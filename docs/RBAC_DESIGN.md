# RBAC Design Model

## Overview

- **Roles:** Named sets of permissions (e.g. SuperAdmin, Admin, Instructor, TeachingAssistant, Student, Guest).
- **Permissions:** Fine-grained `resource:action` (e.g. course:create, grade:read, user:delete).
- **Mapping:** Users ↔ Roles (user_roles), Roles ↔ Permissions (role_permissions).
- **Enforcement:** Backend guards on every protected route; frontend role-based UI and route protection.

## Role Hierarchy (Conceptual)

| Role | Typical scope |
|------|----------------|
| SuperAdmin | Full system; tenant and user management |
| Admin | Tenant-level; courses, users, settings |
| Instructor | Own courses; gradebook, assignments, discussions |
| TeachingAssistant | Assigned courses; grade/comment |
| Student | Enrolled courses; submit, view grades, discuss |
| Guest | Public catalog only (optional) |

## Permission Matrix (Example)

| Permission | SuperAdmin | Admin | Instructor | TA | Student |
|------------|------------|-------|------------|----|--------|
| user:read | ✓ | ✓ (tenant) | — | — | — |
| user:create | ✓ | ✓ | — | — | — |
| user:update | ✓ | ✓ | — | — | — |
| user:delete | ✓ | ✓ | — | — | — |
| course:read | ✓ | ✓ | ✓ (own) | ✓ (assigned) | ✓ (enrolled) |
| course:create | ✓ | ✓ | ✓ | — | — |
| course:update | ✓ | ✓ | ✓ (own) | — | — |
| course:delete | ✓ | ✓ | ✓ (own) | — | — |
| enrollment:create | ✓ | ✓ | ✓ (own course) | — | Self if allowed |
| grade:read | ✓ | ✓ | ✓ (own course) | ✓ (assigned) | Own only |
| grade:write | ✓ | ✓ | ✓ (own course) | ✓ (assigned) | — |
| assignment:create | ✓ | ✓ | ✓ (own course) | ✓ (assigned) | — |
| audit:read | ✓ | ✓ | — | — | — |

## Backend Implementation

1. **Resolve user → roles → permissions** from DB (or cache) after JWT validation.
2. **Guard:** `@UseGuards(JwtAuthGuard, PermissionsGuard)` and `@RequirePermissions('course:create')` (or custom decorator).
3. **Resource-level:** For "own course" or "enrolled," resolve resource (e.g. courseId) from params/body and check enrollment or ownership in service/guard.
4. **Exception filter:** Return 403 with consistent message when permission check fails.

## Frontend Implementation

1. **AuthGuard:** Redirect unauthenticated users to login (e.g. `/login`).
2. **RoleGuard:** Hide or disable UI for roles that lack permission; protect routes so only allowed roles can access.
3. **Data:** User roles (and optionally permissions) in store after login; use for conditional rendering and route guards.

## Token and Caching

- JWT can include `roles` (and optionally top-level permissions) to avoid DB hit on every request.
- Cache permission set per user in Redis with short TTL for high traffic; invalidate on role/permission change.
