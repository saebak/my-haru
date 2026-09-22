import { addDays, parseDate } from '../../domain/todos/date';
import { occursOn, resolveTodoCategory, TodoError, validateTodo } from '../../domain/todos/todoDomain';
import type {
  CreateTodoInput, DeleteReceipt, DisplayTodo, RecurringPatch, RepositoryDependencies,
  TodoContentPatch, TodoData, TodoOverrides, TodoRecordData, TodoRecordStatus, TodoStatus,
} from '../../domain/todos/types';

export const DATABASE_NAME = 'my-daily-todo';
export const DATABASE_VERSION = 2;
const TODO_STORE = 'todos';
const RECORD_STORE = 'todoRecords';
const META_STORE = 'meta';
const ONBOARDING_META_KEY = 'onboardingCompleted';
const MANUAL_ORDERS_META_KEY = 'manualOrders';
const CLOUD_SESSION_META_KEY = 'cloudSession';

export type CloudSession = {
  accountId: string;
  token: string;
  expiresAt: string;
};

export function generateUuid(source: Crypto = globalThis.crypto): string {
  if (typeof source.randomUUID === 'function') return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const defaults: RepositoryDependencies = {
  now: () => new Date(),
  uuid: () => generateUuid(),
};

let connection: Promise<IDBDatabase> | null = null;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Transaction failed'));
  });
}

function createIndex(store: IDBObjectStore, name: string, keyPath: string | string[], options?: IDBIndexParameters) {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options);
}

function normalizeLegacyTodo(value: Record<string, unknown>): TodoData {
  if (value.type === 'one_time' || value.type === 'recurring') {
    const todo = value as TodoData;
    return { ...todo, category: resolveTodoCategory(todo) };
  }
  const timestamp = typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString();
  if (typeof value.id !== 'string' || typeof value.title !== 'string') throw new Error('Invalid legacy todo');
  return {
    id: value.id,
    type: 'one_time',
    category: 'todo',
    seriesId: null,
    revision: null,
    title: value.title.trim(),
    memo: typeof value.memo === 'string' ? value.memo : '',
    emoji: typeof value.emoji === 'string' ? value.emoji : '✅',
    status: value.completedAt ? 'completed' : 'pending',
    priority: value.priority === 'high' || value.priority === 'low' ? value.priority : 'normal',
    dueDate: typeof value.date === 'string' ? value.date : timestamp.slice(0, 10),
    dueTime: typeof value.time === 'string' && value.time ? value.time : null,
    completedAt: typeof value.completedAt === 'string' ? value.completedAt : null,
    repeatFrequency: null,
    repeatInterval: null,
    repeatWeekdays: [],
    repeatStartDate: null,
    repeatEndDate: null,
    timezone: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
}

export function openTodoDatabase(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = request.transaction!;
      const todoStore = database.objectStoreNames.contains(TODO_STORE)
        ? transaction.objectStore(TODO_STORE)
        : database.createObjectStore(TODO_STORE, { keyPath: 'id' });
      createIndex(todoStore, 'type', 'type');
      createIndex(todoStore, 'seriesId', 'seriesId');
      createIndex(todoStore, 'seriesRevision', ['seriesId', 'revision'], { unique: true });
      createIndex(todoStore, 'dueDate', 'dueDate');
      createIndex(todoStore, 'dueDateTime', ['dueDate', 'dueTime']);
      createIndex(todoStore, 'status', 'status');
      createIndex(todoStore, 'priority', 'priority');
      createIndex(todoStore, 'createdAt', 'createdAt');
      createIndex(todoStore, 'deletedAt', 'deletedAt');

      const recordStore = database.objectStoreNames.contains(RECORD_STORE)
        ? transaction.objectStore(RECORD_STORE)
        : database.createObjectStore(RECORD_STORE, { keyPath: 'id' });
      createIndex(recordStore, 'seriesTargetDate', ['seriesId', 'targetDate'], { unique: true });
      createIndex(recordStore, 'seriesId', 'seriesId');
      createIndex(recordStore, 'targetDate', 'targetDate');
      createIndex(recordStore, 'status', 'status');
      createIndex(recordStore, 'deletedAt', 'deletedAt');

      const metaStore = database.objectStoreNames.contains(META_STORE)
        ? transaction.objectStore(META_STORE)
        : database.createObjectStore(META_STORE, { keyPath: 'key' });
      metaStore.put({ key: 'schemaVersion', value: DATABASE_VERSION });

      if (event.oldVersion === 1) {
        const cursorRequest = todoStore.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          try {
            const normalized = normalizeLegacyTodo(cursor.value as Record<string, unknown>);
            validateTodo(normalized);
            cursor.update(normalized);
            cursor.continue();
          } catch {
            transaction.abort();
          }
        };
      }
    };
    request.onblocked = () => {
      blocked = true;
      connection = null;
      reject(new TodoError('STORAGE_BLOCKED', '다른 화면에서 데이터 업데이트를 막고 있어요. 다른 화면을 닫고 다시 시도해 주세요.', true));
    };
    request.onerror = () => {
      connection = null;
      const code = request.error?.name === 'VersionError' ? 'UNSUPPORTED_DATABASE_VERSION' : 'STORAGE_OPEN_FAILED';
      reject(new TodoError(code, code === 'UNSUPPORTED_DATABASE_VERSION' ? '앱을 최신 버전으로 업데이트해 주세요.' : '저장소를 열지 못했어요.', true));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) { database.close(); return; }
      database.onversionchange = () => {
        database.close();
        connection = null;
      };
      resolve(database);
    };
  });
  return connection;
}

