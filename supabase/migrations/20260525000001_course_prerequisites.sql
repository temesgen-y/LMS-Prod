-- Course Prerequisite Engine
-- Stores prerequisite relationships between courses.
-- A student must have completed the prerequisite course before registering
-- for the dependent course. Optional minimum grade can be enforced.

CREATE TABLE IF NOT EXISTS course_prerequisites (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID    NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  prerequisite_id  UUID    NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  min_grade        TEXT    NOT NULL DEFAULT 'D'
    CHECK (min_grade IN ('A','B','C','D','F')),
  is_required      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (course_id, prerequisite_id),
  CHECK  (course_id != prerequisite_id)
);

-- Index for fast lookup: "what are the prerequisites of course X?"
CREATE INDEX IF NOT EXISTS idx_course_prereqs_course     ON course_prerequisites(course_id);
-- Index for fast lookup: "which courses require course X as prerequisite?"
CREATE INDEX IF NOT EXISTS idx_course_prereqs_prereq     ON course_prerequisites(prerequisite_id);
