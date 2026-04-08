/**
 * rateLimit.ts — Simple in-memory sliding-window rate limiter
 *
 * ⚠️ PRODUCTION NOTE: This in-memory store is per-process and does NOT work
 * in serverless or multi-instance deployments (each cold-start gets a fresh store).
 * For production, replace the `store` with Redis (e.g. @upstash/redis) or use
 * Supabase's built-in auth rate limits plus a `rate_limit_log` table.
 *
 * Supabase already enforces rate limits on its auth endpoints; this layer adds
 * rate limiting to our own Next.js API routes (/api/invite/*, /api/validate-password).
 */

interface WindowEntry {
  count: number;
  windowStart: number;
}

// In-memory store: keyed by `${endpoint}:${ip}`
const store = new Map<string, WindowEntry>();

// Clean up old entries every 5 minutes to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart > 60_000 * 10) store.delete(key);
  }
}, 5 * 60_000);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

/**
 * Check (and increment) the rate limit for a given key.
 *
 * @param key         Unique key, e.g. `signup:${ip}` or `setPassword:${token}`
 * @param limit       Max requests allowed in the window
 * @param windowMs    Sliding window size in milliseconds
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    // New window
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, resetInMs: windowMs };
  }

  if (entry.count >= limit) {
    const resetInMs = windowMs - (now - entry.windowStart);
    return { allowed: false, remaining: 0, resetInMs };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetInMs: windowMs - (now - entry.windowStart) };
}

/** Pre-configured limiters for our routes */
export const LIMITS = {
  /** Student signup: 5 attempts per IP per 15 minutes */
  signup: (ip: string) => checkRateLimit(`signup:${ip}`, 5, 15 * 60_000),

  /** Password validation endpoint: 20 checks per IP per minute */
  validatePassword: (ip: string) => checkRateLimit(`validate-pw:${ip}`, 20, 60_000),

  /** Invite token validation: 10 attempts per token per 5 minutes */
  validateInvite: (token: string) => checkRateLimit(`invite-val:${token}`, 10, 5 * 60_000),

  /** Set-password: 5 attempts per token (brute-force prevention) */
  setPassword: (token: string) => checkRateLimit(`set-pw:${token}`, 5, 15 * 60_000),
} as const;

/** Extract client IP from a Next.js request (works behind Vercel/Nginx proxies) */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}
