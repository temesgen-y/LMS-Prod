# Supabase setup for Mule LMS

Follow these steps **in order** so signup and login work.

## 1. Run migrations in the Supabase SQL Editor

Run these **in order** (Dashboard → SQL Editor → New query, paste and run each):

**Step 1a – Base tables (run this first):**

- **`migrations/20260301000000_base_tables_and_roles.sql`**  
  - Creates `public.users`, `public.admin_profiles`, `public.instructor_profiles`, and `public.student_profiles` (no `roles` or `user_roles`). Role is determined by which profile exists and by `users.role`. Without this, signup will fail with “relation does not exist”.

**Step 1b – RLS so the app can insert on signup:**

- **`migrations/20260302000001_users_and_student_profiles_insert.sql`**  
  - Adds `role` and `full_name` to `users` if missing, unique on `auth_user_id`, and RLS policies so authenticated users can create/update their own row and their own `student_profiles` row.

If you already have your own schema, ensure `users` and `student_profiles` (and optionally `admin_profiles`, `instructor_profiles`) exist, then run **Step 1b** only.

---

## 2. Enable Email Signup (required)

If you see **"Email signups are disabled"** or a 400 on signup:

1. In [Supabase Dashboard](https://supabase.com/dashboard), open your project.
2. Left sidebar: **Authentication** → **Providers**.
3. Click **Email**.
4. Turn **ON** **"Enable Email Signup"** (or "Enable email provider").
5. Click **Save**.

---

## 3. Turn off “Confirm email” (recommended)

**Do this so that:**
- New users get a session right after signup (no “Check your email to confirm”).
- Signup does **not** send confirmation emails, so you avoid **“email rate limit exceeded”** when many users sign up.

**Steps:**
1. In [Supabase Dashboard](https://supabase.com/dashboard), open your project.
2. Left sidebar: **Authentication** → **Providers**.
3. Click **Email**.
4. Find **“Confirm email”** (or “Enable email confirmations”) and **turn it OFF**.
5. Click **Save**.

---

## 4. If you already ran the old migration (role_name error)

If you ran `20260301000000_mule_lms_tables.sql` and see errors like `column "role_name" of relation "roles" does not exist`:

- Run **`20260301000001_lms_public_schema_v2.sql`** in full. It drops and recreates the v2 tables (including `roles` with column `name`).
- Then run **000002**, **000003**, and **000004** as in step 1.

---

## 5. If users exist in `users` but not in `user_roles` or `student_profiles`

This can happen if “Confirm email” was on at signup (so the RPC never ran). Run this **once** in the SQL Editor:

- **`backfill_user_roles_and_student_profiles.sql`**

It adds a STUDENT role and a student profile for every user in `public.users` who doesn’t have them. Ensure **`seed_roles_v2.sql`** and **`add_student_profile_columns.sql`** have been run first if needed.

---

## 6. Log in as admin

There is no public “admin signup”. Admins are created via SQL or Dashboard, then they use the **same login page** as students (email + password) and are redirected to **/admin/dashboard**.

**Option A – Insert admin entirely via SQL (recommended)**

1. Run **`migrations/20260303000000_insert_admin_user.sql`** in the Supabase SQL Editor.
2. At the top of the script, edit the variables: `v_email`, `v_password`, `v_first_name`, `v_last_name`.
3. Run the query. It creates the user in `auth.users`, `auth.identities`, `public.users`, and `public.admin_profiles`.
4. **Log in** on the app login page with that email and password. You’ll be redirected to **/admin/dashboard**.

**Option B – Create user in Dashboard, then promote**

1. Create a user (e.g. sign up on the app signup page, or add in **Authentication → Users** in the Supabase Dashboard with email + password).
2. Run **`migrations/promote_user_to_admin.sql`** in the SQL Editor; change `'admin@example.com'` to that user’s email, then run.
3. Log in on the app login page with that email and password.

---

## 7. Quick check

- Create a new account on the app signup page.
- You should be signed in and redirected to the dashboard (no “confirm your email” step if step 2 is done).
- If you still see “Check your email to confirm”, double‑check step 2 and that you saved the Email provider settings.
- If users are in `users` but not in `user_roles` / `student_profiles`, run **`backfill_user_roles_and_student_profiles.sql`** (see step 5).
- To log in as admin, follow **step 6** (Option A: run insert_admin_user.sql with your email/password; or Option B: create a user then run promote_user_to_admin.sql).

---

## 8. Admin: Add Instructor (invite flow)

Admins can invite instructors from **Admin Dashboard → Instructors → Add Instructor**. The instructor receives an email to set their password, then signs in on the same login page and is redirected to the Instructor Dashboard.

**8a. Run the instructor_profiles migration (if you use the Add Instructor feature):**

- **`migrations/20260303100000_instructor_profiles_add_title.sql`**  
  - Adds optional `title` to `instructor_profiles`.

**8b. Service role key (required for invite):**

1. In Supabase Dashboard: **Settings** → **API** → copy the **service_role** key (secret).
2. In your app `.env.local`, add:
   - `SUPABASE_SERVICE_ROLE_KEY=<paste service_role key>`
3. Never expose this key to the client; it is used only in the server API route that sends invites and inserts into `users` and `instructor_profiles`.

**8c. Site URL and Redirect URLs (fix invite email link and text):**

The invite email shows a URL and link. Both must point to your **frontend** (e.g. `http://localhost:3001`), not the backend.

1. In Supabase Dashboard: **Authentication** → **URL Configuration**.
2. Set **Site URL** to your app (frontend) origin, e.g.:
   - `http://localhost:3001` (development)
   - `https://yourdomain.com` (production)  
   This is the URL shown in the email body (“You have been invited to create a user on …”) and used for redirects.
3. Add to **Redirect URLs** (one per line):
   - `http://localhost:3001/login`
   - `https://yourdomain.com/login` (production)

**8d. App URL in .env.local**

Set your frontend URL so the invite API sends the correct redirect:

- `NEXT_PUBLIC_APP_URL=http://localhost:3001` (or your production URL)

**8e. Invite link must use ConfirmationURL:** If "Accept the invite" sends users to the login page with no set-password step, the email link is wrong. In **Authentication** → **Email Templates** → **Invite**, set the clickable link href to **`{{ .ConfirmationURL }}`** (not `{{ .SiteURL }}`). Example: `<a href="{{ .ConfirmationURL }}">Accept the invite</a>`. Save.

**8e2. Customize invite email (optional):**

To change the invite email from “create a user” to “set your password for MULE LMS”:

1. In Supabase Dashboard: **Authentication** → **Email Templates**.
2. Open the **Invite** template.
3. Edit the subject/body (e.g. “Set your MULE LMS instructor password”) and save.

**8f. Invite email not sending (required for real instructor invites):**

By default, Supabase **only sends auth emails (including invite emails) to addresses that are in your project’s organization team**. Other addresses are not sent emails unless you configure custom SMTP.

- **For testing:** Add the instructor’s email as a member of your Supabase organization: **Organization settings** → **Team** → invite that email. Then the default Supabase mailer can send to them (subject to rate limits, e.g. 2 emails/hour).
- **For production (recommended):** Configure **custom SMTP** so invite emails can go to any instructor:
  1. In Supabase Dashboard: **Authentication** → **SMTP** (or **Project Settings** → **Auth** → SMTP).
  2. Enable custom SMTP and enter your provider’s settings (host, port, user, password, sender address).  
     Use a transactional email service (e.g. [Resend](https://resend.com/docs/send-with-supabase-smtp), [SendGrid](https://www.twilio.com/docs/sendgrid), [Brevo](https://www.brevo.com), [Postmark](https://postmarkapp.com), AWS SES, etc.).
  3. Save. After this, invite emails will be sent to any email address (within your SMTP rate limits).

If you do not set up custom SMTP and the instructor’s email is not on the org team, the user may be created in Auth and in `users`/`instructor_profiles`, but **the invitation email will not be delivered**.
