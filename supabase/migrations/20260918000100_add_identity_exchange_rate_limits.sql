create table if not exists public.identity_exchange_limits (
  bucket_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint identity_exchange_limits_bucket_hash_check check (bucket_hash ~ '^[0-9a-f]{64}$'),
  constraint identity_exchange_limits_attempts_check check (attempts > 0)
);

alter table public.identity_exchange_limits enable row level security;
revoke all on public.identity_exchange_limits from anon, authenticated;

create or replace function public.consume_rate_limit_bucket(
  p_bucket_hash text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  if p_bucket_hash !~ '^[0-9a-f]{64}$'
    or p_max_attempts < 1
    or p_window_seconds < 60
    or p_window_seconds > 86400 then
    raise exception using errcode = '22023', message = 'RATE_LIMIT_ARGUMENT_INVALID';
  end if;

  insert into public.identity_exchange_limits(bucket_hash, window_started_at, attempts, updated_at)
  values (p_bucket_hash, now(), 1, now())
  on conflict (bucket_hash) do update set
    window_started_at = case
      when identity_exchange_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then now()
      else identity_exchange_limits.window_started_at
    end,
    attempts = case
      when identity_exchange_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
      else identity_exchange_limits.attempts + 1
    end,
    updated_at = now()
  returning attempts <= p_max_attempts into allowed;

  return allowed;
end;
$$;

create or replace function public.consume_identity_exchange_limits(
  p_source_bucket_hash text,
  p_subject_bucket_hash text,
  p_global_bucket_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  global_allowed boolean;
  source_allowed boolean;
  subject_allowed boolean;
begin
  global_allowed := public.consume_rate_limit_bucket(p_global_bucket_hash, 2000, 3600);
  if not global_allowed then return false; end if;

  source_allowed := public.consume_rate_limit_bucket(p_source_bucket_hash, 300, 3600);
  if not source_allowed then return false; end if;

  subject_allowed := public.consume_rate_limit_bucket(p_subject_bucket_hash, 10, 3600);
  if random() < 0.01 then
    delete from public.identity_exchange_limits where updated_at < now() - interval '2 days';
  end if;
  return subject_allowed;
end;
$$;

revoke all on function public.consume_rate_limit_bucket(text, integer, integer) from public;
revoke all on function public.consume_identity_exchange_limits(text, text, text) from public;
grant execute on function public.consume_identity_exchange_limits(text, text, text) to service_role;

comment on table public.identity_exchange_limits is 'Short-lived HMAC buckets for anonymous identity exchange abuse protection. Raw IP addresses and identity keys are never stored.';
