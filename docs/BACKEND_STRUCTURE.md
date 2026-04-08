# Backend Folder Structure (NestJS)

This document details the backend folder structure for the Enterprise LMS API. It follows **Clean Architecture / DDD** with strict dependency inversion.

## Layer Responsibilities

| Layer | Path | Responsibility |
|-------|------|----------------|
| **Application** | `src/application/` | Use cases (commands/queries), orchestration |
| **Domain** | `src/domain/` | Entities, repository/service interfaces (no framework) |
| **Infrastructure** | `src/infrastructure/` | DB, auth, external APIs, messaging |
| **Interface** | `src/interface/http/` | Controllers, DTOs, versioning |

## Module Mapping to Requirements

| Requirement | NestJS Module | Application Use Cases |
|-------------|---------------|------------------------|
| Authentication | `auth` | Login (OAuth callback), Refresh, Logout |
| User & Role Management | `users` | CRUD users, assign roles |
| Course Management | `courses` | CRUD courses, modules, lessons |
| Enrollment | `enrollments` | Enroll/unenroll, list by course/user |
| Assignment & Submission | `assignments` | CRUD assignments, create submissions |
| Gradebook | `gradebook` | Read grades, write grades (instructor) |
| Discussion | `discussions` | CRUD discussions, comments |
| Notification | `notifications` | Create, list, mark read |
| Audit & Logging | `audit` | Write audit events, query (admin) |

## Key Files (Reference)

- **Guards:** `common/guards/jwt-auth.guard.ts`, `roles.guard.ts`, `permissions.guard.ts`
- **Filters:** `common/filters/http-exception.filter.ts`
- **Interceptors:** `common/interceptors/logging.interceptor.ts`, `transform.interceptor.ts`
- **Config:** `common/config/configuration.ts` (env-based)
- **DTOs:** `interface/http/controllers/dto/*` with class-validator
- **Migrations:** `infrastructure/persistence/typeorm/migrations/` (or equivalent)

Dependency rule: **Domain** has no imports from NestJS or Infrastructure. Application depends on Domain interfaces; Infrastructure and Interface implement them.
