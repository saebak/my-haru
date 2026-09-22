create extension if not exists pgcrypto;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.account_identities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null,
  subject_hash text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (provider, subject_hash),
  constraint account_identities_provider_check check (provider in ('toss_anonymous', 'apple', 'google', 'email')),
  constraint account_identities_subject_hash_check check (subject_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.account_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint account_sessions_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.account_todos (
  account_id uuid not null references public.accounts(id) on delete cascade,
  id uuid not null,
  payload jsonb not null,
  entity_updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (account_id, id)
);

create table if not exists public.account_todo_records (
  account_id uuid not null references public.accounts(id) on delete cascade,
  id uuid not null,
  payload jsonb not null,
  entity_updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (account_id, id)
);

create index if not exists account_identities_account_id_idx on public.account_identities(account_id);
create index if not exists account_sessions_account_id_idx on public.account_sessions(account_id);
create index if not exists account_todo_records_account_id_idx on public.account_todo_records(account_id);

alter table public.accounts enable row level security;
alter table public.account_identities enable row level security;
alter table public.account_sessions enable row level security;
alter table public.account_todos enable row level security;
alter table public.account_todo_records enable row level security;

revoke all on public.accounts, public.account_identities, public.account_sessions, public.account_todos, public.account_todo_records from anon, authenticated;

create or replace function public.resolve_account_identity(p_provider text, p_subject_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_account_id uuid;
begin
  if p_provider not in ('toss_anonymous', 'apple', 'google', 'email') or p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'IDENTITY_INVALID';
  end if;

  select account_id into resolved_account_id
  from public.account_identities
  where provider = p_provider and subject_hash = p_subject_hash;

  if resolved_account_id is null then
    insert into public.accounts default values returning id into resolved_account_id;
    begin
      insert into public.account_identities(account_id, provider, subject_hash)
      values (resolved_account_id, p_provider, p_subject_hash);
    exception when unique_violation then
      delete from public.accounts where id = resolved_account_id;
      select account_id into resolved_account_id
      from public.account_identities
      where provider = p_provider and subject_hash = p_subject_hash;
    end;
  else
    update public.account_identities set last_seen_at = now()
    where provider = p_provider and subject_hash = p_subject_hash;
  end if;

  return resolved_account_id;
end;
$$;

create or replace function public.sync_account_snapshot(
  p_session_token_hash text,
  p_schema_version integer,
  p_todos jsonb,
  p_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  item jsonb;
begin
  if p_schema_version <> 2 or jsonb_typeof(p_todos) <> 'array' or jsonb_typeof(p_records) <> 'array' then
    raise exception using errcode = '22023', message = 'SNAPSHOT_INVALID';
  end if;
  if jsonb_array_length(p_todos) > 10000 or jsonb_array_length(p_records) > 100000 then
    raise exception using errcode = '22023', message = 'SNAPSHOT_LIMIT_EXCEEDED';
  end if;

  select account_id into owner_id from public.account_sessions
  where token_hash = p_session_token_hash and revoked_at is null and expires_at > now()
  limit 1;
  if owner_id is null then
    raise exception using errcode = '28000', message = 'SESSION_INVALID';
  end if;

  update public.account_sessions set last_used_at = now()
  where token_hash = p_session_token_hash;

  for item in select value from jsonb_array_elements(p_todos) loop
    if coalesce(item->>'id', '') !~ '^[0-9a-fA-F-]{36}$' or item->>'updatedAt' is null then
      raise exception using errcode = '22023', message = 'TODO_INVALID';
    end if;
    insert into public.account_todos(account_id, id, payload, entity_updated_at, deleted_at)
    values (owner_id, (item->>'id')::uuid, item, (item->>'updatedAt')::timestamptz, nullif(item->>'deletedAt', '')::timestamptz)
    on conflict (account_id, id) do update set
      payload = excluded.payload,
      entity_updated_at = excluded.entity_updated_at,
      deleted_at = excluded.deleted_at
    where excluded.entity_updated_at >= account_todos.entity_updated_at;
  end loop;

  for item in select value from jsonb_array_elements(p_records) loop
    if coalesce(item->>'id', '') !~ '^[0-9a-fA-F-]{36}$' or item->>'updatedAt' is null then
      raise exception using errcode = '22023', message = 'RECORD_INVALID';
    end if;
    insert into public.account_todo_records(account_id, id, payload, entity_updated_at, deleted_at)
    values (owner_id, (item->>'id')::uuid, item, (item->>'updatedAt')::timestamptz, nullif(item->>'deletedAt', '')::timestamptz)
    on conflict (account_id, id) do update set
      payload = excluded.payload,
      entity_updated_at = excluded.entity_updated_at,
      deleted_at = excluded.deleted_at
    where excluded.entity_updated_at >= account_todo_records.entity_updated_at;
  end loop;

  return jsonb_build_object(
    'todos', coalesce((select jsonb_agg(payload order by entity_updated_at, id) from public.account_todos where account_id = owner_id), '[]'::jsonb),
    'records', coalesce((select jsonb_agg(payload order by entity_updated_at, id) from public.account_todo_records where account_id = owner_id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.resolve_account_identity(text, text) from public;
revoke all on function public.sync_account_snapshot(text, integer, jsonb, jsonb) from public;
grant execute on function public.resolve_account_identity(text, text) to service_role;
grant execute on function public.sync_account_snapshot(text, integer, jsonb, jsonb) to service_role;

comment on table public.account_identities is 'Provider-independent identities. subject_hash is an HMAC digest; raw provider identifiers are never stored.';
comment on table public.account_sessions is 'Opaque client session hashes. Raw session tokens are returned once and never stored.';
