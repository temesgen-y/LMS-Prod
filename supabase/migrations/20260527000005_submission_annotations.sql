-- Add inline annotation support to assignment_submissions.
-- Annotations are stored as a JSONB array:
--   [{ "id": "<uuid>", "start": 0, "end": 25, "comment": "...", "createdAt": "..." }]
-- where start/end are character offsets into text_body.

ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS annotations JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Index for queries that filter on non-empty annotations
CREATE INDEX IF NOT EXISTS idx_submissions_has_annotations
  ON public.assignment_submissions ((annotations != '[]'::jsonb))
  WHERE annotations != '[]'::jsonb;
