-- Promote an existing user to admin so they can log in and be redirected to /admin/dashboard.
-- Run this in Supabase SQL Editor after replacing 'admin@example.com' with the user's email.
--
-- The user must already exist in auth (sign up once as student, or create in Dashboard → Authentication → Users).

DO $$
DECLARE
  app_user_id uuid;
  target_email text := 'admin@example.com';  -- Change this to the admin's email
BEGIN
  SELECT id INTO app_user_id
  FROM public.users
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(target_email))
  LIMIT 1;

  IF app_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with email "%". Sign up first or create the user in Authentication → Users.', target_email;
  END IF;

  UPDATE public.users
  SET role = 'ADMIN'
  WHERE id = app_user_id;

  INSERT INTO public.admin_profiles (user_id)
  VALUES (app_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RAISE NOTICE 'User % is now an admin. They can log in and will be redirected to /admin/dashboard.', target_email;
END $$;
