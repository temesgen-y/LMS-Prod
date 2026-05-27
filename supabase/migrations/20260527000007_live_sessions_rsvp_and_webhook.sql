-- RSVP table: students indicate whether they plan to attend
CREATE TABLE IF NOT EXISTS public.live_session_rsvps (
    id               UUID        NOT NULL DEFAULT uuid_generate_v4(),
    live_session_id  UUID        NOT NULL,
    student_id       UUID        NOT NULL,
    rsvp_status      TEXT        NOT NULL DEFAULT 'yes'
                                 CHECK (rsvp_status IN ('yes', 'no', 'maybe')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_live_session_rsvps
        PRIMARY KEY (id),
    CONSTRAINT uq_live_session_rsvps
        UNIQUE (live_session_id, student_id),
    CONSTRAINT fk_rsvp_session
        FOREIGN KEY (live_session_id)
        REFERENCES public.live_sessions(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_rsvp_student
        FOREIGN KEY (student_id)
        REFERENCES public.users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rsvps_session  ON public.live_session_rsvps(live_session_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_student  ON public.live_session_rsvps(student_id);

-- Track how attendance was captured
ALTER TABLE public.live_session_attendance
    ADD COLUMN IF NOT EXISTS source            TEXT NOT NULL DEFAULT 'manual'
                                               CHECK (source IN ('manual', 'zoom_webhook', 'self_reported')),
    ADD COLUMN IF NOT EXISTS zoom_participant_id TEXT;

-- Trigger to keep rsvps.updated_at fresh
CREATE OR REPLACE FUNCTION public.set_rsvp_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_rsvps_updated_at ON public.live_session_rsvps;
CREATE TRIGGER trg_rsvps_updated_at
    BEFORE UPDATE ON public.live_session_rsvps
    FOR EACH ROW EXECUTE FUNCTION public.set_rsvp_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_session_rsvps TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.live_session_attendance TO anon, authenticated;
