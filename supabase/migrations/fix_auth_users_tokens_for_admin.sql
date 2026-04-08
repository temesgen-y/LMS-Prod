-- One-time fix: set token columns to empty string for existing auth users
-- that were inserted via SQL (e.g. insert_admin_user.sql). NULLs here cause
-- "Database error querying schema" when logging in.
--
-- Run this once in Supabase SQL Editor if you already created an admin with
-- 20260303000000_insert_admin_user.sql before the token columns were added.

UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  recovery_token = COALESCE(recovery_token, '')
WHERE confirmation_token IS NULL
   OR email_change IS NULL
   OR email_change_token_new IS NULL
   OR recovery_token IS NULL;
