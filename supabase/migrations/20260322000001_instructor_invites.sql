-- ============================================================
-- instructor_invites: secure, single-use invite tokens
-- Used by /setup-password?token=... flow.
-- No RLS — accessed only via service-role (admin) client.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.instructor_invites (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who is being invited
  email           TEXT         NOT NULL,

  -- Opaque UUID token included in the invite link (/setup-password?token=...)
  token           UUID         NOT NULL UNIQUE DEFAULT gen_random_uuid(),

  -- Supabase auth.users ID — set when inviteUserByEmail is called
  auth_user_id    UUID,

  -- Admin who created the invite
  invited_by      UUID         REFERENCES public.users(id) ON DELETE SET NULL,

  -- Token validity window (default 48 hours from creation)
  expires_at      TIMESTAMPTZ  NOT NULL DEFAULT (now() + INTERVAL '48 hours'),

  -- One-time use enforcement
  used            BOOLEAN      NOT NULL DEFAULT false,
  used_at         TIMESTAMPTZ,

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Fast lookup by token (validate invite link)
CREATE INDEX IF NOT EXISTS idx_instructor_invites_token
  ON public.instructor_invites (token);

-- Fast lookup by email (check for existing pending invites)
CREATE INDEX IF NOT EXISTS idx_instructor_invites_email
  ON public.instructor_invites (email);

-- NOTE: We intentionally do NOT add a partial unique index on email here.
-- Supabase's JS client cannot use partial indexes as upsert conflict targets.
-- "One active invite per email" is enforced by the API route (invalidate then insert).

COMMENT ON TABLE public.instructor_invites IS
  'Single-use invite tokens for instructor account setup. Tokens expire after 48 hours.';
