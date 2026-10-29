import { describe, expect, it } from 'vitest';

import { dayRate, monthStats } from './stats';
import type { TodoData, TodoRecordData } from './todos/types';

const stamp = '2026-09-01T00:00:00.000Z';

function oneTime(id: string, dueDate: string, done: boolean, tagIds: string[] = []): TodoData {
  return {
    id, type: 'one_time', category: 'todo', seriesId: null, revision: null, title: id, memo: '', emoji: '💡', status: done ? 'completed' : 'pending',
    priority: 'normal', dueDate, dueTime: null, completedAt: done ? stamp : null, repeatFrequency: null, repeatInterval: null, repeatWeekdays: [],
    repeatStartDate: null, repeatEndDate: null, timezone: null, tagIds, createdAt: stamp, updatedAt: stamp, deletedAt: null,
  };
}

const habit: TodoData = {
  id: 'h1', type: 'recurring', category: 'habit', seriesId: 's1', revision: 1, title: '스트레칭', memo: '', emoji: '🧘', status: null, priority: 'normal',
  dueDate: null, dueTime: null, completedAt: null, repeatFrequency: 'daily', repeatInterval: 1, repeatWeekdays: [], repeatStartDate: '2026-10-01',
  repeatEndDate: null, timezone: 'Asia/Seoul', tagIds: ['health'], createdAt: stamp, updatedAt: stamp, deletedAt: null,
};

function record(targetDate: string, status: TodoRecordData['status']): TodoRecordData {
  return { id: `r-${targetDate}`, seriesId: 's1', targetDate, status, completedAt: status === 'completed' ? stamp : null, overrides: null, hidden: false, createdAt: stamp, updatedAt: stamp, deletedAt: null };
}

describe('monthly stats', () => {
  it('counts only days up to today, excludes skipped items, and groups by known tags', () => {
    const todos = [
      habit,
      oneTime('a', '2026-10-01', true, ['career']),
      oneTime('b', '2026-10-02', false, ['career']),
      oneTime('c', '2026-10-02', true, ['deleted-tag']),
      oneTime('future', '2026-10-20', true, ['career']),
    ];
    const records = [record('2026-10-01', 'completed'), record('2026-10-02', 'completed'), record('2026-10-03', 'skipped'), record('2026-10-04', 'completed')];
    const stats = monthStats(todos, records, '2026-10-01', '2026-10-05', new Set(['health', 'career']));
    expect(stats.countedDays).toBe(5);
    // 10/1 습관+a, 10/2 습관+b+c, 10/3 건너뜀 제외, 10/4 습관, 10/5 습관(미완료)
    expect(stats).toMatchObject({ completed: 5, total: 7, percent: 71 });
    expect(stats.perfectDays).toBe(2);
    expect(stats.byTag).toEqual([
      { tagId: 'health', completed: 3, total: 4, percent: 75 },
      { tagId: 'career', completed: 1, total: 2, percent: 50 },
      { tagId: null, completed: 1, total: 1, percent: 100 },
    ]);
    // 10/3 건너뜀은 분모에서 빠지지만 연속은 끊지 않는다.
    expect(stats.routines).toEqual([{ seriesId: 's1', title: '스트레칭', emoji: '🧘', completed: 3, total: 4, percent: 75, bestStreak: 3 }]);
  });

  it('compares with the previous month and reports an empty future month', () => {
    const todos = [oneTime('sep1', '2026-09-10', true), oneTime('sep2', '2026-09-11', false), oneTime('oct', '2026-10-02', true)];
    const october = monthStats(todos, [], '2026-10-01', '2026-10-31', new Set());
    expect(october).toMatchObject({ percent: 100, previousPercent: 50, delta: 50 });
    const december = monthStats(todos, [], '2026-12-01', '2026-10-31', new Set());
    expect(december).toMatchObject({ countedDays: 0, total: 0, percent: null, delta: null, byTag: [], routines: [] });
  });

  it('summarizes a single day without skipped items', () => {
    expect(dayRate([habit], [record('2026-10-03', 'skipped')], '2026-10-03')).toEqual({ completed: 0, total: 0, percent: null });
    expect(dayRate([habit, oneTime('x', '2026-10-04', true)], [], '2026-10-04')).toEqual({ completed: 1, total: 2, percent: 50 });
  });
});
