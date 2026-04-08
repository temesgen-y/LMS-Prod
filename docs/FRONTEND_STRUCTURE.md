# Frontend Project Structure (Next.js)

This document details the frontend folder structure for the Enterprise LMS. It uses **Next.js (React 19)**, **TypeScript**, **TailwindCSS**, **TanStack Query**, **Zustand/Redux**, and **ShadCN UI** (or custom design system).

## Design Reference: Login Page

The login page should match the provided reference:

- **Background:** Full-viewport image with purple overlay (campus/sunset aesthetic).
- **Card:** Single centered white card; logo at top; "Log in to your account"; primary CTA: **"Sign in with Microsoft"** (OAuth 2.0 / OpenID Connect).
- **Optional:** Partner branding (e.g. "Premier Financial Partner") below the button.
- **Accessibility:** WCAG contrast, focus states, keyboard navigation.

## Layer Responsibilities

| Area | Path | Responsibility |
|------|------|----------------|
| **Pages** | `app/` | Routes, layouts, SSR where needed |
| **Features** | `features/*` | Feature-specific components, hooks, store, types |
| **Shared UI** | `shared/components/` | Design system, layout, feedback |
| **Services** | `services/api/` | API client, TanStack Query usage |
| **Store** | `store/` | Global state (auth, user) |
| **Guards** | `guards/` | Protected routes, role-based rendering |

## Key Conventions

- **SSR:** Use for landing and SEO-critical pages; dashboard can be client-rendered after auth.
- **API proxying:** Use `app/api/[...proxy]/route.ts` if needed to avoid CORS and hide backend URL.
- **TanStack Query:** Server state in `features/*/hooks` or `services/api`; optimistic updates where applicable.
- **Protected routes:** `AuthGuard` + `RoleGuard` in `(dashboard)/layout.tsx`.
- **Token handling:** Access token in memory or short-lived cookie; refresh via `/auth/refresh` before expiry.
- **WebSocket:** `services/websocket/notifications.client.ts` for real-time notifications (structure ready).

## Design Tokens (Login / Brand)

- Purple primary (e.g. `hsl(270 60% 40%)`) for logo and accents.
- White card: `bg-white rounded-lg shadow-xl`.
- Microsoft button: blue (`#0078d4` or design system primary).
- Background: `bg-gradient` or image + `bg-purple-900/60` overlay.
