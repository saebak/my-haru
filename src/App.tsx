import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { addDays, formatDate, monthGrid, parseDate, todayInSeoul } from './domain/todos/date';
import { materializeItems, occursOn, TodoError } from './domain/todos/todoDomain';
import type {
  CreateTodoInput,
  DeleteReceipt,
  DisplayTodo,
  Priority,
  RecurringPatch,
  TodoContentPatch,
  TodoData,
  TodoRecordData,
} from './domain/todos/types';
import { createBackup, parseAndValidateBackup, restoreBackup } from './features/backup/backup';
import {
  clearAllData,
  createTodo,
  deleteOccurrence,
  loadSnapshot,
  setOneTimeStatus,
  setRecurringStatus,
  undoDelete,
  updateOneTime,
  updateRecurring,
} from './infrastructure/indexed-db/todoRepository';

type Snapshot = { todos: TodoData[]; records: TodoRecordData[] };
type ItemType = 'todo' | 'habit';
type EditScope = 'date' | 'future' | 'all';
type Overlay = 'form' | 'delete' | 'settings' | 'data' | 'import' | 'reset' | null;

const EMPTY_SNAPSHOT: Snapshot = { todos: [], records: [] };
const PRIORITY_LABEL: Record<Priority, string> = { high: '중요', normal: '보통', low: '낮음' };
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const FORM_WEEKDAYS = [
  { label: '월', value: 1 }, { label: '화', value: 2 }, { label: '수', value: 3 },
  { label: '목', value: 4 }, { label: '금', value: 5 }, { label: '토', value: 6 },
  { label: '일', value: 7 },
];
const EMOJIS = ['✅', '📌', '📝', '📖', '💧', '🌱', '🏃', '💪', '🧘', '💊', '☕', '⭐'];

function dateParts(date: string) {
  const parsed = parseDate(date);
  return { parsed, month: parsed.getUTCMonth() + 1, day: parsed.getUTCDate() };
}

function formatHeading(date: string) {
  const { parsed, month, day } = dateParts(date);
  return `${parsed.getUTCFullYear()}년 ${month}월 ${day}일 ${WEEKDAY_LABELS[parsed.getUTCDay()]}요일`;
}

function monthLabel(date: string) {
  const { parsed, month } = dateParts(date);
  return `${parsed.getUTCFullYear()}년 ${month}월`;
}

function changeMonth(date: string, amount: number) {
  const parsed = parseDate(date);
  return formatDate(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + amount, 1)));
}

function sundayStart(date: string) {
  return addDays(date, -parseDate(date).getUTCDay());
}

function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function itemType(item: DisplayTodo): ItemType {
  return item.type === 'recurring' && item.dueTime === null ? 'habit' : 'todo';
}

