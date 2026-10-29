import { addDays, formatDate, parseDate } from './todos/date';
import { materializeItems } from './todos/todoDomain';
import type { TodoData, TodoRecordData } from './todos/types';

/** 완료·전체 개수와 달성률. 전체가 0이면 달성률은 null이다. */
export type Rate = { completed: number; total: number; percent: number | null };
export type TagRate = Rate & { tagId: string | null };
export type RoutineRate = Rate & { seriesId: string; title: string; emoji: string; bestStreak: number };
export type MonthStats = Rate & {
  /** 통계에 포함한 날 수(오늘 이후 날짜는 제외). 0이면 아직 시작하지 않은 달이다. */
  countedDays: number;
  /** 측정할 항목이 있고 모두 완료한 날 수. */
  perfectDays: number;
  previousPercent: number | null;
  /** 지난달 대비 달성률 변화(%p). 어느 한쪽이라도 기록이 없으면 null. */
  delta: number | null;
  byTag: TagRate[];
  routines: RoutineRate[];
};

function rate(completed: number, total: number): Rate {
  return { completed, total, percent: total ? Math.round((completed / total) * 100) : null };
}

function monthRange(anchor: string, today: string) {
  const parsed = parseDate(anchor);
  const first = formatDate(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1)));
  const last = formatDate(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)));
  return { first, end: last < today ? last : today };
}

/** 날짜 범위의 항목을 하루씩 펼친다. 건너뜀은 달성률 분모에서 제외한다. */
function* measurableDays(todos: TodoData[], records: TodoRecordData[], first: string, end: string) {
  for (let date = first; date <= end; date = addDays(date, 1)) {
    yield { date, items: materializeItems(todos, records, date).filter((item) => item.status !== 'skipped') };
  }
}

function monthRate(todos: TodoData[], records: TodoRecordData[], anchor: string, today: string): number | null {
  const { first, end } = monthRange(anchor, today);
  let completed = 0;
  let total = 0;
  for (const { items } of measurableDays(todos, records, first, end)) {
    total += items.length;
    completed += items.filter((item) => item.status === 'completed').length;
  }
  return rate(completed, total).percent;
}

/**
 * 캘린더 하단 "이번 달 돌아보기" 통계. anchor가 속한 달의 1일부터 말일까지 계산하되 today 이후는 세지 않는다.
 * knownTagIds에 없는 태그(삭제됐거나 이 기기에 정의가 없는 태그)는 태그 없음으로 묶는다.
 */
export function monthStats(todos: TodoData[], records: TodoRecordData[], anchor: string, today: string, knownTagIds: ReadonlySet<string>): MonthStats {
  const { first, end } = monthRange(anchor, today);
  let completed = 0;
  let total = 0;
  let countedDays = 0;
  let perfectDays = 0;
  const tags = new Map<string | null, { completed: number; total: number }>();
  const routines = new Map<string, { title: string; emoji: string; completed: number; total: number; run: number; bestStreak: number }>();

  for (const { items } of measurableDays(todos, records, first, end)) {
    countedDays += 1;
    const done = items.filter((item) => item.status === 'completed').length;
    total += items.length;
    completed += done;
    if (items.length && done === items.length) perfectDays += 1;
    for (const item of items) {
      const isDone = item.status === 'completed';
      const tagId = item.tagIds.find((id) => knownTagIds.has(id)) ?? null;
      const tag = tags.get(tagId) ?? { completed: 0, total: 0 };
      tag.total += 1;
      if (isDone) tag.completed += 1;
      tags.set(tagId, tag);
      if (item.category !== 'habit' || !item.seriesId) continue;
      const routine = routines.get(item.seriesId) ?? { title: item.title, emoji: item.emoji, completed: 0, total: 0, run: 0, bestStreak: 0 };
      routine.title = item.title;
      routine.emoji = item.emoji;
      routine.total += 1;
      if (isDone) {
        routine.completed += 1;
        routine.run += 1;
        routine.bestStreak = Math.max(routine.bestStreak, routine.run);
      } else {
        routine.run = 0;
      }
      routines.set(item.seriesId, routine);
    }
  }

  const parsed = parseDate(first);
  const previousAnchor = formatDate(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() - 1, 1)));
  const current = rate(completed, total);
  const previousPercent = monthRate(todos, records, previousAnchor, today);
  return {
    ...current,
    countedDays,
    perfectDays,
    previousPercent,
    delta: current.percent !== null && previousPercent !== null ? current.percent - previousPercent : null,
    byTag: [...tags].map(([tagId, value]) => ({ tagId, ...rate(value.completed, value.total) }))
      .sort((a, b) => Number(a.tagId === null) - Number(b.tagId === null) || b.total - a.total || (b.percent ?? 0) - (a.percent ?? 0)),
    routines: [...routines].map(([seriesId, value]) => ({ seriesId, title: value.title, emoji: value.emoji, bestStreak: value.bestStreak, ...rate(value.completed, value.total) }))
      .sort((a, b) => b.completed - a.completed || a.title.localeCompare(b.title, 'ko')),
  };
}

/** 선택한 날짜 한 줄 요약용. 건너뜀은 제외한다. */
export function dayRate(todos: TodoData[], records: TodoRecordData[], date: string): Rate {
  const items = materializeItems(todos, records, date).filter((item) => item.status !== 'skipped');
  return rate(items.filter((item) => item.status === 'completed').length, items.length);
}
