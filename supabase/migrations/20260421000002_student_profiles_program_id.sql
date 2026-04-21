-- Link student_profiles to academic_programs so we can filter students by department.
-- Nullable so existing rows with only the legacy text `program` field keep working.
alter table public.student_profiles
  add column if not exists program_id uuid references public.academic_programs(id) on delete set null;

create index if not exists idx_student_profiles_program_id on public.student_profiles(program_id);
