/**
 * csrf.ts — Anti-CSRF protection (Edge Runtime compatible)
 *
 * Uses the Web Crypto API (globalThis.crypto) which works in:
 *   - Next.js Edge Runtime (middleware)
 *   - Node.js 18+ (Route Handlers)
 *   - Browsers
 *
 * Strategy: Double-Submit Cookie Pattern + Origin validation
 *
 * 1. A random token is set in a JavaScript-readable __csrf cookie by middleware.
 * 2. The client reads the cookie and sends it as X-CSRF-Token on every mutation.
 * 3. The server validates cookie === header (attacker on another origin can't
 *    read the cookie, so they can't forge the matching header value).
 * 4. Origin/Referer header is also validated as a second layer.
 */

import { NextRequest, NextResponse } from 'next/server';

const CSRF_COOKIE = '__csrf';
const CSRF_HEADER = 'x-csrf-token';

// ─── Token generation ─────────────────────────────────────────────────────────

/** Generate a random CSRF token using the Web Crypto API (Edge-safe). */
export function generateCsrfToken(): string {
  // crypto.randomUUID() is available in Edge Runtime, Node 14.17+, and browsers
  return globalThis.crypto.randomUUID();
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

  // No Origin/Referer — allow (server-to-server, curl, same-origin fetch in some browsers)
  if (!origin && !referer) return true;

  if (origin)  return allowed.some(o => origin === o || origin.startsWith(o));
  if (referer) return allowed.some(o => referer.startsWith(o));

  return false;
}

// ─── Validation ───────────────────────────────────────────────────────────────

type CsrfResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Validate CSRF for a state-changing request (POST, PUT, PATCH, DELETE).
 * Safe methods (GET, HEAD, OPTIONS) pass through unchanged.
 */
export function validateCsrf(request: NextRequest): CsrfResult {
  const method = request.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return { ok: true };

  // 1. Origin check
  if (!checkOrigin(request)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Request origin not allowed.' }, { status: 403 }),
    };
  }

  // 2. Double-submit cookie check: cookie value must equal header value
  const cookieToken = request.cookies.get(CSRF_COOKIE)?.value ?? '';
  const headerToken = request.headers.get(CSRF_HEADER) ?? '';

  if (!cookieToken || !headerToken) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'CSRF token missing.' }, { status: 403 }),
    };
  }

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(cookieToken, headerToken)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'CSRF token invalid.' }, { status: 403 }),
    };
  }

  return { ok: true };
}

/** Constant-time string comparison (prevents timing-based token guessing). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Attach a fresh CSRF token cookie to a response.
 * The client reads the cookie and sends it as X-CSRF-Token on mutations.
 */
export function attachCsrfCookie(response: NextResponse): NextResponse {
  const token = generateCsrfToken();
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false,     // must be readable by JS to copy into X-CSRF-Token header
    sameSite: 'strict',
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge:   60 * 60 * 8,
  });
  return response;
}
