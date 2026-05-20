-- Program progress tracking per student per academic program
-- Stores credit completion, CGPA, graduation classification, and status

CREATE TABLE IF NOT EXISTS public.program_progress (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id                UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  program_id                UUID NOT NULL REFERENCES public.academic_programs(id),
  total_required_credits    NUMERIC(5,1) NOT NULL DEFAULT 0,
  completed_credits         NUMERIC(5,1) NOT NULL DEFAULT 0,
  completion_percentage     NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  current_cgpa              NUMERIC(4,2) NOT NULL DEFAULT 0.00,
  expected_graduation_term  UUID REFERENCES public.academic_terms(id),
  graduation_classification TEXT,
  status                    TEXT NOT NULL DEFAULT 'in_progress',
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, program_id),
  CONSTRAINT program_progress_status_check CHECK (status IN ('in_progress', 'completed', 'withdrawn'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_progress TO authenticated;
