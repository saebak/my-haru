import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '../../lib/supabase';

const SESSION_STORAGE_KEY = 'my-daily-todo.nickname-session.v1';

export type NicknameSession = {
  userId: string;
  nickname: string;
  token: string;
};

type NicknameRpcRow = {
  user_id: string;
  nickname: string;
};

export function validateNickname(value: string): string | null {
  const nickname = value.trim();

  if (nickname.length < 2 || nickname.length > 20) {
    return '닉네임은 2자 이상 20자 이하로 입력해 주세요.';
  }

  if (/\s/.test(nickname)) {
    return '닉네임에는 공백을 사용할 수 없어요.';
  }

  return null;
}

function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function readStoredSession(): NicknameSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const value = JSON.parse(raw) as Partial<NicknameSession>;
    if (!value.userId || !value.nickname || !value.token) return null;

    return value as NicknameSession;
  } catch {
    return null;
  }
}

function saveSession(session: NicknameSession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function toSession(row: NicknameRpcRow, token: string): NicknameSession {
  return {
    userId: row.user_id,
    nickname: row.nickname,
    token,
  };
}

function errorMessage(error: PostgrestError): string {
  if (error.message.includes('NICKNAME_ALREADY_EXISTS') || error.code === '23505') {
    return '이미 사용 중인 닉네임이에요.';
  }

  if (error.message.includes('NICKNAME_SESSION_INVALID') || error.code === '28000') {
    return '이 닉네임은 다른 기기에서 만들어졌어요. 인증 기능이 추가되기 전에는 이 기기에서 복구할 수 없어요.';
  }

  if (error.code === 'PGRST202') {
    return 'Supabase 닉네임 마이그레이션을 먼저 적용해 주세요.';
  }

  return '닉네임을 확인하는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
}

export async function enterWithNickname(nicknameInput: string): Promise<NicknameSession> {
  const nickname = nicknameInput.trim();
  const validationError = validateNickname(nickname);
  if (validationError) throw new Error(validationError);
  if (!supabase) throw new Error('Supabase 연결 설정을 먼저 완료해 주세요.');

  const storedSession = readStoredSession();
  const canResume = storedSession?.nickname.localeCompare(nickname, undefined, { sensitivity: 'accent' }) === 0;
  const token = canResume ? storedSession.token : createSessionToken();
  const rpcName = canResume ? 'resume_nickname_session' : 'register_nickname';

  const { data, error } = await supabase.rpc(rpcName, {
    p_nickname: nickname,
    p_session_token: token,
  });

  if (error) throw new Error(errorMessage(error));

  const row = (data as NicknameRpcRow[] | null)?.[0];
  if (!row) throw new Error('닉네임 세션 응답을 확인할 수 없어요.');

  const session = toSession(row, token);
  saveSession(session);
  return session;
}

export function getStoredNickname(): string {
  return readStoredSession()?.nickname ?? '';
}

export function clearNicknameSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}
