-- ---------------------------------------------------------------------------
-- Grants for lesson progress tracking and storage access
-- Needed for the lesson detail page (student mark-complete feature)
-- ---------------------------------------------------------------------------

-- lesson_progress: students read/write their own progress
grant select on public.lesson_progress to authenticated;
grant insert on public.lesson_progress to authenticated;
grant update on public.lesson_progress to authenticated;

-- assessment_attempts: students read their own attempts
grant select on public.assessment_attempts to authenticated;
grant insert on public.assessment_attempts to authenticated;
grant update on public.assessment_attempts to authenticated;

-- student_answers: students write answers during attempts
grant select on public.student_answers to authenticated;
grant insert on public.student_answers to authenticated;

-- assignment_submissions: students read/write their own submissions
grant select on public.assignment_submissions to authenticated;
grant insert on public.assignment_submissions to authenticated;
grant update on public.assignment_submissions to authenticated;

-- Storage bucket 'lms-uploads': instructors upload lesson files
-- Run this in the Supabase dashboard → Storage → New bucket:
--   Name: lms-uploads
--   Public: true (or configure RLS policies as needed)
-- The following grants are for the storage schema if using direct SQL:
-- grant usage on schema storage to authenticated;
