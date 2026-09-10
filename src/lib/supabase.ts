import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SupabaseConfig = {
  url: string;
  publishableKey: string;
};

export function readSupabaseConfig(env: ImportMetaEnv): SupabaseConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:') {
      return null;
    }
  } catch {
    return null;
  }

  return { url, publishableKey };
}

export const supabaseConfig = readSupabaseConfig(import.meta.env);

export const supabase: SupabaseClient | null = supabaseConfig
  ? createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export async function checkSupabaseConnection(
  config: SupabaseConfig,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const response = await fetch(`${config.url}/auth/v1/settings`, {
      method: 'GET',
      headers: {
        apikey: config.publishableKey,
      },
      signal,
    });

    return response.ok;
  } catch {
    return false;
  }
}
