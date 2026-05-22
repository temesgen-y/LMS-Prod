-- Enterprise-Grade Exam Security & AI Proctoring System
-- Apply after lmsv6.sql and all other incremental migrations.

-- ── Security & delivery settings on assessments ───────────────────────────────
ALTER TABLE public.assessments
  -- Mode preset
  ADD COLUMN IF NOT EXISTS security_mode                  text    DEFAULT 'standard'
    CHECK (security_mode IN ('standard','lockdown','proctored')),

  -- Browser security
  ADD COLUMN IF NOT EXISTS require_fullscreen              boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS block_copy_paste                boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS block_keyboard_shortcuts        boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS block_right_click               boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS block_text_selection            boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS detect_devtools                 boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS detect_screen_share             boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS detect_external_display         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS detect_remote_software          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_tab_switches                integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_fullscreen_exits            integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_risk_score                  integer DEFAULT 30,

  -- Proctoring
  ADD COLUMN IF NOT EXISTS require_webcam                  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_audio_monitoring         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS snapshot_interval_seconds       integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS require_identity_verification   boolean DEFAULT false,

  -- Question delivery
  ADD COLUMN IF NOT EXISTS one_question_at_a_time          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS prevent_backtracking             boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS question_pool_size              integer,
  ADD COLUMN IF NOT EXISTS per_question_time_limit         integer,
  ADD COLUMN IF NOT EXISTS section_time_limits             jsonb,

  -- Timing & resilience
  ADD COLUMN IF NOT EXISTS grace_period_seconds            integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS late_start_window_minutes       integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS disconnect_timeout_seconds      integer DEFAULT 120;

-- ── exam_sessions: one row per attempt ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id            uuid        NOT NULL REFERENCES public.assessment_attempts(id) ON DELETE CASCADE,
  student_id            uuid        NOT NULL REFERENCES public.users(id),
  assessment_id         uuid        NOT NULL REFERENCES public.assessments(id),
  session_token         text        NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  security_mode         text        NOT NULL DEFAULT 'standard',
  started_at            timestamptz NOT NULL DEFAULT now(),
  ended_at              timestamptz,
  auto_submitted        boolean     DEFAULT false,
  auto_submit_reason    text,  -- 'time_expired','max_violations','disconnect_timeout','instructor_terminated'
  total_violation_count integer     DEFAULT 0,
  risk_score            integer     DEFAULT 0,
  tab_switches          integer     DEFAULT 0,
  fullscreen_exits      integer     DEFAULT 0,
  focus_losses          integer     DEFAULT 0,
  last_heartbeat_at     timestamptz,
  ip_address            text,
  ip_changed            boolean     DEFAULT false,
  browser_fingerprint   jsonb,  -- { userAgent, screenResolution, timezone, language, platform, colorDepth, hardwareConcurrency }
  device_metadata       jsonb,  -- { os, browser, browserVersion, deviceType, screenCount, touchEnabled }
  webcam_enabled        boolean     DEFAULT false,
  identity_verified     boolean     DEFAULT false,
  question_order        jsonb,  -- randomized array of question IDs
  option_orders         jsonb,  -- { [questionId]: [shuffled index array] }
  status                text        DEFAULT 'active'
    CHECK (status IN ('active','completed','terminated','invalidated')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id)
);

CREATE INDEX IF NOT EXISTS exam_sessions_assessment_id_idx ON public.exam_sessions(assessment_id);
CREATE INDEX IF NOT EXISTS exam_sessions_student_id_idx    ON public.exam_sessions(student_id);
CREATE INDEX IF NOT EXISTS exam_sessions_status_idx        ON public.exam_sessions(status);

-- ── exam_violations: granular event log ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_violations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid        NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  student_id     uuid        NOT NULL REFERENCES public.users(id),
  assessment_id  uuid        NOT NULL REFERENCES public.assessments(id),
  violation_type text        NOT NULL,
  severity       text        NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info','warning','critical')),
  risk_points    integer     NOT NULL DEFAULT 0,
  details        jsonb,
  occurred_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_violations_session_id_idx    ON public.exam_violations(session_id);
