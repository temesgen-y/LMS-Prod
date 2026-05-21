-- Add section_label to questions so instructors can group questions into
-- named sections (A, B, C, …) matching a structured exam format.
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS section_label text;
