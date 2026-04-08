/**
 * GET /api/invite/validate?token=<UUID>
 *
 * Validates an instructor invite token.
 * Returns the email associated with the invite so the setup-password page
 * can pre-populate the email field (read-only) and run identifier checks.
 *
 * Response:
 *   200 { valid: true, email: string }
 *   400 { valid: false, reason: 'expired' | 'used' | 'not_found' | 'invalid' }
 *
 * Rate limit: 10 attempts per token per 5 minutes to prevent enumeration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { LIMITS } from '@/lib/security/rateLimit';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim();

  // Basic UUID format check to avoid unnecessary DB queries
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!token || !UUID_RE.test(token)) {
    return NextResponse.json({ valid: false, reason: 'invalid' }, { status: 400 });
  }

  // Rate limit by token (prevent bulk-scanning tokens)
  const rl = LIMITS.validateInvite(token);
  if (!rl.allowed) {
    return NextResponse.json(
      { valid: false, reason: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetInMs / 1000)) } }
    );
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('instructor_invites')
    .select('email, used, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    // 42P01 = table does not exist (migration not yet applied)
    const reason = error.code === '42P01' ? 'table_missing' : 'not_found';
    console.error('[invite/validate] DB error:', error.code, error.message);
    return NextResponse.json({ valid: false, reason }, { status: reason === 'table_missing' ? 500 : 404 });
  }

  if (!data) {
    return NextResponse.json({ valid: false, reason: 'not_found' }, { status: 404 });
  }

  const invite = data as { email: string; used: boolean; expires_at: string };

  if (invite.used) {
    return NextResponse.json({ valid: false, reason: 'used' }, { status: 410 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, reason: 'expired' }, { status: 410 });
  }

  return NextResponse.json({ valid: true, email: invite.email });
}
