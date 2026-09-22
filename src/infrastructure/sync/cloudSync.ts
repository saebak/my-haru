import { BACKUP_FORMAT, parseAndValidateBackup } from '../../features/backup/backup';
import {
  DATABASE_VERSION,
  loadCloudSession,
  loadSnapshot,
  replaceSnapshot,
  saveCloudSession,
  type CloudSession,
} from '../indexed-db/todoRepository';
import { getTossAnonymousIdentity } from '../identity/tossIdentity';
import { supabase } from '../../lib/supabase';

export type CloudSyncStatus = 'local_only' | 'connecting' | 'connected' | 'unavailable';

type ExchangeResponse = CloudSession;
type SyncResponse = {
  todos: unknown[];
  records: unknown[];
};

async function exchangeIdentity(): Promise<CloudSession | null> {
  if (!supabase) return null;
  const identity = await getTossAnonymousIdentity();
  if (!identity) return null;
  const { data, error } = await supabase.functions.invoke<ExchangeResponse>('account-sync', {
    body: { action: 'exchange', provider: identity.provider, anonymousKey: identity.key },
  });
  if (error || !data?.accountId || !data.token || !data.expiresAt) throw new Error('사용자 식별 서버에 연결하지 못했어요.');
  await saveCloudSession(data);
  return data;
}

function isUsable(session: CloudSession | null): session is CloudSession {
  return Boolean(session && Date.parse(session.expiresAt) > Date.now() + 60_000);
}

export async function syncCloudSnapshot(session: CloudSession): Promise<void> {
  if (!supabase) return;
  const snapshot = await loadSnapshot();
  const { data, error } = await supabase.functions.invoke<SyncResponse>('account-sync', {
    body: { action: 'sync', sessionToken: session.token, schemaVersion: DATABASE_VERSION, ...snapshot },
  });
  if (error || !data) throw new Error('클라우드 백업을 동기화하지 못했어요.');

  const validated = parseAndValidateBackup(JSON.stringify({
    format: BACKUP_FORMAT,
    schemaVersion: DATABASE_VERSION,
    exportedAt: new Date().toISOString(),
    timezone: 'Asia/Seoul',
    data,
  }));
  await replaceSnapshot(validated.data);
}

export async function initializeCloudSync(): Promise<CloudSyncStatus> {
  if (!supabase) return 'local_only';
  try {
    const stored = await loadCloudSession();
    const session = isUsable(stored) ? stored : await exchangeIdentity();
    if (!session) return 'local_only';
    await syncCloudSnapshot(session);
    return 'connected';
  } catch {
    return 'unavailable';
  }
}

export async function syncIfConnected(): Promise<boolean> {
  try {
    const session = await loadCloudSession();
    if (!isUsable(session)) return false;
    await syncCloudSnapshot(session);
    return true;
  } catch {
    return false;
  }
}
