-- ---------------------------------------------------------------------------
-- Add syllabus column to course_offerings
-- Instructors write free-form text/markdown here; students can read it.
-- ---------------------------------------------------------------------------

alter table public.course_offerings
  add column if not exists syllabus text;

-- Ensure authenticated users can update course_offerings rows
-- (full UPDATE needed so the set_updated_at trigger can also write updated_at)
grant update on public.course_offerings to authenticated;
