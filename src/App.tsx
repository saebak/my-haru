import {
  CSSProperties,
  FormEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  closestCenter,
  DndContext,
  DraggableAttributes,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SchedulePicker } from './components/SchedulePicker';
import { Notebook } from './components/Notebook';
import { ActionIcon } from './components/ActionIcon';
import { TagChip, TagField, TagManager, TagSelect } from './components/Tags';
import { activeTags, addTags, deleteTag, emptyTagBook, moveTag, updateTag, type Tag, type TagBook, type TagInput } from './domain/tags';

import { addDays, daysBetween, formatDate, monthGrid, parseDate, todayInSeoul } from './domain/todos/date';
import { completionStreak, materializeItems, occursOn, TodoError } from './domain/todos/todoDomain';
import type {
  CreateTodoInput,
  DeleteReceipt,
  DisplayTodo,
  Priority,
  RepeatFrequency,
  RecurringPatch,
  TodoContentPatch,
  TodoData,
  TodoRecordData,
} from './domain/todos/types';
import { createBackup, parseAndValidateBackup, restoreBackup } from './features/backup/backup';
import { saveBackupText } from './features/backup/exportBackup';
import { initializeCloudSync, syncIfConnected, type CloudSyncStatus } from './infrastructure/sync/cloudSync';
import {
  clearAllData,
  completeOnboarding,
  convertOneTimeToRecurring,
  createTodo,
  deleteOccurrence,
  hasCompletedOnboarding,
  loadManualOrders,
  loadRecurringOrders,
  generateUuid,
  loadSnapshot,
  loadTagBook,
  setOneTimeStatus,
  setRecurringStatus,
  saveManualOrder,
  saveRecurringOrderFrom,
  undoDelete,
  updateOneTime,
  updateRecurring,
  updateTagBook,
} from './infrastructure/indexed-db/todoRepository';

type Snapshot = { todos: TodoData[]; records: TodoRecordData[] };
type ItemType = 'todo' | 'habit';
type EditScope = 'date' | 'future' | 'all';
type Overlay = 'detail' | 'copy' | 'form' | 'delete' | 'settings' | 'data' | 'import' | 'reset' | 'tags' | null;
type SlideDirection = 'previous' | 'next';

const EMPTY_SNAPSHOT: Snapshot = { todos: [], records: [] };
const tagDeps = { now: () => new Date(), uuid: () => generateUuid() };
const PRIORITY_LABEL: Record<Priority, string> = { high: '중요', normal: '보통', low: '낮음' };
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const FORM_WEEKDAYS = [
  { label: '월', value: 1 }, { label: '화', value: 2 }, { label: '수', value: 3 },
  { label: '목', value: 4 }, { label: '금', value: 5 }, { label: '토', value: 6 },
  { label: '일', value: 7 },
];
const EMOJIS = [
  '✅', '📌', '📝', '📖', '📚', '✏️', '💡', '🎯', '⭐', '🔥',
  '💧', '🌱', '🌿', '🏃', '🚶', '💪', '🧘', '🚴', '🏊', '⚽',
  '💊', '🩺', '🦷', '🥗', '🍎', '☕', '🍳', '🧹', '🛒', '💰',
  '💻', '📞', '💬', '📧', '🎨', '🎵', '🎁', '❤️', '😊', '🌙',
];

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

function itemType(item: DisplayTodo): ItemType {
  return item.category;
}

