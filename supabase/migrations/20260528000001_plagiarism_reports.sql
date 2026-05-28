CREATE TABLE IF NOT EXISTS public.plagiarism_reports (
    id                  UUID        NOT NULL DEFAULT uuid_generate_v4(),
    submission_id       UUID        NOT NULL,
    assignment_id       UUID,
    student_id          UUID,
    requested_by        UUID,
    status              TEXT        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    provider            TEXT        NOT NULL DEFAULT 'native'
                                    CHECK (provider IN ('native', 'copyleaks', 'turnitin')),
    similarity_pct      DECIMAL(5,2),
    source_matches      JSONB,
    provider_report_url TEXT,
    provider_scan_id    TEXT,
    error_message       TEXT,
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,

    CONSTRAINT pk_plagiarism_reports
        PRIMARY KEY (id),
    CONSTRAINT uq_plagiarism_reports_sub_provider
        UNIQUE (submission_id, provider),
    CONSTRAINT fk_plagiarism_reports_submission
        FOREIGN KEY (submission_id)
        REFERENCES public.assignment_submissions(id)
        ON DELETE CASCADE
);

-- Add columns that may be missing if the table was created by an earlier run
ALTER TABLE public.plagiarism_reports ADD COLUMN IF NOT EXISTS provider_scan_id    TEXT;
ALTER TABLE public.plagiarism_reports ADD COLUMN IF NOT EXISTS provider_report_url TEXT;
ALTER TABLE public.plagiarism_reports ADD COLUMN IF NOT EXISTS error_message       TEXT;
ALTER TABLE public.plagiarism_reports ADD COLUMN IF NOT EXISTS assignment_id       UUID;
ALTER TABLE public.plagiarism_reports ADD COLUMN IF NOT EXISTS student_id          UUID;
ALTER TABLE public.plagiarism_reports ADD COLUMN IF NOT EXISTS requested_by        UUID;
ALTER TABLE public.plagiarism_reports ADD COLUMN IF NOT EXISTS completed_at        TIMESTAMPTZ;
ALTER TABLE public.plagiarism_reports ADD COLUMN IF NOT EXISTS source_matches      JSONB;
ALTER TABLE public.plagiarism_reports ADD COLUMN IF NOT EXISTS similarity_pct      DECIMAL(5,2);

CREATE INDEX IF NOT EXISTS idx_plagiarism_reports_submission ON public.plagiarism_reports(submission_id);
CREATE INDEX IF NOT EXISTS idx_plagiarism_reports_scan_id   ON public.plagiarism_reports(provider_scan_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plagiarism_reports TO anon, authenticated;
