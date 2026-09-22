import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const encoder = new TextEncoder();

function json(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, ...headers } });
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function requestSource(request: Request): string {
  const connectingIp = request.headers.get('cf-connecting-ip')?.trim();
  if (connectingIp) return connectingIp;
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

async function verifyTossIdentity(anonymousKey: string): Promise<string> {
  const verifyUrl = Deno.env.get('TOSS_IDENTITY_VERIFY_URL');
  if (!verifyUrl) return anonymousKey;

  const response = await fetch(verifyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('TOSS_IDENTITY_VERIFY_SECRET') ?? ''}`,
    },
    body: JSON.stringify({ provider: 'toss_anonymous', anonymousKey }),
  });
  if (!response.ok) throw new Error('IDENTITY_VERIFICATION_FAILED');
  const result = await response.json() as { valid?: boolean; subject?: string };
  if (!result.valid || !result.subject) throw new Error('IDENTITY_VERIFICATION_FAILED');
  return result.subject;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { code: 'METHOD_NOT_ALLOWED' });

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const secretKey = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const identitySecret = Deno.env.get('IDENTITY_HMAC_SECRET');
    if (!url || !secretKey || !identitySecret) return json(503, { code: 'SERVER_NOT_CONFIGURED' });
    const database = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await request.json() as Record<string, unknown>;

    if (body.action === 'exchange') {
      if (body.provider !== 'toss_anonymous' || typeof body.anonymousKey !== 'string' || body.anonymousKey.length < 16 || body.anonymousKey.length > 512) {
        return json(400, { code: 'IDENTITY_INVALID' });
      }
      const verifiedSubject = await verifyTossIdentity(body.anonymousKey);
      const subjectHash = await hmac(`toss_anonymous:${verifiedSubject}`, identitySecret);
      const { data: rateLimitAllowed, error: rateLimitError } = await database.rpc('consume_identity_exchange_limits', {
        p_source_bucket_hash: await hmac(`rate:source:${requestSource(request)}`, identitySecret),
        p_subject_bucket_hash: await hmac(`rate:subject:${subjectHash}`, identitySecret),
        p_global_bucket_hash: await hmac('rate:global:identity-exchange', identitySecret),
      });
      if (rateLimitError) return json(500, { code: 'RATE_LIMIT_CHECK_FAILED' });
      if (!rateLimitAllowed) return json(429, { code: 'RATE_LIMITED' }, { 'Retry-After': '3600' });

      const { data: accountId, error: accountError } = await database.rpc('resolve_account_identity', {
        p_provider: 'toss_anonymous', p_subject_hash: subjectHash,
      });
      if (accountError || typeof accountId !== 'string') return json(500, { code: 'IDENTITY_EXCHANGE_FAILED' });

      const token = randomToken();
      const tokenHash = await sha256(token);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error: sessionError } = await database.from('account_sessions').insert({
        account_id: accountId, token_hash: tokenHash, expires_at: expiresAt,
      });
      if (sessionError) return json(500, { code: 'SESSION_CREATE_FAILED' });
      return json(200, { accountId, token, expiresAt });
    }

    if (body.action === 'sync') {
      if (typeof body.sessionToken !== 'string' || !Array.isArray(body.todos) || !Array.isArray(body.records)) {
        return json(400, { code: 'SNAPSHOT_INVALID' });
      }
      const { data, error } = await database.rpc('sync_account_snapshot', {
        p_session_token_hash: await sha256(body.sessionToken),
        p_schema_version: body.schemaVersion,
        p_todos: body.todos,
        p_records: body.records,
      });
      if (error) return json(error.code === '28000' ? 401 : 400, { code: error.message });
      return json(200, data as Record<string, unknown>);
    }

    return json(400, { code: 'ACTION_INVALID' });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    const status = code.startsWith('IDENTITY_') ? 503 : 500;
    return json(status, { code });
  }
});