function Modal({
  kicker,
  title,
  closeLabel = '닫기',
  compact = false,
  onClose,
  children,
  initialFocus,
  headerAction,
}: {
  kicker: string;
  title: string;
  closeLabel?: string;
  compact?: boolean;
  onClose: () => void;
  children: ReactNode;
  initialFocus?: RefObject<HTMLElement | null>;
  headerAction?: ReactNode;
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

  return <div className={`modal-backdrop ${compact ? '' : 'form-dialog-backdrop'}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={panelRef} className={`bottom-sheet ${compact ? 'compact-sheet' : 'form-dialog'}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="sheet-handle" aria-hidden="true" />
      <div className="sheet-header"><div><p className="section-kicker">{kicker}</p><h2 id={titleId}>{title}</h2></div><div className="header-actions">{headerAction}<button className="icon-button" type="button" onClick={onClose} aria-label={closeLabel}>×</button></div></div>
      {children}
    </section>
  </div>;
}

function TodoForm({
  selectedDate,
  editing,
  source,
  saving,
  tagBook,
  defaultTagId,
  onCreateTag,
  onRenameTag,
  onDeleteTag,
  onCancel,
  onSubmit,
}: {
  selectedDate: string;
  editing: DisplayTodo | null;
  source: TodoData | null;
  saving: boolean;
  tagBook: TagBook;
  defaultTagId: string;
  onCreateTag: (input: TagInput) => Promise<Tag>;
  onRenameTag: (id: string, name: string) => Promise<unknown>;
  onDeleteTag: (id: string) => Promise<unknown>;
  onCancel: () => void;
  onSubmit: (input: CreateTodoInput | RecurringPatch | TodoContentPatch, scope: EditScope, type: ItemType) => Promise<void>;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<ItemType>(editing ? itemType(editing) : 'todo');
  const [repeating, setRepeating] = useState(editing?.type === 'recurring');
  const [emoji, setEmoji] = useState(editing?.emoji || '💡');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [date, setDate] = useState(editing?.targetDate ?? selectedDate);
  const [time, setTime] = useState(editing?.dueTime ?? '');
  const [repeatUntil, setRepeatUntil] = useState(source?.repeatEndDate ?? '');
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>(source?.repeatFrequency ?? 'daily');
  const [repeatInterval, setRepeatInterval] = useState(source?.repeatInterval ?? 2);
  const [scope, setScope] = useState<EditScope>('date');
  const [formError, setFormError] = useState('');
  // 수정 시 원래 태그가 삭제됐으면 선택 없음으로 보여주되, 사용자가 바꾸지 않으면 저장값을 건드리지 않는다.
  const originalTagId = editing?.tagIds.find((id) => activeTags(tagBook).some((tag) => tag.id === id)) ?? '';
  const [tagId, setTagId] = useState(editing ? originalTagId : defaultTagId);
  const tagChanged = editing ? tagId !== originalTagId : Boolean(tagId);
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
    if (!editing) setRepeating(next === 'habit');
    if (!emoji) setEmoji('💡');
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
      category: type,
      title,
      memo: String(data.get('memo') ?? '').trim(),
      emoji: emoji || '💡',
      priority: String(data.get('priority') ?? 'normal') as Priority,
      dueTime: isHabit ? null : String(data.get('time') ?? '') || null,
      ...(tagChanged ? { tagIds: tagId ? [tagId] : [] } : {}),
    };
    if (editing?.type === 'recurring' && scope === 'date' && tagChanged) {
      setFormError('반복 항목의 태그는 "오늘 이후" 또는 "전체 반복"으로 바꿀 수 있어요.');
      return;
    }
    try {
      if (!repeats) {
        await onSubmit({ type: 'one_time', ...content, dueDate: String(data.get('date') ?? selectedDate) }, scope, type);
        return;
      }
      const frequency = String(data.get('repeatFrequency') ?? repeatFrequency) as RepeatFrequency;
      const weekdays = frequency === 'weekly' ? data.getAll('weekdays').map(Number) : [];
      const patch: RecurringPatch = {
        ...content,
        repeatFrequency: frequency,
        repeatInterval: frequency === 'interval_days' ? Number(data.get('repeatInterval') ?? repeatInterval) : 1,
        repeatWeekdays: weekdays,
        repeatEndDate: String(data.get('repeatUntil') ?? '') || null,
      };
      await onSubmit(
        editing?.type === 'recurring' ? patch : { type: 'recurring', ...patch, repeatStartDate: isHabit ? selectedDate : String(data.get('date') ?? selectedDate) },
        scope,
        type,
      );
    } catch (reason) {
      setFormError(reason instanceof TodoError ? reason.message : '저장하지 못했어요. 입력 내용을 확인하고 다시 시도해 주세요.');
    }
  }

  return <Modal kicker={editing ? '일정 수정' : '새로운 계획'} title={editing ? '항목 수정' : '무엇을 시작할까요?'} onClose={onCancel}>
    <form onSubmit={(event) => void submit(event)}>
      <fieldset className="type-picker">
        <legend className="sr-only">항목 종류</legend>
        <label><input type="radio" name="type" value="todo" checked={type === 'todo'} disabled={Boolean(editing)} onChange={() => selectType('todo')} /><span>할 일</span></label>
        <label><input type="radio" name="type" value="habit" checked={type === 'habit'} disabled={Boolean(editing)} onChange={() => selectType('habit')} /><span>습관</span></label>
      </fieldset>
      <label className="field-label" htmlFor="task-title">무엇을 할까요?</label>
      <input ref={titleRef} id="task-title" name="title" type="text" placeholder="내용을 입력하세요" autoComplete="off" required maxLength={120} defaultValue={editing?.title ?? ''} aria-describedby={formError ? 'form-error' : undefined} />
      <TagField book={tagBook} value={tagId} onChange={setTagId} onCreate={onCreateTag} onRename={onRenameTag} onDelete={onDeleteTag} disabled={saving} />
      <div className={`field-grid quick-field-grid ${isHabit ? 'is-habit' : ''}`}>
        <div className="emoji-field">
          <span className="field-label">이모지 <em>선택</em></span>
          <input name="emoji" type="hidden" value={emoji} readOnly />
          <button className="emoji-trigger" type="button" aria-expanded={emojiOpen} aria-controls="emoji-picker" onClick={() => setEmojiOpen((value) => !value)}><span>{emoji || '💡'}</span><small>눌러서 선택</small></button>
          <div className={`emoji-picker ${emojiOpen ? 'is-open' : ''}`} id="emoji-picker" aria-label="이모지 선택" hidden={!emojiOpen}>
            {EMOJIS.map((value) => <button key={value} className={emoji === value ? 'is-selected' : ''} type="button" data-emoji={value} onClick={() => { setEmoji(value); setEmojiOpen(false); }}>{value}</button>)}
          </div>
        </div>
        <div hidden={isHabit}><SchedulePicker name="time" label="시간" value={time} onChange={setTime} time optional /></div>
      </div>
      <div className="date-priority-row" hidden={isHabit}>
        <SchedulePicker name="date" label="날짜" value={date} onChange={setDate} />
        <fieldset className="priority-picker">
          <legend className="field-label">중요도</legend>
          <label><input type="radio" name="priority" value="low" defaultChecked={editing?.priority === 'low'} /><span>낮음</span></label>
          <label><input type="radio" name="priority" value="normal" defaultChecked={!editing || editing.priority === 'normal'} /><span>보통</span></label>
          <label><input type="radio" name="priority" value="high" defaultChecked={editing?.priority === 'high'} /><span>중요</span></label>
        </fieldset>
      </div>
      {isHabit && <input type="hidden" name="priority" value={editing?.priority ?? 'normal'} />}
      <label className="repeat-toggle"><span><strong>반복</strong><small>매일, 요일별 또는 며칠마다 반복할 수 있어요</small></span><input name="repeat" type="checkbox" checked={repeats} disabled={isHabit || editing?.type === 'recurring'} onChange={(event) => setRepeating(event.target.checked)} /><i aria-hidden="true" /></label>
      <div className="repeat-options" hidden={!repeats}>
        <fieldset className="repeat-frequency-picker">
          <legend className="field-label">반복 방식</legend>
          <label><input type="radio" name="repeatFrequency" value="daily" checked={repeatFrequency === 'daily'} onChange={() => setRepeatFrequency('daily')} /><span>매일</span></label>
          <label><input type="radio" name="repeatFrequency" value="weekly" checked={repeatFrequency === 'weekly'} onChange={() => setRepeatFrequency('weekly')} /><span>요일별</span></label>
          <label><input type="radio" name="repeatFrequency" value="interval_days" checked={repeatFrequency === 'interval_days'} onChange={() => setRepeatFrequency('interval_days')} /><span>며칠마다</span></label>
        </fieldset>
        {repeatFrequency === 'weekly' && <><span className="field-label">반복 요일</span><div className="weekday-picker" aria-label="반복 요일 선택">
          {FORM_WEEKDAYS.map(({ label, value }) => <label key={value}><input type="checkbox" name="weekdays" value={value} defaultChecked={source?.repeatFrequency === 'weekly' && source.repeatWeekdays.includes(value)} /><span>{label}</span></label>)}
        </div></>}
        {repeatFrequency === 'interval_days' && <label className="interval-field"><span className="field-label">반복 간격</span><span><input name="repeatInterval" type="number" min={2} max={365} value={repeatInterval} onChange={(event) => setRepeatInterval(Number(event.target.value))} />일마다</span></label>}
        <SchedulePicker name="repeatUntil" label="반복 종료일" value={repeatUntil} onChange={setRepeatUntil} min={isHabit ? selectedDate : date} optional />
      </div>
      <label className="field-label" htmlFor="task-memo">메모 <span>선택</span></label>
      <textarea id="task-memo" name="memo" rows={2} placeholder="잊지 말아야 할 내용을 적어두세요" maxLength={2000} defaultValue={editing?.memo ?? ''} />
      {editing?.type === 'recurring' && <fieldset className="scope-picker">
        <legend>반복 변경 범위</legend>
        <label><input type="radio" name="editScope" value="date" checked={scope === 'date'} onChange={() => setScope('date')} /><span>오늘만</span></label>
        <label><input type="radio" name="editScope" value="future" checked={scope === 'future'} onChange={() => setScope('future')} /><span>오늘 이후</span></label>
        <label><input type="radio" name="editScope" value="all" checked={scope === 'all'} onChange={() => setScope('all')} /><span>전체 반복</span></label>
      </fieldset>}
      {formError && <p id="form-error" className="form-error" role="alert">{formError}</p>}
      <div className="form-submit-bar"><button className="primary-button" type="submit" disabled={saving}>{saving ? '저장 중…' : `${isHabit ? '습관' : '할 일'} ${editing ? '수정' : '추가'}`}</button></div>
    </form>
  </Modal>;
}

const SWIPE_ACTION_WIDTH = 112;
/** 이 속도(px/ms)보다 빠르게 튕기면 이동 거리와 관계없이 그 방향으로 열거나 닫는다. */
const SWIPE_FLICK_VELOCITY = 0.35;
/** 열림 범위를 넘어 끌면 저항감을 줘 손가락보다 덜 움직이게 한다. */
function rubberBand(offset: number) {
  if (offset > 0) return offset * 0.25;
  if (offset < -SWIPE_ACTION_WIDTH) return -SWIPE_ACTION_WIDTH + (offset + SWIPE_ACTION_WIDTH) * 0.25;
  return offset;
}

function streakFor(snapshot: Snapshot, item: DisplayTodo) {
  return item.seriesId ? completionStreak(snapshot.todos, snapshot.records, item.seriesId, item.targetDate) : 0;
}

type TaskCardProps = {
  item: DisplayTodo;
  tag: Tag | null;
  snapshot: Snapshot;
  busy: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
  onToggle: () => void;
  onView: (button: HTMLButtonElement) => void;
  onEdit: (button: HTMLButtonElement) => void;
  onDelete: (button: HTMLButtonElement) => void;
};

function TaskCard({
  item, tag, snapshot, busy, open, onOpen, onToggle, onEdit, onDelete, onView,
  setNodeRef, setActivatorNodeRef, sortableStyle, dragging = false, dragAttributes, dragListeners,
}: TaskCardProps & {
  setNodeRef?: (node: HTMLDivElement | null) => void;
  setActivatorNodeRef?: (node: HTMLButtonElement | null) => void;
  sortableStyle?: CSSProperties;
  dragging?: boolean;
  dragAttributes?: DraggableAttributes;
  dragListeners?: ReturnType<typeof useSortable>['listeners'];
}) {
  const routine = itemType(item) === 'habit';
  const done = item.status === 'completed';
  const skipped = item.status === 'skipped';
  const rowGesture = useRef<{ pointerId: number; x: number; y: number; base: number; offset: number; axis: 'x' | 'y' | null; lastX: number; lastT: number; velocity: number } | null>(null);
  const rowClick = useRef(false);

  // 터치 시작 시점에 카드가 포인터를 잡는다. 이동 중에 잡으면 손가락이 처음 닿은 자식 요소의 암묵적 capture가 풀리며
  // lostpointercapture가 버블링돼 스와이프가 중간에 취소되므로(실기기 회귀), 시작할 때만 잡는다.
  function startRowSwipe(event: ReactPointerEvent<HTMLElement>) {
    rowClick.current = false;
    if (!event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest('button:not(.item-detail-button)')) return;
    const base = open ? -SWIPE_ACTION_WIDTH : 0;
    rowGesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, base, offset: base, axis: null, lastX: event.clientX, lastT: event.timeStamp, velocity: 0 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function moveRowSwipe(event: ReactPointerEvent<HTMLElement>) {
    const gesture = rowGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
      gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (gesture.axis === 'y') return;
      event.currentTarget.style.transition = 'none';
      event.currentTarget.parentElement?.classList.add('is-swiping');
    }
    if (gesture.axis !== 'x') return;
    event.preventDefault();
    const elapsed = event.timeStamp - gesture.lastT;
    if (elapsed > 0) gesture.velocity = 0.8 * ((event.clientX - gesture.lastX) / elapsed) + 0.2 * gesture.velocity;
    gesture.lastX = event.clientX;
    gesture.lastT = event.timeStamp;
    gesture.offset = rubberBand(gesture.base + dx);
    event.currentTarget.style.transform = `translateX(${gesture.offset}px)`;
  }
  function finishRowSwipe(event: ReactPointerEvent<HTMLElement>, cancelled: boolean) {
    const gesture = rowGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    rowGesture.current = null;
    if (event.currentTarget.hasPointerCapture?.(gesture.pointerId)) event.currentTarget.releasePointerCapture(gesture.pointerId);
    // 인라인 값을 지우면 CSS transition이 현재 손가락 위치에서 열림·닫힘 위치까지 이어서 움직인다.
    event.currentTarget.style.transition = '';
    event.currentTarget.style.transform = '';
    event.currentTarget.parentElement?.classList.remove('is-swiping');
    if (gesture.axis !== 'x') return;
    rowClick.current = true;
    window.setTimeout(() => { rowClick.current = false; }, 0);
    const flick = Math.abs(gesture.velocity) > SWIPE_FLICK_VELOCITY;
    onOpen(cancelled ? open : flick ? gesture.velocity < 0 : gesture.offset < -SWIPE_ACTION_WIDTH / 2);
  }

  return <div ref={setNodeRef} style={sortableStyle} className={`swipe-item ${open ? 'is-open' : ''} ${dragging ? 'is-dragging' : ''}`} data-id={item.todoId} data-type={routine ? 'habit' : 'todo'} data-order-key={item.key}>
    <div className="swipe-actions" aria-hidden={!open}>
      <button className="edit-action" type="button" data-action="edit" tabIndex={open ? 0 : -1} disabled={busy} onClick={(event) => onEdit(event.currentTarget)}>수정</button>
      <button className="delete-action" type="button" data-action="delete" tabIndex={open ? 0 : -1} disabled={busy} onClick={(event) => onDelete(event.currentTarget)}>삭제</button>
    </div>
<article className={`item-card ${done ? 'is-done' : ''} ${skipped ? 'is-skipped' : ''}`} aria-label={`${item.title}${done ? ', 완료됨' : ''}`} onKeyDown={event => { if (event.key === 'F10' && event.shiftKey) { event.preventDefault(); onOpen(true); const row = event.currentTarget.parentElement; window.setTimeout(() => row?.querySelector<HTMLButtonElement>('[data-action="edit"]')?.focus(), 0); } }} onPointerDown={startRowSwipe} onPointerMove={moveRowSwipe} onPointerUp={event => finishRowSwipe(event, false)} onPointerCancel={event => finishRowSwipe(event, true)} onLostPointerCapture={event => { if (event.target === event.currentTarget) finishRowSwipe(event, false); }} onClickCapture={event => { if (rowClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); rowClick.current = false; } }}>
      <div className="item-icon" aria-hidden="true">{item.emoji || '💡'}</div>
      <button type="button" className="item-body item-detail-button" aria-label={`${item.title} 상세보기`} onClick={event => onView(event.currentTarget)}><span className="item-title-row"><strong className="item-title">{item.title}</strong><span className={`item-type-tag ${routine ? 'routine' : 'todo'}`}>{routine ? 'ROUTINE' : 'TODO'}</span></span>{item.memo && <span className="item-memo">{item.memo}</span>}<span className="item-meta">{tag && <TagChip tag={tag} />}{routine && done && <span className="streak-badge">🔥 {streakFor(snapshot, item)}일 연속</span>}{!routine && <span className={`priority-mark ${item.priority}`}>{PRIORITY_LABEL[item.priority]}</span>}{item.dueTime && <span>{item.dueTime}</span>}{skipped && <span>건너뜀</span>}{done && <span className="completion-badge">✓ 완료됨</span>}</span></button>
      <button className={`item-check ${done ? 'is-done' : ''}`} type="button" data-action="toggle" disabled={busy} onClick={onToggle} aria-label={`${item.title} ${done ? '완료 취소' : '완료'}`}>✓</button>
      <button ref={setActivatorNodeRef} {...dragAttributes} {...dragListeners} className="drag-handle" type="button" data-action="drag" aria-label={`${item.title} 순서 변경`}>⠿</button>
    </article>
  </div>;
}

