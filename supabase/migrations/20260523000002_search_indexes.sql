-- Full-text / trigram search indexes
-- Enables pg_trgm for fast ILIKE queries across searchable text columns.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- courses
CREATE INDEX IF NOT EXISTS idx_courses_title_trgm ON courses USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_courses_code_trgm  ON courses USING gin(code  gin_trgm_ops);

-- lessons
CREATE INDEX IF NOT EXISTS idx_lessons_title_trgm ON lessons USING gin(title gin_trgm_ops);

-- assignments
CREATE INDEX IF NOT EXISTS idx_assignments_title_trgm ON assignments USING gin(title gin_trgm_ops);

-- assessments
CREATE INDEX IF NOT EXISTS idx_assessments_title_trgm ON assessments USING gin(title gin_trgm_ops);

-- announcements
CREATE INDEX IF NOT EXISTS idx_announcements_title_trgm ON announcements USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_announcements_body_trgm  ON announcements USING gin(body  gin_trgm_ops);

-- forum threads
CREATE INDEX IF NOT EXISTS idx_forum_threads_title_trgm ON forum_threads USING gin(title gin_trgm_ops);

-- users (names for student/instructor search)
CREATE INDEX IF NOT EXISTS idx_users_first_name_trgm ON users USING gin(first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_last_name_trgm  ON users USING gin(last_name  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_email_trgm      ON users USING gin(email      gin_trgm_ops);