export function closeTodoDatabase(): void {
  if (!connection) return;
  void connection.then((database) => database.close()).catch(() => undefined);
  connection = null;
}

function storageError(error: unknown): TodoError {
  if (error instanceof TodoError) return error;
  return new TodoError('STORAGE_WRITE_FAILED', '기기에 저장하지 못했어요. 다시 시도해 주세요.', true);
}

export async function loadSnapshot(): Promise<{ todos: TodoData[]; records: TodoRecordData[] }> {
  try {
    const database = await openTodoDatabase();
    const transaction = database.transaction([TODO_STORE, RECORD_STORE], 'readonly');
    const todos = await requestResult(transaction.objectStore(TODO_STORE).getAll()) as TodoData[];
    const records = await requestResult(transaction.objectStore(RECORD_STORE).getAll()) as TodoRecordData[];
    await transactionDone(transaction);
    return { todos: todos.map((todo) => ({ ...todo, category: resolveTodoCategory(todo) })), records };
  } catch (error) {
    throw storageError(error);
  }
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    const database = await openTodoDatabase();
    const transaction = database.transaction(META_STORE, 'readonly');
    const entry = await requestResult(transaction.objectStore(META_STORE).get(ONBOARDING_META_KEY)) as { value?: unknown } | undefined;
    await transactionDone(transaction);
    return entry?.value === true;
  } catch (error) {
    throw storageError(error);
  }
}

export async function completeOnboarding(): Promise<void> {
  try {
    const database = await openTodoDatabase();
    const transaction = database.transaction(META_STORE, 'readwrite');
    transaction.objectStore(META_STORE).put({ key: ONBOARDING_META_KEY, value: true });
    await transactionDone(transaction);
  } catch (error) {
    throw storageError(error);
  }
}

export async function loadCloudSession(): Promise<CloudSession | null> {
  try {
    const database = await openTodoDatabase();
    const transaction = database.transaction(META_STORE, 'readonly');
    const entry = await requestResult(transaction.objectStore(META_STORE).get(CLOUD_SESSION_META_KEY)) as { value?: unknown } | undefined;
    await transactionDone(transaction);
    const value = entry?.value as Partial<CloudSession> | undefined;
    if (!value || typeof value.accountId !== 'string' || typeof value.token !== 'string' || typeof value.expiresAt !== 'string') return null;
    if (Number.isNaN(Date.parse(value.expiresAt))) return null;
    return value as CloudSession;
  } catch (error) {
    throw storageError(error);
  }
}