function SortableTaskCard(props: TaskCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: props.item.key, disabled: props.busy });
  return <TaskCard {...props} setNodeRef={setNodeRef} setActivatorNodeRef={setActivatorNodeRef} dragging={isDragging}
    dragAttributes={attributes} dragListeners={listeners}
    sortableStyle={{ transform: CSS.Transform.toString(transform), transition }} />;
}

function DraggedTaskCard({ item, tag, snapshot }: { item: DisplayTodo; tag: Tag | null; snapshot: Snapshot }) {
  const routine = itemType(item) === 'habit';
  return <article className="item-card drag-overlay" aria-hidden="true">
    <div className="item-icon">{item.emoji || '💡'}</div>
    <div className="item-body"><div className="item-title-row"><strong className="item-title">{item.title}</strong><span className={`item-type-tag ${routine ? 'routine' : 'todo'}`}>{routine ? 'ROUTINE' : 'TODO'}</span></div><div className="item-meta">{tag && <TagChip tag={tag} />}{routine && item.status === 'completed' && <span className="streak-badge">🔥 {streakFor(snapshot, item)}일 연속</span>}{!routine && <><span className={`priority-mark ${item.priority}`}>{PRIORITY_LABEL[item.priority]}</span>{item.dueTime && <span>{item.dueTime}</span>}</>}</div></div>
    <span className="drag-overlay-handle" aria-hidden="true">⠿</span>
  </article>;
}

