import { parseDate } from '../../domain/todos/date';
import { occursOn, resolveTodoCategory, TodoError, validateTodo } from '../../domain/todos/todoDomain';
import type { RepositoryDependencies, TodoData, TodoOverrides, TodoRecordData } from '../../domain/todos/types';
import { DATABASE_VERSION, loadSnapshot, replaceSnapshot } from '../../infrastructure/indexed-db/todoRepository';

export const BACKUP_FORMAT = 'my-daily-todo-backup';
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export const MAX_BACKUP_TODOS = 10_000;
export const MAX_BACKUP_RECORDS = 100_000;

export type TodoBackup = {
  format: typeof BACKUP_FORMAT;
  schemaVersion: typeof DATABASE_VERSION;
  exportedAt: string;
  timezone: 'Asia/Seoul';
  data: { todos: TodoData[]; records: TodoRecordData[] };
};

function invalid(message: string): never {
  throw new TodoError('VALIDATION', message, false);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}

function readTodo(value: unknown): TodoData {
  if (!isObject(value)) invalid('백업의 할 일 형식이 올바르지 않아요.');
  const priority = value.priority;
  const status = value.status;
  if (typeof value.id !== 'string' || !value.id || (value.type !== 'one_time' && value.type !== 'recurring')) invalid('백업의 할 일 식별자가 올바르지 않아요.');
  if (typeof value.title !== 'string' || typeof value.memo !== 'string' || typeof value.emoji !== 'string') invalid('백업의 할 일 내용 형식이 올바르지 않아요.');
  if (value.category !== undefined && value.category !== 'todo' && value.category !== 'habit') invalid('백업의 항목 종류가 올바르지 않아요.');
  if (priority !== 'low' && priority !== 'normal' && priority !== 'high') invalid('백업의 우선순위가 올바르지 않아요.');
  if (status !== null && status !== 'pending' && status !== 'completed') invalid('백업의 완료 상태가 올바르지 않아요.');
  if (!isNullableString(value.seriesId) || !isNullableString(value.dueDate) || !isNullableString(value.dueTime) || !isNullableString(value.completedAt) || !isNullableString(value.repeatStartDate) || !isNullableString(value.repeatEndDate) || !isNullableString(value.deletedAt)) invalid('백업의 날짜 또는 연결 정보가 올바르지 않아요.');
  if (value.revision !== null && !Number.isInteger(value.revision)) invalid('백업의 revision이 올바르지 않아요.');
  if (value.repeatFrequency !== null && value.repeatFrequency !== 'daily' && value.repeatFrequency !== 'weekly' && value.repeatFrequency !== 'interval_days') invalid('백업의 반복 방식이 올바르지 않아요.');
  if (value.repeatInterval !== null && !Number.isInteger(value.repeatInterval)) invalid('백업의 반복 간격이 올바르지 않아요.');
  if (!Array.isArray(value.repeatWeekdays) || !value.repeatWeekdays.every(Number.isInteger)) invalid('백업의 반복 요일이 올바르지 않아요.');
  if (value.timezone !== null && value.timezone !== 'Asia/Seoul') invalid('지원하지 않는 시간대예요.');
  if (!isIsoInstant(value.createdAt) || !isIsoInstant(value.updatedAt) || (value.completedAt !== null && !isIsoInstant(value.completedAt)) || (value.deletedAt !== null && !isIsoInstant(value.deletedAt))) invalid('백업의 변경 시각이 올바르지 않아요.');
  const todo = { ...(value as TodoData), category: resolveTodoCategory(value as TodoData) };
  try { validateTodo(todo); } catch (error) { if (error instanceof TodoError) throw error; invalid('백업의 할 일 데이터가 올바르지 않아요.'); }
  return todo;
}

function readOverrides(value: unknown): TodoOverrides | null {
  if (value === null) return null;
  if (!isObject(value)) invalid('백업의 날짜별 수정 정보가 올바르지 않아요.');
  const allowed = new Set(['title', 'memo', 'priority', 'dueTime']);
  if (Object.keys(value).some((key) => !allowed.has(key))) invalid('백업의 날짜별 수정 필드가 올바르지 않아요.');
  if ('title' in value && typeof value.title !== 'string') invalid('백업의 수정 제목이 올바르지 않아요.');
  if ('memo' in value && typeof value.memo !== 'string') invalid('백업의 수정 메모가 올바르지 않아요.');
  if ('priority' in value && value.priority !== 'low' && value.priority !== 'normal' && value.priority !== 'high') invalid('백업의 수정 우선순위가 올바르지 않아요.');
  if ('dueTime' in value && !isNullableString(value.dueTime)) invalid('백업의 수정 시간이 올바르지 않아요.');
  return value as TodoOverrides;
}

