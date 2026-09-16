import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { materializeItems } from '../../domain/todos/todoDomain';
import type { RepositoryDependencies } from '../../domain/todos/types';
import {
  closeTodoDatabase, completeOnboarding, createTodo, DATABASE_NAME, deleteOccurrence, hasCompletedOnboarding, loadManualOrders, loadSnapshot, openTodoDatabase, saveManualOrder,
  setOneTimeStatus, setRecurringStatus, softDeleteCompleted, undoDelete, updateRecurring,
} from './todoRepository';

const deps: RepositoryDependencies = {
  now: () => new Date('2026-09-11T01:00:00.000Z'),
  uuid: (() => { let value = 0; return () => `id-${++value}`; })(),
};

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('delete blocked'));
  });
}

beforeEach(async () => {
  closeTodoDatabase();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await deleteDatabase();
});

afterAll(() => closeTodoDatabase());

describe('IndexedDB todo repository', () => {
  it('stores onboarding completion separately from todo data', async () => {
    expect(await hasCompletedOnboarding()).toBe(false);
    await completeOnboarding();
    expect(await hasCompletedOnboarding()).toBe(true);
    expect(await loadSnapshot()).toEqual({ todos: [], records: [] });
  });

  it('persists unique manual orders by calendar date', async () => {
    expect(await loadManualOrders()).toEqual({});
    await saveManualOrder('2026-09-11', ['todo-b', 'todo-a', 'todo-b']);
    await saveManualOrder('2026-09-12', ['todo-c']);
    expect(await loadManualOrders()).toEqual({
      '2026-09-11': ['todo-b', 'todo-a'],
      '2026-09-12': ['todo-c'],
    });
  });

  it('rejects invalid input before writing anything', async () => {
    await expect(createTodo({ type: 'one_time', title: '   ', memo: '', emoji: '✅', priority: 'normal', dueDate: '2026-09-11', dueTime: null }, deps)).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await loadSnapshot()).todos).toEqual([]);
  });

  it('stores status and completedAt atomically', async () => {
    const todo = await MamaCreate();
    const completed = await setOneTimeStatus(todo.id, 'completed', deps);
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBe('2026-09-11T01:00:00.000Z');
    const restored = await setOneTimeStatus(todo.id, 'pending', deps);
    expect(restored.completedAt).toBeNull();
    expect((await loadSnapshot()).todos[0]).toEqual(restored);
  });

  it('soft deletes and restores the exact previous value with a receipt', async () => {
    const todo = await MamaCreate();
    const [item] = materializeItems([todo], [], '2026-09-11');
    const receipt = await deleteOccurrence(item, 'date', deps);
    expect((await loadSnapshot()).todos[0].deletedAt).not.toBeNull();
    await undoDelete(receipt);
    expect((await loadSnapshot()).todos[0]).toEqual(todo);
  });

  it('splits a recurring series for future edits and keeps an earlier completion', async () => {
    const todo = await createTodo({ type: 'recurring', title: '운동', memo: '', emoji: '🏃', priority: 'normal', dueTime: '08:00', repeatStartDate: '2026-09-01', repeatFrequency: 'daily', repeatInterval: 1, repeatWeekdays: [], repeatEndDate: null }, deps);
    await setRecurringStatus(todo.seriesId!, '2026-09-10', 'completed', deps);
    await updateRecurring(todo.seriesId!, '2026-09-11', 'future', { title: '산책', memo: '', emoji: '🚶', priority: 'low', dueTime: null, repeatFrequency: 'interval_days', repeatInterval: 2, repeatWeekdays: [], repeatEndDate: null }, deps);
    const snapshot = await loadSnapshot();
    const revisions = snapshot.todos.filter((value) => value.seriesId === todo.seriesId).sort((a, b) => a.revision! - b.revision!);
    expect(revisions).toHaveLength(2);
    expect(revisions[0].repeatEndDate).toBe('2026-09-10');
    expect(revisions[1]).toMatchObject({ revision: 2, title: '산책', repeatStartDate: '2026-09-11' });
    expect(snapshot.records[0]).toMatchObject({ targetDate: '2026-09-10', status: 'completed', deletedAt: null });
  });

  it('does not create a record on a date outside the recurrence rule', async () => {
    const todo = await createTodo({ type: 'recurring', title: '운동', memo: '', emoji: '🏃', priority: 'normal', dueTime: null, repeatStartDate: '2026-09-01', repeatFrequency: 'interval_days', repeatInterval: 2, repeatWeekdays: [], repeatEndDate: null }, deps);
    await expect(setRecurringStatus(todo.seriesId!, '2026-09-02', 'completed', deps)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await loadSnapshot()).records).toEqual([]);
  });

  it('cleans completed one-time todos without removing recurring history', async () => {
    const oneTime = await MamaCreate();
    await setOneTimeStatus(oneTime.id, 'completed', deps);
    const recurring = await createTodo({ type: 'recurring', title: '운동', memo: '', emoji: '🏃', priority: 'normal', dueTime: null, repeatStartDate: '2026-09-11', repeatFrequency: 'daily', repeatInterval: 1, repeatWeekdays: [], repeatEndDate: null }, deps);
    await setRecurringStatus(recurring.seriesId!, '2026-09-11', 'completed', deps);
    const receipt = await softDeleteCompleted(deps);
    const cleaned = await loadSnapshot();
    expect(cleaned.todos.find((todo) => todo.id === oneTime.id)?.deletedAt).not.toBeNull();
    expect(cleaned.records[0]).toMatchObject({ status: 'completed', deletedAt: null });
    await undoDelete(receipt);
    expect((await loadSnapshot()).todos.find((todo) => todo.id === oneTime.id)?.deletedAt).toBeNull();
  });
});

async function MamaCreate() {
  return createTodo({ type: 'one_time', title: '테스트', memo: '', emoji: '✅', priority: 'high', dueDate: '2026-09-11', dueTime: '09:00' }, deps);
}

describe('legacy v1 migration', () => {
  it('keeps a legacy todo while adding the production stores', async () => {
    closeTodoDatabase();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await deleteDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('todos', { keyPath: 'id' }).put({ id: 'legacy', title: '기존 항목', memo: '', emoji: '✅', date: '2026-09-11', time: '10:00', priority: 'normal', completedAt: null, createdAt: '2026-09-10T00:00:00.000Z' });
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    const database = await openTodoDatabase();
    expect([...database.objectStoreNames]).toEqual(['meta', 'todoRecords', 'todos']);
    const snapshot = await loadSnapshot();
    expect(snapshot.todos[0]).toMatchObject({ id: 'legacy', type: 'one_time', dueDate: '2026-09-11', status: 'pending' });
  });
});
