# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (Next.js — runs on port 3001)
```bash
cd frontend
npm run dev       # Start dev server at http://localhost:3001
npm run build     # Production build
npm run lint      # ESLint
```

### Backend (Express.js — runs on port 3000)
```bash
cd backend
npm run dev     # Watch mode with nodemon
npm run build   # Compile TypeScript
npm start       # Run compiled output (no test suite yet)
```

## Architecture

This is a university Learning Management System with two separate apps:

- **`frontend/`** — Next.js 15 (React 19), TypeScript, TailwindCSS, Supabase SSR (`@supabase/ssr`)
- **`backend/`** — Express.js (TypeScript) with Clean Architecture / DDD (scaffolded but not yet fully implemented; current auth and data flows run entirely through Supabase from the frontend)
- **`supabase/migrations/`** — All DB migrations. `lmsv6.sql` is the base schema; incremental `.sql` files extend it. Apply all in order in the Supabase SQL editor.
- **`docs/`** — Architecture reference documents.

## User Roles & Auth Flow

There is a **single login page** (`/login`) for all roles. After login, users are redirected based on the `role` column in `public.users`:

| Role value | Redirect |
|---|---|
| `admin` | `/admin/dashboard` |
| `instructor` | `/instructor/dashboard` |
| `student` | `/dashboard` |
| `registrar` | `/registrar/dashboard` |
| `department_head` | `/dept-head/home` |
| `academic_advisor` | `/advisor/dashboard` |
| `it_admin` | `/it-admin/dashboard` |

**How users are created:**
- **Admin**: seeded directly in the database
- **Instructor**: created by admin only — via invite email (Supabase `inviteUserByEmail`), never self-registered. Instructor completes account setup at `/setup-password?token=<UUID>`.
- **Student**: self-registers via the signup page (`/signup`). New student accounts require admin approval before they can log in.

**Role detection** (`src/lib/auth/get-user-roles.ts`): Reads `public.users.role` column. Falls back to checking which profile table has a row if the column is unset. Priority (from `src/types/auth.ts`): ADMIN > DEPARTMENT_HEAD > INSTRUCTOR > STUDENT > REGISTRAR > ACADEMIC_ADVISOR > IT_ADMIN.

## Frontend Portal Areas

Each route prefix has its own layout that enforces role access server-side:

| Route prefix | Role(s) allowed | Layout |
|---|---|---|
| `/dashboard` | `student` only | `src/app/dashboard/layout.tsx` |
| `/instructor` | `instructor` or `admin` | `src/app/instructor/layout.tsx` |
| `/admin` | `admin` only | `src/app/admin/layout.tsx` |
| `/registrar` | `registrar` or `admin` | `src/app/registrar/layout.tsx` |
| `/dept-head` | `department_head` or `admin` | `src/app/dept-head/layout.tsx` |
| `/advisor` | `academic_advisor` or `admin` | `src/app/advisor/layout.tsx` |
| `/it-admin` | `it_admin` or `admin` | `src/app/it-admin/layout.tsx` |
| `/setup-password` | unauthenticated (invite flow) | standalone page |

Layouts call `getUserRoleNames()` → `getHighestRole()` and redirect to the correct portal or `/unauthorized` if role doesn't match.

**Middleware** (`src/middleware.ts`): Refreshes Supabase session on every request; redirects unauthenticated users accessing `/dashboard`, `/admin`, or `/instructor` to `/login?next=...`.

**Supabase clients** (`src/lib/supabase/`):
- `client.ts` — browser client
- `server.ts` — server component / Route Handler client (reads cookies)
- `middleware.ts` — session refresh for Next.js middleware
- `admin.ts` — service-role client; bypasses RLS; **server-only**

