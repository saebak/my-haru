create extension if not exists citext;
create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  nickname citext not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint app_users_nickname_length check (char_length(trim(nickname::text)) between 2 and 20),
  constraint app_users_nickname_trimmed check (nickname::text = trim(nickname::text))
);

create table if not exists public.nickname_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists nickname_sessions_user_id_idx
  on public.nickname_sessions(user_id);

alter table public.app_users enable row level security;
alter table public.nickname_sessions enable row level security;

revoke all on public.app_users from anon, authenticated;
revoke all on public.nickname_sessions from anon, authenticated;

create or replace function public.register_nickname(
  p_nickname text,
  p_session_token text
)
returns table(user_id uuid, nickname text)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_nickname text := trim(p_nickname);
  created_user public.app_users;
begin
  if char_length(normalized_nickname) < 2 or char_length(normalized_nickname) > 20 then
    raise exception using
      errcode = '22023',
      message = 'NICKNAME_LENGTH_INVALID';
  end if;

  if p_session_token is null or char_length(p_session_token) < 32 then
    raise exception using
      errcode = '22023',
      message = 'SESSION_TOKEN_INVALID';
  end if;

  insert into public.app_users (nickname)
  values (normalized_nickname)
  returning * into created_user;

  insert into public.nickname_sessions (user_id, token_hash)
  values (created_user.id, digest(p_session_token, 'sha256'));

  return query select created_user.id, created_user.nickname::text;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'NICKNAME_ALREADY_EXISTS';
end;
$$;

create or replace function public.resume_nickname_session(
  p_nickname text,
  p_session_token text
)
returns table(user_id uuid, nickname text)
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_user public.app_users;
begin
  select users.*
  into matched_user
  from public.app_users as users
  join public.nickname_sessions as sessions on sessions.user_id = users.id
  where users.nickname = trim(p_nickname)::citext
    and users.deleted_at is null
    and sessions.revoked_at is null
    and sessions.token_hash = digest(p_session_token, 'sha256')
  limit 1;

  if matched_user.id is null then
    raise exception using
      errcode = '28000',
      message = 'NICKNAME_SESSION_INVALID';
  end if;

  update public.nickname_sessions
  set last_used_at = now()
  where user_id = matched_user.id
    and token_hash = digest(p_session_token, 'sha256')
    and revoked_at is null;

  return query select matched_user.id, matched_user.nickname::text;
end;
$$;

revoke all on function public.register_nickname(text, text) from public;
revoke all on function public.resume_nickname_session(text, text) from public;
grant execute on function public.register_nickname(text, text) to anon, authenticated;
grant execute on function public.resume_nickname_session(text, text) to anon, authenticated;

comment on table public.app_users is
  'Nickname-based lightweight accounts. Nicknames are case-insensitively unique.';
comment on table public.nickname_sessions is
  'Device-bound session token hashes. Raw tokens never leave the client except during RPC verification.';
