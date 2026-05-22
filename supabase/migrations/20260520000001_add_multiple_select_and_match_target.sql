-- Add 'multiple_select' question type and 'match_target' for matching pairs

-- 1. Extend the type check on questions to include multiple_select
ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS chk_questions_type;

ALTER TABLE public.questions
  ADD CONSTRAINT chk_questions_type
  CHECK (type IN ('mcq','true_false','short_answer','fill_blank','essay','matching','multiple_select'));

-- 2. Add match_target column to question_options (used by matching questions)
--    body  = left-side item  (e.g. "Keyboard")
--    match_target = correct right-side value (e.g. "Input Device")
ALTER TABLE public.question_options
  ADD COLUMN IF NOT EXISTS match_target text;
