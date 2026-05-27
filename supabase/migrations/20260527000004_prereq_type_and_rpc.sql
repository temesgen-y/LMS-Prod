-- Add prerequisite_type column to course_prerequisites
-- Replaces the boolean is_required with a text enum ('hard' | 'soft')
-- so the UI can store and display the type directly.

ALTER TABLE public.course_prerequisites
  ADD COLUMN IF NOT EXISTS prerequisite_type TEXT NOT NULL DEFAULT 'hard'
    CHECK (prerequisite_type IN ('hard', 'soft'));

-- Backfill from the existing is_required boolean if the column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'course_prerequisites'
      AND column_name  = 'is_required'
  ) THEN
    UPDATE public.course_prerequisites
    SET prerequisite_type = CASE WHEN is_required THEN 'hard' ELSE 'soft' END;
  END IF;
END;
$$;

-- ─── Grade helpers ────────────────────────────────────────────────────────────

-- Converts a full letter grade (from enrollments.final_grade) to a GPA point
CREATE OR REPLACE FUNCTION public.grade_to_gpa(grade TEXT)
RETURNS DECIMAL AS $$
  SELECT CASE grade
    WHEN 'A'  THEN 4.0
    WHEN 'A-' THEN 3.7
    WHEN 'B+' THEN 3.3
    WHEN 'B'  THEN 3.0
    WHEN 'B-' THEN 2.7
    WHEN 'C+' THEN 2.3
    WHEN 'C'  THEN 2.0
    WHEN 'D'  THEN 1.0
    WHEN 'F'  THEN 0.0
    ELSE -1.0
  END;
$$ LANGUAGE sql IMMUTABLE STRICT;

-- Converts a minimum-grade requirement (A/B/C/D/F) to a GPA threshold
CREATE OR REPLACE FUNCTION public.min_grade_to_gpa(grade TEXT)
RETURNS DECIMAL AS $$
  SELECT CASE grade
    WHEN 'A' THEN 4.0
    WHEN 'B' THEN 3.0
    WHEN 'C' THEN 2.0
    WHEN 'D' THEN 1.0
    WHEN 'F' THEN 0.0
    ELSE 0.0
  END;
$$ LANGUAGE sql IMMUTABLE STRICT;

-- ─── check_student_prerequisites RPC ─────────────────────────────────────────
-- Returns one row per prerequisite for the course offering p_offering_id,
-- indicating whether student p_student_id has met each one.

DROP FUNCTION IF EXISTS public.check_student_prerequisites(UUID, UUID);

CREATE OR REPLACE FUNCTION public.check_student_prerequisites(
  p_student_id UUID,
  p_offering_id UUID
)
RETURNS TABLE (
  prerequisite_id  UUID,
  course_code      TEXT,
  course_title     TEXT,
  required_grade   TEXT,
  prereq_type      TEXT,
  is_met           BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.prerequisite_id,
    c.code::TEXT                AS course_code,
    c.title::TEXT               AS course_title,
    cp.min_grade                AS required_grade,
    cp.prerequisite_type        AS prereq_type,
    COALESCE(
      (
        -- Does the student have a completed (or active) enrollment in any offering
        -- of the prerequisite course, with a grade >= the minimum required?
        SELECT
          grade_to_gpa(e.final_grade) >= min_grade_to_gpa(cp.min_grade)
        FROM public.enrollments e
        JOIN public.course_offerings co2 ON co2.id = e.offering_id
        WHERE e.student_id    = p_student_id
          AND co2.course_id   = cp.prerequisite_id
          AND e.final_grade  IS NOT NULL
          AND e.final_grade  != 'I'
        ORDER BY grade_to_gpa(e.final_grade) DESC
        LIMIT 1
      ),
      FALSE
    )::BOOLEAN                  AS is_met
  FROM public.course_prerequisites cp
  JOIN public.course_offerings    co ON co.id = p_offering_id
  JOIN public.courses              c ON c.id  = cp.prerequisite_id
  WHERE cp.course_id = co.course_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute to the anon and authenticated roles so it can be called
-- via the Supabase JS client.
GRANT EXECUTE ON FUNCTION public.check_student_prerequisites(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grade_to_gpa(TEXT)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.min_grade_to_gpa(TEXT) TO anon, authenticated;
