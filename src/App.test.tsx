// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { createTodo } from './infrastructure/indexed-db/todoRepository';

vi.mock('./infrastructure/indexed-db/todoRepository', () => ({
  loadSnapshot: vi.fn().mockResolvedValue({ todos: [], records: [] }),
  createTodo: vi.fn().mockResolvedValue({}),
  updateOneTime: vi.fn(), updateRecurring: vi.fn(), setOneTimeStatus: vi.fn(), setRecurringStatus: vi.fn(),
  deleteOccurrence: vi.fn(), undoDelete: vi.fn(), softDeleteCompleted: vi.fn(), clearAllData: vi.fn(), replaceSnapshot: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('App', () => {
  it('shows an actionable empty state and moves focus into the create dialog', async () => {
    render(<App />);
    expect(await screen.findByText('아직 할 일이 없어요')).toBeInTheDocument();
    const openButton = screen.getByRole('button', { name: /새 할 일/ });
    fireEvent.click(openButton);
    const title = screen.getByLabelText('무엇을 할까요?');
    await waitFor(() => expect(title).toHaveFocus());
    fireEvent.change(title, { target: { value: '물 마시기' } });
    fireEvent.click(screen.getByRole('button', { name: '할 일 추가' }));
    await waitFor(() => expect(createTodo).toHaveBeenCalledOnce());
  });

  it('returns focus to the opener when the dialog closes', async () => {
    render(<App />);
    await screen.findByText('아직 할 일이 없어요');
    const openButton = screen.getByRole('button', { name: /새 할 일/ });
    fireEvent.click(openButton);
    fireEvent.click(screen.getByRole('button', { name: '새 할 일 닫기' }));
    await waitFor(() => expect(openButton).toHaveFocus());
  });

  it('keeps the entered title and disables duplicate submission while saving', async () => {
    let finish!: () => void;
    vi.mocked(createTodo).mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve({} as Awaited<ReturnType<typeof createTodo>>); }));
    render(<App />);
    await screen.findByText('아직 할 일이 없어요');
    fireEvent.click(screen.getByRole('button', { name: /새 할 일/ }));
    const title = screen.getByLabelText('무엇을 할까요?');
    fireEvent.change(title, { target: { value: '중복 없이 저장' } });
    fireEvent.click(screen.getByRole('button', { name: '할 일 추가' }));
    expect(await screen.findByRole('button', { name: '저장 중…' })).toBeDisabled();
    expect(createTodo).toHaveBeenCalledTimes(1);
    expect(title).toHaveValue('중복 없이 저장');
    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('offers backup controls and requires confirmation before clearing all data', async () => {
    render(<App />);
    await screen.findByText('아직 할 일이 없어요');
    fireEvent.click(screen.getByRole('button', { name: '데이터 관리 열기' }));
    expect(screen.getByText('백업 내보내기')).toBeInTheDocument();
    expect(screen.getByLabelText('백업 파일 선택')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /모든 데이터 삭제/ }));
    expect(screen.getByRole('dialog', { name: '모든 데이터 삭제' })).toBeInTheDocument();
    expect(screen.getByText(/실행 취소할 수 없어요/)).toBeInTheDocument();
  });

  it('moves focus into the calendar and returns it on Escape', async () => {
    render(<App />);
    await screen.findByText('아직 할 일이 없어요');
    const opener = screen.getByRole('button', { name: '월간 캘린더 열기' });
    fireEvent.click(opener);
    const close = screen.getByRole('button', { name: '캘린더 닫기' });
    await waitFor(() => expect(close).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
