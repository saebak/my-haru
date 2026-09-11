import { describe, expect, it } from 'vitest';

import { addDays, monthGrid } from './date';
import { filterAndSortItems, materializeItems, occursOn } from './todoDomain';
import type { DisplayTodo, TodoData } from './types';

function recurring(overrides: Partial<TodoData> = {}): TodoData {
  return {
    id: 'todo-1', type: 'recurring', seriesId: 'series-1', revision: 1, title: '운동', memo: '', emoji: '🏃',
    status: null, priority: 'normal', dueDate: null, dueTime: '08:00', completedAt: null,
    repeatFrequency: 'daily', repeatInterval: 1, repeatWeekdays: [], repeatStartDate: '2028-02-28',
    repeatEndDate: null, timezone: 'Asia/Seoul', createdAt: '2028-01-01T00:00:00.000Z',
    updatedAt: '2028-01-01T00:00:00.000Z', deletedAt: null, ...overrides,
  };
}

describe('recurrence domain', () => {
  it('handles leap day and month boundaries with calendar strings', () => {
    const todo = recurring({ repeatFrequency: 'interval_days', repeatInterval: 2 });
    expect(occursOn(todo, '2028-02-28')).toBe(true);
    expect(occursOn(todo, '2028-02-29')).toBe(false);
    expect(occursOn(todo, '2028-03-01')).toBe(true);
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('uses Monday-based week intervals and selected weekdays', () => {
    const todo = recurring({ repeatFrequency: 'weekly', repeatInterval: 2, repeatWeekdays: [1, 3], repeatStartDate: '2026-09-09' });
    expect(occursOn(todo, '2026-09-09')).toBe(true);
    expect(occursOn(todo, '2026-09-14')).toBe(false);
    expect(occursOn(todo, '2026-09-21')).toBe(true);
  });

  it('materializes a date override and a skipped status without changing the source todo', () => {
    const todo = recurring();
    const items = materializeItems([todo], [{
      id: 'record-1', seriesId: 'series-1', targetDate: '2028-02-29', status: 'skipped', completedAt: null,
      overrides: { title: '가볍게 걷기', dueTime: null }, hidden: false,
      createdAt: '2028-02-28T00:00:00.000Z', updatedAt: '2028-02-28T00:00:00.000Z', deletedAt: null,
    }], '2028-02-29');
    expect(items[0]).toMatchObject({ title: '가볍게 걷기', dueTime: null, status: 'skipped' });
    expect(todo.title).toBe('운동');
  });

  it('builds a stable six-week month grid', () => {
    const grid = monthGrid('2026-09-11');
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-08-30');
    expect(grid.at(-1)).toBe('2026-10-10');
  });
});

describe('list filtering and sorting', () => {
  const base: DisplayTodo = {
    key: 'a', todoId: 'a', type: 'one_time', seriesId: null, targetDate: '2026-09-11', title: 'A', memo: '', emoji: '✅',
    priority: 'low', dueTime: null, status: 'pending', completedAt: null, createdAt: '2026-09-01T00:00:00.000Z', revision: null,
  };
  it('filters by status and priority and orders high priority first', () => {
    const values = [base, { ...base, key: 'b', todoId: 'b', priority: 'high' as const }, { ...base, key: 'c', todoId: 'c', priority: 'high' as const, status: 'completed' as const }];
    expect(filterAndSortItems(values, { priority: 'high', status: 'pending', sort: 'priority' }).map((item) => item.key)).toEqual(['b']);
  });

  it('materializes, filters, and sorts 1,000 todos within the interaction budget', () => {
    const todos: TodoData[] = Array.from({ length: 1_000 }, (_, index) => ({
      id: `todo-${index}`, type: 'one_time', seriesId: null, revision: null, title: `할 일 ${index}`, memo: '', emoji: '✅',
      status: index % 3 === 0 ? 'completed' : 'pending', priority: index % 2 === 0 ? 'high' : 'normal',
      dueDate: '2026-09-11', dueTime: `${String(index % 24).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}`,
      completedAt: index % 3 === 0 ? '2026-09-11T01:00:00.000Z' : null,
      repeatFrequency: null, repeatInterval: null, repeatWeekdays: [], repeatStartDate: null, repeatEndDate: null,
      timezone: null, createdAt: new Date(index).toISOString(), updatedAt: new Date(index).toISOString(), deletedAt: null,
    }));
    const startedAt = performance.now();
    const result = filterAndSortItems(materializeItems(todos, [], '2026-09-11'), { priority: 'high', status: 'pending', sort: 'due' });
    const elapsed = performance.now() - startedAt;
    expect(result).toHaveLength(333);
    expect(elapsed).toBeLessThan(500);
  });
});