## Key API Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/admin/instructors/invite` | admin | Calls Supabase `inviteUserByEmail`; upserts `users` + `instructor_profiles`; creates `instructor_invites` token |
| `GET` | `/api/invite/validate?token=<UUID>` | none | Validates invite token; returns `{ valid, email }`. Rate-limited: 10/token/5 min |
| `POST` | `/api/invite/set-password` | none | Completes invite flow: validates token → policy check → breach check → sets password via admin API → marks token used. Rate-limited: 5/token/15 min |
| `POST` | `/api/validate-password` | none | Server-side password policy + HaveIBeenPwned breach check. Rate-limited: 20/IP/min |
| `GET` | `/api/admin/students/pending` | admin | Lists students awaiting approval |
| `POST` | `/api/admin/students/[id]/approve` | admin | Approves a pending student |
| `POST` | `/api/admin/students/[id]/reject` | admin | Rejects a pending student |
| `GET` | `/api/admin/dashboard-stats` | admin | Returns aggregate dashboard statistics |
| `POST` | `/api/admin/admins` | admin | Admin management |
| `POST` | `/api/admin/staff/create` | admin | Create staff user (registrar / dept-head / advisor / it-admin) |
| `GET` | `/api/admin/staff/registrars` | admin | List registrar users |
| `POST` | `/api/admin/instructors/assign-department` | admin | Assign instructor to a department |
| `DELETE` | `/api/admin/instructors/delete` | admin | Delete an instructor |
| `POST` | `/api/payments/chapa/initialize` | student | Initialize Chapa payment for fees |
| `GET` | `/api/payments/chapa/verify` | student | Verify Chapa payment status |
| `POST` | `/api/payments/chapa/webhook` | none | Chapa payment webhook handler |
| `GET` | `/api/certificates/[id]/generate-pdf` | auth | Generate certificate PDF via `pdf-lib` |
| `GET` | `/api/supabase-health` | none | Supabase connectivity health check |

## Security Layer (`src/lib/security/`)

- **`password.ts`** — `validatePasswordPolicy(password, userInputs)`: enforces complexity rules and blocks use of personal identifiers in the password
- **`breachCheck.ts`** — `checkPasswordBreach(password)`: calls the HaveIBeenPwned k-anonymity API; returns `{ checked, count }`
- **`rateLimit.ts`** — In-memory sliding-window rate limiter. `LIMITS.validatePassword(ip)`, `LIMITS.validateInvite(token)`, `LIMITS.setPassword(token)`

## Student Class View Navigation

The class view (`/dashboard/class/[id]/`) uses a **tab bar** layout rather than a sidebar:

- **Persistent dashboard sidebar** stays visible at all times (not replaced by a class-specific sidebar)
- **Top tab bar** (rendered by `src/app/dashboard/class/[id]/layout.tsx`) contains:
  - Dynamic **topic tabs** (T1, T2, … TN) — one per visible `course_module`, ordered by `sort_order`
  - Static tabs: Calendar, Announcements, Syllabus, Gradebook, Forums
- Topic routes follow the pattern `/dashboard/class/[id]/t<N>` where N is 1-based module index
  - `/t1`–`/t4` are static Next.js pages; `/t5+` are handled by the dynamic `[topicSlug]` catch-all

## Video Handling (`src/utils/videoUtils.ts`)

Utilities for safe YouTube embedding in lesson content:

- `extractYoutubeId(url)` — parses all YouTube URL formats (watch, youtu.be, embed, nocookie)
- `buildSafeYoutubeUrl(videoId)` — returns a `youtube-nocookie.com` embed URL with tracking/branding params minimized
- `isYoutubeUrl(url)` — detects YouTube URLs
- `preprocessRichTextHtml(html)` — DOM-parses rich-text HTML, rewrites YouTube iframes to safe nocookie embeds, overlays black divs to hide "Watch on YouTube" / "Copy link" buttons, and disables plain YouTube anchor links

**`ProtectedVideoPlayer`** component (`src/components/student/ProtectedVideoPlayer.tsx`): renders YouTube videos via `buildSafeYoutubeUrl` with overlay protection, or plain `<iframe>` for non-YouTube sources.

## Database Schema

**Base schema:** `supabase/migrations/lmsv6.sql` (PostgreSQL, 36 tables). Apply all migration files in the `supabase/migrations/` directory in filename order.

### Incremental migrations (applied on top of lmsv6.sql)

