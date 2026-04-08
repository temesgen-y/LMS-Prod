# Database Schema Outline (PostgreSQL)

Core tables for the Enterprise LMS. All primary keys are `uuid` unless noted. Use migrations for all changes; soft delete where indicated.

## Core Tables

### Identity & RBAC

- **users** — id, email, name, avatar_url, external_id (OIDC sub), tenant_id, created_at, updated_at, deleted_at (soft).
- **roles** — id, name, description, created_at, updated_at.
- **permissions** — id, resource, action, description, created_at.
- **user_roles** — user_id (FK), role_id (FK), assigned_at; unique (user_id, role_id).
- **role_permissions** — role_id (FK), permission_id (FK); unique (role_id, permission_id).

### Courses & Content

- **courses** — id, title, slug, description, status (draft|published), tenant_id, created_at, updated_at, deleted_at (soft).
- **course_modules** — id, course_id (FK), title, order_index, created_at, updated_at, deleted_at (soft).
- **lessons** — id, module_id (FK), title, content (text/html), order_index, created_at, updated_at, deleted_at (soft).

### Enrollments

- **enrollments** — id, user_id (FK), course_id (FK), status (active|completed|dropped), enrolled_at, completed_at, created_at, updated_at, deleted_at (soft). Unique (user_id, course_id).

### Assignments & Grades

- **assignments** — id, course_id (FK), title, description, due_at, max_score, created_at, updated_at, deleted_at (soft).
- **submissions** — id, user_id (FK), assignment_id (FK), status (draft|submitted|graded), submitted_at, created_at, updated_at.
- **grades** — id, submission_id (FK), score, feedback (text), graded_by (FK users), graded_at, created_at, updated_at.

### Discussions

- **discussions** — id, course_id (FK), user_id (FK), title, body, created_at, updated_at, deleted_at (soft).
- **comments** — id, discussion_id (FK), user_id (FK), body, created_at, updated_at, deleted_at (soft).

### Notifications & Auth

- **notifications** — id, user_id (FK), type, title, body (jsonb payload), read, created_at.
- **refresh_tokens** — id, user_id (FK), token_hash, expires_at, family_id, revoked_at, created_at.

### Audit

- **audit_logs** — id, user_id (FK nullable), action, resource, resource_id, meta (jsonb), ip, user_agent, created_at.

## Indexes (Recommended)

- users: (email), (external_id), (tenant_id), (deleted_at).
- user_roles: (user_id), (role_id).
- role_permissions: (role_id), (permission_id).
- courses: (tenant_id), (status), (deleted_at).
- enrollments: (user_id), (course_id), (status).
- assignments: (course_id).
- submissions: (assignment_id), (user_id).
- refresh_tokens: (token_hash), (user_id), (expires_at).
- audit_logs: (user_id), (resource, resource_id), (created_at).

## Analytics-Ready

- Keep audit_logs and event-like data append-only where possible.
- Consider materialized views or summary tables for gradebook and enrollment analytics.
- Use partitioning on audit_logs by created_at for very large volumes.