export async function saveCloudSession(session: CloudSession): Promise<void> {
  try {
    const database = await openTodoDatabase();
    const transaction = database.transaction(META_STORE, 'readwrite');
    transaction.objectStore(META_STORE).put({ key: CLOUD_SESSION_META_KEY, value: session });
    await transactionDone(transaction);
  } catch (error) {
    throw storageError(error);
  }
}

export async function loadManualOrders(): Promise<Record<string, string[]>> {
  try {
    const database = await openTodoDatabase();
    const transaction = database.transaction(META_STORE, 'readonly');
    const entry = await requestResult(transaction.objectStore(META_STORE).get(MANUAL_ORDERS_META_KEY)) as { value?: unknown } | undefined;
    await transactionDone(transaction);
    if (!entry?.value || typeof entry.value !== 'object' || Array.isArray(entry.value)) return {};
    return Object.fromEntries(Object.entries(entry.value).filter(([date, order]) =>
      /^\d{4}-\d{2}-\d{2}$/.test(date) && Array.isArray(order) && order.every((key) => typeof key === 'string'),
    )) as Record<string, string[]>;
  } catch (error) {
    throw storageError(error);
  }
}

export async function saveManualOrder(date: string, order: string[]): Promise<void> {
  try {
    parseDate(date);
    const database = await openTodoDatabase();
    const transaction = database.transaction(META_STORE, 'readwrite');
    const store = transaction.objectStore(META_STORE);
    const entry = await requestResult(store.get(MANUAL_ORDERS_META_KEY)) as { value?: unknown } | undefined;
    const current = entry?.value && typeof entry.value === 'object' && !Array.isArray(entry.value)
      ? entry.value as Record<string, unknown>
      : {};
    store.put({ key: MANUAL_ORDERS_META_KEY, value: { ...current, [date]: [...new Set(order)] } });
    await transactionDone(transaction);
  } catch (error) {
    throw storageError(error);
  }
}

function makeTodo(input: CreateTodoInput, deps: RepositoryDependencies): TodoData {
  const timestamp = deps.now().toISOString();
  const base = {
    id: deps.uuid(), title: input.title.trim(), memo: input.memo.trim(), emoji: input.emoji || '💡',
    category: input.category ?? (input.type === 'one_time' ? 'todo' : undefined),
    priority: input.priority, dueTime: input.dueTime || null, createdAt: timestamp, updatedAt: timestamp,
    deletedAt: null,
  };
  if (input.type === 'one_time') {
    return {
      ...base, type: 'one_time', seriesId: null, revision: null, status: 'pending', dueDate: input.dueDate,
      completedAt: null, repeatFrequency: null, repeatInterval: null, repeatWeekdays: [], repeatStartDate: null,
      repeatEndDate: null, timezone: null,
    };
  }
  return {
    ...base, category: base.category ?? (input.dueTime === null ? 'habit' : 'todo'), type: 'recurring', seriesId: deps.uuid(), revision: 1, status: null, dueDate: null,
    completedAt: null, repeatFrequency: input.repeatFrequency, repeatInterval: input.repeatInterval,
    repeatWeekdays: [...input.repeatWeekdays].sort((a, b) => a - b), repeatStartDate: input.repeatStartDate,
    repeatEndDate: input.repeatEndDate, timezone: 'Asia/Seoul',
  };
}

export async function createTodo(input: CreateTodoInput, deps = defaults): Promise<TodoData> {
  const todo = makeTodo(input, deps);
  validateTodo(todo);
  try {
    const database = await openTodoDatabase();
    const transaction = database.transaction(TODO_STORE, 'readwrite');
    transaction.objectStore(TODO_STORE).add(todo);
    await transactionDone(transaction);
    return todo;
  } catch (error) {
    throw storageError(error);
  }
}

