import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { addDays, formatDate, isoWeekday, monthGrid, parseDate, todayInSeoul } from './domain/todos/date';
import { filterAndSortItems, materializeItems, TodoError } from './domain/todos/todoDomain';
import type { CreateTodoInput, DeleteReceipt, DisplayTodo, ListQuery, Priority, RecurringPatch, TodoData, TodoRecordData } from './domain/todos/types';
import { createBackup, parseAndValidateBackup, restoreBackup } from './features/backup/backup';
import { clearAllData, createTodo, deleteOccurrence, loadSnapshot, setOneTimeStatus, setRecurringStatus, softDeleteCompleted, undoDelete, updateOneTime, updateRecurring } from './infrastructure/indexed-db/todoRepository';

type View = 'today' | 'upcoming' | 'completed' | 'date';
type Snapshot = { todos: TodoData[]; records: TodoRecordData[] };
const EMPTY_SNAPSHOT: Snapshot = { todos: [], records: [] };
const PRIORITY_LABEL: Record<Priority, string> = { high: '높음', normal: '보통', low: '낮음' };
const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

function formatHeading(date: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${date}T12:00:00+09:00`));
}
function monthLabel(date: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00+09:00`));
}
function changeMonth(date: string, amount: number) {
  const parsed = parseDate(date);
  return formatDate(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + amount, 1)));
}

