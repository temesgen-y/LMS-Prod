# Enterprise Learning Management System (LMS)

Production-grade, enterprise LMS comparable in capability and scalability to Halo Learn. Modular, secure, scalable, and cloud-ready.

## Repository Structure

| Path | Description |
|------|-------------|
| **docs/** | System design, architecture, backend/frontend structure, DB schema, auth flow, RBAC, API examples, security, scalability, deployment, login design reference |
| **backend/** | NestJS API (Clean Architecture / DDD): Application, Domain, Infrastructure, Interface |
| **frontend/** | Next.js (React 19), TypeScript, TailwindCSS, TanStack Query, Zustand/Redux, ShadCN UI |
| **assets/** | Design reference images (e.g. login page) |

## Design Reference

The login experience follows the provided reference: **purple-tinted background**, **central white card**, **"Log in to your account"**, **"Sign in with Microsoft"** (OAuth 2.0 / OpenID Connect). See `docs/LOGIN_DESIGN_REFERENCE.md`.

## Key Documents

1. **docs/SYSTEM_DESIGN.md** — High-level architecture, backend/frontend structure, DB schema outline, auth flow, RBAC, API examples, security, scalability, deployment (all 10 expected outputs).
2. **docs/BACKEND_STRUCTURE.md** — Backend folder structure and module mapping.
3. **docs/FRONTEND_STRUCTURE.md** — Frontend folder structure and design reference.
4. **docs/DATABASE_SCHEMA.md** — PostgreSQL schema outline and indexes. **Canonical schema:** `supabase/migrations/lmsv6.sql` (run in Supabase SQL Editor).
5. **docs/API_EXAMPLES.md** — REST API structure and examples.
6. **docs/RBAC_DESIGN.md** — RBAC model and permission matrix.
7. **docs/SECURITY_STRATEGY.md** — Security strategy documentation.
8. **docs/SCALABILITY_AND_DEPLOYMENT.md** — Scalability and deployment readiness.
9. **docs/LOGIN_DESIGN_REFERENCE.md** — Login page design and implementation notes.

## Tech Stack

- **Frontend:** Next.js (React 19), TypeScript, TailwindCSS, TanStack Query, Zustand/Redux Toolkit, ShadCN UI
- **Backend:** Node.js, NestJS, TypeScript, Clean Architecture / DDD
- **Database:** PostgreSQL (migrations, soft delete, indexing)
- **Auth:** OAuth 2.0, JWT (short-lived), refresh tokens (hashed, rotated), RBAC; optional SSO (SAML, OpenID Connect / Microsoft)
- **Non-functional:** Horizontal scaling, multi-tenant readiness, structured logging, API versioning, tests (unit + integration)

## How to run

### Prerequisites

- **Node.js** 20+ and **npm**
- **PostgreSQL** (for backend; optional for frontend-only)
- **Redis** (optional for backend until you need cache/rate limit)

### Backend (NestJS)

```bash
cd backend
npm install
cp .env.example .env
# Edit .env: set DATABASE_URL, REDIS_URL (optional), JWT_SECRET
npm run start:dev
```

API runs at **http://localhost:3000** (or the port in `.env`). Health: `GET http://localhost:3000/health`.

### Frontend (Next.js)

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Edit .env.local: set NEXT_PUBLIC_API_URL (e.g. http://localhost:3000)
npm run dev
```

App runs at **http://localhost:3001** (or 3000 if backend uses another port).

### Run both (two terminals)

1. **Terminal 1:** `cd backend && npm run start:dev`
2. **Terminal 2:** `cd frontend && npm run dev`

Then open the frontend URL in your browser.

---

## Quick Start (reference)

- **Backend:** See `backend/README.md` (install, env, migrations, start).
- **Frontend:** See `frontend/README.md` (install, env, dev, build).

## Engineering Standards

- Clean code, SOLID, dependency inversion, no tight coupling.
- Production-ready, extensible for future microservices extraction.
# LMS-Prod