async function findTodo(transaction: IDBTransaction, id: string): Promise<TodoData> {
  const todo = await requestResult(transaction.objectStore(TODO_STORE).get(id)) as TodoData | undefined;
  if (!todo || todo.deletedAt) throw new TodoError('NOT_FOUND', '할 일을 찾을 수 없어요.', false);
  return todo;
}

export async function updateOneTime(id: string, patch: TodoContentPatch, deps = defaults): Promise<TodoData> {
  try {
    const database = await openTodoDatabase();
    const transaction = database.transaction(TODO_STORE, 'readwrite');
    const todo = await findTodo(transaction, id);
    if (todo.type !== 'one_time') throw new TodoError('CONFLICT', '반복 할 일에는 수정 범위가 필요해요.', false);
    const updated: TodoData = {
      ...todo, ...patch, title: patch.title.trim(), memo: patch.memo.trim(), dueTime: patch.dueTime || null,
      category: patch.category ?? resolveTodoCategory(todo),
      updatedAt: deps.now().toISOString(),
    };
    validateTodo(updated);
    transaction.objectStore(TODO_STORE).put(updated);
    await transactionDone(transaction);
    return updated;
  } catch (error) {
    throw storageError(error);
  }
}

export async function setOneTimeStatus(id: string, status: TodoStatus, deps = defaults): Promise<TodoData> {
  try {
    const database = await openTodoDatabase();
    const transaction = database.transaction(TODO_STORE, 'readwrite');
    const todo = await findTodo(transaction, id);
    if (todo.type !== 'one_time') throw new TodoError('CONFLICT', '반복 할 일 상태는 날짜별로 저장해야 해요.', false);
    const timestamp = deps.now().toISOString();
    const updated = { ...todo, status, completedAt: status === 'completed' ? timestamp : null, updatedAt: timestamp };
    validateTodo(updated);
    transaction.objectStore(TODO_STORE).put(updated);
    await transactionDone(transaction);
    return updated;
  } catch (error) {
    throw storageError(error);
  }
}

async function findRecord(transaction: IDBTransaction, seriesId: string, targetDate: string): Promise<TodoRecordData | undefined> {
  return requestResult(transaction.objectStore(RECORD_STORE).index('seriesTargetDate').get([seriesId, targetDate])) as Promise<TodoRecordData | undefined>;
}

export async function setRecurringStatus(
  seriesId: string, targetDate: string, status: TodoRecordStatus, deps = defaults,
): Promise<TodoRecordData> {
  try {
    const database = await openTodoDatabase();
    const transaction = database.transaction([TODO_STORE, RECORD_STORE], 'readwrite');
    const todos = await requestResult(transaction.objectStore(TODO_STORE).index('seriesId').getAll(seriesId)) as TodoData[];
    if (!todos.some((todo) => occursOn(todo, targetDate))) {
      throw new TodoError('NOT_FOUND', '이 날짜의 반복 할 일을 찾을 수 없어요.', false);
    }
    const current = await findRecord(transaction, seriesId, targetDate);
    const timestamp = deps.now().toISOString();
    const record: TodoRecordData = {
      id: current?.id ?? deps.uuid(), seriesId, targetDate, status,
      completedAt: status === 'completed' ? timestamp : null,
      overrides: current?.deletedAt ? null : current?.overrides ?? null,
      hidden: current?.deletedAt ? false : current?.hidden ?? false,
      createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp, deletedAt: null,
    };
    transaction.objectStore(RECORD_STORE).put(record);
    await transactionDone(transaction);
    return record;
  } catch (error) {
    throw storageError(error);
  }
}

function overridesFromPatch(patch: RecurringPatch): TodoOverrides {
  return { title: patch.title.trim(), memo: patch.memo.trim(), priority: patch.priority, dueTime: patch.dueTime || null };
}