function agendaDetail(item: DisplayTodo, snapshot: Snapshot) {
  if (itemType(item) === 'habit') {
    if (item.status === 'completed') return `${streakFor(snapshot, item)}일 연속 · 완료`;
    return item.status === 'skipped' ? '건너뜀' : '';
  }
  return [item.dueTime, PRIORITY_LABEL[item.priority], item.status === 'completed' ? '완료' : null]
    .filter((value): value is string => Boolean(value))
    .join(' · ');
}

function calendarCompletion(items: DisplayTodo[]) {
  const measurable = items.filter((item) => item.status !== 'skipped');
  if (!measurable.length) return { percent: null, level: 0 };
  const percent = Math.round((measurable.filter((item) => item.status === 'completed').length / measurable.length) * 100);
  const level = percent >= 100 ? 4 : percent >= 75 ? 3 : percent >= 50 ? 2 : percent >= 25 ? 1 : 0;
  return { percent, level };
}

function CalendarGrowth({ level }: { level: number }) {
  if (level === 0) return null;
  return <span className={`calendar-growth growth-level-${level}`} data-growth-level={level} aria-hidden="true">
    <svg viewBox="0 0 48 27" focusable="false">
      <path className="growth-ground" d="M5 24.2c8-1.4 29-1.4 38 0" />
      {level <= 2 && <>
        <g className="sprout sprout-left">
          <path d="M18 23V13" />
          <path className="leaf" d="M18 16c-5-.1-7-2.6-7.5-6.5 4.7-.2 7.3 2.1 7.5 6.5Z" />
          <path className="leaf" d="M18 13c.4-4.2 3-6.5 7.5-6.3-.3 4-2.9 6.3-7.5 6.3Z" />
        </g>
        {level === 2 && <g className="sprout sprout-right">
          <path d="M32 23v-8" />
          <path className="leaf" d="M32 18c-4.2-.1-6.2-2.1-6.5-5.2 3.9-.2 6.1 1.7 6.5 5.2Z" />
          <path className="leaf" d="M32 15c.3-3.3 2.4-5.1 6.2-5-.3 3.2-2.4 5-6.2 5Z" />
        </g>}
      </>}
      {level === 3 && <g className="tree tree-main">
        <path className="trunk" d="M22 24V14h4v10Z" />
        <circle cx="24" cy="10" r="7" /><circle cx="18.5" cy="13" r="5" /><circle cx="29.5" cy="13" r="5" />
      </g>}
      {level === 4 && <>
        <g className="tree tree-side tree-left"><path className="trunk" d="M10 24v-7h3v7Z" /><circle cx="11.5" cy="14" r="5" /><circle cx="8" cy="16" r="3.5" /><circle cx="15" cy="16" r="3.5" /></g>
        <g className="tree tree-main"><path className="trunk" d="M22 24V12h4v12Z" /><circle cx="24" cy="8" r="7" /><circle cx="18.5" cy="12" r="5" /><circle cx="29.5" cy="12" r="5" /></g>
        <g className="tree tree-side tree-right"><path className="trunk" d="M36 24v-7h3v7Z" /><circle cx="37.5" cy="14" r="5" /><circle cx="34" cy="16" r="3.5" /><circle cx="41" cy="16" r="3.5" /></g>
      </>}
    </svg>
  </span>;
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
    <div className="calendar-completion-legend" aria-label="달성률 꾸밈 기준"><span><i>🌱</i>새싹 25%</span><span><i>🌿</i>잎새 50%</span><span><i>🌳</i>나무 75%</span><span><i>🌲</i>숲 100%</span></div>
    <div className="calendar-weekdays" aria-hidden="true">{WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}</div>
    <div className="calendar-grid" aria-label="월간 달력">{days.map((date) => {
      const dateItems = materializeItems(snapshot.todos, snapshot.records, date);
      const { percent, level } = calendarCompletion(dateItems);
      return <button key={date} className={`calendar-day ${date.slice(0, 7) !== anchorMonth ? 'is-outside' : ''} ${date === selected ? 'is-selected' : ''} ${date === today ? 'is-today' : ''} ${dateItems.length ? 'has-items' : ''} completion-level-${level}`} type="button" data-date={date} data-completion={percent ?? undefined} aria-pressed={date === selected} aria-current={date === today ? 'date' : undefined} aria-label={`${formatHeading(date)}${dateItems.length ? `, ${dateItems.length}개 항목` : ''}${percent !== null ? `, 완료 ${percent}%` : ''}`} onClick={() => onSelect(date)}><span className="calendar-date-number">{Number(date.slice(-2))}</span><CalendarGrowth level={level} /></button>;
    })}</div>
    <section className="calendar-agenda" aria-labelledby="agenda-title"><div className="section-heading-row"><div><p className="section-kicker">SELECTED DAY</p><h2 id="agenda-title">{month}월 {day}일 일정</h2></div><span className="section-meta">{selectedItems.length}개</span></div><div>{selectedItems.length ? selectedItems.map((item) => <div className={`agenda-item ${item.status === 'completed' ? 'is-done' : ''}`} key={item.key}><span>{item.emoji || '💡'}</span><div><strong>{item.title}</strong><small>{agendaDetail(item, snapshot)}</small></div></div>) : <div className="calendar-empty"><strong>일정이 없어요</strong><span>이 날짜를 선택해 새 항목을 추가할 수 있어요.</span></div>}</div><button className="agenda-open-button" type="button" onClick={onOpenDate}>이 날짜 일정 보기</button></section>
  </section>;
}

function DataPanel({ busy, error, cloudStatus, onClose, onExport, onImport, onReset }: { busy: boolean; error: string; cloudStatus: CloudSyncStatus; onClose: () => void; onExport: () => void; onImport: (file: File) => void; onReset: () => void }) {
  const cloudCopy = cloudStatus === 'connected' ? '토스 사용자 식별키로 안전하게 백업 중이에요.' : cloudStatus === 'connecting' ? '클라우드 백업 연결을 확인하고 있어요.' : '현재는 이 기기에 저장돼요. 토스 앱에서 열면 클라우드 백업을 연결합니다.';
  return <Modal kicker="ACCOUNT" title="데이터 백업 및 복원" compact onClose={onClose}><p className={`cloud-status cloud-status-${cloudStatus}`}><strong>{cloudStatus === 'connected' ? '클라우드 백업 연결됨' : '기기 저장 사용 중'}</strong><span>{cloudCopy}</span></p>{error && <p className="form-error" role="alert">{error}</p>}<div className="data-action-list"><button disabled={busy} onClick={onExport}><strong>백업 내보내기</strong><small>모든 항목과 수행 기록을 JSON 파일로 저장해요.</small></button><label className={busy ? 'is-disabled' : ''}><input className="sr-only" type="file" accept="application/json,.json" aria-label="백업 파일 선택" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.currentTarget.value = ''; }} /><strong>백업 가져오기</strong><small>검증을 통과한 파일로 현재 데이터를 교체해요.</small></label><button className="danger-data-action" disabled={busy} onClick={onReset}><strong>모든 데이터 삭제</strong><small>기기의 할 일과 수행 기록을 모두 지워요.</small></button></div></Modal>;
}

