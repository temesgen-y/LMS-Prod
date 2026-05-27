import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { generateCsrfToken } from '@/lib/security/csrf';

const PROTECTED_PREFIXES = [
  '/dashboard', '/admin', '/instructor', '/registrar',
  '/dept-head', '/advisor', '/it-admin', '/change-password',
];
const AUTH_PAGES = ['/login', '/signup'];

// Idle session timeout: force re-login after 8 hours of inactivity
const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;
const ACTIVITY_COOKIE = '__last_activity';
const CSRF_COOKIE     = '__csrf';

// ─── Security headers ─────────────────────────────────────────────────────────
// Applied to every response (HTML pages). API routes inherit most of these.
const SECURITY_HEADERS: Record<string, string> = {
  // Prevent MIME-sniffing attacks
  'X-Content-Type-Options': 'nosniff',
  // Prevent clickjacking
  'X-Frame-Options': 'SAMEORIGIN',
  // Disable XSS auditor (deprecated but harmless)
  'X-XSS-Protection': '1; mode=block',
  // Force HTTPS for 1 year (HSTS) — only effective in production
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  // Limit information leakage in Referer header
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Permissions Policy: disable features not needed by the LMS
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()',
  // Content Security Policy — tuned for Next.js + Supabase + YouTube embeds
  'Content-Security-Policy': [
    "default-src 'self'",
    // Scripts: allow Next.js chunks + inline scripts Next.js injects
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube-nocookie.com",
    // Styles: allow inline (Tailwind, Next.js)
    "style-src 'self' 'unsafe-inline'",
    // Images: allow Supabase Storage + YouTube thumbnails + data URIs (webcam snapshots)
    "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://img.youtube.com",
    // Media: allow blob: for webcam streams
    "media-src 'self' blob:",
    // Frames: YouTube nocookie only
    "frame-src 'self' https://www.youtube-nocookie.com",
    // Connections: self + Supabase + Chapa payment gateway
    "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co https://api.chapa.co",
    // Fonts: self only
    "font-src 'self'",
    // Workers: self + blob (for PDF generation)
    "worker-src 'self' blob:",
    // Ancestors: SAMEORIGIN only (blocks embedding in other sites)
    "frame-ancestors 'self'",
  ].join('; '),
};

function applySecurityHeaders(response: NextResponse): void {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
}

// ─── CSRF token helpers ───────────────────────────────────────────────────────

function ensureCsrfCookie(request: NextRequest, response: NextResponse): void {
  // Only set for HTML page responses (not API routes or static assets)
  const existing = request.cookies.get(CSRF_COOKIE)?.value;
  if (!existing) {
    const token = generateCsrfToken();
    response.cookies.set(CSRF_COOKIE, token, {
      httpOnly: false,         // readable by JS so client can copy to X-CSRF-Token header
      sameSite: 'strict',
      secure:   process.env.NODE_ENV === 'production',
      path:     '/',
      maxAge:   60 * 60 * 8,  // 8 hours, matches session idle timeout
    });
  }
}

// ─── Idle session timeout ─────────────────────────────────────────────────────

function checkIdleTimeout(request: NextRequest, pathname: string): NextResponse | null {
  const isProtected = PROTECTED_PREFIXES.some(p => pathname.startsWith(p));
  if (!isProtected) return null;

  const lastActivity = request.cookies.get(ACTIVITY_COOKIE)?.value;
  if (lastActivity) {
    const elapsed = Date.now() - parseInt(lastActivity, 10);
    if (elapsed > SESSION_IDLE_MS) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      loginUrl.searchParams.set('reason', 'session_expired');
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete(ACTIVITY_COOKIE);
      return response;
    }
  }
  return null;
}

function refreshActivityCookie(response: NextResponse): void {
  response.cookies.set(ACTIVITY_COOKIE, String(Date.now()), {
    httpOnly: true,
    sameSite: 'strict',
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge:   60 * 60 * 8,
  });
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Refresh Supabase session + get current user
  const { response, user } = await updateSession(request);

  // 2. Idle timeout check (only for authenticated protected pages)
  if (user) {
    const timeoutRedirect = checkIdleTimeout(request, pathname);
    if (timeoutRedirect) {
      applySecurityHeaders(timeoutRedirect);
      return timeoutRedirect;
    }
  }

  // 3. Auth guard: unauthenticated user accessing protected route
  const isProtected = PROTECTED_PREFIXES.some(p => pathname.startsWith(p));
  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    const redirect = NextResponse.redirect(loginUrl);
    applySecurityHeaders(redirect);
    return redirect;
  }

  // 4. Apply security headers to all responses
  applySecurityHeaders(response);

  // 5. Refresh activity timestamp + ensure CSRF cookie for authenticated users
  if (user) {
    refreshActivityCookie(response);
    ensureCsrfCookie(request, response);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
