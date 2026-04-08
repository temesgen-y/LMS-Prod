-- Run this in Supabase SQL Editor so signup inserts into users and student_profiles.
-- Matches your schema: users (first_name, last_name, role, status, etc.), profile tables.
-- Ensures: unique(auth_user_id), RLS so app can create/update own user and student_profile.

-- 1) Unique constraint on auth_user_id (required for upsert from app)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_auth_user_id_key'
    AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id);
  END IF;
END $$;

-- 2) Enable RLS on public.users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 3) Policy: allow insert when the new row's auth_user_id is the current auth user
DROP POLICY IF EXISTS "Users: allow insert own row" ON public.users;
CREATE POLICY "Users: allow insert own row" ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = auth_user_id);

-- 4) Policy: allow update own row (for upsert and role)
DROP POLICY IF EXISTS "Users: allow update own row" ON public.users;
CREATE POLICY "Users: allow update own row" ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- 5) Policy: allow select own row
DROP POLICY IF EXISTS "Users: allow select own row" ON public.users;
CREATE POLICY "Users: allow select own row" ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_user_id);

-- 6) student_profiles: allow insert when user_id belongs to current auth user
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Student profiles: allow insert own" ON public.student_profiles;
CREATE POLICY "Student profiles: allow insert own" ON public.student_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Student profiles: allow update own" ON public.student_profiles;
CREATE POLICY "Student profiles: allow update own" ON public.student_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()))
  WITH CHECK (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "Student profiles: allow select own" ON public.student_profiles;
CREATE POLICY "Student profiles: allow select own" ON public.student_profiles
  FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

-- 7) admin_profiles: select own (role is derived from which profile exists)
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin profiles: allow select own" ON public.admin_profiles;
CREATE POLICY "Admin profiles: allow select own" ON public.admin_profiles
  FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

-- 8) instructor_profiles: select own
ALTER TABLE public.instructor_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Instructor profiles: allow select own" ON public.instructor_profiles;
CREATE POLICY "Instructor profiles: allow select own" ON public.instructor_profiles
  FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));
