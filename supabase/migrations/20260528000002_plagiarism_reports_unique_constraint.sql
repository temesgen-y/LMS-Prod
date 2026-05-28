-- Ensure the (submission_id, provider) unique constraint exists on plagiarism_reports.
-- The original migration declared it inside CREATE TABLE IF NOT EXISTS, so any database
-- where the table was created by an earlier run is missing the constraint. Without it,
-- upserts using `onConflict: 'submission_id,provider'` fail with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification".

-- 1. Remove duplicate (submission_id, provider) rows, keeping the most recent.
DELETE FROM public.plagiarism_reports
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY submission_id, provider
                   ORDER BY requested_at DESC, id DESC
               ) AS rn
        FROM public.plagiarism_reports
    ) t
    WHERE t.rn > 1
);

-- 2. (Re)create the unique constraint.
ALTER TABLE public.plagiarism_reports
    DROP CONSTRAINT IF EXISTS uq_plagiarism_reports_sub_provider;
ALTER TABLE public.plagiarism_reports
    ADD CONSTRAINT uq_plagiarism_reports_sub_provider UNIQUE (submission_id, provider);
