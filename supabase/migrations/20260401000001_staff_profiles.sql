-- Staff profile tables and role extension
-- Extend users.role check constraint to include staff roles
do $$
declare
  c text;
begin
  select constraint_name into c
  from information_schema.table_constraints
  where table_schema = 'public'
    and table_name = 'users'
    and constraint_type = 'CHECK'
    and constraint_name ilike '%role%';
  if c is not null then
    execute 'alter table public.users drop constraint ' || quote_ident(c);
  end if;
end $$;

alter table public.users add constraint users_role_check
  check (role in ('admin', 'instructor', 'student', 'registrar', 'department_head', 'academic_advisor', 'it_admin'));

-- Registrar profiles
create table if not exists public.registrar_profiles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references public.users(id) on delete cascade,
  staff_no       text,
  department     text,
  profile_status text not null default 'active'
    check (profile_status in ('active', 'inactive')),
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
drop trigger if exists set_registrar_profiles_updated_at on public.registrar_profiles;
create trigger set_registrar_profiles_updated_at
  before update on public.registrar_profiles
  for each row execute function set_updated_at();

-- Department head profiles
create table if not exists public.department_head_profiles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references public.users(id) on delete cascade,
  staff_no       text,
  department_id  uuid references public.departments(id) on delete set null,
  profile_status text not null default 'active'
    check (profile_status in ('active', 'inactive')),
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
drop trigger if exists set_department_head_profiles_updated_at on public.department_head_profiles;
create trigger set_department_head_profiles_updated_at
  before update on public.department_head_profiles
  for each row execute function set_updated_at();

-- Academic advisor profiles
create table if not exists public.academic_advisor_profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references public.users(id) on delete cascade,
  staff_no        text,
  specialization  text,
  profile_status  text not null default 'active'
    check (profile_status in ('active', 'inactive')),
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
drop trigger if exists set_academic_advisor_profiles_updated_at on public.academic_advisor_profiles;
create trigger set_academic_advisor_profiles_updated_at
  before update on public.academic_advisor_profiles
  for each row execute function set_updated_at();

-- IT admin profiles
create table if not exists public.it_admin_profiles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references public.users(id) on delete cascade,
  staff_no       text,
  access_level   text not null default 'standard'
    check (access_level in ('standard', 'super')),
  profile_status text not null default 'active'
    check (profile_status in ('active', 'inactive')),
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
drop trigger if exists set_it_admin_profiles_updated_at on public.it_admin_profiles;
create trigger set_it_admin_profiles_updated_at
  before update on public.it_admin_profiles
  for each row execute function set_updated_at();

-- Grants for PostgREST access
grant select, insert, update, delete on public.registrar_profiles to anon, authenticated;
grant select, insert, update, delete on public.department_head_profiles to anon, authenticated;
grant select, insert, update, delete on public.academic_advisor_profiles to anon, authenticated;
grant select, insert, update, delete on public.it_admin_profiles to anon, authenticated;
