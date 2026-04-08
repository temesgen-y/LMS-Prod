-- Add open-ended text response column to assessment_attempts
-- Used when an assessment has no structured questions (instructor wrote them in instructions)
ALTER TABLE public.assessment_attempts
  ADD COLUMN IF NOT EXISTS text_response text;
