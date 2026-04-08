-- Drop pass_score from assignments: remove the check constraint then the column.
alter table public.assignments
  drop constraint if exists chk_assignments_pass;

alter table public.assignments
  drop column if exists pass_score;
