// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const emblaMock = vi.hoisted(() => {
  let selected = 30;
  let settle: (() => void) | undefined;
  let pointerDown: (() => void) | undefined;
  let select: (() => void) | undefined;
  const api = {
    selectedScrollSnap: () => selected,
    scrollTo: (index: number, jump?: boolean) => {
      selected = index;
      if (!jump) { pointerDown?.(); select?.(); queueMicrotask(() => settle?.()); }
    },
    on: (event: string, handler: () => void) => { if (event === 'settle') settle = handler; if (event === 'pointerDown') pointerDown = handler; if (event === 'select') select = handler; return api; },
    off: (event: string, handler: () => void) => { if (event === 'settle' && settle === handler) settle = undefined; if (event === 'pointerDown' && pointerDown === handler) pointerDown = undefined; if (event === 'select' && select === handler) select = undefined; return api; },
  };
  return {
    api,
    dragTo: (index: number) => { pointerDown?.(); selected = index; select?.(); },
    finishDrag: () => settle?.(),
    reset: () => { selected = 30; settle = undefined; pointerDown = undefined; select = undefined; },
  };
});

vi.mock('embla-carousel-react', () => ({ default: () => [vi.fn(), emblaMock.api] }));

import App from './App';
import { addDays } from './domain/todos/date';
import { createTodo, loadSnapshot, setOneTimeStatus } from './infrastructure/indexed-db/todoRepository';