export async function updateRecurring(
  seriesId: string, targetDate: string, scope: 'date' | 'future', patch: RecurringPatch, deps = defaults,
): Promise<void> {
  try {
    const database = await openTodoDatabase();
    const transaction = database.transaction([TODO_STORE, RECORD_STORE], 'readwrite');
    const todoStore = transaction.objectStore(TODO_STORE);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const todos = await requestResult(todoStore.index('seriesId').getAll(seriesId)) as TodoData[];
    const active = todos.find((todo) => occursOn(todo, targetDate));
    if (!active) throw new TodoError('NOT_FOUND', '이 날짜의 반복 할 일을 찾을 수 없어요.', false);
    const timestamp = deps.now().toISOString();
    if (scope === 'date') {
      const current = await findRecord(transaction, seriesId, targetDate);
      const candidate = { ...active, title: patch.title.trim(), memo: patch.memo.trim(), priority: patch.priority, dueTime: patch.dueTime || null, category: patch.category ?? resolveTodoCategory(active) };
      validateTodo(candidate);
      const record: TodoRecordData = {
        id: current?.id ?? deps.uuid(), seriesId, targetDate, status: current && !current.deletedAt ? current.status : 'pending',
        completedAt: current && !current.deletedAt ? current.completedAt : null, overrides: overridesFromPatch(patch), hidden: false,
        createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp, deletedAt: null,
      };
      recordStore.put(record);
    } else {
      const maxRevision = Math.max(...todos.map((todo) => todo.revision ?? 0));
      for (const todo of todos.filter((value) => !value.deletedAt && value.repeatStartDate! >= active.repeatStartDate!)) {
        if (todo.id === active.id && todo.repeatStartDate! < targetDate) {
          todoStore.put({ ...todo, repeatEndDate: addDays(targetDate, -1), updatedAt: timestamp });
        } else if (todo.repeatStartDate! >= targetDate || todo.id === active.id) {
          todoStore.put({ ...todo, deletedAt: timestamp, updatedAt: timestamp });
        }
      }
      const next: TodoData = {
        ...active, ...patch, id: deps.uuid(), revision: maxRevision + 1, repeatStartDate: targetDate,
        category: patch.category ?? resolveTodoCategory(active),
        repeatWeekdays: [...patch.repeatWeekdays].sort((a, b) => a - b), title: patch.title.trim(), memo: patch.memo.trim(),
        dueTime: patch.dueTime || null, createdAt: timestamp, updatedAt: timestamp, deletedAt: null,
      };
      validateTodo(next);
      todoStore.add(next);
      const records = await requestResult(recordStore.index('seriesId').getAll(seriesId)) as TodoRecordData[];
      for (const record of records) {
        if (!record.deletedAt && record.targetDate >= targetDate && !occursOn(next, record.targetDate)) {
          recordStore.put({ ...record, deletedAt: timestamp, updatedAt: timestamp });
        }
      }
    }
    await transactionDone(transaction);
  } catch (error) {
    throw storageError(error);
  }
}

