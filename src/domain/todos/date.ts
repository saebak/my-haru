import type { CalendarDate } from './types';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(date: CalendarDate): Date {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new Error('Invalid calendar date');
  const value = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (formatDate(value) !== date) throw new Error('Invalid calendar date');
  return value;
}

export function formatDate(date: Date): CalendarDate {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function todayInSeoul(now = new Date()): CalendarDate {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDays(date: CalendarDate, amount: number): CalendarDate {
  const value = parseDate(date);
  value.setUTCDate(value.getUTCDate() + amount);
  return formatDate(value);
}

export function daysBetween(start: CalendarDate, end: CalendarDate): number {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000);
}

export function isoWeekday(date: CalendarDate): number {
  const day = parseDate(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function startOfWeek(date: CalendarDate): CalendarDate {
  return addDays(date, 1 - isoWeekday(date));
}

export function monthGrid(anchor: CalendarDate): CalendarDate[] {
  const parsed = parseDate(anchor);
  const first = formatDate(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1)));
  const gridStart = addDays(first, -parseDate(first).getUTCDay());
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}
