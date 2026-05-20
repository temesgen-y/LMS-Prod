-- Semester GPA records per student per term
-- Stores computed semester and cumulative GPA, credits, standing, and course counts

CREATE TABLE IF NOT EXISTS public.semester_gpa (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id                 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  term_id                    UUID NOT NULL REFERENCES public.academic_terms(id),
  total_credit_hours         NUMERIC(5,1) NOT NULL DEFAULT 0,
  total_quality_points       NUMERIC(7,2) NOT NULL DEFAULT 0,
  semester_gpa               NUMERIC(4,2) NOT NULL DEFAULT 0.00,
  cumulative_credit_hours    NUMERIC(6,1) NOT NULL DEFAULT 0,
  cumulative_quality_points  NUMERIC(8,2) NOT NULL DEFAULT 0,
  cumulative_gpa             NUMERIC(4,2) NOT NULL DEFAULT 0.00,
  academic_standing          TEXT NOT NULL DEFAULT 'Good Standing',
  courses_taken              INTEGER NOT NULL DEFAULT 0,
  courses_passed             INTEGER NOT NULL DEFAULT 0,
  courses_failed             INTEGER NOT NULL DEFAULT 0,
  calculated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, term_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.semester_gpa TO authenticated;
