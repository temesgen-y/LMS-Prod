-- SCORM attempt tracking
-- One row per student per lesson (upserted on each session).
-- Stores the full CMI data snapshot so the package can resume.

CREATE TABLE IF NOT EXISTS public.scorm_attempts (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id        UUID        NOT NULL REFERENCES public.lessons(id)  ON DELETE CASCADE,
    student_id       UUID        NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
    enrollment_id    UUID        REFERENCES public.enrollments(id)       ON DELETE SET NULL,

    -- SCORM 1.2 core fields
    status           TEXT        NOT NULL DEFAULT 'not attempted'
        CHECK (status IN ('passed','failed','completed','incomplete','not attempted','browsed')),
    score_raw        NUMERIC(6,2),
    score_min        NUMERIC(6,2) DEFAULT 0,
    score_max        NUMERIC(6,2) DEFAULT 100,
    total_time       TEXT        DEFAULT '00:00:00',   -- "HH:MM:SS"
    lesson_location  TEXT,                              -- cmi.core.lesson_location (bookmark)
    suspend_data     TEXT,                              -- cmi.suspend_data (arbitrary resume blob)

    -- Full CMI snapshot for debugging / future use
    cmi_data         JSONB,

    started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (lesson_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_scorm_attempts_lesson   ON public.scorm_attempts(lesson_id);
CREATE INDEX IF NOT EXISTS idx_scorm_attempts_student  ON public.scorm_attempts(student_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_scorm_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_scorm_attempts_updated_at ON public.scorm_attempts;
CREATE TRIGGER trg_scorm_attempts_updated_at
    BEFORE UPDATE ON public.scorm_attempts
    FOR EACH ROW EXECUTE FUNCTION public.set_scorm_updated_at();
