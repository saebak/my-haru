import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { TodoBackup } from './backup';
import { BACKUP_FORMAT, createBackup, parseAndValidateBackup, restoreBackup } from './backup';
import { closeTodoDatabase, createTodo, DATABASE_NAME, loadSnapshot } from '../../infrastructure/indexed-db/todoRepository';

const now = '2026-09-11T01:00:00.000Z';

function validBackup(): TodoBackup {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: 2,
    exportedAt: now,
    timezone: 'Asia/Seoul',
    data: {
      todos: [{
        id: 'todo-1', type: 'one_time', seriesId: null, revision: null, title: '백업 항목', memo: '', emoji: '✅',
        status: 'pending', priority: 'normal', dueDate: '2026-09-11', dueTime: null, completedAt: null,
        repeatFrequency: null, repeatInterval: null, repeatWeekdays: [], repeatStartDate: null, repeatEndDate: null,
        timezone: null, createdAt: now, updatedAt: now, deletedAt: null,
      }],
      records: [],
    },
  };
}

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

describe('backup validation and restore', () => {
  it('round-trips a supported backup', async () => {
    await restoreBackup(JSON.stringify(validBackup()));
    const exported = await createBackup({ now: () => new Date(now) });
    expect(exported).toEqual(validBackup());
  });

  it('rejects duplicate logical records before writing', () => {
    const backup = validBackup();
    backup.data.todos = [{
      ...backup.data.todos[0], id: 'routine-1', type: 'recurring', seriesId: 'series-1', revision: 1,
      status: null, dueDate: null, repeatFrequency: 'daily', repeatInterval: 1, repeatStartDate: '2026-09-01', timezone: 'Asia/Seoul',
    }];
    const record = { id: 'record-1', seriesId: 'series-1', targetDate: '2026-09-11', status: 'pending' as const, completedAt: null, overrides: null, hidden: false, createdAt: now, updatedAt: now, deletedAt: null };
    backup.data.records = [record, { ...record, id: 'record-2' }];
    expect(() => parseAndValidateBackup(JSON.stringify(backup))).toThrow('같은 날짜의 수행 기록');
  });

  it('does not change existing data when a backup is invalid', async () => {
    await createTodo({ type: 'one_time', title: '기존 데이터', memo: '', emoji: '✅', priority: 'high', dueDate: '2026-09-11', dueTime: null }, { now: () => new Date(now), uuid: () => 'existing' });
    const before = await loadSnapshot();
    await expect(restoreBackup('{"format":"wrong"}')).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await loadSnapshot()).toEqual(before);
  });
});