| Migration file | What it adds |
|---|---|
| `20260301000000_base_tables_and_roles.sql` | Base tables and role setup |
| `20260303100000_instructor_profiles_add_title.sql` | `title` column on `instructor_profiles` |
| `20260303110000_instructor_profiles_employment_status_check.sql` | Employment status check constraint |
| `20260308000001_student_approval_rpcs.sql` | RPCs for student approval workflow |
| `20260308000003_announcements_status_dates.sql` | Status + date fields on `announcements` |
| `20260310000001_messaging.sql` | `conversations`, `messages`, `message_attachments` tables |
| `20260310000002_forum_reply_count_trigger.sql` | Auto-maintained `reply_count` on forum threads |
| `20260310000003_forum_thread_dates.sql` | Date fields on forum threads |
| `20260310000004_study_groups.sql` | `study_groups`, `study_group_members`, `study_group_messages`, `study_group_attachments` |
| `20260310000007_drop_study_groups_rls.sql` | RLS dropped from study group tables |
| `20260311000001_drop_assignments_pass_score.sql` | Removes deprecated `pass_score` from assignments |
| `20260314000001_grading_constraints.sql` | Grading check constraints |
| `20260314000002_assessment_attachments.sql` | Attachments on assessments |
| `20260315000001_attempt_text_response.sql` | Text response field on assessment attempts |
| `20260315000002_student_answer_attachments.sql` | Attachments on student answers |
| `20260315000004_drop_grades_merge_into_gradebook_items.sql` | Merges grades into gradebook items |
| `20260315000005_fix_grading_system.sql` | Grading system fixes |
| `20260315000006_course_offerings_syllabus.sql` | `syllabus` field on `course_offerings` |
| `20260315000007_course_content_sort_order.sql` | `sort_order` on modules/items |
| `20260315000008_lesson_progress_grants.sql` | DB grants for lesson progress table |
| `20260322000001_instructor_invites.sql` | `instructor_invites` table (single-use UUID token, 48 h expiry) |
| `002_expansion_rls.sql` | Extends role constraint; adds RLS for expanded roles (registrar, department_head) |
| `20260401000001_staff_profiles.sql` | `registrar_profiles`, `department_head_profiles`, `academic_advisor_profiles`, `it_admin_profiles`; extends `users.role` check to all 7 roles |
| `20260401000002_leave_management.sql` | Leave management tables for staff |
| `20260401000003_dept_head_profiles_appointed_at.sql` | `appointed_at` column on `department_head_profiles` |
| `20260401000004_instructor_profiles_department_id.sql` | `department_id` FK on `instructor_profiles` |
| `20260401000006_instructor_profiles_grants.sql` | DB grants for instructor profiles table |
| `20260402000001_student_profile_policies.sql` | Student profile access policies |
| `20260405000001_registration_academic_tables.sql` | Academic registration tables |
| `20260406000002_academic_calendar_ensure.sql` | Ensures academic calendar configuration |
| `20260408000001_fix_users_access.sql` | Fixes PostgREST access grants on users table |
| `20260421000001_chapa_payments.sql` | Chapa payment integration tables |
| `20260421000002_student_profiles_program_id.sql` | `program_id` FK on `student_profiles` |
| `20260421000003_notifications_payment_due.sql` | Payment-due notification type support |

### Core tables (from lmsv6.sql)

| # | Table | Purpose |
|---|---|---|
| 01 | `users` | All users. `role` in (`admin`,`instructor`,`student`). `auth_user_id` links to Supabase Auth. `status` in (`active`,`inactive`,`suspended`,`pending`) |
| 02 | `admin_profiles` | 1-to-1 extended profile for admins |
| 03 | `instructor_profiles` | 1-to-1 extended profile for instructors. `created_by` (admin) is required. Has `title` and `employment_status` fields |
| 04 | `student_profiles` | 1-to-1 extended profile for students. `student_no` auto-generated by app |
| 05 | `institution_settings` | Single-row config (grading scale, features, term defaults as JSONB) |
| 06 | `departments` | University departments |
| 07 | `academic_programs` | Degree programs per department |
| 08 | `academic_terms` | Semesters/terms. Only one `is_current = true` enforced by partial unique index |
| 09 | `courses` | Master course catalogue (what is taught) |
| 10 | `course_offerings` | A course running in a specific term/section. Has `syllabus` field. Students enrol here |
| 11 | `course_instructors` | Who teaches an offering. One `primary` instructor enforced per offering |
| 12 | `course_modules` | Content modules within an offering (support drip release via `unlock_date`; ordered by `sort_order`) |
| 13 | `lessons` | Content units: `video`, `document`, `link`, `scorm` only |
| 14 | `attachments` | Generic file metadata (Supabase Storage URL) |
| 15 | `lesson_materials` | Link table: lessons ↔ attachments |
| 16 | `live_sessions` | Scheduled live/virtual sessions |
| 17 | `course_module_items` | Ordered items within a module (lesson / assessment / assignment / live_session); ordered by `sort_order` |
| 18 | `enrollments` | Student ↔ course_offering. `enrolled_count` auto-maintained by trigger |
| 19 | `lesson_progress` | Per-student lesson completion tracking |
| 20 | `attendance` | Attendance records |
| 21 | `assessments` | Quizzes/exams (supports file attachments) |
| 22 | `questions` | Questions for assessments |
| 23 | `question_options` | Answer options for questions |
| 24 | `assessment_attempts` | Student quiz attempts (supports text response field) |
| 25 | `student_answers` | Per-question answers in an attempt (supports file attachments) |
| 26 | `assignments` | Assignment definitions |
| 27 | `assignment_submissions` | Student submissions |
| 28 | `grades` | Grades (merged into gradebook_items — see migration `20260315000004`) |
| 29 | `gradebook_items` | Gradebook configuration (supports both assessment and assignment) |
| 30 | `live_session_attendance` | Attendance for live sessions |
| 31 | `announcements` | Course/system announcements (has `status` + date fields) |
| 32 | `forum_threads` | Discussion forum threads (auto-maintained `reply_count`) |
| 33 | `forum_posts` | Posts in forum threads |
| 34 | `notifications` | In-app notifications |
| 35 | `certificates` | Completion certificates |
| 36 | `audit_logs` | Sensitive action trail |