vi.mock('./infrastructure/indexed-db/todoRepository', () => ({
  loadSnapshot: vi.fn().mockResolvedValue({ todos: [], records: [] }),
  createTodo: vi.fn().mockResolvedValue({}),
  updateOneTime: vi.fn(), updateRecurring: vi.fn(), setOneTimeStatus: vi.fn(), setRecurringStatus: vi.fn(),
  deleteOccurrence: vi.fn(), undoDelete: vi.fn(), clearAllData: vi.fn(), replaceSnapshot: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  emblaMock.reset();
  vi.mocked(loadSnapshot).mockResolvedValue({ todos: [], records: [] });
});
afterEach(() => cleanup());

describe('App', () => {
  it('moves one day in either direction through carousel snaps', async () => {
    render(<App />);
    await screen.findByText('이날의 항목이 없어요');
    const strip = screen.getByRole('region', { name: '날짜 선택' });
    const selected = () => within(strip).getAllByRole('button')[3].getAttribute('data-date')!;
    const start = selected();
    const nextDayButton = within(strip).getAllByRole('button')[4];
    fireEvent.click(nextDayButton);
    expect(nextDayButton).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(selected()).toBe(addDays(start, 1)));
    fireEvent.click(within(strip).getAllByRole('button')[2]);
    await waitFor(() => expect(selected()).toBe(start));
  });

  it('centers the selected date after selection and returning to today', async () => {
    render(<App />);
    await screen.findByText('이날의 항목이 없어요');
    const strip = screen.getByRole('region', { name: '날짜 선택' });
    const days = () => within(strip).getAllByRole('button');
    expect(days()[3]).toHaveAttribute('aria-pressed', 'true');
    const next = days()[6].getAttribute('data-date');
    fireEvent.click(days()[6]);
    await waitFor(() => expect(days()[3]).toHaveAttribute('data-date', next));
    expect(days()[3]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '오늘' }));
    expect(days()[3]).toHaveAttribute('aria-current', 'date');
  });

  it('moves the carousel without changing the selected date until a visible date is clicked', async () => {
    render(<App />);
    await screen.findByText('이날의 항목이 없어요');
    const strip = screen.getByRole('region', { name: '날짜 선택' });
    const start = within(strip).getAllByRole('button')[3].getAttribute('data-date')!;
    const originallySelected = strip.querySelector<HTMLButtonElement>(`[data-date="${start}"]`)!;
    emblaMock.dragTo(32);
    await waitFor(() => expect(within(strip).getAllByRole('button')[3]).toHaveAttribute('data-date', addDays(start, 2)));
    expect(originallySelected).toHaveAttribute('aria-pressed', 'true');
    emblaMock.finishDrag();
    expect(originallySelected).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(strip).getAllByRole('button')[3]);
    expect(within(strip).getAllByRole('button')[3]).toHaveAttribute('aria-pressed', 'true');
  });

  it('saves a library-picked date and time and restores picker focus', async () => {
    render(<App />);
    await screen.findByText('이날의 항목이 없어요');
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    expect(screen.getByRole('dialog')).toHaveClass('form-dialog');
    fireEvent.change(screen.getByLabelText('무엇을 할까요?'), { target: { value: '일정 선택 검증' } });
    const dateTrigger = screen.getByRole('button', { name: /^날짜 / });
    fireEvent.click(dateTrigger);
    fireEvent.click(screen.getByRole('button', { name: '다음 달' }));
    const day = document.querySelector('.react-datepicker__day:not(.react-datepicker__day--outside-month)')!;
    fireEvent.click(day);
    expect(dateTrigger).toHaveFocus();
    const expectedDate = (document.querySelector('input[name="date"]') as HTMLInputElement).value;
    fireEvent.click(screen.getByRole('button', { name: /^시간 선택/ }));
    fireEvent.click(screen.getByText('09:30', { exact: true }));
    expect(screen.getByRole('button', { name: /^시간 선택/ })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '할 일 추가' }));
    await waitFor(() => expect(createTodo).toHaveBeenCalledWith(expect.objectContaining({ dueDate: expectedDate, dueTime: '09:30' })));
  });
  it('renders the prototype main screen without tabs, filters, or a data menu', async () => {
    render(<App />);
    expect(await screen.findByText('이날의 항목이 없어요')).toBeInTheDocument();
    expect(screen.getByText('DAILY LIST')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '캘린더 열기' }).querySelector('svg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '설정 열기' }).querySelector('svg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '설정 열기' })).not.toHaveTextContent('MJ');
    expect(screen.queryByRole('navigation', { name: '목록 화면' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('필터와 정렬')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '데이터 관리 열기' })).not.toBeInTheDocument();
  });

  it('uses the prototype new-item sheet and saves through the repository', async () => {
    render(<App />);
    await screen.findByText('이날의 항목이 없어요');
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    expect(screen.getByText('새로운 계획')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '무엇을 시작할까요?' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '할 일' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '습관' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /시간 선택/ })).toHaveTextContent('시간 없음');
    expect(screen.getByRole('checkbox', { name: /반복/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: '보통' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '낮음' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '중요' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /눌러서 선택/ }));
    expect(within(screen.getByLabelText('이모지 선택')).getAllByRole('button')).toHaveLength(40);
    const title = screen.getByLabelText('무엇을 할까요?');
    await waitFor(() => expect(title).toHaveFocus());
    fireEvent.change(title, { target: { value: '물 마시기' } });
    fireEvent.click(screen.getByRole('button', { name: '할 일 추가' }));
    await waitFor(() => expect(createTodo).toHaveBeenCalledWith(expect.objectContaining({ dueTime: null, priority: 'normal', type: 'one_time' })));
  });

  it('keeps the entered title and disables duplicate submission while saving', async () => {
    let finish!: () => void;
    vi.mocked(createTodo).mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve({} as Awaited<ReturnType<typeof createTodo>>); }));
    render(<App />);
    await screen.findByText('이날의 항목이 없어요');
    fireEvent.click(screen.getByRole('button', { name: /추가/ }));
    const title = screen.getByLabelText('무엇을 할까요?');
    fireEvent.change(title, { target: { value: '중복 없이 저장' } });
    fireEvent.click(screen.getByRole('button', { name: '할 일 추가' }));
    expect(await screen.findByRole('button', { name: '저장 중…' })).toBeDisabled();
    expect(createTodo).toHaveBeenCalledTimes(1);
    expect(title).toHaveValue('중복 없이 저장');
    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('returns focus to the 추가 button when the sheet closes', async () => {
    render(<App />);
    await screen.findByText('이날의 항목이 없어요');
    const opener = screen.getByRole('button', { name: /추가/ });
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('opens backup controls from the prototype settings sheet', async () => {
    render(<App />);
    await screen.findByText('이날의 항목이 없어요');
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    expect(screen.getByText('ACCOUNT')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '설정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /알림 설정/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /데이터 백업 및 복원/ }));
    expect(screen.getByText('백업 내보내기')).toBeInTheDocument();
    expect(screen.getByLabelText('백업 파일 선택')).toBeInTheDocument();
  });

  it('renders the prototype item DOM and copy', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    vi.mocked(loadSnapshot).mockResolvedValueOnce({
      todos: [{
        id: 'todo-1', type: 'one_time', seriesId: null, revision: null, title: '디자인 시안 피드백 보내기', memo: '확인한 내용만 간단히 전달', emoji: '💬', status: 'pending', priority: 'high', dueDate: today, dueTime: '11:00', completedAt: null, repeatFrequency: null, repeatInterval: null, repeatWeekdays: [], repeatStartDate: null, repeatEndDate: null, timezone: null, createdAt: '2026-09-14T00:00:00.000Z', updatedAt: '2026-09-14T00:00:00.000Z', deletedAt: null,
      }, {
        id: 'todo-2', type: 'one_time', seriesId: null, revision: null, title: '완료된 항목', memo: '', emoji: '✅', status: 'completed', priority: 'normal', dueDate: today, dueTime: null, completedAt: '2026-09-15T01:00:00.000Z', repeatFrequency: null, repeatInterval: null, repeatWeekdays: [], repeatStartDate: null, repeatEndDate: null, timezone: null, createdAt: '2026-09-14T01:00:00.000Z', updatedAt: '2026-09-15T01:00:00.000Z', deletedAt: null,
      }],
      records: [],
    });
    const { container } = render(<App />);
    expect(await screen.findByText('디자인 시안 피드백 보내기')).toBeInTheDocument();
    expect(screen.getAllByText('TODO')).toHaveLength(2);
    expect(screen.getByText('중요')).toBeInTheDocument();
    expect(screen.getByText('✓ 완료됨')).toBeInTheDocument();
    expect(screen.getByLabelText('완료된 항목, 완료됨')).toHaveClass('is-done');
    expect(container.querySelector('.swipe-item > .item-card .drag-handle')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '디자인 시안 피드백 보내기 완료' }));
    await waitFor(() => expect(setOneTimeStatus).toHaveBeenCalledWith('todo-1', 'completed'));
    expect(container.querySelector('.toast')).not.toBeInTheDocument();
  });

  it('opens the prototype calendar and returns focus on Escape', async () => {
    render(<App />);
    await screen.findByText('이날의 항목이 없어요');
    const opener = screen.getByRole('button', { name: '캘린더 열기' });
    fireEvent.click(opener);
    expect(screen.getByRole('heading', { name: '캘린더' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이 날짜 일정 보기' })).toBeInTheDocument();
    const close = screen.getByRole('button', { name: '일정으로 돌아가기' });
    await waitFor(() => expect(close).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
