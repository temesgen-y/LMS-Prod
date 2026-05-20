-- Grade scale table: Ethiopian university grading system
-- Letters, grade points, percentage ranges, GPA inclusion flags

CREATE TABLE IF NOT EXISTS public.grade_scale (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_grade   TEXT NOT NULL UNIQUE,
  grade_point    NUMERIC(3,2) NOT NULL,
  min_percentage NUMERIC(5,2),
  max_percentage NUMERIC(5,2),
  description    TEXT,
  counts_in_gpa  BOOLEAN NOT NULL DEFAULT true,
  is_passing     BOOLEAN NOT NULL DEFAULT true,
  sort_order     INTEGER NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.grade_scale
  (letter_grade, grade_point, min_percentage, max_percentage, description, counts_in_gpa, is_passing, sort_order)
VALUES
  ('A',   4.00, 90.00, 100.00, 'Excellent',     true,  true,  1),
  ('A-',  3.75, 85.00,  89.99, 'Very Good+',    true,  true,  2),
  ('B+',  3.50, 80.00,  84.99, 'Very Good',     true,  true,  3),
  ('B',   3.00, 75.00,  79.99, 'Good',          true,  true,  4),
  ('B-',  2.75, 70.00,  74.99, 'Above Average', true,  true,  5),
  ('C+',  2.50, 65.00,  69.99, 'Average+',      true,  true,  6),
  ('C',   2.00, 60.00,  64.99, 'Average',       true,  true,  7),
  ('C-',  1.75, 55.00,  59.99, 'Below Average', true,  true,  8),
  ('D',   1.00, 45.00,  54.99, 'Poor',          true,  true,  9),
  ('F',   0.00,  0.00,  44.99, 'Fail',          true,  false, 10),
  ('I',   0.00,  NULL,   NULL, 'Incomplete',    false, false, 11),
  ('W',   0.00,  NULL,   NULL, 'Withdrawn',     false, false, 12),
  ('NG',  0.00,  NULL,   NULL, 'No Grade',      false, false, 13)
ON CONFLICT (letter_grade) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grade_scale TO authenticated;
