-- Drop the legacy single-column UNIQUE constraint on plagiarism_reports.submission_id.
-- An earlier version of the table defined submission_id as UNIQUE (PostgreSQL auto-named
-- it "plagiarism_reports_submission_id_key"), which permits only ONE report per submission.
-- We need one report PER PROVIDER (native, copyleaks, turnitin), enforced by
-- uq_plagiarism_reports_sub_provider (submission_id, provider). The single-column
-- constraint causes, when checking a second provider on the same submission:
--   duplicate key value violates unique constraint "plagiarism_reports_submission_id_key"

ALTER TABLE public.plagiarism_reports
    DROP CONSTRAINT IF EXISTS plagiarism_reports_submission_id_key;

-- Safety: also drop it if it somehow exists only as a bare unique index.
DROP INDEX IF EXISTS public.plagiarism_reports_submission_id_key;

-- Ensure the correct composite constraint is present (idempotent).
ALTER TABLE public.plagiarism_reports
    DROP CONSTRAINT IF EXISTS uq_plagiarism_reports_sub_provider;
ALTER TABLE public.plagiarism_reports
    ADD CONSTRAINT uq_plagiarism_reports_sub_provider UNIQUE (submission_id, provider);
