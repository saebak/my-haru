// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { MonthStats } from '../domain/stats';
import { MonthlyReview } from './MonthlyReview';

afterEach(() => cleanup());

const routine = (seriesId: string, completed: number) => ({ seriesId, title: `루틴${seriesId}`, emoji: '💧', completed, total: 10, percent: completed * 10, bestStreak: completed });
const stats: MonthStats = {
  completed: 20, total: 40, percent: 50, countedDays: 30, perfectDays: 2, previousPercent: 60, delta: -10,
  byTag: [{ tagId: null, completed: 3, total: 4, percent: 75 }],
  routines: [routine('1', 9), routine('2', 7), routine('3', 5), routine('4', 2)],
};

describe('MonthlyReview', () => {
  it('labels untagged items as 기타, states the change in words, and shows the top three routines first', () => {
    render(<MonthlyReview stats={stats} monthName="10월" isCurrentMonth tagsById={new Map()} />);
    expect(screen.getByText('기타')).toBeInTheDocument();
    expect(screen.getByText('지난달보다 10%p 내렸어요')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').filter((item) => item.textContent?.includes('루틴'))).toHaveLength(3);
    const more = screen.getByRole('button', { name: '루틴 1개 더 보기' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    expect(screen.getByText('루틴4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '접기' })).toHaveAttribute('aria-expanded', 'true');
  });
});
