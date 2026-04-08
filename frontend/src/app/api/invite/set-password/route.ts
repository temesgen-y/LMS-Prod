/**
 * POST /api/invite/set-password
 *
 * Completes the instructor invite flow:
 *   1. Validates the invite token (exists, not used, not expired)
 *   2. Runs full server-side password policy + breach check
 *   3. Sets the instructor's password via Supabase Admin API
 *   4. Marks the invite token as used (single-use enforcement)
 *   5. Returns the email so the client can auto-sign in
 *
 * Body: { token: string; password: string }
 *
 * Security:
 * - Rate limited per token (5 attempts / 15 min) — brute-force prevention
 * - Password is validated server-side before touching Supabase Auth
 * - Token is marked used AFTER password is set (prevent partial-success loops)
 * - Admin client (service-role) is used only server-side; never exposed to client
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validatePasswordPolicy } from '@/lib/security/password';
import { checkPasswordBreach } from '@/lib/security/breachCheck';
import { LIMITS } from '@/lib/security/rateLimit';

export async function POST(request: NextRequest) {
  // 1. Parse body
  let body: { token?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const token    = typeof body.token    === 'string' ? body.token.trim()    : '';
  const password = typeof body.password === 'string' ? body.password        : '';

  if (!token || !password) {
    return NextResponse.json({ error: 'Token and password are required.' }, { status: 400 });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: 'Invalid invite token format.' }, { status: 400 });
  }

  // 2. Rate limit per token (prevent brute-forcing the password-reset step)
  const rl = LIMITS.setPassword(token);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait before trying again.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetInMs / 1000)) } }
    );
  }

  const admin = createAdminClient();

  // 3. Validate the invite token
  const { data: invite, error: inviteError } = await admin
    .from('instructor_invites')
    .select('id, email, auth_user_id, used, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (inviteError || !invite) {
    return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
  }

  const inv = invite as {
    id: string;
    email: string;
    auth_user_id: string | null;
    used: boolean;
    expires_at: string;
  };

  if (inv.used) {
    return NextResponse.json({ error: 'This invite link has already been used.' }, { status: 410 });
  }
  if (new Date(inv.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'This invite link has expired. Please ask an administrator to send a new invite.' },
      { status: 410 }
    );
  }

  // 4. Server-side password policy enforcement
  // Use email + name parts as user inputs for identifier detection
  const emailLocal = inv.email.split('@')[0];
  const userInputs = [inv.email, emailLocal].filter(Boolean);

  const policy = validatePasswordPolicy(password, userInputs);
  if (!policy.valid) {
    return NextResponse.json({ error: policy.errors[0], errors: policy.errors }, { status: 422 });
  }

  // 5. Breach check
  const breach = await checkPasswordBreach(password);
  if (breach.checked && breach.count > 0) {
    return NextResponse.json(
      {
        error: `This password has appeared in ${breach.count.toLocaleString()} known data breaches. Please choose a different password.`,
      },
      { status: 422 }
    );
  }

  // 6. Resolve the Supabase Auth user ID
  let authUserId = inv.auth_user_id;

  if (!authUserId) {
    // Fallback: look up by email in public.users (set during inviteUserByEmail flow)
    const { data: appUser } = await admin
      .from('users')
      .select('auth_user_id')
      .eq('email', inv.email)
      .maybeSingle();
    authUserId = (appUser as { auth_user_id: string } | null)?.auth_user_id ?? null;
  }

  if (!authUserId) {
    return NextResponse.json(
      { error: 'Could not find the account associated with this invite. Please contact an administrator.' },
      { status: 500 }
    );
  }

  // 7. Set the password via Supabase Admin API
  // Using admin.updateUserById so we never need the user's current credentials.
  const { error: updateError } = await admin.auth.admin.updateUserById(authUserId, { password });

  if (updateError) {
    console.error('[set-password] updateUserById error:', updateError.message);
    return NextResponse.json(
      { error: updateError.message || 'Failed to set password. Please try again.' },
      { status: 500 }
    );
  }

  // 8. Mark token as used (AFTER successful password set — atomicity via order)
  await admin
    .from('instructor_invites')
    .update({ used: true, used_at: new Date().toISOString() })
    .eq('id', inv.id);

  // 9. Audit log (best-effort, don't fail the request if this errors)
  try {
    await admin.from('audit_logs').insert({
      action: 'instructor_password_set',
      target_type: 'instructor_invite',
      target_id: inv.id,
      metadata: { email: inv.email },
    });
  } catch { /* non-critical */ }

  return NextResponse.json({ success: true, email: inv.email });
}
