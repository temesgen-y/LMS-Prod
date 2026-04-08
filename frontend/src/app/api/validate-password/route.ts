/**
 * POST /api/validate-password
 *
 * Server-side password policy validation + breach check.
 * Called by forms before submitting to Supabase Auth.
 *
 * Body: { password: string; userInputs?: string[] }
 * Response: { valid: boolean; errors: string[]; breachCount?: number }
 *
 * Rate limit: 20 requests / IP / minute (prevents enumeration attacks).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validatePasswordPolicy } from '@/lib/security/password';
import { checkPasswordBreach } from '@/lib/security/breachCheck';
import { LIMITS, getClientIp } from '@/lib/security/rateLimit';

export async function POST(request: NextRequest) {
  // 1. Rate limit by IP
  const ip = getClientIp(request);
  const rl = LIMITS.validatePassword(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { valid: false, errors: ['Too many requests. Please wait and try again.'] },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(rl.resetInMs / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  // 2. Parse body
  let body: { password?: unknown; userInputs?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ valid: false, errors: ['Invalid request body.'] }, { status: 400 });
  }

  const password = typeof body.password === 'string' ? body.password : '';
  const userInputs = Array.isArray(body.userInputs)
    ? (body.userInputs as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];

  if (!password) {
    return NextResponse.json({ valid: false, errors: ['Password is required.'] }, { status: 400 });
  }

  // 3. Policy check (synchronous)
  const policy = validatePasswordPolicy(password, userInputs);

  // 4. Breach check (async — only run if policy passes, to avoid wasting the API call)
  let breachCount: number | undefined;
  if (policy.valid) {
    const breach = await checkPasswordBreach(password);
    if (breach.checked) {
      breachCount = breach.count;
      if (breach.count > 0) {
        policy.valid = false;
        policy.errors.push(
          `This password has appeared in ${breach.count.toLocaleString()} known data breaches. Choose a different password.`
        );
      }
    }
  }

  return NextResponse.json({
    valid: policy.valid,
    errors: policy.errors,
    breachCount,
  });
}