function readRecord(value: unknown): TodoRecordData {
  if (!isObject(value)) invalid('백업의 수행 기록 형식이 올바르지 않아요.');
  if (typeof value.id !== 'string' || !value.id || typeof value.seriesId !== 'string' || !value.seriesId || typeof value.targetDate !== 'string') invalid('백업의 수행 기록 식별자가 올바르지 않아요.');
  try { parseDate(value.targetDate); } catch { invalid('백업의 수행 날짜가 올바르지 않아요.'); }
  if (value.status !== 'pending' && value.status !== 'completed' && value.status !== 'skipped') invalid('백업의 수행 상태가 올바르지 않아요.');
  if (typeof value.hidden !== 'boolean' || !isNullableString(value.completedAt) || !isNullableString(value.deletedAt)) invalid('백업의 수행 기록 필드가 올바르지 않아요.');
  if (!isIsoInstant(value.createdAt) || !isIsoInstant(value.updatedAt) || (value.completedAt !== null && !isIsoInstant(value.completedAt)) || (value.deletedAt !== null && !isIsoInstant(value.deletedAt))) invalid('백업의 수행 기록 시각이 올바르지 않아요.');
  if (Boolean(value.completedAt) !== (value.status === 'completed')) invalid('백업의 수행 완료 시각이 상태와 일치하지 않아요.');
  return { ...(value as Omit<TodoRecordData, 'overrides'>), overrides: readOverrides(value.overrides) };
}

function validateRelations(todos: TodoData[], records: TodoRecordData[]) {
  const todoIds = new Set<string>();
  const revisions = new Set<string>();
  const bySeries = new Map<string, TodoData[]>();
  for (const todo of todos) {
    if (todoIds.has(todo.id)) invalid('백업에 중복된 할 일 ID가 있어요.');
    todoIds.add(todo.id);
    if (todo.type === 'recurring') {
      const revisionKey = `${todo.seriesId}:${todo.revision}`;
      if (revisions.has(revisionKey)) invalid('백업에 중복된 반복 revision이 있어요.');
      revisions.add(revisionKey);
      const series = bySeries.get(todo.seriesId!) ?? [];
      series.push(todo);
      bySeries.set(todo.seriesId!, series);
    }
  }
  for (const series of bySeries.values()) {
    const active = series.filter((todo) => !todo.deletedAt).sort((a, b) => a.repeatStartDate!.localeCompare(b.repeatStartDate!));
    for (let index = 1; index < active.length; index += 1) {
      const previous = active[index - 1];
      if (!previous.repeatEndDate || previous.repeatEndDate >= active[index].repeatStartDate!) invalid('백업의 활성 반복 기간이 겹쳐요.');
    }
  }
  const recordIds = new Set<string>();
  const logicalRecords = new Set<string>();
  for (const record of records) {
    if (recordIds.has(record.id)) invalid('백업에 중복된 수행 기록 ID가 있어요.');
    recordIds.add(record.id);
    const key = `${record.seriesId}:${record.targetDate}`;
    if (logicalRecords.has(key)) invalid('백업에 같은 날짜의 수행 기록이 둘 이상 있어요.');
    logicalRecords.add(key);
    if (!record.deletedAt && !(bySeries.get(record.seriesId) ?? []).some((todo) => occursOn(todo, record.targetDate))) invalid('백업에 연결할 수 없는 수행 기록이 있어요.');
  }
}

export function parseAndValidateBackup(text: string): TodoBackup {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) invalid('백업 파일은 5MB 이하여야 해요.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { invalid('JSON 백업 파일을 읽을 수 없어요.'); }
  if (!isObject(value) || value.format !== BACKUP_FORMAT || value.schemaVersion !== DATABASE_VERSION || value.timezone !== 'Asia/Seoul' || !isIsoInstant(value.exportedAt) || !isObject(value.data)) invalid('지원하지 않는 백업 형식 또는 버전이에요.');
  if (!Array.isArray(value.data.todos) || !Array.isArray(value.data.records)) invalid('백업 데이터 목록이 올바르지 않아요.');
  if (value.data.todos.length > MAX_BACKUP_TODOS || value.data.records.length > MAX_BACKUP_RECORDS) invalid('백업 항목 수가 허용 범위를 넘었어요.');
  const todos = value.data.todos.map(readTodo);
  const records = value.data.records.map(readRecord);
  validateRelations(todos, records);
  return { format: BACKUP_FORMAT, schemaVersion: DATABASE_VERSION, exportedAt: value.exportedAt, timezone: 'Asia/Seoul', data: { todos, records } };
}

export async function createBackup(deps: Pick<RepositoryDependencies, 'now'> = { now: () => new Date() }): Promise<TodoBackup> {
  const snapshot = await loadSnapshot();
  return { format: BACKUP_FORMAT, schemaVersion: DATABASE_VERSION, exportedAt: deps.now().toISOString(), timezone: 'Asia/Seoul', data: snapshot };
}

export async function restoreBackup(text: string): Promise<void> {
  const backup = parseAndValidateBackup(text);
  await replaceSnapshot(backup.data);
}