function Modal({ title, onClose, children, initialFocus }: { title: string; onClose: () => void; children: ReactNode; initialFocus?: React.RefObject<HTMLElement | null> }) {
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const fallback = panelRef.current?.querySelector<HTMLElement>('button, input, select, textarea');
    queueMicrotask(() => (initialFocus?.current ?? fallback)?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
      if (!focusable.length) return;
      const [first] = focusable;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [initialFocus, onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={panelRef} className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="sheet-handle" aria-hidden="true" /><div className="sheet-header"><div><p className="section-kicker">MY DAILY TODO</p><h2 id="dialog-title">{title}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label={`${title} 닫기`}>×</button></div>{children}</section></div>;
}

function TodoForm({ selectedDate, editing, source, saving, onCancel, onSubmit }: { selectedDate: string; editing: DisplayTodo | null; source: TodoData | null; saving: boolean; onCancel: () => void; onSubmit: (input: CreateTodoInput | RecurringPatch, scope: 'date' | 'future') => Promise<void> }) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [recurring, setRecurring] = useState(editing?.type === 'recurring');
  const [frequency, setFrequency] = useState(source?.repeatFrequency ?? 'daily');
  const [scope, setScope] = useState<'date' | 'future'>('date');
  const [formError, setFormError] = useState('');
  const initialWeekday = isoWeekday(editing?.targetDate ?? selectedDate);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') ?? '').trim();
    if (!title) { setFormError('제목을 입력해 주세요.'); titleRef.current?.focus(); return; }
    const base = { title, memo: String(data.get('memo') ?? '').trim(), emoji: String(data.get('emoji') ?? '✅').trim() || '✅', priority: String(data.get('priority')) as Priority, dueTime: String(data.get('dueTime') ?? '') || null };
    try {
      if (!recurring) await onSubmit({ type: 'one_time', ...base, dueDate: String(data.get('date')) }, scope);
      else {
        const weekdays = data.getAll('weekdays').map(Number);
        if (frequency === 'weekly' && !weekdays.length) { setFormError('반복 요일을 하나 이상 선택해 주세요.'); return; }
        const recurringPatch: RecurringPatch = { ...base, repeatFrequency: frequency, repeatInterval: frequency === 'daily' ? 1 : Math.max(1, Number(data.get('interval') || 1)), repeatWeekdays: frequency === 'weekly' ? weekdays : [], repeatEndDate: String(data.get('repeatEndDate') ?? '') || null };
        await onSubmit(editing ? recurringPatch : { type: 'recurring', ...recurringPatch, repeatStartDate: String(data.get('date')) }, scope);
      }
    } catch (error) {
      setFormError(error instanceof TodoError ? error.message : '저장하지 못했어요. 입력 내용을 확인하고 다시 시도해 주세요.');
    }
  }
  return <Modal title={editing ? '할 일 수정' : '새 할 일'} onClose={onCancel} initialFocus={titleRef}><form onSubmit={(event) => void submit(event)}>
    {!editing && <fieldset className="type-picker"><legend className="sr-only">할 일 종류</legend><label><input type="radio" name="type" checked={!recurring} onChange={() => setRecurring(false)} /><span>한 번만</span></label><label><input type="radio" name="type" checked={recurring} onChange={() => setRecurring(true)} /><span>반복</span></label></fieldset>}
    <label className="field-label" htmlFor="todo-title">무엇을 할까요?</label><input ref={titleRef} id="todo-title" name="title" defaultValue={editing?.title ?? ''} maxLength={120} aria-describedby={formError ? 'form-error' : undefined} />
    <div className="field-grid"><label><span className="field-label">아이콘</span><input name="emoji" defaultValue={editing?.emoji ?? '✅'} maxLength={4} /></label><label><span className="field-label">시간 <em>선택</em></span><input name="dueTime" type="time" defaultValue={editing?.dueTime ?? ''} /></label></div>
    <label><span className="field-label">{recurring ? '시작 날짜' : '날짜'}</span><input name="date" type="date" defaultValue={editing?.targetDate ?? selectedDate} disabled={Boolean(editing?.type === 'recurring')} /></label>
    <label className="field-block"><span className="field-label">우선순위</span><select name="priority" defaultValue={editing?.priority ?? 'normal'}><option value="normal">보통</option><option value="high">높음</option><option value="low">낮음</option></select></label>
    <label className="field-block"><span className="field-label">메모 <em>선택</em></span><textarea name="memo" rows={3} maxLength={2000} defaultValue={editing?.memo ?? ''} /></label>
    {editing?.type === 'recurring' && <fieldset className="scope-picker"><legend>수정 범위</legend><label><input type="radio" name="scope" value="date" checked={scope === 'date'} onChange={() => setScope('date')} /><span>이 날짜만</span></label><label><input type="radio" name="scope" value="future" checked={scope === 'future'} onChange={() => setScope('future')} /><span>이 날짜부터</span></label></fieldset>}
    {recurring && (!editing || scope === 'future') && <fieldset className="repeat-options"><legend>반복 규칙</legend><label><span className="field-label">방식</span><select name="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)}><option value="daily">매일</option><option value="weekly">매주 / 특정 요일</option><option value="interval_days">며칠마다</option></select></label>{frequency !== 'daily' && <label className="field-block"><span className="field-label">반복 간격</span><input name="interval" type="number" min={frequency === 'interval_days' ? 2 : 1} defaultValue={source?.repeatInterval ?? (frequency === 'interval_days' ? 2 : 1)} /></label>}{frequency === 'weekly' && <div className="weekday-picker" aria-label="반복 요일">{WEEKDAY_LABELS.map((label, index) => <label key={label}><input type="checkbox" name="weekdays" value={index + 1} defaultChecked={source?.repeatWeekdays.includes(index + 1) ?? index + 1 === initialWeekday} /><span>{label}</span></label>)}</div>}<label className="field-block"><span className="field-label">종료 날짜 <em>선택</em></span><input name="repeatEndDate" type="date" defaultValue={source?.repeatEndDate ?? ''} min={editing?.targetDate ?? selectedDate} /></label></fieldset>}
    {formError && <p id="form-error" className="form-error" role="alert">{formError}</p>}<button className="primary-button" disabled={saving}>{saving ? '저장 중…' : editing ? '변경 저장' : '할 일 추가'}</button>
  </form></Modal>;
}

function TaskCard({ item, today, busy, onToggle, onSkip, onEdit, onDelete }: { item: DisplayTodo; today: string; busy: boolean; onToggle: () => void; onSkip: () => void; onEdit: (button: HTMLButtonElement) => void; onDelete: (button: HTMLButtonElement) => void }) {
  const dueState = item.targetDate < today ? '기한 지남' : item.targetDate === today ? '오늘 마감' : item.targetDate;
  return <article className={`task-card ${item.status === 'completed' ? 'is-done' : ''} ${item.status === 'skipped' ? 'is-skipped' : ''}`}><button className={`task-check ${item.status === 'completed' ? 'is-done' : ''}`} disabled={busy} onClick={onToggle} aria-label={`${item.title} ${item.status === 'completed' ? '미완료로 변경' : '완료'}`}>{item.status === 'completed' ? '✓' : '○'}</button><div className="task-emoji" aria-hidden="true">{item.emoji}</div><div className="task-copy"><div className="task-title-row"><h3>{item.title}</h3><span className={`priority-badge ${item.priority}`}>{PRIORITY_LABEL[item.priority]}</span>{item.type === 'recurring' && <span className="type-badge">반복</span>}</div>{item.memo && <p>{item.memo}</p>}<div className="task-meta"><span className={item.targetDate <= today ? `due-${item.targetDate < today ? 'overdue' : 'today'}` : ''}>{dueState}</span><span>{item.dueTime ?? '시간 없음'}</span><span>{item.status === 'completed' ? '완료' : item.status === 'skipped' ? '건너뜀' : '미완료'}</span></div></div><div className="task-actions">{item.type === 'recurring' && <button type="button" disabled={busy} onClick={onSkip}>{item.status === 'skipped' ? '복원' : '건너뜀'}</button>}<button type="button" disabled={busy} onClick={(event) => onEdit(event.currentTarget)}>수정</button><button className="danger-text" type="button" disabled={busy} onClick={(event) => onDelete(event.currentTarget)}>삭제</button></div></article>;
}

function CalendarView({ anchor, selected, today, snapshot, onMove, onSelect, onClose }: { anchor: string; selected: string; today: string; snapshot: Snapshot; onMove: (amount: number) => void; onSelect: (date: string) => void; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const days = monthGrid(anchor);
  const anchorMonth = anchor.slice(0, 7);
  const selectedItems = materializeItems(snapshot.todos, snapshot.records, selected);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const panel = document.querySelector<HTMLElement>('.calendar-view');
      const focusable = panel ? [...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')] : [];
      const [first] = focusable;
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return <section className="calendar-view" role="dialog" aria-modal="true" aria-labelledby="calendar-title"><header className="calendar-header"><button ref={closeRef} className="icon-button back-button" onClick={onClose} aria-label="캘린더 닫기">‹</button><h1 id="calendar-title">월간 캘린더</h1><button className="today-button" onClick={() => onSelect(today)}>오늘</button></header><div className="month-heading"><button onClick={() => onMove(-1)} aria-label="이전 달">‹</button><h2>{monthLabel(anchor)}</h2><button onClick={() => onMove(1)} aria-label="다음 달">›</button></div><div className="calendar-weekdays" aria-hidden="true"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div className="calendar-grid">{days.map((date) => { const count = materializeItems(snapshot.todos, snapshot.records, date).length; return <button key={date} className={`calendar-day ${date.slice(0, 7) !== anchorMonth ? 'is-outside' : ''} ${date === selected ? 'is-selected' : ''} ${date === today ? 'is-today' : ''} ${count ? 'has-items' : ''}`} onClick={() => onSelect(date)} aria-label={`${formatHeading(date)}, 할 일 ${count}개`} aria-pressed={date === selected}>{Number(date.slice(-2))}</button>; })}</div><section className="calendar-agenda"><p className="section-kicker">SELECTED DATE</p><h2>{formatHeading(selected)}</h2>{selectedItems.length ? selectedItems.map((item) => <div className={`agenda-item ${item.status === 'completed' ? 'is-done' : ''}`} key={item.key}><span aria-hidden="true">{item.emoji}</span><div><strong>{item.title}</strong><small>{item.dueTime ?? '시간 없음'} · {item.status === 'completed' ? '완료' : item.status === 'skipped' ? '건너뜀' : '미완료'}</small></div></div>) : <div className="calendar-empty"><strong>예정된 할 일이 없어요</strong><span>날짜를 선택한 뒤 새 할 일을 추가해 보세요.</span></div>}</section></section>;
}

function DataPanel({ busy, error, onClose, onExport, onImport, onReset }: { busy: boolean; error: string; onClose: () => void; onExport: () => void; onImport: (file: File) => void; onReset: () => void }) {
  return <Modal title="데이터 관리" onClose={onClose}>
    <p className="scope-copy">할 일은 이 기기에만 저장됩니다. 중요한 변경 전에는 백업 파일을 보관해 주세요.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="data-action-list">
      <button disabled={busy} onClick={onExport}><strong>백업 내보내기</strong><small>모든 항목과 수행 기록을 JSON 파일로 저장해요.</small></button>
      <label className={busy ? 'is-disabled' : ''}><input className="sr-only" type="file" accept="application/json,.json" aria-label="백업 파일 선택" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.currentTarget.value = ''; }} /><strong>백업 가져오기</strong><small>검증을 통과한 파일로 현재 데이터를 교체해요.</small></label>
      <button className="danger-data-action" disabled={busy} onClick={onReset}><strong>모든 데이터 삭제</strong><small>기기의 할 일과 수행 기록을 모두 지워요.</small></button>
    </div>
  </Modal>;
}

export default function App() {
  const today = todayInSeoul();
  const [selectedDate, setSelectedDate] = useState(today);
  const [view, setView] = useState<View>('today');
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<DisplayTodo | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DisplayTodo | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showData, setShowData] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ name: string; text: string } | null>(null);
  const [calendarAnchor, setCalendarAnchor] = useState(`${today.slice(0, 7)}-01`);
  const [query, setQuery] = useState<ListQuery>({ priority: 'all', status: 'all', sort: 'due' });
  const [receipt, setReceipt] = useState<DeleteReceipt | null>(null);
  const [notice, setNotice] = useState('');
  const openerRef = useRef<HTMLElement | null>(null);
  const undoTimer = useRef<number | null>(null);
  const noticeTimer = useRef<number | null>(null);
  async function refresh() { setSnapshot(await loadSnapshot()); }
  useEffect(() => { void refresh().catch((reason) => setError(reason instanceof Error ? reason.message : '목록을 불러오지 못했어요.')).finally(() => setReady(true)); }, []);
  useEffect(() => () => { if (undoTimer.current) window.clearTimeout(undoTimer.current); if (noticeTimer.current) window.clearTimeout(noticeTimer.current); }, []);
  const items = useMemo(() => {
    let values: DisplayTodo[] = [];
    if (view === 'date') values = materializeItems(snapshot.todos, snapshot.records, selectedDate);
    if (view === 'today') {
      values = materializeItems(snapshot.todos, snapshot.records, today);
      for (const todo of snapshot.todos) if (todo.type === 'one_time' && !todo.deletedAt && todo.status === 'pending' && todo.dueDate && todo.dueDate < today) values.push(...materializeItems(snapshot.todos, snapshot.records, todo.dueDate).filter((item) => item.todoId === todo.id));
    }
    if (view === 'upcoming') {
      const horizon = addDays(today, 31);
      for (let offset = 1; offset <= 31; offset += 1) values.push(...materializeItems(snapshot.todos, snapshot.records, addDays(today, offset)).filter((item) => item.status === 'pending'));
      for (const todo of snapshot.todos) if (todo.type === 'one_time' && !todo.deletedAt && todo.status === 'pending' && todo.dueDate && todo.dueDate > horizon) values.push(...materializeItems(snapshot.todos, snapshot.records, todo.dueDate).filter((item) => item.todoId === todo.id));
    }
    if (view === 'completed') {
      const dates = new Set<string>();
      snapshot.todos.forEach((todo) => { if (todo.type === 'one_time' && todo.status === 'completed' && todo.dueDate) dates.add(todo.dueDate); });
      snapshot.records.forEach((record) => { if (!record.deletedAt && record.status === 'completed') dates.add(record.targetDate); });
      dates.forEach((date) => values.push(...materializeItems(snapshot.todos, snapshot.records, date).filter((item) => item.status === 'completed')));
    }
    return filterAndSortItems(values, query);
  }, [query, selectedDate, snapshot, today, view]);
  const completed = items.filter((item) => item.status === 'completed').length;
  const percent = items.length ? Math.round(completed / items.length * 100) : 0;
  const source = editing ? snapshot.todos.find((todo) => todo.id === editing.todoId) ?? null : null;
  const hasCompletedOneTime = view === 'completed' && items.some((item) => item.type === 'one_time');
  function showNotice(message: string) { setNotice(message); if (noticeTimer.current) window.clearTimeout(noticeTimer.current); noticeTimer.current = window.setTimeout(() => setNotice(''), 3_000); }
  function closeOverlay() { setShowForm(false); setEditing(null); setDeleteTarget(null); setShowCalendar(false); setShowData(false); setConfirmReset(false); setPendingImport(null); queueMicrotask(() => openerRef.current?.focus()); }
  async function run(action: () => Promise<void>, close = false) { if (busy) return; setBusy(true); setError(''); try { await action(); await refresh(); if (close) closeOverlay(); } catch (reason) { setError(reason instanceof Error ? reason.message : '저장하지 못했어요. 다시 시도해 주세요.'); throw reason; } finally { setBusy(false); } }
  async function submit(input: CreateTodoInput | RecurringPatch, scope: 'date' | 'future') { await run(async () => { if (!editing) await createTodo(input as CreateTodoInput); else if (editing.type === 'one_time') await updateOneTime(editing.todoId, input as Extract<CreateTodoInput, { type: 'one_time' }>); else await updateRecurring(editing.seriesId!, editing.targetDate, scope, input as RecurringPatch); }, true); }
  async function commitDelete(item: DisplayTodo, scope: 'date' | 'future') { await run(async () => { const nextReceipt = await deleteOccurrence(item, scope); setReceipt(nextReceipt); if (undoTimer.current) window.clearTimeout(undoTimer.current); undoTimer.current = window.setTimeout(() => setReceipt(null), 5_000); }, true); }
  async function undo() { if (!receipt) return; await run(async () => { await undoDelete(receipt); setReceipt(null); if (undoTimer.current) window.clearTimeout(undoTimer.current); }); }
  async function cleanupCompleted() { await run(async () => { const nextReceipt = await softDeleteCompleted(); setReceipt(nextReceipt); if (undoTimer.current) window.clearTimeout(undoTimer.current); undoTimer.current = window.setTimeout(() => setReceipt(null), 5_000); }); }
  async function exportData() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const backup = await createBackup();
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = `my-daily-todo-${today}.json`; link.click();
      URL.revokeObjectURL(url);
      showNotice('백업 파일을 저장했어요.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '백업 파일을 만들지 못했어요.'); }
    finally { setBusy(false); }
  }
  async function prepareImport(file: File) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const text = await file.text();
      parseAndValidateBackup(text);
      setShowData(false); setPendingImport({ name: file.name, text });
    } catch (reason) { setError(reason instanceof Error ? reason.message : '백업 파일을 읽지 못했어요.'); }
    finally { setBusy(false); }
  }
  const week = useMemo(() => { const start = addDays(selectedDate, 1 - isoWeekday(selectedDate)); return Array.from({ length: 7 }, (_, index) => addDays(start, index)); }, [selectedDate]);
  return <>
    <main className="app-shell" aria-label="My Daily Todo"><header className="app-header"><div className="header-date"><p className="eyebrow">{view === 'today' ? formatHeading(today) : view === 'date' ? formatHeading(selectedDate) : 'MY DAILY TODO'}</p></div><div className="header-actions"><button className="icon-button" onClick={(event) => { openerRef.current = event.currentTarget; setError(''); setShowData(true); }} aria-label="데이터 관리 열기">···</button><button className="icon-button calendar-button" onClick={(event) => { openerRef.current = event.currentTarget; setCalendarAnchor(`${selectedDate.slice(0, 7)}-01`); setShowCalendar(true); }} aria-label="월간 캘린더 열기">▦</button></div></header>
      <nav className="view-tabs" aria-label="목록 화면"><button className={view === 'today' ? 'is-active' : ''} onClick={() => { setView('today'); setSelectedDate(today); }}>오늘</button><button className={view === 'upcoming' ? 'is-active' : ''} onClick={() => setView('upcoming')}>예정</button><button className={view === 'completed' ? 'is-active' : ''} onClick={() => setView('completed')}>완료</button></nav>
      {(view === 'today' || view === 'date') && <section className="week-strip" aria-label="날짜 선택">{week.map((date, index) => <button key={date} className={`day-button ${date === selectedDate ? 'is-selected' : ''} ${date === today ? 'is-today' : ''}`} onClick={() => { setSelectedDate(date); setView(date === today ? 'today' : 'date'); }} aria-pressed={date === selectedDate}><span>{WEEKDAY_LABELS[index]}</span><strong>{Number(date.slice(-2))}</strong></button>)}</section>}
      <section className="progress-card" aria-label="현재 목록 진행률"><div className="progress-heading"><h2>{view === 'upcoming' ? '다가오는 할 일' : view === 'completed' ? '완료한 할 일' : '목록 진행률'}</h2><div className="progress-numbers"><span>{completed} / {items.length}</span><strong>{percent}%</strong></div></div><div className="progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="완료 비율"><span style={{ width: `${percent}%` }} /></div></section>
      <section className="content-section"><div className="section-heading-row"><div><p className="section-kicker">{view.toUpperCase()}</p><h1>{view === 'today' ? '오늘의 목록' : view === 'upcoming' ? '예정된 목록' : view === 'completed' ? '완료한 목록' : `${Number(selectedDate.slice(5, 7))}월 ${Number(selectedDate.slice(8))}일 목록`}</h1></div><div className="heading-actions">{hasCompletedOneTime && <button className="secondary-button" disabled={busy} onClick={() => void cleanupCompleted().catch(() => undefined)}>완료 정리</button>}<button className="mini-add-button" onClick={(event) => { openerRef.current = event.currentTarget; setEditing(null); setShowForm(true); }}>새 할 일 <span>+</span></button></div></div>
        <div className="list-tools" aria-label="필터와 정렬"><label><span>상태</span><select value={query.status} onChange={(event) => setQuery({ ...query, status: event.target.value as ListQuery['status'] })}><option value="all">전체</option><option value="pending">미완료</option><option value="completed">완료</option><option value="skipped">건너뜀</option></select></label><label><span>우선순위</span><select value={query.priority} onChange={(event) => setQuery({ ...query, priority: event.target.value as ListQuery['priority'] })}><option value="all">전체</option><option value="high">높음</option><option value="normal">보통</option><option value="low">낮음</option></select></label><label><span>정렬</span><select value={query.sort} onChange={(event) => setQuery({ ...query, sort: event.target.value as ListQuery['sort'] })}><option value="due">마감순</option><option value="priority">우선순위순</option><option value="created">생성순</option></select></label></div>
        {error && <div className="error-banner" role="alert"><strong>저장 또는 조회에 문제가 생겼어요.</strong><span>{error}</span><button onClick={() => void refresh().then(() => setError('')).catch(() => undefined)}>다시 불러오기</button></div>}
        <div className="unified-list" aria-live="polite" aria-busy={!ready || busy}>{!ready && <div className="empty-state"><strong>목록을 불러오는 중이에요</strong><p>기기에 저장된 할 일을 확인하고 있어요.</p></div>}{ready && !items.length && <div className="empty-state"><strong>{query.priority !== 'all' || query.status !== 'all' ? '조건에 맞는 할 일이 없어요' : '아직 할 일이 없어요'}</strong><p>{query.priority !== 'all' || query.status !== 'all' ? '필터를 바꾸거나 초기화해 보세요.' : '새 할 일을 추가해 오늘 계획을 시작해 보세요.'}</p>{(query.priority !== 'all' || query.status !== 'all') && <button onClick={() => setQuery({ priority: 'all', status: 'all', sort: 'due' })}>필터 초기화</button>}</div>}{items.map((item) => <TaskCard key={item.key} item={item} today={today} busy={busy} onToggle={() => void run(async () => { if (item.type === 'one_time') await setOneTimeStatus(item.todoId, item.status === 'completed' ? 'pending' : 'completed'); else await setRecurringStatus(item.seriesId!, item.targetDate, item.status === 'completed' ? 'pending' : 'completed'); }).catch(() => undefined)} onSkip={() => void run(async () => { await setRecurringStatus(item.seriesId!, item.targetDate, item.status === 'skipped' ? 'pending' : 'skipped'); }).catch(() => undefined)} onEdit={(button) => { openerRef.current = button; setEditing(item); setShowForm(true); }} onDelete={(button) => { openerRef.current = button; if (item.type === 'recurring') setDeleteTarget(item); else void commitDelete(item, 'date').catch(() => undefined); }} />)}</div>
      </section><div className="bottom-space" /></main>
    {showForm && <TodoForm selectedDate={selectedDate} editing={editing} source={source} saving={busy} onCancel={closeOverlay} onSubmit={submit} />}
    {deleteTarget && <Modal title="반복 할 일 삭제" onClose={closeOverlay}><p className="scope-copy">어느 범위에서 삭제할까요? 삭제 후 5초 동안 실행 취소할 수 있어요.</p><div className="scope-action-list"><button disabled={busy} onClick={() => void commitDelete(deleteTarget, 'date').catch(() => undefined)}><strong>이 날짜만 삭제</strong><small>선택한 날짜에서만 숨겨요.</small></button><button disabled={busy} onClick={() => void commitDelete(deleteTarget, 'future').catch(() => undefined)}><strong>이 날짜부터 이후 삭제</strong><small>과거 기록은 그대로 보존해요.</small></button></div></Modal>}
    {showCalendar && <CalendarView anchor={calendarAnchor} selected={selectedDate} today={today} snapshot={snapshot} onMove={(amount) => setCalendarAnchor(changeMonth(calendarAnchor, amount))} onSelect={(date) => { setSelectedDate(date); setCalendarAnchor(`${date.slice(0, 7)}-01`); }} onClose={() => { setView(selectedDate === today ? 'today' : 'date'); closeOverlay(); }} />}
    {showData && <DataPanel busy={busy} error={error} onClose={closeOverlay} onExport={() => void exportData()} onImport={(file) => void prepareImport(file)} onReset={() => { setShowData(false); setConfirmReset(true); }} />}
    {pendingImport && <Modal title="백업으로 복원" onClose={closeOverlay}><p className="scope-copy"><strong>{pendingImport.name}</strong>의 데이터로 현재 기기 내용을 모두 바꿉니다. 검증된 파일만 한 번에 반영되며 되돌릴 수 없어요.</p><button className="destructive-button" disabled={busy} onClick={() => void run(async () => { await restoreBackup(pendingImport.text); showNotice('백업 데이터를 복원했어요.'); }, true).catch(() => undefined)}>현재 데이터 교체</button></Modal>}
    {confirmReset && <Modal title="모든 데이터 삭제" onClose={closeOverlay}><p className="scope-copy">할 일과 반복 수행 기록을 이 기기에서 모두 삭제합니다. 이 작업은 실행 취소할 수 없어요.</p><button className="destructive-button" disabled={busy} onClick={() => void run(async () => { await clearAllData(); showNotice('모든 데이터를 삭제했어요.'); }, true).catch(() => undefined)}>모든 데이터 삭제</button></Modal>}
    {receipt && <div className="toast" role="status"><span>할 일을 삭제했어요.</span><button onClick={() => void undo().catch(() => undefined)}>실행 취소</button></div>}
    {notice && !receipt && <div className="toast" role="status"><span>{notice}</span></div>}
  </>;
}
