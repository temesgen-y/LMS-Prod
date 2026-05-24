-- ─── Assignment Management Enhancements ──────────────────────────────────────

-- 1. Assignment type & advanced options
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS assignment_type  TEXT NOT NULL DEFAULT 'individual'
    CHECK (assignment_type IN ('individual','group','practice','homework','project')),
  ADD COLUMN IF NOT EXISTS allow_url        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allow_media      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS group_assignment BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_group_size   SMALLINT NOT NULL DEFAULT 4;

-- 2. Submission type extensions
ALTER TABLE assignment_submissions
  ADD COLUMN IF NOT EXISTS url_submission   TEXT,
  ADD COLUMN IF NOT EXISTS media_urls       TEXT[],
  ADD COLUMN IF NOT EXISTS draft_text       TEXT,
  ADD COLUMN IF NOT EXISTS draft_file_urls  TEXT[],
  ADD COLUMN IF NOT EXISTS draft_saved_at   TIMESTAMPTZ;

-- 3. Group assignment tables
CREATE TABLE IF NOT EXISTS assignment_groups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignment_group_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES assignment_groups(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, student_id)
);

-- Add group_id to submissions so group work links back
ALTER TABLE assignment_submissions
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES assignment_groups(id) ON DELETE SET NULL;

-- ─── Numerical Question Type ──────────────────────────────────────────────────

-- 4. Extend question type check to include 'numerical'
ALTER TABLE questions
  DROP CONSTRAINT IF EXISTS chk_questions_type;

ALTER TABLE questions
  ADD CONSTRAINT chk_questions_type
    CHECK (type IN ('mcq','true_false','short_answer','fill_blank','essay',
                    'matching','multiple_select','numerical'));

-- 5. Numerical answer fields on questions table
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS correct_value   DECIMAL,
  ADD COLUMN IF NOT EXISTS tolerance       DECIMAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tolerance_type  TEXT    NOT NULL DEFAULT 'absolute'
    CHECK (tolerance_type IN ('absolute','percentage')),
  ADD COLUMN IF NOT EXISTS unit            TEXT;

-- 6. Numerical answer on student_answers
ALTER TABLE student_answers
  ADD COLUMN IF NOT EXISTS numeric_answer DECIMAL;

-- ─── Assessment Attempt Auto-Save ────────────────────────────────────────────

-- 7. Draft answers JSONB for disconnection recovery
ALTER TABLE assessment_attempts
  ADD COLUMN IF NOT EXISTS draft_answers JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_saved_at TIMESTAMPTZ;

-- ─── Plagiarism Detection ─────────────────────────────────────────────────────

-- 8. Plagiarism reports table
CREATE TABLE IF NOT EXISTS plagiarism_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  assignment_id   UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by    UUID NOT NULL REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  similarity_pct  DECIMAL,          -- overall similarity score 0–100
  ai_pct          DECIMAL,          -- AI-generated content percentage
  source_matches  JSONB,            -- array of { url, similarity_pct, matched_text }
  provider        TEXT DEFAULT 'internal',  -- 'turnitin' | 'internal'
  provider_report_url TEXT,
  error_message   TEXT,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  UNIQUE (submission_id)
);
