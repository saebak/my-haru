import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkSupabaseConnection, readSupabaseConfig } from './supabase';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readSupabaseConfig', () => {
  it('returns a normalized config when both public values are valid', () => {
    const config = readSupabaseConfig({
      VITE_SUPABASE_URL: ' https://project.supabase.co ',
      VITE_SUPABASE_PUBLISHABLE_KEY: ' publishable-key ',
    } as ImportMetaEnv);

    expect(config).toEqual({
      url: 'https://project.supabase.co',
      publishableKey: 'publishable-key',
    });
  });

  it('returns null when a value is missing', () => {
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://project.supabase.co' } as ImportMetaEnv)).toBeNull();
  });

  it('rejects an insecure URL', () => {
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: 'http://project.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
      } as ImportMetaEnv),
    ).toBeNull();
  });
});

describe('checkSupabaseConnection', () => {
  const config = {
    url: 'https://project.supabase.co',
    publishableKey: 'publishable-key',
  };

  it('checks the authenticated Supabase settings endpoint without exposing a bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkSupabaseConnection(config)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/auth/v1/settings',
      expect.objectContaining({
        method: 'GET',
        headers: { apikey: 'publishable-key' },
      }),
    );
  });

  it('returns false when the endpoint is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network unavailable')));

    await expect(checkSupabaseConnection(config)).resolves.toBe(false);
  });
});