### Additional tables (from incremental migrations)

| Table | Purpose |
|---|---|
| `instructor_invites` | Single-use invite tokens for instructor onboarding. 48 h expiry. No RLS — service-role only. |
| `registrar_profiles` | 1-to-1 extended profile for registrars. `staff_no`, `department`, `profile_status` |
| `department_head_profiles` | 1-to-1 extended profile for department heads. Links to `departments.id` |
| `academic_advisor_profiles` | 1-to-1 extended profile for academic advisors. `staff_no`, `specialization` |
| `it_admin_profiles` | 1-to-1 extended profile for IT admins. `access_level` in (`standard`, `super`) |
| `conversations` | One per student ↔ instructor pair per offering |
| `messages` | Messages within a conversation |
| `message_attachments` | File attachments on messages |
| `study_groups` | Student-created groups per course offering |
| `study_group_members` | Membership in study groups |
| `study_group_messages` | Chat messages within a study group |
| `study_group_attachments` | File attachments on study group messages |

### Key DB rules
- `users.role` check: `'admin'`, `'instructor'`, `'student'`, `'registrar'`, `'department_head'`, `'academic_advisor'`, `'it_admin'` (all lowercase)
- `instructor_profiles.created_by` is `NOT NULL` — instructors can only be created by an admin
- `course_offerings.enrolled_count` is auto-maintained by a trigger
- Only one `academic_terms.is_current = true` at a time (partial unique index)
- Email uniqueness is case-insensitive (`lower(email)` unique index)
- All tables with `updated_at` use the `set_updated_at()` trigger function
- **No RLS** on any table — do not add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` or `CREATE POLICY` statements

## Environment Variables

Frontend (`frontend/.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # Server-only; never expose to client
NEXT_PUBLIC_APP_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3000
```

Backend (`backend/.env`, see `backend/.env.example`):
```
PORT=3000
JWT_SECRET=
JWT_EXPIRES_IN=15m
```

## Key Conventions

- **`SUPABASE_SERVICE_ROLE_KEY`** must only be used server-side (Route Handlers, server components). It bypasses RLS.
- Role values in `users.role` are **lowercase** (`admin`, `instructor`, `student`) but the app code normalizes to uppercase (`ADMIN`, `INSTRUCTOR`, `STUDENT`) for comparisons via `getUserRoleNames()`.
- The Express backend follows Clean Architecture / DDD: domain layer has no framework imports; infrastructure and interface layers depend on domain, not vice versa. Backend API uses `/v1/` path versioning.
- **All DB changes** go in `supabase/migrations/` as timestamped `.sql` files (e.g., `20260322000001_instructor_invites.sql`). Do not paste migration SQL in chat — write it directly to the migrations folder.
- **No RLS** anywhere in the schema. Do not add row-level security policies.
- Password policy and breach checks are always enforced **server-side** (never trust client-side validation alone).