export async function deleteOccurrence(
  item: DisplayTodo, scope: 'date' | 'future', deps = defaults,
): Promise<DeleteReceipt> {
  try {
    const database = await openTodoDatabase();
    const transaction = database.transaction([TODO_STORE, RECORD_STORE], 'readwrite');
    const todoStore = transaction.objectStore(TODO_STORE);
    const recordStore = transaction.objectStore(RECORD_STORE);
    const timestamp = deps.now().toISOString();
    const receipt: DeleteReceipt = { todos: [], records: [], createdRecordIds: [] };
    if (item.type === 'one_time') {
      const todo = await findTodo(transaction, item.todoId);
      receipt.todos.push(todo);
      todoStore.put({ ...todo, deletedAt: timestamp, updatedAt: timestamp });
    } else if (scope === 'date') {
      const current = await findRecord(transaction, item.seriesId!, item.targetDate);
      if (current) receipt.records.push(current);
      else receipt.createdRecordIds.push(deps.uuid());
      const record: TodoRecordData = {
        id: current?.id ?? receipt.createdRecordIds[0], seriesId: item.seriesId!, targetDate: item.targetDate,
        status: current && !current.deletedAt ? current.status : 'pending', completedAt: current && !current.deletedAt ? current.completedAt : null,
        overrides: current && !current.deletedAt ? current.overrides : null, hidden: true, createdAt: current?.createdAt ?? timestamp,
        updatedAt: timestamp, deletedAt: null,
      };
      recordStore.put(record);
    } else {
      const todos = await requestResult(todoStore.index('seriesId').getAll(item.seriesId!)) as TodoData[];
      const records = await requestResult(recordStore.index('seriesId').getAll(item.seriesId!)) as TodoRecordData[];
      for (const todo of todos.filter((value) => !value.deletedAt && value.repeatStartDate! <= item.targetDate && (!value.repeatEndDate || value.repeatEndDate >= item.targetDate))) {
        receipt.todos.push(todo);
        if (todo.repeatStartDate! < item.targetDate) {
          todoStore.put({ ...todo, repeatEndDate: addDays(item.targetDate, -1), updatedAt: timestamp });
        } else {
          todoStore.put({ ...todo, deletedAt: timestamp, updatedAt: timestamp });
        }
      }
      for (const todo of todos.filter((value) => !value.deletedAt && value.repeatStartDate! > item.targetDate)) {
        receipt.todos.push(todo);
        todoStore.put({ ...todo, deletedAt: timestamp, updatedAt: timestamp });
      }
      for (const record of records.filter((value) => !value.deletedAt && value.targetDate >= item.targetDate)) {
        receipt.records.push(record);
        recordStore.put({ ...record, deletedAt: timestamp, updatedAt: timestamp });
      }
    }
    await transactionDone(transaction);
    return receipt;
  } catch (error) {
    throw storageError(error);
  }
}

export async function undoDelete(receipt: DeleteReceipt): Promise<void> {
  try {
    const database = await openTodoDatabase();
    const transaction = database.transaction([TODO_STORE, RECORD_STORE], 'readwrite');
    const todoStore = transaction.objectStore(TODO_STORE);
    const recordStore = transaction.objectStore(RECORD_STORE);
    receipt.todos.forEach((todo) => todoStore.put(todo));
    receipt.records.forEach((record) => recordStore.put(record));
    receipt.createdRecordIds.forEach((id) => recordStore.delete(id));
    await transactionDone(transaction);
  } catch (error) {
    throw storageError(error);
  }
}

export async function softDeleteCompleted(deps = defaults): Promise<DeleteReceipt> {
  try {
    const database = await openTodoDatabase();
    const transaction = database.transaction(TODO_STORE, 'readwrite');
    const store = transaction.objectStore(TODO_STORE);
    const todos = await requestResult(store.getAll()) as TodoData[];
    const completed = todos.filter((todo) => todo.type === 'one_time' && todo.status === 'completed' && !todo.deletedAt);
    const timestamp = deps.now().toISOString();
    completed.forEach((todo) => store.put({ ...todo, deletedAt: timestamp, updatedAt: timestamp }));
    await transactionDone(transaction);
    return { todos: completed, records: [], createdRecordIds: [] };
  } catch (error) {
    throw storageError(error);
  }
}

export async function replaceSnapshot(snapshot: { todos: TodoData[]; records: TodoRecordData[] }): Promise<void> {
  try {
    const database = await openTodoDatabase();
    const transaction = database.transaction([TODO_STORE, RECORD_STORE, META_STORE], 'readwrite');
    const todoStore = transaction.objectStore(TODO_STORE);
    const recordStore = transaction.objectStore(RECORD_STORE);
    todoStore.clear();
    recordStore.clear();
    snapshot.todos.forEach((todo) => todoStore.put(todo));
    snapshot.records.forEach((record) => recordStore.put(record));
    transaction.objectStore(META_STORE).put({ key: 'schemaVersion', value: DATABASE_VERSION });
    await transactionDone(transaction);
  } catch (error) {
    throw storageError(error);
  }
}

export async function clearAllData(): Promise<void> {
  return replaceSnapshot({ todos: [], records: [] });
}
