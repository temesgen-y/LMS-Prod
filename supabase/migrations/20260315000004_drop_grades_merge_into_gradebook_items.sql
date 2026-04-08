-- =============================================================
-- Drop grades table; consolidate raw-score columns into
-- gradebook_items so there is a single source of truth.
-- =============================================================

-- 1. Add columns that lived in grades but were absent from gradebook_items
alter table public.gradebook_items
  add column if not exists total_marks decimal not null default 0;

alter table public.gradebook_items
  add column if not exists score_pct decimal not null default 0;

alter table public.gradebook_items
  add column if not exists passed boolean
    generated always as (score_pct >= 50) stored;

-- 2. Remove the FK to the grades table that is being dropped
alter table public.gradebook_items
  drop constraint if exists fk_gradebook_items_grade;

alter table public.gradebook_items
  drop column if exists grade_id;

-- 3. Drop grades (cascade removes indexes, triggers, dependent objects)
drop table if exists public.grades cascade;
