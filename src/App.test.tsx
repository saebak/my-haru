// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { addDays } from './domain/todos/date';
import { completeOnboarding, createTodo, hasCompletedOnboarding, loadSnapshot, setOneTimeStatus } from './infrastructure/indexed-db/todoRepository';

vi.mock('./infrastructure/indexed-db/todoRepository', () => ({
  loadSnapshot: vi.fn().mockResolvedValue({ todos: [], records: [] }),
  hasCompletedOnboarding: vi.fn().mockResolvedValue(true), completeOnboarding: vi.fn().mockResolvedValue(undefined),
  loadManualOrders: vi.fn().mockResolvedValue({}), saveManualOrder: vi.fn().mockResolvedValue(undefined),
  createTodo: vi.fn().mockResolvedValue({}),
  updateOneTime: vi.fn(), updateRecurring: vi.fn(), setOneTimeStatus: vi.fn(), setRecurringStatus: vi.fn(),
  deleteOccurrence: vi.fn(), undoDelete: vi.fn(), clearAllData: vi.fn(), replaceSnapshot: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadSnapshot).mockResolvedValue({ todos: [], records: [] });
  vi.mocked(hasCompletedOnboarding).mockResolvedValue(true);
});
afterEach(() => cleanup());

describe('App', () => {
  it('shows the onboarding guide on first launch and remembers completion', async () => {
    vi.mocked(hasCompletedOnboarding).mockResolvedValueOnce(false);
    render(<App />);

    expect(await screen.findByRole('heading', { name: '오늘 할 일을 가볍게 시작해요' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('3단계 중 1단계')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading', { name: '날짜를 고르고 완료를 체크해요' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading', { name: '계획은 이 기기에 저장돼요' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '시작하기' }));

    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the onboarding guide again from settings', async () => {
    render(<App />);
    await screen.findByText('이날의 항목이 없어요');
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.click(screen.getByRole('button', { name: /사용 가이드/ }));
    expect(screen.getByRole('heading', { name: '오늘 할 일을 가볍게 시작해요' })).toBeInTheDocument();
  });

  it('moves the visible date page by seven days without changing the selection', async () => {
    render(<App />);
    await screen.findByText('이날의 항목이 없어요');
    const strip = screen.getByRole('region', { name: '날짜 선택' });
    const selected = () => strip.querySelector<HTMLButtonElement>('[aria-pressed="true"]')!.dataset.date!;
    const days = () => [...strip.querySelectorAll<HTMLButtonElement>('button[data-date]')];
    const start = selected();
    const firstVisible = days()[0].dataset.date!;
    fireEvent.click(within(strip).getByRole('button', { name: '다음 날짜 페이지' }));
    expect(days()[0]).toHaveAttribute('data-date', addDays(firstVisible, 7));
    expect(strip.querySelector('.week-strip')).toHaveClass('slide-next');
    expect(strip.querySelector('[aria-pressed="true"]')).not.toBeInTheDocument();
    fireEvent.click(within(strip).getByRole('button', { name: '이전 날짜 페이지' }));
    expect(days()[0]).toHaveAttribute('data-date', firstVisible);
    expect(strip.querySelector('.week-strip')).toHaveClass('slide-previous');
    expect(selected()).toBe(start);
  });

  it('starts with today centered and keeps the visible dates fixed when another date is selected', async () => {
    render(<App />);
    await screen.findByText('이날의 항목이 없어요');
    const strip = screen.getByRole('region', { name: '날짜 선택' });
    const days = () => [...strip.querySelectorAll<HTMLButtonElement>('button[data-date]')];
    const visibleDates = days().map((day) => day.dataset.date);
    expect(days()[3]).toHaveAttribute('aria-pressed', 'true');
    expect(days()[3]).toHaveAttribute('aria-current', 'date');
    const next = days()[6].getAttribute('data-date');
    fireEvent.click(days()[6]);
    expect(days().map((day) => day.dataset.date)).toEqual(visibleDates);
    expect(days()[6]).toHaveAttribute('data-date', next);
    expect(days()[6]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(strip).getByRole('button', { name: '다음 날짜 페이지' }));
    expect(strip.querySelector('[aria-current="date"]')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '오늘' }));
    expect(days()[3]).toHaveAttribute('aria-current', 'date');
    expect(days()[3]).toHaveAttribute('aria-pressed', 'true');
    expect(days()[3]).toHaveClass('is-today', 'is-selected');
  });

  it('saves a library-picked date and time and restores picker focus', async () => {
    render(<App />);
    await screen.findByText('이날의 항목이 없어요');
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    expect(screen.getByRole('dialog')).toHaveClass('form-dialog');
    const title = screen.getByLabelText('무엇을 할까요?');
    await waitFor(() => expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus());
    expect(title).not.toHaveFocus();
    fireEvent.change(title, { target: { value: '일정 선택 검증' } });
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
  it('renders the simple daily list and settings', async () => {
    render(<App />);
    expect(await screen.findByText('이날의 항목이 없어요')).toBeInTheDocument();
    expect(screen.getByText('DAILY LIST')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '캘린더 열기' }).querySelector('svg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '설정 열기' }).querySelector('svg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '설정 열기' })).not.toHaveTextContent('MJ');
    expect(screen.queryByRole('group', { name: '목록 구분' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('필터와 정렬')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '완료 정리' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /눌러서 선택/ })).toHaveTextContent('💡');
    expect(screen.getByRole('radio', { name: '보통' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '낮음' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '중요' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /눌러서 선택/ }));
    expect(within(screen.getByLabelText('이모지 선택')).getAllByRole('button')).toHaveLength(40);
    fireEvent.click(screen.getByRole('radio', { name: '습관' }));
    expect(screen.getByRole('checkbox', { name: /반복/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /반복/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /눌러서 선택/ })).toHaveTextContent('💡');
    fireEvent.click(screen.getByRole('radio', { name: '할 일' }));
    expect(screen.getByRole('checkbox', { name: /반복/ })).not.toBeChecked();
    const title = screen.getByLabelText('무엇을 할까요?');
    fireEvent.change(title, { target: { value: '물 마시기' } });
    fireEvent.click(screen.getByRole('button', { name: '할 일 추가' }));
    await waitFor(() => expect(createTodo).toHaveBeenCalledWith(expect.objectContaining({ category: 'todo', dueTime: null, emoji: '💡', priority: 'normal', type: 'one_time' })));
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
    const fixture = {
      todos: [{
        id: 'todo-1', type: 'one_time', seriesId: null, revision: null, title: '디자인 시안 피드백 보내기', memo: '확인한 내용만 간단히 전달', emoji: '💬', status: 'pending', priority: 'high', dueDate: today, dueTime: '11:00', completedAt: null, repeatFrequency: null, repeatInterval: null, repeatWeekdays: [], repeatStartDate: null, repeatEndDate: null, timezone: null, createdAt: '2026-09-14T00:00:00.000Z', updatedAt: '2026-09-14T00:00:00.000Z', deletedAt: null,
      }, {
        id: 'todo-2', type: 'one_time', seriesId: null, revision: null, title: '완료된 항목', memo: '', emoji: '✅', status: 'completed', priority: 'normal', dueDate: today, dueTime: null, completedAt: '2026-09-15T01:00:00.000Z', repeatFrequency: null, repeatInterval: null, repeatWeekdays: [], repeatStartDate: null, repeatEndDate: null, timezone: null, createdAt: '2026-09-14T01:00:00.000Z', updatedAt: '2026-09-15T01:00:00.000Z', deletedAt: null,
      }, {
        id: 'todo-3', type: 'one_time', seriesId: null, revision: null, title: '아직 할 항목', memo: '', emoji: '📌', status: 'pending', priority: 'normal', dueDate: today, dueTime: '12:00', completedAt: null, repeatFrequency: null, repeatInterval: null, repeatWeekdays: [], repeatStartDate: null, repeatEndDate: null, timezone: null, createdAt: '2026-09-14T02:00:00.000Z', updatedAt: '2026-09-14T02:00:00.000Z', deletedAt: null,
      }],
      records: [],
    } as Awaited<ReturnType<typeof loadSnapshot>>;
    vi.mocked(loadSnapshot).mockImplementation(async () => structuredClone(fixture));
    vi.mocked(setOneTimeStatus).mockImplementationOnce(async (id, status) => {
      const todo = fixture.todos.find((item) => item.id === id)!;
      todo.status = status;
      todo.completedAt = status === 'completed' ? '2026-09-16T01:00:00.000Z' : null;
      return todo;
    });
    const { container } = render(<App />);
    expect(await screen.findByText('디자인 시안 피드백 보내기')).toBeInTheDocument();
    expect(screen.getAllByText('TODO')).toHaveLength(3);
    expect(container.querySelector('.priority-mark.high')).toHaveTextContent('중요');
    expect(screen.getByText('✓ 완료됨')).toBeInTheDocument();
    expect(screen.getByLabelText('완료된 항목, 완료됨')).toHaveClass('is-done');
    expect(container.querySelector('.swipe-item > .item-card .drag-handle')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '디자인 시안 피드백 보내기 완료' }));
    await waitFor(() => expect(setOneTimeStatus).toHaveBeenCalledWith('todo-1', 'completed'));
    expect(container.querySelector('.toast')).not.toBeInTheDocument();
    await waitFor(() => {
      const rows = [...container.querySelectorAll('.swipe-item')].map((row) => row.textContent);
      expect(rows[0]).toContain('아직 할 항목');
      expect(rows.slice(1).every((row) => row?.includes('완료됨'))).toBe(true);
    });
  });

  it('shows only edit and delete actions for a recurring habit', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    vi.mocked(loadSnapshot).mockResolvedValue({
      todos: [{
        id: 'habit-1', type: 'recurring', category: 'habit', seriesId: 'series-1', revision: 1, title: '물 마시기', memo: '', emoji: '💧',
        status: null, priority: 'normal', dueDate: null, dueTime: null, completedAt: null,
        repeatFrequency: 'daily', repeatInterval: 1, repeatWeekdays: [], repeatStartDate: today,
        repeatEndDate: null, timezone: 'Asia/Seoul', createdAt: '2026-09-17T00:00:00.000Z',
        updatedAt: '2026-09-17T00:00:00.000Z', deletedAt: null,
      }],
      records: [],
    });

    render(<App />);
    await screen.findByText('물 마시기');

    expect(screen.getByText('ROUTINE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수정', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제', hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /건너뜀/, hidden: true })).not.toBeInTheDocument();
  });

  it('renders a repeated todo as a todo even without a time', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    vi.mocked(loadSnapshot).mockResolvedValue({
      todos: [{
        id: 'repeated-todo', type: 'recurring', category: 'todo', seriesId: 'todo-series', revision: 1,
        title: '매주 정산 확인', memo: '', emoji: '💡', status: null, priority: 'normal', dueDate: null,
        dueTime: null, completedAt: null, repeatFrequency: 'daily', repeatInterval: 1, repeatWeekdays: [],
        repeatStartDate: today, repeatEndDate: null, timezone: 'Asia/Seoul', createdAt: '2026-09-17T00:00:00.000Z',
        updatedAt: '2026-09-17T00:00:00.000Z', deletedAt: null,
      }],
      records: [],
    });

    render(<App />);
    await screen.findByText('매주 정산 확인');
    expect(screen.getByText('TODO')).toBeInTheDocument();
    expect(screen.queryByText('ROUTINE')).not.toBeInTheDocument();
  });

  it('creates a custom interval recurring item', async () => {
    render(<App />);
    await screen.findByText('이날의 항목이 없어요');
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    fireEvent.change(screen.getByLabelText('무엇을 할까요?'), { target: { value: '이틀마다 물주기' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /반복/ }));
    fireEvent.click(screen.getByRole('radio', { name: '며칠마다' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: /반복 간격/ }), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '할 일 추가' }));
    await waitFor(() => expect(createTodo).toHaveBeenCalledWith(expect.objectContaining({
      type: 'recurring', category: 'todo', repeatFrequency: 'interval_days', repeatInterval: 3, repeatWeekdays: [],
    })));
  });

  it('opens the prototype calendar and returns focus on Escape', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const todo = (id: string, status: 'pending' | 'completed') => ({
      id, type: 'one_time' as const, seriesId: null, revision: null, title: `${status} 일정`, memo: '', emoji: '✓', status, priority: 'normal' as const,
      dueDate: today, dueTime: null, completedAt: status === 'completed' ? '2026-09-16T01:00:00.000Z' : null,
      repeatFrequency: null, repeatInterval: null, repeatWeekdays: [], repeatStartDate: null, repeatEndDate: null, timezone: null,
      createdAt: '2026-09-16T00:00:00.000Z', updatedAt: '2026-09-16T01:00:00.000Z', deletedAt: null,
    });
    vi.mocked(loadSnapshot).mockResolvedValue({ todos: [todo('todo-complete', 'completed'), todo('todo-pending', 'pending')], records: [] });
    render(<App />);
    await screen.findByText('completed 일정');
    const opener = screen.getByRole('button', { name: '캘린더 열기' });
    fireEvent.click(opener);
    expect(screen.getByRole('heading', { name: '캘린더' })).toBeInTheDocument();
    expect(screen.getByLabelText('달성률 꾸밈 기준')).toBeInTheDocument();
    const todayCell = screen.getByRole('button', { name: /2개 항목, 완료 50%/ });
    expect(todayCell).toHaveClass('completion-level-2');
    expect(todayCell).toHaveAttribute('data-completion', '50');
    expect(todayCell.querySelector('[data-growth-level="2"]')).toBeInTheDocument();
    expect(screen.getByLabelText('달성률 꾸밈 기준')).toHaveTextContent('새싹 25%');
    expect(screen.getByLabelText('달성률 꾸밈 기준')).toHaveTextContent('숲 100%');
    expect(screen.getByRole('button', { name: '이 날짜 일정 보기' })).toBeInTheDocument();
    const close = screen.getByRole('button', { name: '일정으로 돌아가기' });
    await waitFor(() => expect(close).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