CREATE INDEX IF NOT EXISTS exam_violations_assessment_id_idx ON public.exam_violations(assessment_id);

-- ── webcam_snapshots: periodic capture metadata ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webcam_snapshots (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid        NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  student_id      uuid        NOT NULL REFERENCES public.users(id),
  storage_path    text        NOT NULL,
  analysis_result jsonb,  -- { facesDetected, lookingAway, phoneVisible, audioLevel }
  flagged         boolean     DEFAULT false,
  flag_reason     text,
  captured_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webcam_snapshots_session_id_idx ON public.webcam_snapshots(session_id);

-- ── identity_verifications: pre-exam ID check ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.identity_verifications (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           uuid        NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  student_id           uuid        NOT NULL REFERENCES public.users(id),
  assessment_id        uuid        NOT NULL REFERENCES public.assessments(id),
  selfie_path          text,
  student_id_photo_path text,
  otp_verified         boolean     DEFAULT false,
  face_match_confidence numeric(5,2),
  verified_at          timestamptz,
  status               text        DEFAULT 'pending'
    CHECK (status IN ('pending','verified','failed')),
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ── risk_score_rules: per-violation configuration ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.risk_score_rules (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_type        text        NOT NULL UNIQUE,
  risk_points           integer     NOT NULL DEFAULT 3,
  description           text,
  auto_submit_threshold integer,
  created_at            timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.risk_score_rules (violation_type, risk_points, description) VALUES
  ('tab_switch',                3,  'Student switched to another tab'),
  ('fullscreen_exit',           3,  'Student exited fullscreen mode'),
  ('copy_attempt',              2,  'Student attempted to copy text'),
  ('paste_attempt',             2,  'Student attempted to paste text'),
  ('right_click',               1,  'Student right-clicked during exam'),
  ('keyboard_shortcut',         2,  'Student used a blocked keyboard shortcut'),
  ('devtools_open',             5,  'Browser developer tools detected'),
  ('print_attempt',             3,  'Student attempted to print the exam'),
  ('screenshot_attempt',        3,  'Student attempted to take a screenshot'),
  ('text_select',               1,  'Student attempted to select text'),
  ('browser_minimize',          2,  'Student minimized the browser'),
  ('focus_lost',                3,  'Browser window lost focus'),
  ('no_face',                   5,  'No face detected in webcam'),
  ('multiple_faces',            10, 'Multiple faces detected in webcam'),
  ('looking_away',              2,  'Student looking away from screen frequently'),
  ('phone_detected',            8,  'Phone or secondary device detected'),
  ('voice_detected',            4,  'Unexpected voice/audio detected'),
  ('suspicious_movement',       3,  'Suspicious body movement detected'),
  ('ip_change',                 5,  'IP address changed during exam'),
  ('multiple_sessions',         8,  'Exam opened in multiple windows/devices'),
  ('screen_share_detected',     10, 'Screen sharing software detected'),
  ('external_display',          5,  'External monitor/display detected'),
  ('remote_software_detected',  10, 'Remote access software detected'),
  ('disconnect',                3,  'Student disconnected from exam'),
  ('time_manipulation',         8,  'Client time does not match server time')
ON CONFLICT (violation_type) DO NOTHING;

-- ── updated_at trigger on exam_sessions ───────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_exam_sessions_updated_at'
  ) THEN
    CREATE TRIGGER set_exam_sessions_updated_at
      BEFORE UPDATE ON public.exam_sessions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ── PostgREST grants ──────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_sessions           TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_violations         TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webcam_snapshots        TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.identity_verifications  TO anon, authenticated;
GRANT SELECT, INSERT                 ON public.risk_score_rules        TO anon, authenticated;
