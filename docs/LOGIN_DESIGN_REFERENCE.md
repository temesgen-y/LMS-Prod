# Login Page Design Reference

This document describes the target login experience, aligned with the provided reference (enterprise SSO, branded purple background, central white card).

## Visual Reference

- **Reference image:** `assets/c__Users_Masresha_AppData_Roaming_Cursor_User_workspaceStorage_727341bb0ca528c6cfff0c02df6d7354_images_image-9e0f9573-f9a7-4bf8-87ce-4dcf681b8f1b.png` (in workspace: purple-tinted aerial background, central white card, "Sign in with Microsoft")
- **Style:** Grand Canyon University–style login: purple-tinted aerial background, central white card, “Sign in with Microsoft.”

## Layout & Structure

1. **Background**
   - Full-viewport image (e.g. campus/sunset).
   - Purple overlay (e.g. `bg-purple-900/60` or gradient) for brand consistency and readability.
   - Ensure WCAG contrast for any text on background.

2. **Login Card (Central)**
   - Single white card, centered (flex/grid).
   - Rounded corners (e.g. `rounded-lg` or `rounded-xl`).
   - Shadow (e.g. `shadow-xl`).
   - Max width (e.g. 400–480px) for readability.

3. **Card Content (Top to Bottom)**
   - **Institution logo:** At top of card (e.g. “GRAND CANYON UNIVERSITY” style or your institution).
   - **Heading:** “Log in to your account” (clear, accessible text).
   - **Primary CTA:** Single button: **“Sign in with Microsoft”** (OAuth 2.0 / OpenID Connect).
   - **Optional:** Partner or footer branding below the button (e.g. “The Premier Financial Partner of …”).

## Technical Implementation

- **Route:** Frontend login page (e.g. `app/(auth)/login/page.tsx`).
- **Auth flow:** Redirect to Microsoft authorization URL; handle callback at `/auth/callback`; backend exchanges code for tokens.
- **Design system:** Tailwind + design tokens (purple primary, white card, blue Microsoft button).
- **Accessibility:** WCAG contrast, focus states, keyboard navigation, no reliance on color alone; aria-labels where needed.

## Design Tokens (Suggested)

- **Primary (brand):** Purple (e.g. `hsl(270 60% 40%)` or design system equivalent).
- **Card:** `bg-white`, `rounded-xl`, `shadow-xl`, padding.
- **Microsoft button:** Blue (e.g. `#0078d4`) or design system primary; white text; hover state.
- **Background overlay:** `bg-purple-900/60` or `bg-gradient-to-b from-purple-900/70 to-purple-950/80`.

## Security

- Use PKCE and state for OAuth flow.
- Redirect URI allowlist; exchange code only on backend.
- No client_secret in frontend.

Implement this in the Next.js app under the auth group layout, with shared layout for auth pages (e.g. centered, full-height).
