# Enterprise LMS — Frontend (Next.js)

Production-grade Next.js app (React 19, TypeScript, TailwindCSS, TanStack Query, Zustand/Redux, ShadCN UI). See `docs/SYSTEM_DESIGN.md` and `docs/FRONTEND_STRUCTURE.md`.

## Design Reference

Login page: purple-tinted background, central white card, "Sign in with Microsoft" (OAuth 2.0 / OpenID Connect). See `docs/LOGIN_DESIGN_REFERENCE.md`.

## Stack

- Next.js (App Router), React 19, TypeScript
- TailwindCSS, ShadCN UI (or custom design system)
- TanStack Query, Zustand or Redux Toolkit
- Protected routes, role-based UI, token-based session

## Setup

```bash
npm install
cp .env.local.example .env.local
# Configure NEXT_PUBLIC_API_URL, OIDC_* etc.
npm run dev
```

## Structure

- `app/` — Routes, layouts (auth, dashboard)
- `features/` — Feature modules (auth, courses, enrollments, etc.)
- `shared/` — Components, hooks, lib, types
- `services/` — API client, WebSocket-ready
- `store/` — Global state
- `guards/` — AuthGuard, RoleGuard

## Build

```bash
npm run build
npm run start
```

## Troubleshooting: build errors

**"ENOENT preflight.css"** or **"Can't resolve 'next-flight-client-entry-loader'"** usually mean a bad or mismatched install.

1. **Stop the dev server** (Ctrl+C where `npm run dev` is running).
2. **Clean reinstall** (in `frontend` folder):
   ```powershell
   Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
   Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
   Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
   npm install
   ```
3. Run `npm run dev` again.

Versions are pinned in `package.json`: Next.js `14.2.18`, React `18.2.x`, Tailwind `3.4.16`. If delete fails (e.g. "access denied"), close the IDE and any terminals using the project, then retry or delete `node_modules` and `.next` in File Explorer before `npm install`.
