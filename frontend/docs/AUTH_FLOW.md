# MULE LMS – Role-based auth flow

## Single sign-in

- **One login page only:** `/login` (no `/admin/login`, `/student/login`, or `/instructor/login`).
- All users sign in with **email + password** (Supabase Auth).
- Credentials live in **Supabase Auth** only; **no passwords** in `public.users`.

## Email confirmation

This project is set up for **no email confirmation**: users are signed in immediately after signup. In Supabase Dashboard go to **Authentication → Providers → Email** and turn **off** "Confirm email". If you leave it on, users will see "Check your email to confirm..." and must confirm before signing in (the login page will complete their profile on first sign-in).

## Student signup (public, student-only)

1. **Supabase Auth:** `signUp({ email, password })` → creates `auth.users` row.
2. **Trigger:** `on_auth_user_created` inserts into `public.users` (`auth_user_id`, `email`, `full_name`, `status`).
3. **Client (after signUp):** Inserts into `public.user_roles` (STUDENT) and `public.student_profiles`.
- No role selection on the form; signup is **student-only**. Instructors/admins are created by admin flows.

## Login and role-based redirect

1. **Authenticate:** `signInWithPassword({ email, password })`.
2. **Load identity:** Get `public.users` by `auth_user_id = auth.uid()`.
3. **Load roles:** `public.user_roles` joined to `public.roles` (only `is_active = true`).
4. **Redirect by role (priority: admin > instructor > student):**
   - **student** → `/dashboard` (Student Dashboard)
   - **instructor** → `/instructor/dashboard`
   - **admin** → `/admin/dashboard`
   - No role → sign out and show error (or `/unauthorized`).

## Instructor login

Instructors use the **same** `/login` page. They are assumed to already exist (created by admin). On successful login, role is read from `public.user_roles` and they are redirected to the Instructor Dashboard.

## Tables (no passwords in public schema)

- `auth.users` – credentials (email, password hash).
- `public.users` – app identity (`auth_user_id` → `auth.users.id`, email, full_name, status).
- `public.roles` – role definitions (e.g. STUDENT, INSTRUCTOR, ADMIN).
- `public.user_roles` – user ↔ role (user_id, role_id, is_active).

## Key files

- **Login:** `src/app/login/page.tsx` – single form, then `getUserRoleNames` + `getRedirectForRole`.
- **Signup:** `src/app/signup/page.tsx` – student-only form; after `signUp`, insert `user_roles` + `student_profiles`.
- **Auth helpers:** `src/lib/auth/get-user-roles.ts`, `src/types/auth.ts`.
- **DB trigger:** `supabase/migrations/20260301000002_auth_trigger_and_student_profile_columns.sql`.
- **RLS:** `supabase/migrations/20260301000003_rls_policies_signup.sql`.
