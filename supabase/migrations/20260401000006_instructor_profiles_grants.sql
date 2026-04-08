-- Grant PostgREST access to instructor_profiles for authenticated users.
-- Previously only the service-role/admin client could read this table,
-- which is why the department head instructor list returned 0 rows.

grant select, insert, update, delete on public.instructor_profiles to anon, authenticated;

-- Also grant on related core tables that dept-head and other portal pages query.
-- These were created in lmsv6.sql without explicit grants.
grant select on public.users                 to anon, authenticated;
grant select on public.departments           to anon, authenticated;
grant select on public.courses               to anon, authenticated;
grant select on public.course_offerings      to anon, authenticated;
grant select on public.course_instructors    to anon, authenticated;
grant select on public.academic_terms        to anon, authenticated;
grant select on public.course_modules        to anon, authenticated;
grant select on public.course_module_items   to anon, authenticated;
grant select on public.announcements         to anon, authenticated;
grant select on public.forum_threads         to anon, authenticated;
grant select on public.forum_posts           to anon, authenticated;
grant select on public.notifications         to anon, authenticated;
grant select on public.enrollments           to anon, authenticated;
grant select on public.academic_programs     to anon, authenticated;
grant select on public.admin_profiles        to anon, authenticated;
grant select on public.student_profiles      to anon, authenticated;
