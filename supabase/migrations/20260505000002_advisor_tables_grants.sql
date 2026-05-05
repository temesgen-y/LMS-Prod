-- Grants for tables that lack explicit GRANT statements

-- Advisor workflow tables (created in 002_expansion_rls.sql)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advisor_assignments TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advisor_appointments TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.degree_requirements TO anon, authenticated;

-- Audit log (SELECT + INSERT; append-only, never update/delete)
GRANT SELECT, INSERT ON public.audit_logs TO anon, authenticated;

-- Users: add UPDATE/DELETE so admin management features (status changes, etc.) work
GRANT INSERT, UPDATE, DELETE ON public.users TO anon, authenticated;
