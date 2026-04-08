-- Fix: ensure all authenticated users can SELECT public.users
-- (no RLS on this table per project design; layouts use service-role client anyway)

-- 1. Remove RLS from public.users if it was accidentally enabled
alter table public.users disable row level security;

-- 2. Drop any lingering RLS policies on public.users
drop policy if exists "Users: allow select own row"    on public.users;
drop policy if exists "Users: allow insert own row"    on public.users;
drop policy if exists "Users: allow update own row"    on public.users;

-- 3. Ensure authenticated and anon roles have SELECT on the core tables
--    (Supabase sets these by default but some migration paths miss them)
grant select on public.users to anon, authenticated;
grant select on public.admin_profiles to anon, authenticated;
grant select on public.instructor_profiles to anon, authenticated;
grant select on public.student_profiles to anon, authenticated;
grant select on public.registrar_profiles to anon, authenticated;
grant select on public.department_head_profiles to anon, authenticated;
grant select on public.academic_advisor_profiles to anon, authenticated;
grant select on public.it_admin_profiles to anon, authenticated;
