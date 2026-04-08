-- Insert an admin user so they can log in with email/password (no signup).
-- Run this in Supabase SQL Editor. Replace the email, password, and name below, then run.
--
-- After running, the admin can sign in on the app login page and will be redirected to /admin/dashboard.
-- Admins are created only via this SQL (or Dashboard → Authentication → Add user + promote_user_to_admin.sql).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  -- ========== EDIT THESE ==========
  v_email     text := 'temesgen2040@gmail.com';
  v_password  text := '#MAS/[][]mas9';
  v_first_name text := 'Admin';
  v_last_name  text := 'yayeh';
  -- ================================

  v_auth_user_id uuid;
  v_app_user_id  uuid;
  v_encrypted_pw text;
BEGIN
  v_auth_user_id := gen_random_uuid();
  v_app_user_id  := gen_random_uuid();
  v_encrypted_pw := crypt(v_password, gen_salt('bf'));

  -- 1) auth.users (Supabase Auth)
  -- Token columns must be '' not NULL or login fails with "Database error querying schema".
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    v_auth_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    trim(lower(v_email)),
    v_encrypted_pw,
    now(),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('first_name', v_first_name, 'last_name', v_last_name),
    now(),
    now()
  );

  -- 2) auth.identities (required for email sign-in)
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_auth_user_id,
    jsonb_build_object('sub', v_auth_user_id::text, 'email', trim(lower(v_email))),
    'email',
    v_auth_user_id::text,
    now(),
    now(),
    now()
  );

  -- 3) public.users (app user with role ADMIN)
  INSERT INTO public.users (
    id,
    auth_user_id,
    email,
    first_name,
    last_name,
    role,
    status,
    created_at,
    updated_at
  )
  VALUES (
    v_app_user_id,
    v_auth_user_id,
    trim(lower(v_email)),
    v_first_name,
    v_last_name,
    'ADMIN',
    'ACTIVE',
    now(),
    now()
  );

  -- 4) public.admin_profiles
  INSERT INTO public.admin_profiles (user_id, profile_status, created_at, updated_at)
  VALUES (v_app_user_id, 'ACTIVE', now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  RAISE NOTICE 'Admin user created. Email: % — Sign in on the app login page; you will be redirected to /admin/dashboard.', trim(lower(v_email));
END $$;
