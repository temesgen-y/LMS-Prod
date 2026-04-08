# Enterprise LMS — Backend (NestJS)

Production-grade NestJS API following Clean Architecture / DDD. See `docs/SYSTEM_DESIGN.md` and `docs/BACKEND_STRUCTURE.md`.

## Stack

- Node.js, NestJS, TypeScript
- PostgreSQL (TypeORM or Prisma)
- Redis (cache, rate limit, sessions)
- JWT + OAuth 2.0 / OpenID Connect (Microsoft SSO)
- class-validator, global filters, interceptors

## Setup

```bash
npm install
cp .env.example .env
# Configure DATABASE_URL, REDIS_URL, JWT_SECRET, OIDC_* etc.
npm run migration:run
npm run start:dev
```

## Structure

- `src/application/` — Use cases
- `src/domain/` — Entities, interfaces (no framework)
- `src/infrastructure/` — DB, auth, external
- `src/interface/http/` — Controllers, DTOs
- `src/modules/` — NestJS feature modules

## Tests

```bash
npm run test
npm run test:e2e
```
