-- Add appointed_at column to department_head_profiles
-- This was missing, causing promoteDeptHead inserts to fail silently.
alter table public.department_head_profiles
  add column if not exists appointed_at date;
