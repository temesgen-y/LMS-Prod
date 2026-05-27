-- Enable Supabase Realtime publication for exam_violations so the instructor
-- monitoring dashboard receives live INSERT notifications.
-- Run this once in the Supabase SQL editor (or via migration runner).

-- Add exam_violations to the supabase_realtime publication if not already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'exam_violations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE exam_violations;
  END IF;
END $$;

-- Ensure exam_sessions is also in the publication (for risk_score updates).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'exam_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE exam_sessions;
  END IF;
END $$;
