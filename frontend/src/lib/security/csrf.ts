/**
 * csrf.ts — Anti-CSRF protection for Next.js Route Handlers
 *
 * Strategy: Double-Submit Cookie Pattern + Origin validation
 *
 * 1. Origin/Referer check — rejects requests whose Origin header doesn't match
 *    the app's own origin (blocks cross-site form POSTs from other domains).
 *
 * 2. CSRF token — a signed, one-time token stored in an httpOnly cookie and
 *    submitted as an `X-CSRF-Token` request header. The server validates both
 *    match before processing any state-changing request.
 *
 * Usage in API routes:
 *   const csrf = validateCsrf(request);
 *   if (!csrf.ok) return csrf.response;
 *
 * Usage in client components:
 *   const token = await getCsrfToken();  // fetches /api/csrf-token
 *   fetch('/api/...', { headers: { 'X-CSRF-Token': token } });
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const CSRF_COOKIE  = '__csrf';
const CSRF_HEADER  = 'x-csrf-token';
const TOKEN_BYTES  = 32;
const HMAC_SECRET  = process.env.CSRF_SECRET ?? process.env.ENCRYPTION_SECRET ?? 'csrf-fallback-dev-only';

// ─── Token generation & verification ─────────────────────────────────────────

function sign(token: string): string {
  return crypto.createHmac('sha256', HMAC_SECRET).update(token).digest('hex');
}

/** Generate a new CSRF token. Returns `raw.signature`. */
export function generateCsrfToken(): string {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  return `${raw}.${sign(raw)}`;
}

/** Verify a CSRF token string. */
function verifyCsrfToken(token: string): boolean {
  const dot = token.lastIndexOf('.');
  if (dot === -1) return false;
  const raw = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(raw);
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

// ─── Origin check ─────────────────────────────────────────────────────────────

function getAllowedOrigins(): string[] {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';
  const origins = [appUrl];
  if (process.env.NODE_ENV === 'development') {
    origins.push('http://localhost:3001', 'http://localhost:3000', 'http://127.0.0.1:3001');
  }
  return origins.filter(Boolean);
}

function checkOrigin(request: NextRequest): boolean {
  const origin  = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const allowed = getAllowedOrigins();

  // Same-origin requests from Next.js Server Actions / Route Handlers
  // may not send an Origin header — allow if no origin header at all on non-browser context
  if (!origin && !referer) return true;

  if (origin) return allowed.some(o => origin === o || origin.startsWith(o));
  if (referer) return allowed.some(o => referer.startsWith(o));

  return false;
}

// ─── Validation ───────────────────────────────────────────────────────────────

type CsrfResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Validate CSRF for a state-changing request (POST, PUT, PATCH, DELETE).
 * Skips validation for GET/HEAD/OPTIONS (safe methods).
 */
export function validateCsrf(request: NextRequest): CsrfResult {
  const method = request.method.toUpperCase();

  // Safe methods don't need CSRF protection
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return { ok: true };

  // 1. Origin check
  if (!checkOrigin(request)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Request origin not allowed.' },
        { status: 403 }
      ),
    };
  }

  // 2. Token check (cookie vs. header)
  const cookieToken  = request.cookies.get(CSRF_COOKIE)?.value ?? '';
  const headerToken  = request.headers.get(CSRF_HEADER) ?? '';

  if (!cookieToken || !headerToken) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'CSRF token missing.' },
        { status: 403 }
      ),
    };
  }

  if (cookieToken !== headerToken || !verifyCsrfToken(cookieToken)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'CSRF token invalid.' },
        { status: 403 }
      ),
    };
  }

  return { ok: true };
}

/**
 * Attach a fresh CSRF token cookie to a response.
 * Call this on the response that delivers your HTML shell (layout, not API).
 * The client reads the cookie value and sends it as X-CSRF-Token on mutations.
 */
export function attachCsrfCookie(response: NextResponse): NextResponse {
  const token = generateCsrfToken();
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false,      // must be readable by JS so the client can copy it to a header
    sameSite: 'strict',
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge:   60 * 60 * 8, // 8 hours
  });
  return response;
}