function SettingsPanel({ cloudStatus, tagCount, onClose, onGuide, onTags, onData, onNotifications }: { cloudStatus: CloudSyncStatus; tagCount: number; onClose: () => void; onGuide: () => void; onTags: () => void; onData: () => void; onNotifications: () => void }) {
  return <Modal kicker="ACCOUNT" title="설정" compact onClose={onClose}><button className="setting-row" type="button" onClick={onGuide}><span>사용 가이드</span><b>›</b></button><button className="setting-row" type="button" onClick={onTags}><span>태그 관리<small>{tagCount ? `${tagCount}개 사용 중` : '건강관리·이직준비처럼 목표별로 묶어요'}</small></span><b>›</b></button><button className="setting-row" type="button" onClick={onData}><span>데이터 백업 및 복원<small>{cloudStatus === 'connected' ? '클라우드 연결됨' : '기기 저장'}</small></span><b>›</b></button><button className="setting-row" type="button" onClick={onNotifications}><span>알림 설정</span><b>›</b></button></Modal>;
}

const ONBOARDING_STEPS = [
  {
    icon: '✓',
    kicker: '나만의 하루 계획',
    title: '오늘 할 일을 가볍게 시작해요',
    description: '할 일과 반복 루틴을 한곳에 적고, 시간과 중요도를 정해 하루를 정리할 수 있어요.',
    accent: 'plan',
  },
  {
    icon: '↔',
    kicker: '빠른 기록',
    title: '날짜를 고르고 완료를 체크해요',
    description: '위쪽 날짜나 캘린더로 다른 날을 살펴보고, 끝낸 항목은 체크해요. 항목을 끌어 순서를 바꾸면 반복 루틴은 이후 날짜에도 같은 순서로 보여요.',
    accent: 'check',
  },
  {
    icon: '✎',
    kicker: '메모장',
    title: '떠오르는 생각은 메모장에 남겨요',
    description: '오른쪽 위 메모 버튼으로 일정과 별개의 메모를 쓰고, 수정하고, 삭제할 수 있어요.',
    accent: 'note',
  },
  {
    icon: '⌂',
    kicker: '기기와 클라우드에 안전하게',
    title: '계획은 먼저 이 기기에 저장돼요',
    description: '로그인 없이 바로 쓸 수 있고, 토스 계정 정보로 클라우드에도 백업돼요. 설정에서 백업 파일로 직접 보관하고 복원할 수도 있어요.',
    accent: 'local',
  },
] as const;

function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const current = ONBOARDING_STEPS[step];
  const last = step === ONBOARDING_STEPS.length - 1;

  return <section className="onboarding-card" aria-labelledby="onboarding-title" data-step={step + 1}>
    <div className="onboarding-card-header">
      <p className="section-kicker">MY DAILY TODO</p>
      <button className="onboarding-close" type="button" onClick={onFinish} aria-label="가이드 건너뛰기">×</button>
    </div>
    <div className="onboarding">
      <div className={`onboarding-visual is-${current.accent}`} aria-hidden="true">
        <span>{current.icon}</span>
        <i className="onboarding-dot dot-one" />
        <i className="onboarding-dot dot-two" />
      </div>
      <p className="onboarding-kicker">{current.kicker}</p>
      <h2 id="onboarding-title">{current.title}</h2>
      <p className="onboarding-description">{current.description}</p>
      <div className="onboarding-progress" aria-label={`${ONBOARDING_STEPS.length}단계 중 ${step + 1}단계`}>
        {ONBOARDING_STEPS.map((item, index) => <i key={item.title} className={index === step ? 'is-current' : ''} />)}
      </div>
      <div className="onboarding-actions">
        {step > 0 && <button className="onboarding-secondary" type="button" onClick={() => setStep((value) => value - 1)}>이전</button>}
        <button className="primary-button" type="button" onClick={() => last ? onFinish() : setStep((value) => value + 1)}>{last ? '시작하기' : '다음'}</button>
      </div>
    </div>
  </section>;
}

function sortDailyItems(items: DisplayTodo[], order: string[]) {
  const positions = new Map(order.map((key, index) => [key, index]));
  return [...items].sort((a, b) => {
    const completionOrder = Number(a.status === 'completed') - Number(b.status === 'completed');
    if (completionOrder !== 0) return completionOrder;
    const aKey = a.seriesId ? `series:${a.seriesId}` : a.key;
    const bKey = b.seriesId ? `series:${b.seriesId}` : b.key;
    if (positions.has(a.key) || positions.has(b.key) || positions.has(aKey) || positions.has(bKey)) return (positions.get(a.key) ?? positions.get(aKey) ?? 9_999) - (positions.get(b.key) ?? positions.get(bKey) ?? 9_999);
    return a.createdAt.localeCompare(b.createdAt);
  });
}

// 완료 토글·추가·삭제로 순서가 바뀔 때 카드가 순간이동하지 않고 새 위치로 미끄러지게 한다(FLIP).
// dnd-kit은 드래그 중에만 위치를 측정하므로 드래그 밖 재정렬은 직접 처리하고, 드래그 결과와 날짜 전환은 건너뛴다.
function useReorderAnimation(list: RefObject<HTMLElement | null>, order: string, scope: string, skip: MutableRefObject<boolean>) {
  const positions = useRef(new Map<string, number>());
  const previousScope = useRef(scope);
  useLayoutEffect(() => {
    const rows = [...list.current?.querySelectorAll<HTMLElement>('.swipe-item[data-order-key]') ?? []];
    const next = new Map(rows.map((row) => [row.dataset.orderKey!, row.offsetTop]));
    const animate = !skip.current && previousScope.current === scope && typeof Element.prototype.animate === 'function' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    skip.current = false;
    previousScope.current = scope;
    if (animate) rows.forEach((row) => {
      const before = positions.current.get(row.dataset.orderKey!);
      const delta = before === undefined ? 0 : before - row.offsetTop;
      if (delta) row.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], { duration: 240, easing: 'cubic-bezier(.22,.75,.28,1)' });
    });
    positions.current = next;
  }, [list, order, scope, skip]);
}

function DateStrip({ selectedDate, pageCenter, today, snapshot, onSelect, onPage }: {
  selectedDate: string;
  pageCenter: string;
  today: string;
  snapshot: Snapshot;
  onSelect: (date: string) => void;
  onPage: (date: string) => void;
}) {
  // 페이지 이동 경로(화살표, 스와이프, 오늘, 캘린더)와 무관하게 실제 이동 방향으로 슬라이드한다.
  const [page, setPage] = useState<{ center: string; direction: SlideDirection | null }>({ center: pageCenter, direction: null });
  if (page.center !== pageCenter) setPage({ center: pageCenter, direction: pageCenter < page.center ? 'previous' : 'next' });
  const slideDirection = page.direction;
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = addDays(pageCenter, index - 3);
    return { date, count: materializeItems(snapshot.todos, snapshot.records, date).length };
  }), [pageCenter, snapshot]);

  function movePage(amount: number) {
    onPage(addDays(pageCenter, amount));
  }

  return <div className="date-row date-navigator" role="region" aria-label="날짜 선택">
    <button className="date-step-button" type="button" aria-label="이전 날짜 페이지" onClick={() => movePage(-7)}>‹</button>
    <section key={pageCenter} className={`week-strip ${slideDirection ? `slide-${slideDirection}` : ''}`}>
    {dates.map(({ date, count }) => {
      const { parsed, day } = dateParts(date);
      return <button key={date} className={`day-button ${date === selectedDate ? 'is-selected' : ''} ${date === today ? 'is-today' : ''}`} type="button" data-date={date}
        aria-pressed={date === selectedDate} aria-current={date === today ? 'date' : undefined}
        aria-label={`${formatHeading(date)}${count ? `, ${count}개 항목` : ''}`}
        onClick={() => onSelect(date)}>
        <span>{WEEKDAY_LABELS[parsed.getUTCDay()]}</span><strong>{day}</strong>{count > 0 && <i />}
      </button>;
    })}
    </section>
    <button className="date-step-button" type="button" aria-label="다음 날짜 페이지" onClick={() => movePage(7)}>›</button>
  </div>;
}