function Modal({
  kicker,
  title,
  closeLabel = '닫기',
  compact = false,
  onClose,
  children,
  initialFocus,
}: {
  kicker: string;
  title: string;
  closeLabel?: string;
  compact?: boolean;
  onClose: () => void;
  children: ReactNode;
  initialFocus?: RefObject<HTMLElement | null>;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const titleId = `sheet-title-${useId().replace(/:/g, '')}`;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>('.app-shell');
    shell?.setAttribute('inert', '');
    const fallback = panelRef.current?.querySelector<HTMLElement>('button, input, select, textarea');
    queueMicrotask(() => (initialFocus?.current ?? fallback)?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.closest('[hidden]'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      shell?.removeAttribute('inert');
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [initialFocus]);

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={panelRef} className={`bottom-sheet ${compact ? 'compact-sheet' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="sheet-handle" aria-hidden="true" />
      <div className="sheet-header"><div><p className="section-kicker">{kicker}</p><h2 id={titleId}>{title}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label={closeLabel}>×</button></div>
      {children}
    </section>
  </div>;
}

function TodoForm({
  selectedDate,
  editing,
  source,
  saving,
  onCancel,
  onSubmit,
}: {
  selectedDate: string;
  editing: DisplayTodo | null;
  source: TodoData | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateTodoInput | RecurringPatch | TodoContentPatch, scope: EditScope, type: ItemType) => Promise<void>;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<ItemType>(editing ? itemType(editing) : 'todo');
  const [repeating, setRepeating] = useState(editing?.type === 'recurring');
  const [emoji, setEmoji] = useState(editing?.emoji ?? (editing?.type === 'recurring' ? '🌱' : ''));
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [scope, setScope] = useState<EditScope>('date');
  const [formError, setFormError] = useState('');
  const isHabit = type === 'habit';
  const repeats = isHabit || repeating;

  useEffect(() => {
    if (!emojiOpen) return;
    const closePicker = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest('.emoji-field')) setEmojiOpen(false);
    };
    document.addEventListener('pointerdown', closePicker);
    return () => document.removeEventListener('pointerdown', closePicker);
  }, [emojiOpen]);

  function selectType(next: ItemType) {
    setType(next);
    if (next === 'habit') setRepeating(true);
    if (!emoji) setEmoji(next === 'habit' ? '🌱' : '');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') ?? '').trim();
    if (!title) {
      setFormError('제목을 입력해 주세요.');
      titleRef.current?.focus();
      return;
    }
    const content = {
      title,
      memo: String(data.get('memo') ?? '').trim(),
      emoji: emoji || (isHabit ? '🌱' : '✓'),
      priority: String(data.get('priority') ?? 'normal') as Priority,
      dueTime: isHabit ? null : String(data.get('time') ?? '') || null,
    };
    try {
      if (!repeats) {
        await onSubmit({ type: 'one_time', ...content, dueDate: String(data.get('date') ?? selectedDate) }, scope, type);
        return;
      }
      const weekdays = data.getAll('weekdays').map(Number);
      const patch: RecurringPatch = {
        ...content,
        repeatFrequency: weekdays.length ? 'weekly' : 'daily',
        repeatInterval: 1,
        repeatWeekdays: weekdays,
        repeatEndDate: String(data.get('repeatUntil') ?? '') || null,
      };
      await onSubmit(
        editing ? patch : { type: 'recurring', ...patch, repeatStartDate: isHabit ? selectedDate : String(data.get('date') ?? selectedDate) },
        scope,
        type,
      );
    } catch (reason) {
      setFormError(reason instanceof TodoError ? reason.message : '저장하지 못했어요. 입력 내용을 확인하고 다시 시도해 주세요.');
    }
  }

  return <Modal kicker="NEW ITEM" title={editing ? '항목 수정' : '새 항목'} onClose={onCancel} initialFocus={titleRef}>
    <form onSubmit={(event) => void submit(event)}>
      <fieldset className="type-picker">
        <legend className="sr-only">항목 종류</legend>
        <label><input type="radio" name="type" value="todo" checked={type === 'todo'} disabled={Boolean(editing)} onChange={() => selectType('todo')} /><span>할 일</span></label>
        <label><input type="radio" name="type" value="habit" checked={type === 'habit'} disabled={Boolean(editing)} onChange={() => selectType('habit')} /><span>습관</span></label>
      </fieldset>
      <label className="field-label" htmlFor="task-title">무엇을 할까요?</label>
      <input ref={titleRef} id="task-title" name="title" type="text" placeholder="내용을 입력하세요" autoComplete="off" required maxLength={120} defaultValue={editing?.title ?? ''} aria-describedby={formError ? 'form-error' : undefined} />
      <div className={`field-grid ${isHabit ? 'is-habit' : ''}`}>
        <div className="emoji-field">
          <span className="field-label">이모지 <em>선택</em></span>
          <input name="emoji" type="hidden" value={emoji} readOnly />
          <button className="emoji-trigger" type="button" aria-expanded={emojiOpen} aria-controls="emoji-picker" onClick={() => setEmojiOpen((value) => !value)}><span>{emoji || (isHabit ? '🌱' : '✓')}</span><small>눌러서 선택</small></button>
          <div className={`emoji-picker ${emojiOpen ? 'is-open' : ''}`} id="emoji-picker" aria-label="이모지 선택" hidden={!emojiOpen}>
            {EMOJIS.map((value) => <button key={value} className={emoji === value ? 'is-selected' : ''} type="button" data-emoji={value} onClick={() => { setEmoji(value); setEmojiOpen(false); }}>{value}</button>)}
          </div>
        </div>
        <label hidden={isHabit}><span className="field-label">시간</span><input name="time" type="time" defaultValue={editing?.dueTime ?? currentTime()} /></label>
      </div>
      <label hidden={isHabit}><span className="field-label">날짜</span><input name="date" type="date" defaultValue={editing?.targetDate ?? selectedDate} /></label>
      <label><span className="field-label">중요도</span><select name="priority" defaultValue={editing?.priority ?? 'normal'}><option value="normal">보통</option><option value="high">중요</option><option value="low">낮음</option></select></label>
      <label className="repeat-toggle"><span><strong>반복</strong><small>선택한 요일마다 반복합니다</small></span><input name="repeat" type="checkbox" checked={repeats} disabled={isHabit} onChange={(event) => setRepeating(event.target.checked)} /><i aria-hidden="true" /></label>
      <div className="repeat-options" hidden={!repeats}>
        <span className="field-label">반복 요일</span>
        <div className="weekday-picker" aria-label="반복 요일 선택">
          {FORM_WEEKDAYS.map(({ label, value }) => <label key={value}><input type="checkbox" name="weekdays" value={value} defaultChecked={source?.repeatFrequency === 'weekly' && source.repeatWeekdays.includes(value)} /><span>{label}</span></label>)}
        </div>
        <label><span className="field-label">반복 종료일 <em>비워두면 계속 반복</em></span><input name="repeatUntil" type="date" min={editing?.targetDate ?? selectedDate} defaultValue={source?.repeatEndDate ?? ''} /></label>
      </div>
      <label className="field-label" htmlFor="task-memo">메모 <span>선택</span></label>
      <textarea id="task-memo" name="memo" rows={3} placeholder="잊지 말아야 할 내용을 적어두세요" maxLength={2000} defaultValue={editing?.memo ?? ''} />
      {editing?.type === 'recurring' && <fieldset className="scope-picker">
        <legend>반복 변경 범위</legend>
        <label><input type="radio" name="editScope" value="date" checked={scope === 'date'} onChange={() => setScope('date')} /><span>오늘만</span></label>
        <label><input type="radio" name="editScope" value="future" checked={scope === 'future'} onChange={() => setScope('future')} /><span>오늘 이후</span></label>
        <label><input type="radio" name="editScope" value="all" checked={scope === 'all'} onChange={() => setScope('all')} /><span>전체 반복</span></label>
      </fieldset>}
      {formError && <p id="form-error" className="form-error" role="alert">{formError}</p>}
      <button className="primary-button" type="submit" disabled={saving}>{saving ? '저장 중…' : `${isHabit ? '습관' : '할 일'} ${editing ? '수정' : '추가'}`}</button>
    </form>
  </Modal>;
}

function streakFor(snapshot: Snapshot, item: DisplayTodo) {
  if (!item.seriesId) return 0;
  let cursor = item.targetDate;
  let streak = 0;
  for (let checked = 0; checked < 365; checked += 1) {
    const occurs = snapshot.todos.some((todo) => todo.seriesId === item.seriesId && occursOn(todo, cursor));
    if (occurs) {
      const occurrence = materializeItems(snapshot.todos, snapshot.records, cursor).find((value) => value.seriesId === item.seriesId);
      if (occurrence?.status !== 'completed') break;
      streak += 1;
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function TaskCard({
  item, snapshot, busy, open, onOpen, onToggle, onSkip, onEdit, onDelete, onReorder, onKeyboardMove,
}: {
  item: DisplayTodo;
  snapshot: Snapshot;
  busy: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
  onToggle: () => void;
  onSkip: () => void;
  onEdit: (button: HTMLButtonElement) => void;
  onDelete: (button: HTMLButtonElement) => void;
  onReorder: (targetKey: string, before: boolean) => void;
  onKeyboardMove: (amount: -1 | 1) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{ pointerId: number; startX: number; startY: number; dx: number } | null>(null);
  const dragRef = useRef<{ pointerId: number } | null>(null);
  const routine = itemType(item) === 'habit';
  const done = item.status === 'completed';
  const skipped = item.status === 'skipped';

  function startSwipe(event: ReactPointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('button')) return;
    swipeRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dx: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveSwipe(event: ReactPointerEvent<HTMLElement>) {
    const gesture = swipeRef.current;
    if (!gesture) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    gesture.dx = dx;
    if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
    event.preventDefault();
    const width = routine ? 168 : 112;
    event.currentTarget.style.transform = `translateX(${Math.max(-width, Math.min(0, dx))}px)`;
  }
  function endSwipe(event: ReactPointerEvent<HTMLElement>) {
    const gesture = swipeRef.current;
    if (!gesture) return;
    if (event.currentTarget.hasPointerCapture(gesture.pointerId)) event.currentTarget.releasePointerCapture(gesture.pointerId);
    if (Math.abs(gesture.dx) > 8) onOpen(gesture.dx < -42);
    event.currentTarget.style.transform = '';
    swipeRef.current = null;
  }
  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    dragRef.current = { pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    wrapperRef.current?.classList.add('is-dragging');
  }
  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragRef.current || typeof document.elementFromPoint !== 'function') return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.swipe-item');
    if (!target || target.dataset.orderKey === item.key) return;
    const rect = target.getBoundingClientRect();
    onReorder(target.dataset.orderKey ?? '', event.clientY < rect.top + rect.height / 2);
  }
  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return;
    if (event.currentTarget.hasPointerCapture(dragRef.current.pointerId)) event.currentTarget.releasePointerCapture(dragRef.current.pointerId);
    wrapperRef.current?.classList.remove('is-dragging');
    dragRef.current = null;
  }

  return <div ref={wrapperRef} className={`swipe-item ${routine ? 'has-skip' : ''} ${open ? 'is-open' : ''}`} data-id={item.todoId} data-type={routine ? 'habit' : 'todo'} data-order-key={item.key}>
    <div className="swipe-actions" aria-hidden={!open}>
      <button className="edit-action" type="button" data-action="edit" tabIndex={open ? 0 : -1} disabled={busy} onClick={(event) => onEdit(event.currentTarget)}>수정</button>
      {routine && <button className="skip-action" type="button" data-action="skip" tabIndex={open ? 0 : -1} disabled={busy} onClick={onSkip}>{skipped ? '건너뜀 취소' : '건너뜀'}</button>}
      <button className="delete-action" type="button" data-action="delete" tabIndex={open ? 0 : -1} disabled={busy} onClick={(event) => onDelete(event.currentTarget)}>삭제</button>
    </div>
    <article className={`item-card ${done ? 'is-done' : ''} ${skipped ? 'is-skipped' : ''}`} aria-label={item.title} onPointerDown={startSwipe} onPointerMove={moveSwipe} onPointerUp={endSwipe} onPointerCancel={endSwipe}>
      <div className="item-icon" aria-hidden="true">{item.emoji || (routine ? '🌱' : '✓')}</div>
      <div className="item-body"><div className="item-title-row"><strong className="item-title">{item.title}</strong><span className={`item-type-tag ${routine ? 'routine' : 'todo'}`}>{routine ? 'ROUTINE' : 'TODO'}</span></div>{item.memo && <p className="item-memo">{item.memo}</p>}<div className="item-meta">{routine ? <><span className="streak-badge">🔥 {streakFor(snapshot, item)}일 연속</span>{skipped && <span className="status-label">건너뜀</span>}</> : <><span className={`priority-mark ${item.priority}`}>{PRIORITY_LABEL[item.priority]}</span><span>{item.dueTime || '시간 없음'}</span></>}</div></div>
      <button className={`item-check ${done ? 'is-done' : ''}`} type="button" data-action="toggle" disabled={busy} onClick={onToggle} aria-label={`${item.title} ${done ? '완료 취소' : '완료'}`}>✓</button>
      <button className="drag-handle" type="button" data-action="drag" aria-label={`${item.title} 순서 변경. Alt와 방향키로 이동`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={(event) => { if (!event.altKey) return; if (event.key === 'ArrowUp') { event.preventDefault(); onKeyboardMove(-1); } if (event.key === 'ArrowDown') { event.preventDefault(); onKeyboardMove(1); } }}>⠿</button>
    </article>
  </div>;
}

function agendaDetail(item: DisplayTodo, snapshot: Snapshot) {
  if (itemType(item) === 'habit') {
    const state = item.status === 'skipped' ? ' · 건너뜀' : item.status === 'completed' ? ' · 완료' : '';
    return `${streakFor(snapshot, item)}일 연속${state}`;
  }
  return `${item.dueTime || '시간 없음'} · ${PRIORITY_LABEL[item.priority]}${item.status === 'completed' ? ' · 완료' : ''}`;
}

function CalendarView({ anchor, selected, today, snapshot, onMove, onSelect, onToday, onOpenDate, onClose }: {
  anchor: string;
  selected: string;
  today: string;
  snapshot: Snapshot;
  onMove: (amount: number) => void;
  onSelect: (date: string) => void;
  onToday: () => void;
  onOpenDate: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;
  const days = monthGrid(anchor);
  const anchorMonth = anchor.slice(0, 7);
  const selectedItems = materializeItems(snapshot.todos, snapshot.records, selected);
  const { month, day } = dateParts(selected);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeHandler.current(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return <section className="calendar-view" aria-labelledby="calendar-title">
    <header className="calendar-header"><button ref={closeRef} className="icon-button back-button" type="button" aria-label="일정으로 돌아가기" onClick={onClose}>‹</button><h1 id="calendar-title">캘린더</h1><button className="today-button" type="button" onClick={onToday}>오늘</button></header>
    <div className="month-heading"><button type="button" aria-label="이전 달" onClick={() => onMove(-1)}>‹</button><h2>{monthLabel(anchor)}</h2><button type="button" aria-label="다음 달" onClick={() => onMove(1)}>›</button></div>
    <div className="calendar-weekdays" aria-hidden="true">{WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}</div>
    <div className="calendar-grid" aria-label="월간 달력">{days.map((date) => { const count = materializeItems(snapshot.todos, snapshot.records, date).length; return <button key={date} className={`calendar-day ${date.slice(0, 7) !== anchorMonth ? 'is-outside' : ''} ${date === selected ? 'is-selected' : ''} ${date === today ? 'is-today' : ''} ${count ? 'has-items' : ''}`} type="button" data-date={date} aria-label={`${formatHeading(date)}${count ? `, ${count}개 항목` : ''}`} onClick={() => onSelect(date)}>{Number(date.slice(-2))}</button>; })}</div>
    <section className="calendar-agenda" aria-labelledby="agenda-title"><div className="section-heading-row"><div><p className="section-kicker">SELECTED DAY</p><h2 id="agenda-title">{month}월 {day}일 일정</h2></div><span className="section-meta">{selectedItems.length}개</span></div><div>{selectedItems.length ? selectedItems.map((item) => <div className={`agenda-item ${item.status === 'completed' ? 'is-done' : ''}`} key={item.key}><span>{item.emoji || (itemType(item) === 'habit' ? '🌱' : '✓')}</span><div><strong>{item.title}</strong><small>{agendaDetail(item, snapshot)}</small></div></div>) : <div className="calendar-empty"><strong>일정이 없어요</strong><span>이 날짜를 선택해 새 항목을 추가할 수 있어요.</span></div>}</div><button className="agenda-open-button" type="button" onClick={onOpenDate}>이 날짜 일정 보기</button></section>
  </section>;
}

function DataPanel({ busy, error, onClose, onExport, onImport, onReset }: { busy: boolean; error: string; onClose: () => void; onExport: () => void; onImport: (file: File) => void; onReset: () => void }) {
  return <Modal kicker="ACCOUNT" title="데이터 백업 및 복원" compact onClose={onClose}><p className="scope-copy">할 일은 이 기기에만 저장됩니다. 중요한 변경 전에는 백업 파일을 보관해 주세요.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="data-action-list"><button disabled={busy} onClick={onExport}><strong>백업 내보내기</strong><small>모든 항목과 수행 기록을 JSON 파일로 저장해요.</small></button><label className={busy ? 'is-disabled' : ''}><input className="sr-only" type="file" accept="application/json,.json" aria-label="백업 파일 선택" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.currentTarget.value = ''; }} /><strong>백업 가져오기</strong><small>검증을 통과한 파일로 현재 데이터를 교체해요.</small></label><button className="danger-data-action" disabled={busy} onClick={onReset}><strong>모든 데이터 삭제</strong><small>기기의 할 일과 수행 기록을 모두 지워요.</small></button></div></Modal>;
}

function SettingsPanel({ onClose, onData, onNotifications }: { onClose: () => void; onData: () => void; onNotifications: () => void }) {
  return <Modal kicker="ACCOUNT" title="설정" compact onClose={onClose}><button className="setting-row" type="button" onClick={onData}><span>데이터 백업 및 복원</span><b>›</b></button><button className="setting-row" type="button" onClick={onNotifications}><span>알림 설정</span><b>›</b></button></Modal>;
}

function sortDailyItems(items: DisplayTodo[], order: string[]) {
  const positions = new Map(order.map((key, index) => [key, index]));
  return [...items].sort((a, b) => {
    if (positions.has(a.key) || positions.has(b.key)) return (positions.get(a.key) ?? 9_999) - (positions.get(b.key) ?? 9_999);
    if (a.type !== b.type) return a.type === 'one_time' ? -1 : 1;
    if (a.type === 'one_time') return (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99') || a.createdAt.localeCompare(b.createdAt);
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export default function App() {
  const today = todayInSeoul();
  const [selectedDate, setSelectedDate] = useState(today);
  const [visibleStart, setVisibleStart] = useState(sundayStart(today));
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<DisplayTodo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DisplayTodo | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarSelected, setCalendarSelected] = useState(today);
  const [calendarAnchor, setCalendarAnchor] = useState(`${today.slice(0, 7)}-01`);
  const [pendingImport, setPendingImport] = useState<{ name: string; text: string } | null>(null);
  const [receipt, setReceipt] = useState<DeleteReceipt | null>(null);
  const [notice, setNotice] = useState('');
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [orders, setOrders] = useState<Record<string, string[]>>({});
  const openerRef = useRef<HTMLElement | null>(null);
  const undoTimer = useRef<number | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const weekRef = useRef<HTMLElement>(null);
  const dateGesture = useRef<{ pointerId: number; startX: number; dx: number; date: string | null } | null>(null);
  const suppressDateClick = useRef(false);

  async function refresh() { setSnapshot(await loadSnapshot()); }
  useEffect(() => { void refresh().catch((reason) => setError(reason instanceof Error ? reason.message : '목록을 불러오지 못했어요.')).finally(() => setReady(true)); }, []);
  useEffect(() => () => { if (undoTimer.current) window.clearTimeout(undoTimer.current); if (noticeTimer.current) window.clearTimeout(noticeTimer.current); }, []);
  useEffect(() => {
    const closeRows = (event: PointerEvent) => { if (!(event.target as HTMLElement).closest('.swipe-item')) setOpenItem(null); };
    document.addEventListener('pointerdown', closeRows);
    return () => document.removeEventListener('pointerdown', closeRows);
  }, []);

  const items = useMemo(() => sortDailyItems(materializeItems(snapshot.todos, snapshot.records, selectedDate), orders[selectedDate] ?? []), [orders, selectedDate, snapshot]);
  const activeItems = items.filter((item) => item.status !== 'skipped');
  const completed = activeItems.filter((item) => item.status === 'completed').length;
  const percent = activeItems.length ? Math.round(completed / activeItems.length * 100) : 0;
  const source = editing ? snapshot.todos.find((todo) => todo.id === editing.todoId) ?? null : null;
  const week = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(visibleStart, index)), [visibleStart]);

  function showNotice(message: string) {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3_500);
  }
  function closeOverlay() {
    setOverlay(null); setEditing(null); setDeleteTarget(null); setPendingImport(null);
    queueMicrotask(() => openerRef.current?.focus());
  }
  async function run(action: () => Promise<void>, close = false) {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); await refresh(); if (close) closeOverlay(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '저장하지 못했어요. 다시 시도해 주세요.'); throw reason; }
    finally { setBusy(false); }
  }
  function firstSeriesOccurrence(item: DisplayTodo) {
    const first = snapshot.todos
      .filter((todo) => todo.seriesId === item.seriesId && todo.repeatStartDate)
      .sort((a, b) => a.repeatStartDate!.localeCompare(b.repeatStartDate!))[0];
    if (!first?.repeatStartDate) return item.targetDate;
    for (let offset = 0; offset < 7; offset += 1) {
      const candidate = addDays(first.repeatStartDate, offset);
      if (occursOn(first, candidate)) return candidate;
    }
    return item.targetDate;
  }
  async function submit(input: CreateTodoInput | RecurringPatch | TodoContentPatch, scope: EditScope, type: ItemType) {
    await run(async () => {
      if (!editing) {
        const created = input as CreateTodoInput;
        await createTodo(created);
        if (created.type === 'one_time') { setSelectedDate(created.dueDate); setVisibleStart(sundayStart(created.dueDate)); }
      } else if (editing.type === 'one_time') await updateOneTime(editing.todoId, input as TodoContentPatch);
      else await updateRecurring(editing.seriesId!, scope === 'all' ? firstSeriesOccurrence(editing) : editing.targetDate, scope === 'date' ? 'date' : 'future', input as RecurringPatch);
      showNotice(editing ? '항목을 수정했어요.' : `${type === 'habit' ? '습관' : '할 일'}을 추가했어요.`);
    }, true);
  }
  async function commitDelete(item: DisplayTodo, scope: EditScope) {
    await run(async () => {
      const target = scope === 'all' ? { ...item, targetDate: firstSeriesOccurrence(item) } : item;
      const nextReceipt = await deleteOccurrence(target, scope === 'date' ? 'date' : 'future');
      setReceipt(nextReceipt);
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => setReceipt(null), 5_000);
    }, true);
  }
  async function undo() {
    if (!receipt) return;
    await run(async () => { await undoDelete(receipt); setReceipt(null); if (undoTimer.current) window.clearTimeout(undoTimer.current); });
  }
  async function exportData() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const backup = await createBackup();
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `my-daily-todo-${today}.json`; link.click(); URL.revokeObjectURL(url);
      showNotice('백업 파일을 저장했어요.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '백업 파일을 만들지 못했어요.'); }
    finally { setBusy(false); }
  }
  async function prepareImport(file: File) {
    if (busy) return;
    setBusy(true); setError('');
    try { const text = await file.text(); parseAndValidateBackup(text); setPendingImport({ name: file.name, text }); setOverlay('import'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '백업 파일을 읽지 못했어요.'); }
    finally { setBusy(false); }
  }
  function reorder(sourceKey: string, targetKey: string, before: boolean) {
    if (!targetKey || sourceKey === targetKey) return;
    const next = items.map((item) => item.key).filter((key) => key !== sourceKey);
    const targetIndex = next.indexOf(targetKey);
    if (targetIndex < 0) return;
    next.splice(targetIndex + (before ? 0 : 1), 0, sourceKey);
    setOrders((value) => ({ ...value, [selectedDate]: next }));
  }
  function keyboardMove(sourceKey: string, amount: -1 | 1) {
    const current = items.map((item) => item.key);
    const index = current.indexOf(sourceKey); const target = index + amount;
    if (index < 0 || target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    setOrders((value) => ({ ...value, [selectedDate]: current })); showNotice('순서를 변경했어요.');
  }
  function startDateSwipe(event: ReactPointerEvent<HTMLElement>) {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.day-button');
    dateGesture.current = { pointerId: event.pointerId, startX: event.clientX, dx: 0, date: button?.dataset.date ?? null };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDateSwipe(event: ReactPointerEvent<HTMLElement>) {
    if (!dateGesture.current || !weekRef.current) return;
    dateGesture.current.dx = event.clientX - dateGesture.current.startX;
    if (Math.abs(dateGesture.current.dx) < 6) return;
    event.preventDefault();
    weekRef.current.style.transform = `translateX(${Math.max(-46, Math.min(46, dateGesture.current.dx * 0.28))}px)`;
  }
  function finishDateSwipe(event: ReactPointerEvent<HTMLElement>) {
    const gesture = dateGesture.current;
    if (!gesture) return;
    if (event.currentTarget.hasPointerCapture(gesture.pointerId)) event.currentTarget.releasePointerCapture(gesture.pointerId);
    if (weekRef.current) weekRef.current.style.transform = 'translateX(0)';
    const distance = Math.abs(gesture.dx);
    if (distance > 42) {
      const amount = gesture.dx < 0 ? 7 : -7;
      suppressDateClick.current = true; setVisibleStart((value) => addDays(value, amount)); setSelectedDate((value) => addDays(value, amount));
      queueMicrotask(() => { suppressDateClick.current = false; });
    } else if (distance < 8 && gesture.date) {
      suppressDateClick.current = true; setSelectedDate(gesture.date); queueMicrotask(() => { suppressDateClick.current = false; });
    }
    dateGesture.current = null;
  }
  function openCalendar(button: HTMLButtonElement) {
    openerRef.current = button; setCalendarSelected(selectedDate); setCalendarAnchor(`${selectedDate.slice(0, 7)}-01`); setCalendarOpen(true);
  }
  function closeCalendar() { setCalendarOpen(false); queueMicrotask(() => openerRef.current?.focus()); }

  return <>
    <main className="app-shell" aria-label="My Daily Todo 앱 목업">
      <header className="app-header"><div className="header-date"><p className="eyebrow">{formatHeading(selectedDate)}</p>{selectedDate !== today && <button className="today-button" type="button" onClick={() => { setSelectedDate(today); setVisibleStart(sundayStart(today)); }}>현재</button>}</div><div className="header-actions"><button className="icon-button calendar-button" type="button" aria-label="캘린더 열기" onClick={(event) => openCalendar(event.currentTarget)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm0 5h14M8 2v4m8-4v4" /></svg></button><button className="icon-button avatar-button" type="button" aria-label="설정 열기" onClick={(event) => { openerRef.current = event.currentTarget; setOverlay('settings'); }}><span>MJ</span></button></div></header>
      <div className="date-row"><section ref={weekRef} className="week-strip" aria-label="날짜 선택" onPointerDown={startDateSwipe} onPointerMove={moveDateSwipe} onPointerUp={finishDateSwipe} onPointerCancel={finishDateSwipe}>{week.map((date) => { const { parsed, day } = dateParts(date); const count = materializeItems(snapshot.todos, snapshot.records, date).length; return <button key={date} className={`day-button ${date === selectedDate ? 'is-selected' : ''} ${date === today ? 'is-today' : ''}`} type="button" data-date={date} aria-label={`${formatHeading(date)}${count ? `, ${count}개 항목` : ''}`} onClick={() => { if (!suppressDateClick.current) setSelectedDate(date); }}><span>{WEEKDAY_LABELS[parsed.getUTCDay()]}</span><strong>{day}</strong>{count > 0 && <i />}</button>; })}</section></div>
      <section className="progress-card" aria-labelledby="progress-title"><div className="progress-heading"><h2 id="progress-title">선택한 날짜 진행률</h2><div className="progress-numbers"><span>{completed}</span> / <span>{activeItems.length}</span><strong>{percent}%</strong></div></div><div className="progress-track" role="progressbar" aria-label={`${dateParts(selectedDate).month}월 ${dateParts(selectedDate).day}일 전체 진행률`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div></section>
      <section className="content-section" aria-labelledby="daily-heading"><div className="section-heading-row"><div><p className="section-kicker">DAILY LIST</p><h2 id="daily-heading">{selectedDate === today ? '오늘의 목록' : `${dateParts(selectedDate).month}월 ${dateParts(selectedDate).day}일 목록`}</h2></div><button className="mini-add-button" type="button" onClick={(event) => { openerRef.current = event.currentTarget; setEditing(null); setOverlay('form'); }}>NEW TASK <span>+</span></button></div>
        {error && <div className="error-banner" role="alert"><strong>저장 또는 조회에 문제가 생겼어요.</strong><span>{error}</span><button type="button" onClick={() => void refresh().then(() => setError('')).catch(() => undefined)}>다시 불러오기</button></div>}
        <div className="unified-list" aria-live="polite" aria-busy={!ready || busy}>{!ready && <div className="empty-state"><strong>목록을 불러오는 중이에요</strong><p>기기에 저장된 할 일을 확인하고 있어요.</p></div>}{ready && !items.length && <div className="empty-state"><strong>이날의 항목이 없어요</strong><p>NEW TASK 버튼으로 할 일이나 습관을 추가해 보세요.</p></div>}{items.map((item) => <TaskCard key={item.key} item={item} snapshot={snapshot} busy={busy} open={openItem === item.key} onOpen={(open) => setOpenItem(open ? item.key : null)} onToggle={() => void run(async () => { if (item.type === 'one_time') await setOneTimeStatus(item.todoId, item.status === 'completed' ? 'pending' : 'completed'); else await setRecurringStatus(item.seriesId!, item.targetDate, item.status === 'completed' ? 'pending' : 'completed'); showNotice(item.status === 'completed' ? '완료를 취소했어요.' : '완료했어요.'); }).catch(() => undefined)} onSkip={() => void run(async () => { await setRecurringStatus(item.seriesId!, item.targetDate, item.status === 'skipped' ? 'pending' : 'skipped'); showNotice(item.status === 'skipped' ? '건너뜀을 취소했어요.' : '오늘은 건너뛰었어요.'); }).catch(() => undefined)} onEdit={(button) => { openerRef.current = button; setEditing(item); setOpenItem(null); setOverlay('form'); }} onDelete={(button) => { openerRef.current = button; setOpenItem(null); if (item.type === 'recurring') { setDeleteTarget(item); setOverlay('delete'); } else void commitDelete(item, 'date').catch(() => undefined); }} onReorder={(targetKey, before) => reorder(item.key, targetKey, before)} onKeyboardMove={(amount) => keyboardMove(item.key, amount)} />)}</div>
      </section><div className="bottom-space" aria-hidden="true" />
    </main>
    {calendarOpen && <CalendarView anchor={calendarAnchor} selected={calendarSelected} today={today} snapshot={snapshot} onMove={(amount) => setCalendarAnchor(changeMonth(calendarAnchor, amount))} onSelect={(date) => { setCalendarSelected(date); setCalendarAnchor(`${date.slice(0, 7)}-01`); }} onToday={() => { setCalendarSelected(today); setCalendarAnchor(`${today.slice(0, 7)}-01`); }} onOpenDate={() => { setSelectedDate(calendarSelected); setVisibleStart(sundayStart(calendarSelected)); closeCalendar(); }} onClose={closeCalendar} />}
    {overlay === 'form' && <TodoForm selectedDate={selectedDate} editing={editing} source={source} saving={busy} onCancel={closeOverlay} onSubmit={submit} />}
    {overlay === 'delete' && deleteTarget && <Modal kicker="REPEAT ITEM" title="어디에서 삭제할까요?" compact onClose={closeOverlay}><div className="scope-action-list"><button type="button" disabled={busy} onClick={() => void commitDelete(deleteTarget, 'date').catch(() => undefined)}><strong>오늘만</strong><small>선택한 날짜에서만 숨겨요</small></button><button type="button" disabled={busy} onClick={() => void commitDelete(deleteTarget, 'future').catch(() => undefined)}><strong>오늘 이후</strong><small>이전 기록은 그대로 남겨요</small></button><button type="button" disabled={busy} onClick={() => void commitDelete(deleteTarget, 'all').catch(() => undefined)}><strong>전체 반복</strong><small>모든 날짜에서 삭제해요</small></button></div></Modal>}
    {overlay === 'settings' && <SettingsPanel onClose={closeOverlay} onData={() => { setError(''); setOverlay('data'); }} onNotifications={() => { closeOverlay(); showNotice('알림 설정은 다음 단계에서 제공할 예정이에요.'); }} />}
    {overlay === 'data' && <DataPanel busy={busy} error={error} onClose={closeOverlay} onExport={() => void exportData()} onImport={(file) => void prepareImport(file)} onReset={() => setOverlay('reset')} />}
    {overlay === 'import' && pendingImport && <Modal kicker="DATA" title="백업으로 복원" compact onClose={closeOverlay}><p className="scope-copy"><strong>{pendingImport.name}</strong>의 데이터로 현재 기기 내용을 모두 바꿉니다. 검증된 파일만 한 번에 반영되며 되돌릴 수 없어요.</p><button className="destructive-button" type="button" disabled={busy} onClick={() => void run(async () => { await restoreBackup(pendingImport.text); showNotice('백업 데이터를 복원했어요.'); }, true).catch(() => undefined)}>현재 데이터 교체</button></Modal>}
    {overlay === 'reset' && <Modal kicker="DATA" title="모든 데이터 삭제" compact onClose={closeOverlay}><p className="scope-copy">할 일과 반복 수행 기록을 이 기기에서 모두 삭제합니다. 이 작업은 실행 취소할 수 없어요.</p><button className="destructive-button" type="button" disabled={busy} onClick={() => void run(async () => { await clearAllData(); showNotice('모든 데이터를 삭제했어요.'); }, true).catch(() => undefined)}>모든 데이터 삭제</button></Modal>}
    {receipt && <div className="toast" role="status" aria-live="polite"><span>항목을 삭제했어요.</span><button type="button" onClick={() => void undo().catch(() => undefined)}>실행 취소</button></div>}
    {notice && !receipt && <div className="toast" role="status" aria-live="polite"><span>{notice}</span></div>}
  </>;
}
