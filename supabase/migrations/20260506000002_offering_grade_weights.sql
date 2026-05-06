-- Per-offering grade weight configuration.
-- When a row exists for an offering, weighted calculation replaces marks-based grading.
-- All three weights must sum to exactly 100.
CREATE TABLE IF NOT EXISTS public.offering_grade_weights (
  offering_id        uuid PRIMARY KEY
                     REFERENCES public.course_offerings(id) ON DELETE CASCADE,
  assessments_weight decimal(5,2) NOT NULL DEFAULT 40
                     CHECK (assessments_weight >= 0 AND assessments_weight <= 100),
  assignments_weight decimal(5,2) NOT NULL DEFAULT 30
                     CHECK (assignments_weight >= 0 AND assignments_weight <= 100),
  attendance_weight  decimal(5,2) NOT NULL DEFAULT 30
                     CHECK (attendance_weight >= 0 AND attendance_weight <= 100),
  CONSTRAINT chk_weights_sum
    CHECK (ROUND(assessments_weight + assignments_weight + attendance_weight, 2) = 100.00),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on change
CREATE TRIGGER set_offering_grade_weights_updated_at
  BEFORE UPDATE ON public.offering_grade_weights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