export default function App() {
  const today = todayInSeoul();
  const [selectedDate, setSelectedDate] = useState(today);
  const [datePageCenter, setDatePageCenter] = useState(today);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<DisplayTodo | null>(null);
  const [viewing, setViewing] = useState<DisplayTodo | null>(null);
  const [copyDate, setCopyDate] = useState(today);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const actionLock = useRef(false);
  const gesture = useRef<{ id: number; x: number; y: number; vertical: boolean; strip: boolean } | null>(null);
  const suppressClick = useRef(false);
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
  const [recurringOrders, setRecurringOrders] = useState<Record<string, string[]>>({});
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>('connecting');
  const [tagBook, setTagBook] = useState<TagBook>(emptyTagBook);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const undoTimer = useRef<number | null>(null);
  const noticeTimer = useRef<number | null>(null);

  async function refresh() { setSnapshot(await loadSnapshot()); }
  useEffect(() => {
    let active = true;
    void refresh()
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : '목록을 불러오지 못했어요.');
      })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    void initializeCloudSync().then(async (status) => {
      if (!active) return;
      setCloudStatus(status);
      if (status === 'connected') await refresh();
    }).catch(() => { if (active) setCloudStatus('unavailable'); });
    return () => { active = false; };
  }, [ready]);
  useEffect(() => { void hasCompletedOnboarding().then((completed) => { if (!completed) setOnboardingOpen(true); }).catch(() => undefined); }, []);
  useEffect(() => { void loadManualOrders().then(setOrders).catch(() => undefined); }, []);
  useEffect(() => { void loadRecurringOrders().then(setRecurringOrders).catch(() => undefined); }, []);
  useEffect(() => { void loadTagBook().then(setTagBook).catch(() => undefined); }, []);
  useEffect(() => {
    const update = () => setShowScrollTop(window.scrollY > 280);
    update(); window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  useEffect(() => () => { if (undoTimer.current) window.clearTimeout(undoTimer.current); if (noticeTimer.current) window.clearTimeout(noticeTimer.current); }, []);
  useEffect(() => {
    const closeRows = (event: PointerEvent) => { if (!(event.target as HTMLElement).closest('.swipe-item')) setOpenItem(null); };
    document.addEventListener('pointerdown', closeRows);
    return () => document.removeEventListener('pointerdown', closeRows);
  }, []);

  const [dayChange, setDayChange] = useState<{ date: string; direction: SlideDirection | null }>({ date: selectedDate, direction: null });
  if (dayChange.date !== selectedDate) setDayChange({ date: selectedDate, direction: selectedDate < dayChange.date ? 'previous' : 'next' });
  const inheritedRecurringOrder =useMemo(() => Object.entries(recurringOrders).filter(([date]) => date <= selectedDate).sort(([a], [b]) => b.localeCompare(a))[0]?.[1] ?? [], [recurringOrders, selectedDate]);
  const items = useMemo(() => sortDailyItems(materializeItems(snapshot.todos, snapshot.records, selectedDate), [...(orders[selectedDate] ?? []), ...inheritedRecurringOrder]), [inheritedRecurringOrder, orders, selectedDate, snapshot]);
  const tags = useMemo(() => activeTags(tagBook), [tagBook]);
  const tagsById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const activeFilter = tagFilter && tagsById.has(tagFilter) ? tagFilter : null;
  const visibleItems = activeFilter ? items.filter((item) => item.tagIds.includes(activeFilter)) : items;
  const tagOf = (item: DisplayTodo) => item.tagIds.map((id) => tagsById.get(id)).find((tag): tag is Tag => Boolean(tag)) ?? null;
  const activeItems = items.filter((item) => item.status !== 'skipped');
  const completed = activeItems.filter((item) => item.status === 'completed').length;
  const percent = activeItems.length ? Math.round(completed / activeItems.length * 100) : 0;
  const source = editing ? snapshot.todos.find((todo) => todo.id === editing.todoId) ?? null : null;
  const activeDragItem = activeDragId ? items.find((item) => item.key === activeDragId) ?? null : null;
  const listRef = useRef<HTMLDivElement>(null);
  const skipReorderAnimation = useRef(false);
  useReorderAnimation(listRef, visibleItems.map((item) => item.key).join('|'), selectedDate, skipReorderAnimation);
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // 보이는 주 밖의 날짜로 이동할 때만 날짜 줄을 넘긴다. 바로 옆 날짜는 한 주 단위로 넘겨 페이지 감각을 유지한다.
  function goToDate(date: string) {
    setSelectedDate(date);
    setDatePageCenter((center) => {
      const offset = daysBetween(center, date);
      if (Math.abs(offset) <= 3) return center;
      return Math.abs(offset) === 4 ? addDays(center, Math.sign(offset) * 7) : date;
    });
  }
  function showNotice(message: string) {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3_500);
  }
  function closeOverlay() {
    setOverlay(null); setEditing(null); setViewing(null); setDeleteTarget(null); setPendingImport(null);
    queueMicrotask(() => openerRef.current?.focus());
  }
  async function run(action: () => Promise<void>, close = false) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true); setError('');
    try {
      await action();
      await refresh();
      if (close) closeOverlay();
      void syncIfConnected().then((synced) => { if (synced) void refresh(); });
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : '저장하지 못했어요. 다시 시도해 주세요.'); throw reason; }
    finally { actionLock.current = false; setBusy(false); }
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
        if (created.type === 'one_time') goToDate(created.dueDate);
      } else if (editing.type === 'one_time') {
        if ('type' in input && input.type === 'recurring') await convertOneTimeToRecurring(editing.todoId, input);
        else await updateOneTime(editing.todoId, input as TodoContentPatch);
      }
      else await updateRecurring(editing.seriesId!, scope === 'all' ? firstSeriesOccurrence(editing) : editing.targetDate, scope === 'date' ? 'date' : 'future', input as RecurringPatch);
      showNotice(editing ? '항목을 수정했어요.' : `${type === 'habit' ? '습관' : '할 일'}을 추가했어요.`);
    }, true);
  }
  // 태그 문서 변경(TAG-001). 실패하면 호출한 화면이 메시지를 보여주도록 예외를 그대로 던진다.
  async function editTags(change: (book: TagBook) => TagBook): Promise<TagBook> {
    if (actionLock.current) throw new Error('이전 저장이 끝난 뒤 다시 시도해 주세요.');
    actionLock.current = true;
    setBusy(true);
    try {
      const next = await updateTagBook(change);
      setTagBook(next);
      return next;
    } finally { actionLock.current = false; setBusy(false); }
  }
  async function createTag(input: TagInput): Promise<Tag> {
    let created: Tag | undefined;
    await editTags((book) => { const result = addTags(book, [input], tagDeps); created = result.added[0]; return result.book; });
    return created!;
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
      await saveBackupText(JSON.stringify(backup, null, 2), `my-daily-todo-${today}.json`);
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
  function startDrag(event: DragStartEvent) {
    setOpenItem(null);
    setActiveDragId(String(event.active.id));
  }
  function finishOnboarding() {
    setOnboardingOpen(false);
    queueMicrotask(() => openerRef.current?.focus());
    void completeOnboarding().catch(() => showNotice('가이드 확인 상태를 저장하지 못했어요. 다음 실행 때 다시 표시될 수 있어요.'));
  }
  function finishDrag(event: DragEndEvent) {
    setActiveDragId(null);
    if (!event.over || event.active.id === event.over.id) return;
    const current = items.map((item) => item.key);
    const from = current.indexOf(String(event.active.id));
    const to = current.indexOf(String(event.over.id));
    if (from < 0 || to < 0) return;
    const nextOrder = arrayMove(current, from, to);
    skipReorderAnimation.current = true;
    setOrders((value) => ({ ...value, [selectedDate]: nextOrder }));
    const currentRecurringOrder = current.map(key => items.find(item => item.key === key)).filter((item): item is DisplayTodo => Boolean(item?.seriesId)).map(item => `series:${item.seriesId}`);
    const recurringOrder = nextOrder.map(key => items.find(item => item.key === key)).filter((item): item is DisplayTodo => Boolean(item?.seriesId)).map(item => `series:${item.seriesId}`);
    const recurringChanged = currentRecurringOrder.join('|') !== recurringOrder.join('|');
    if (recurringChanged) setRecurringOrders(value => ({ ...Object.fromEntries(Object.entries(value).filter(([date]) => date < selectedDate)), [selectedDate]: recurringOrder }));
    void Promise.all([saveManualOrder(selectedDate, nextOrder), ...(recurringChanged ? [saveRecurringOrderFrom(selectedDate, recurringOrder)] : [])])
      .then(() => showNotice('순서를 변경했어요.'))
      .catch((reason) => {
        setOrders((value) => ({ ...value, [selectedDate]: current }));
        void loadRecurringOrders().then(setRecurringOrders).catch(() => undefined);
        setError(reason instanceof Error ? reason.message : '순서를 저장하지 못했어요.');
      });
  }
  async function toggleItem(item: DisplayTodo) {
    setNotice('');
    await run(async () => {
      if (item.type === 'one_time') await setOneTimeStatus(item.todoId, item.status === 'completed' ? 'pending' : 'completed');
      else await setRecurringStatus(item.seriesId!, item.targetDate, item.status === 'completed' ? 'pending' : 'completed');
    });
  }
  function openCalendar(button: HTMLButtonElement) {
    openerRef.current = button; setCalendarSelected(selectedDate); setCalendarAnchor(`${selectedDate.slice(0, 7)}-01`); setCalendarOpen(true);
  }
  function closeCalendar() { setCalendarOpen(false); queueMicrotask(() => openerRef.current?.focus()); }
  const taskProps = (item: DisplayTodo): TaskCardProps => ({
    item,
    tag: tagOf(item),
    snapshot,
    busy,
    open: openItem === item.key,
    onOpen: (open) => setOpenItem(open ? item.key : null),
    onToggle: () => void toggleItem(item).catch(() => undefined),
    onView: (button) => { openerRef.current = button; setViewing(item); setOpenItem(null); setOverlay('detail'); },
    onEdit: (button) => { openerRef.current = button; setEditing(item); setOpenItem(null); setOverlay('form'); },
    onDelete: (button) => {
      openerRef.current = button; setOpenItem(null);
      if (item.type === 'recurring') { setDeleteTarget(item); setOverlay('delete'); }
      else void commitDelete(item, 'date').catch(() => undefined);
    },
  });

  function beginDateSwipe(event: ReactPointerEvent<HTMLElement>) {
    suppressClick.current = false;
    const target = event.target as HTMLElement;
    const strip = Boolean(target.closest('.week-strip'));
    if (gesture.current || !event.isPrimary || event.button !== 0 || overlay || calendarOpen || notebookOpen || activeDragId || (!strip && target.closest('.swipe-item, .tag-select, button, input, textarea'))) { gesture.current = null; return; }
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, vertical: false, strip };
  }
  function endDateSwipe(event: ReactPointerEvent<HTMLElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!start || start.id !== event.pointerId || start.vertical) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    suppressClick.current = true;
    setOpenItem(null);
    // 날짜 줄 위에서는 화살표 버튼처럼 주 단위로, 그 밖에서는 하루 단위로 넘긴다.
    if (start.strip) setDatePageCenter((center) => addDays(center, dx < 0 ? 7 : -7));
    else goToDate(addDays(selectedDate, dx < 0 ? 1 : -1));
  }

  return <>
    <main className="app-shell" aria-label="My Daily Todo" onPointerDown={beginDateSwipe} onPointerMove={event => { const start = gesture.current; if (start && Math.abs(event.clientY - start.y) > 12 && Math.abs(event.clientY - start.y) > Math.abs(event.clientX - start.x)) start.vertical = true; }} onPointerUp={endDateSwipe} onPointerCancel={() => { gesture.current = null; }} onClickCapture={event => { if (suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
<header className="app-header"><div className="header-date"><p className="eyebrow">{formatHeading(selectedDate)}</p>{selectedDate !== today && <button className="today-button" type="button" onClick={() => { setSelectedDate(today); setDatePageCenter(today); }}><span>오늘</span></button>}</div><div className="header-actions"><button className="icon-button notebook-entry" type="button" aria-label="메모" title="메모장" onClick={event => { openerRef.current = event.currentTarget; setNotebookOpen(true); }}><ActionIcon name="note" /></button><button className="icon-button calendar-button" type="button" aria-label="캘린더 열기" onClick={(event) => openCalendar(event.currentTarget)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm0 5h14M8 2v4m8-4v4" /></svg></button><button className="icon-button avatar-button" type="button" aria-label="설정 열기" onClick={(event) => { openerRef.current = event.currentTarget; setOverlay('settings'); }}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg></button></div></header>
      <DateStrip selectedDate={selectedDate} pageCenter={datePageCenter} today={today} snapshot={snapshot} onSelect={setSelectedDate} onPage={setDatePageCenter} />
      {onboardingOpen && <Onboarding onFinish={finishOnboarding} />}
      <section className="progress-card" aria-labelledby="progress-title"><div className="progress-heading"><h2 id="progress-title">{selectedDate === today ? '오늘의 달성' : `${dateParts(selectedDate).month}월 ${dateParts(selectedDate).day}일의 달성`}</h2><div className="progress-numbers"><span>{completed}</span> / <span>{activeItems.length}</span><strong>{percent}%</strong></div></div><div className="progress-track" role="progressbar" aria-label={`${dateParts(selectedDate).month}월 ${dateParts(selectedDate).day}일 전체 진행률`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div><p className="progress-copy">{!activeItems.length ? '작은 계획 하나로 하루를 시작해 보세요.' : completed === activeItems.length ? '모두 해냈어요. 수고했어요!' : `${activeItems.length}개 중 ${completed}개 완료했어요.`}</p></section>
      <section className="content-section" aria-labelledby="daily-heading"><div className="section-heading-row"><div><p className="section-kicker">DAILY LIST</p><h2 id="daily-heading">할 일</h2></div><div className="section-actions">{tags.length > 0 && <TagSelect tags={tags} value={activeFilter} onChange={setTagFilter} />}<button className="mini-add-button" type="button" onClick={(event) => { openerRef.current = event.currentTarget; setEditing(null); setOverlay('form'); }}>추가 <span aria-hidden="true">+</span></button></div></div>
        {error && <div className="error-banner" role="alert"><strong>저장 또는 조회에 문제가 생겼어요.</strong><span>{error}</span><button type="button" onClick={() => void refresh().then(() => setError('')).catch(() => undefined)}>다시 불러오기</button></div>}
        <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragStart={startDrag} onDragCancel={() => setActiveDragId(null)} onDragEnd={finishDrag}>
          <SortableContext items={visibleItems.map((item) => item.key)} strategy={verticalListSortingStrategy}>
            <div ref={listRef} className="unified-list" aria-live="polite" aria-busy={!ready || busy}><div key={selectedDate} className={`day-items ${dayChange.direction ? `slide-${dayChange.direction}` : ''}`}>{!ready && <div className="empty-state"><strong>목록을 불러오는 중이에요</strong><p>기기에 저장된 할 일을 확인하고 있어요.</p></div>}{ready && !items.length && <div className="empty-state"><strong>이날의 항목이 없어요</strong><p>추가 버튼을 눌러 첫 할 일이나 습관을 적어보세요.</p></div>}{ready && items.length > 0 && !visibleItems.length && <div className="empty-state"><strong>이 태그의 항목이 없어요</strong><p>다른 태그를 고르거나 전체 목록을 확인해 보세요.</p><button className="empty-state-action" type="button" onClick={() => setTagFilter(null)}>전체 보기</button></div>}{visibleItems.map((item) => <SortableTaskCard key={item.key} {...taskProps(item)} />)}</div></div>
          </SortableContext>
          <DragOverlay>{activeDragItem && <DraggedTaskCard item={activeDragItem} tag={tagOf(activeDragItem)} snapshot={snapshot} />}</DragOverlay>
        </DndContext>
      </section><div className="bottom-space" aria-hidden="true" />
    </main>
    {notebookOpen && <Notebook onClose={() => { setNotebookOpen(false); queueMicrotask(() => openerRef.current?.focus()); }} />}
    {overlay === 'detail' && viewing && <Modal kicker={viewing.category === 'habit' ? 'ROUTINE' : 'TODO'} title="상세보기" onClose={closeOverlay} headerAction={<button className="icon-button" type="button" aria-label="복사" title="복사" onClick={() => { setCopyDate(viewing.targetDate); setError(''); setOverlay('copy'); }}><ActionIcon name="copy" /></button>}><div className="todo-detail"><h3>{viewing.emoji} {viewing.title}</h3><p>{formatHeading(viewing.targetDate)}{viewing.dueTime ? ` · ${viewing.dueTime}` : ''}</p>{tagOf(viewing) && <div className="detail-tag"><TagChip tag={tagOf(viewing)!} /></div>}<h4>메모</h4><p className="detail-memo">{viewing.memo || '작성된 메모가 없어요.'}</p></div></Modal>}
{overlay === 'copy' && viewing && <Modal kicker="COPY" title="다른 날짜로 복사" compact onClose={closeOverlay}><form className="copy-form" onSubmit={event => { event.preventDefault(); const targetDate = String(new FormData(event.currentTarget).get('copyDate')); void run(async () => { await createTodo({ type: 'one_time', category: viewing.category, title: viewing.title, memo: viewing.memo, emoji: viewing.emoji, priority: viewing.priority, dueTime: viewing.dueTime, dueDate: targetDate, tagIds: viewing.tagIds }); goToDate(targetDate); showNotice('선택한 날짜에 복사했어요.'); }, true).catch(() => undefined); }}><p>내용과 시간을 그대로 복사해 미완료 항목으로 한 번 등록해요. 반복 설정과 완료 기록은 복사하지 않아요.</p><SchedulePicker name="copyDate" label="복사할 날짜" value={copyDate} onChange={setCopyDate} disabled={busy} />{error && <p role="alert">{error}</p>}<button disabled={busy || !copyDate} type="submit">{busy ? '복사 중…' : '이 날짜에 복사'}</button></form></Modal>}
    {calendarOpen && <CalendarView anchor={calendarAnchor} selected={calendarSelected} today={today} snapshot={snapshot} onMove={(amount) => setCalendarAnchor(changeMonth(calendarAnchor, amount))} onSelect={(date) => { setCalendarSelected(date); setCalendarAnchor(`${date.slice(0, 7)}-01`); }} onToday={() => { setCalendarSelected(today); setCalendarAnchor(`${today.slice(0, 7)}-01`); }} onOpenDate={() => { goToDate(calendarSelected); closeCalendar(); }} onClose={closeCalendar} />}
    {overlay === 'form' && <TodoForm selectedDate={selectedDate} editing={editing} source={source} saving={busy} tagBook={tagBook} defaultTagId={activeFilter ?? ''} onCreateTag={createTag} onRenameTag={(id, name) => editTags((book) => updateTag(book, id, { name, color: activeTags(book).find((tag) => tag.id === id)?.color ?? 'gray' }, tagDeps))} onDeleteTag={(id) => editTags((book) => deleteTag(book, id, tagDeps))} onCancel={closeOverlay} onSubmit={submit} />}
    {overlay === 'delete' && deleteTarget && <Modal kicker="REPEAT ITEM" title="어디에서 삭제할까요?" compact onClose={closeOverlay}><div className="scope-action-list"><button type="button" disabled={busy} onClick={() => void commitDelete(deleteTarget, 'date').catch(() => undefined)}><strong>오늘만</strong><small>선택한 날짜에서만 숨겨요</small></button><button type="button" disabled={busy} onClick={() => void commitDelete(deleteTarget, 'future').catch(() => undefined)}><strong>오늘 이후</strong><small>이전 기록은 그대로 남겨요</small></button><button type="button" disabled={busy} onClick={() => void commitDelete(deleteTarget, 'all').catch(() => undefined)}><strong>전체 반복</strong><small>모든 날짜에서 삭제해요</small></button></div></Modal>}
    {overlay === 'settings' && <SettingsPanel cloudStatus={cloudStatus} tagCount={tags.length} onTags={() => setOverlay('tags')} onClose={closeOverlay} onGuide={() => { setOverlay(null); setOnboardingOpen(true); }} onData={() => { setError(''); setOverlay('data'); }} onNotifications={() => { closeOverlay(); showNotice('알림 설정은 다음 단계에서 제공할 예정이에요.'); }} />}
    {overlay === 'tags' && <Modal kicker="TAGS" title="태그 관리" compact onClose={closeOverlay}><TagManager book={tagBook} busy={busy}
      onAddMany={(inputs) => editTags((book) => addTags(book, inputs, tagDeps).book)}
      onUpdate={(id, patch) => editTags((book) => updateTag(book, id, patch, tagDeps))}
      onDelete={(id) => editTags((book) => deleteTag(book, id, tagDeps))}
      onMove={(id, amount) => editTags((book) => moveTag(book, id, amount, tagDeps))} /></Modal>}
    {overlay === 'data' && <DataPanel busy={busy} error={error} cloudStatus={cloudStatus} onClose={closeOverlay} onExport={() => void exportData()} onImport={(file) => void prepareImport(file)} onReset={() => setOverlay('reset')} />}
    {overlay === 'import' && pendingImport && <Modal kicker="DATA" title="백업으로 복원" compact onClose={closeOverlay}><p className="scope-copy"><strong>{pendingImport.name}</strong>의 데이터로 현재 기기 내용을 모두 바꿉니다. 검증된 파일만 한 번에 반영되며 되돌릴 수 없어요.</p><button className="destructive-button" type="button" disabled={busy} onClick={() => void run(async () => { await restoreBackup(pendingImport.text); showNotice('백업 데이터를 복원했어요.'); }, true).catch(() => undefined)}>현재 데이터 교체</button></Modal>}
{overlay === 'reset' && <Modal kicker="DATA" title="모든 데이터 삭제" compact onClose={closeOverlay}><p className="scope-copy">할 일, 반복 수행 기록과 메모장을 이 기기에서 모두 삭제합니다. 이 작업은 실행 취소할 수 없어요.</p><button className="destructive-button" type="button" disabled={busy} onClick={() => void run(async () => { await clearAllData(); showNotice('모든 데이터를 삭제했어요.'); }, true).catch(() => undefined)}>모든 데이터 삭제</button></Modal>}
    {receipt && <div className="toast" role="status" aria-live="polite"><span>항목을 삭제했어요.</span><button type="button" onClick={() => void undo().catch(() => undefined)}>실행 취소</button></div>}
    {notice && !receipt && <div className="toast" role="status" aria-live="polite"><span>{notice}</span></div>}
    {showScrollTop && <button className="scroll-top-button" type="button" aria-label="화면 최상단으로 이동" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑</button>}
  </>;
}
