-- =============================================================================
--  IT Admin portal support
-- =============================================================================
-- Adds:
--   1. public.system_backups  — backup/restore monitoring records (read + log)
--   2. public.revoke_user_sessions(uuid) — security-definer RPC that deletes a
--      user's auth sessions/refresh tokens, forcing logout on all devices.
--
-- No RLS (project convention). Service-role-only sensitive operations are
-- enforced in the API layer.

-- -----------------------------------------------------------------------------
-- 1. system_backups
-- -----------------------------------------------------------------------------
create table if not exists public.system_backups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  backup_type    text not null default 'full'
                   check (backup_type in ('full', 'database', 'files')),
  status         text not null default 'completed'
                   check (status in ('completed', 'failed', 'in_progress')),
  size_bytes     bigint,
  location       text,
  restore_status text not null default 'none'
                   check (restore_status in ('none', 'in_progress', 'completed', 'failed')),
  initiated_by   uuid references public.users(id) on delete set null,
  notes          text,
  error_message  text,
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_system_backups_created_at
  on public.system_backups (created_at desc);
create index if not exists idx_system_backups_status
  on public.system_backups (status);

drop trigger if exists set_system_backups_updated_at on public.system_backups;
create trigger set_system_backups_updated_at
  before update on public.system_backups
  for each row execute function set_updated_at();

grant select, insert, update, delete on public.system_backups to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. revoke_user_sessions(uuid)
-- -----------------------------------------------------------------------------
-- Deletes all GoTrue sessions + refresh tokens for the given auth user id.
-- Runs as definer so it can reach the protected `auth` schema. Returns the
-- number of sessions removed. Restricted to the service role.
create or replace function public.revoke_user_sessions(p_auth_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  v_count integer := 0;
begin
  if p_auth_user_id is null then
    return 0;
  end if;

  delete from auth.sessions where user_id = p_auth_user_id;
  get diagnostics v_count = row_count;

  -- Older GoTrue rows may not be linked to a session; clear them defensively.
  delete from auth.refresh_tokens where user_id = p_auth_user_id::text;

  return v_count;
end;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
