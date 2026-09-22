import { daysBetween, isoWeekday, parseDate, startOfWeek } from './date';
import type { DisplayTodo, ItemCategory, ListQuery, TodoData, TodoRecordData } from './types';

export type TodoErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'STORAGE_OPEN_FAILED'
  | 'STORAGE_BLOCKED'
  | 'STORAGE_WRITE_FAILED'
  | 'UNSUPPORTED_DATABASE_VERSION';

export class TodoError extends Error {
  constructor(
    public readonly code: TodoErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly field?: 'title' | 'memo' | 'dueDate' | 'dueTime' | 'repeatWeekdays',
  ) {
    super(message);
    this.name = 'TodoError';
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function resolveTodoCategory(todo: Pick<TodoData, 'type' | 'category' | 'emoji' | 'dueTime'>): ItemCategory {
  if (todo.category === 'todo' || todo.category === 'habit') return todo.category;
  if (todo.type === 'one_time') return 'todo';
  if (todo.emoji === '✓' || todo.emoji === '✅') return 'todo';
  if (todo.emoji === '🌱') return 'habit';
  return todo.dueTime === null ? 'habit' : 'todo';
}

export function validateTodo(todo: TodoData): void {
  if (todo.category !== undefined && todo.category !== 'todo' && todo.category !== 'habit') {
    throw new TodoError('VALIDATION', '항목 종류가 올바르지 않아요.', false);
  }
  if (!todo.title.trim() || todo.title.trim().length > 120) {
    throw new TodoError('VALIDATION', '제목은 1~120자로 입력해 주세요.', false, 'title');
  }
  if (todo.memo.length > 2_000) {
    throw new TodoError('VALIDATION', '메모는 2,000자 이하로 입력해 주세요.', false, 'memo');
  }
  if (todo.dueTime && !TIME_PATTERN.test(todo.dueTime)) {
    throw new TodoError('VALIDATION', '올바른 시간을 입력해 주세요.', false, 'dueTime');
  }
  if (todo.type === 'one_time') {
    if (todo.category === 'habit') {
      throw new TodoError('VALIDATION', '습관은 반복 설정이 필요해요.', false);
    }
    if (!todo.dueDate || !DATE_PATTERN.test(todo.dueDate)) {
      throw new TodoError('VALIDATION', '날짜를 선택해 주세요.', false, 'dueDate');
    }
    try { parseDate(todo.dueDate); } catch { throw new TodoError('VALIDATION', '올바른 날짜를 선택해 주세요.', false, 'dueDate'); }
    if (!todo.status || Boolean(todo.completedAt) !== (todo.status === 'completed')) {
      throw new TodoError('VALIDATION', '완료 상태가 올바르지 않아요.', false);
    }
    if (todo.seriesId || todo.revision || todo.repeatFrequency || todo.repeatStartDate || todo.timezone) {
      throw new TodoError('VALIDATION', '일반 할 일에 반복 정보가 포함됐어요.', false);
    }
    return;
  }
  if (!todo.seriesId || !todo.revision || !todo.repeatFrequency || !todo.repeatStartDate || todo.timezone !== 'Asia/Seoul') {
    throw new TodoError('VALIDATION', '반복 설정이 완전하지 않아요.', false);
  }
  if (todo.status || todo.completedAt || todo.dueDate) {
    throw new TodoError('VALIDATION', '반복 할 일의 날짜별 상태는 수행 기록에 저장해야 해요.', false);
  }
  if (!todo.repeatInterval || todo.repeatInterval < 1) {
    throw new TodoError('VALIDATION', '반복 간격은 1 이상이어야 해요.', false);
  }
  try {
    parseDate(todo.repeatStartDate);
    if (todo.repeatEndDate) parseDate(todo.repeatEndDate);
  } catch {
    throw new TodoError('VALIDATION', '올바른 반복 날짜를 선택해 주세요.', false, 'dueDate');
  }
  if (todo.repeatFrequency === 'daily' && todo.repeatInterval !== 1) {
    throw new TodoError('VALIDATION', '매일 반복 간격은 1이어야 해요.', false);
  }
  if (todo.repeatFrequency === 'interval_days' && todo.repeatInterval < 2) {
    throw new TodoError('VALIDATION', '며칠마다 반복은 2일 이상이어야 해요.', false);
  }
  if (todo.repeatEndDate && todo.repeatEndDate < todo.repeatStartDate) {
    throw new TodoError('VALIDATION', '반복 종료일은 시작일 이후여야 해요.', false, 'dueDate');
  }
  if (todo.repeatFrequency === 'weekly' && !todo.repeatWeekdays.length) {
    throw new TodoError('VALIDATION', '반복 요일을 하나 이상 선택해 주세요.', false, 'repeatWeekdays');
  }
  if (todo.repeatWeekdays.some((day) => day < 1 || day > 7) || new Set(todo.repeatWeekdays).size !== todo.repeatWeekdays.length) {
    throw new TodoError('VALIDATION', '반복 요일이 올바르지 않아요.', false, 'repeatWeekdays');
  }
}

export function occursOn(todo: TodoData, targetDate: string): boolean {
  if (todo.type !== 'recurring' || todo.deletedAt || !todo.repeatStartDate || !todo.repeatFrequency || !todo.repeatInterval) return false;
  if (targetDate < todo.repeatStartDate || (todo.repeatEndDate && targetDate > todo.repeatEndDate)) return false;
  const elapsed = daysBetween(todo.repeatStartDate, targetDate);
  if (todo.repeatFrequency === 'daily') return true;
  if (todo.repeatFrequency === 'interval_days') return elapsed % todo.repeatInterval === 0;
  const weeks = Math.floor(daysBetween(startOfWeek(todo.repeatStartDate), startOfWeek(targetDate)) / 7);
  return weeks % todo.repeatInterval === 0 && todo.repeatWeekdays.includes(isoWeekday(targetDate));
}

export function materializeItems(todos: TodoData[], records: TodoRecordData[], date: string): DisplayTodo[] {
  const recordBySeries = new Map(
    records.filter((record) => record.targetDate === date && !record.deletedAt).map((record) => [record.seriesId, record]),
  );
  const items: DisplayTodo[] = [];
  for (const todo of todos) {
    if (todo.deletedAt) continue;
    if (todo.type === 'one_time') {
      if (todo.dueDate !== date) continue;
      items.push({
        key: todo.id, todoId: todo.id, type: todo.type, category: resolveTodoCategory(todo), seriesId: null, targetDate: date,
        title: todo.title, memo: todo.memo, emoji: todo.emoji, priority: todo.priority,
        dueTime: todo.dueTime, status: todo.status ?? 'pending', completedAt: todo.completedAt,
        createdAt: todo.createdAt, revision: null,
      });
      continue;
    }
    if (!occursOn(todo, date)) continue;
    const record = recordBySeries.get(todo.seriesId!);
    if (record?.hidden) continue;
    items.push({
      key: `${todo.seriesId}:${date}`, todoId: todo.id, type: todo.type, category: resolveTodoCategory(todo), seriesId: todo.seriesId,
      targetDate: date, title: record?.overrides?.title ?? todo.title,
      memo: record?.overrides?.memo ?? todo.memo, emoji: todo.emoji,
      priority: record?.overrides?.priority ?? todo.priority,
      dueTime: record?.overrides && 'dueTime' in record.overrides ? record.overrides.dueTime ?? null : todo.dueTime,
      status: record?.status ?? 'pending', completedAt: record?.completedAt ?? null,
      createdAt: todo.createdAt, revision: todo.revision,
    });
  }
  return items;
}

const priorityRank = { high: 0, normal: 1, low: 2 } as const;

export function filterAndSortItems(items: DisplayTodo[], query: ListQuery): DisplayTodo[] {
  const result = items.filter((item) =>
    (query.priority === 'all' || item.priority === query.priority)
    && (query.status === 'all' || item.status === query.status),
  );
  return result.sort((a, b) => {
    if (query.sort === 'priority') {
      const priority = priorityRank[a.priority] - priorityRank[b.priority];
      if (priority) return priority;
    } else if (query.sort === 'created') {
      const created = a.createdAt.localeCompare(b.createdAt);
      if (created) return created;
    } else {
      const date = a.targetDate.localeCompare(b.targetDate);
      if (date) return date;
      const time = (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99');
      if (time) return time;
    }
    return a.key.localeCompare(b.key);
  });
}
