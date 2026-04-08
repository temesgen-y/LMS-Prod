-- Add department_id UUID FK to instructor_profiles and backfill from the text
-- department field. All pages now query by department_id; the legacy text
-- department column is kept for backward compat but no longer used for lookups.

-- 1. Add nullable column first (backfill before adding NOT NULL)
alter table public.instructor_profiles
  add column if not exists department_id uuid
    references public.departments(id) on delete set null;

-- 2. Backfill: match text department field to departments by name (case-insensitive)
--    OR by UUID if the text field already contains a UUID
update public.instructor_profiles ip
set department_id = d.id
from public.departments d
where ip.department_id is null
  and (
    lower(ip.department) = lower(d.name)
    or ip.department = d.id::text
    or lower(ip.department) = lower(d.code)
  );

-- 3. Index for fast lookups
create index if not exists idx_instructor_profiles_department_id
  on public.instructor_profiles(department_id);
