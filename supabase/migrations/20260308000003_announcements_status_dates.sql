-- Add status, starts_at, ends_at to announcements table
-- status: draft (not yet published) | active | inactive | scheduled | archived

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS status     text        NOT NULL DEFAULT 'active'
      CHECK (status IN ('draft','active','inactive','scheduled','archived')),
  ADD COLUMN IF NOT EXISTS starts_at  timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at    timestamptz;

CREATE INDEX IF NOT EXISTS idx_announcements_status ON public.announcements(status);
