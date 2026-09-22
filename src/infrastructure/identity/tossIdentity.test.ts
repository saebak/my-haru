import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAnonymousKey } = vi.hoisted(() => ({
  getAnonymousKey: Object.assign(vi.fn(), { isSupported: vi.fn() }),
}));

vi.mock('@apps-in-toss/web-framework', () => ({ User: { getAnonymousKey } }));

import { getTossAnonymousIdentity } from './tossIdentity';

beforeEach(() => {
  getAnonymousKey.mockReset();
  getAnonymousKey.isSupported.mockReset();
});

describe('getTossAnonymousIdentity', () => {
  it('keeps standalone browsers in local-only mode', async () => {
    getAnonymousKey.isSupported.mockReturnValue(false);
    await expect(getTossAnonymousIdentity()).resolves.toBeNull();
    expect(getAnonymousKey).not.toHaveBeenCalled();
  });

  it('returns the Apps-in-Toss anonymous identity without transforming the client value', async () => {
    getAnonymousKey.isSupported.mockReturnValue(true);
    getAnonymousKey.mockResolvedValue({ type: 'HASH', hash: 'anonymous-key-from-toss' });
    await expect(getTossAnonymousIdentity()).resolves.toEqual({ provider: 'toss_anonymous', key: 'anonymous-key-from-toss' });
  });

  it('falls back to local data when the bridge call fails', async () => {
    getAnonymousKey.isSupported.mockReturnValue(true);
    getAnonymousKey.mockRejectedValue(new Error('bridge unavailable'));
    await expect(getTossAnonymousIdentity()).resolves.toBeNull();
  });
});
