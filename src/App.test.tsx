// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { createTodo, loadSnapshot } from './infrastructure/indexed-db/todoRepository';

vi.mock('./infrastructure/indexed-db/todoRepository', () => ({
  loadSnapshot: vi.fn().mockResolvedValue({ todos: [], records: [] }),
  createTodo: vi.fn().mockResolvedValue({}),
  updateOneTime: vi.fn(), updateRecurring: vi.fn(), setOneTimeStatus: vi.fn(), setRecurringStatus: vi.fn(),
  deleteOccurrence: vi.fn(), undoDelete: vi.fn(), clearAllData: vi.fn(), replaceSnapshot: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadSnapshot).mockResolvedValue({ todos: [], records: [] });
});
afterEach(() => cleanup());

describe('App', () => {
  it('renders the prototype main screen without tabs, filters, or a data menu', async () => {
    render(<App />);
    expect(await screen.findByText('이날의 항목이 없어요')).toBeInTheDocument();
    expect(screen.getByText('DAILY LIST')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '캘린더 열기' }).querySelector('svg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '설정 열기' })).toHaveTextContent('MJ');
    expect(screen.queryByRole('navigation', { name: '목록 화면' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('필터와 정렬')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '데이터 관리 열기' })).not.toBeInTheDocument();
  });

  it('uses the prototype new-item sheet and saves through the repository', async () => {
    render(<App />);
    await screen.findByText('이날의 항목이 없어요');
    fireEvent.click(screen.getByRole('button', { name: /NEW TASK/ }));
    expect(screen.getByText('NEW ITEM')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '새 항목' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '할 일' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '습관' })).toBeInTheDocument();
    const title = screen.getByLabelText('무엇을 할까요?');
    await waitFor(() => expect(title).toHaveFocus());
    fireEvent.change(title, { target: { value: '물 마시기' } });
    fireEvent.click(screen.getByRole('button', { name: '할 일 추가' }));
    await waitFor(() => expect(createTodo).toHaveBeenCalledOnce());
  });

  it('keeps the entered title and disables duplicate submission while saving', async () => {
    let finish!: () => void;
    vi.mocked(createTodo).mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve({} as Awaited<ReturnType<typeof createTodo>>); }));
    render(<App />);
    await screen.findByText('이날의 항목이 없어요');
    fireEvent.click(screen.getByRole('button', { name: /NEW TASK/ }));
    const title = screen.getByLabelText('무엇을 할까요?');
    fireEvent.change(title, { target: { value: '중복 없이 저장' } });
    fireEvent.click(screen.getByRole('button', { name: '할 일 추가' }));
    expect(await screen.findByRole('button', { name: '저장 중…' })).toBeDisabled();
    expect(createTodo).toHaveBeenCalledTimes(1);
    expect(title).toHaveValue('중복 없이 저장');
    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('returns focus to the NEW TASK button when the sheet closes', async () => {
    render(<App />);
    await screen.findByText('이날의 항목이 없어요');
    const opener = screen.getByRole('button', { name: /NEW TASK/ });
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
      }],
      records: [],
    });
    const { container } = render(<App />);
    expect(await screen.findByText('디자인 시안 피드백 보내기')).toBeInTheDocument();
    expect(screen.getByText('TODO')).toBeInTheDocument();
    expect(screen.getByText('중요')).toBeInTheDocument();
    expect(container.querySelector('.swipe-item > .item-card .drag-handle')).toBeInTheDocument();
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
