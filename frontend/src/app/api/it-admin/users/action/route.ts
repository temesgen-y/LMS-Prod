import { NextRequest, NextResponse } from 'next/server';
import { requireItAdmin, writeAuditLog } from '@/lib/auth/require-it-admin';

type Action = 'lock' | 'unlock' | 'reset-password' | 'revoke-sessions';
const ACTIONS: Action[] = ['lock', 'unlock', 'reset-password', 'revoke-sessions'];

// ban far into the future ≈ 100 years
const LOCK_BAN_DURATION = '876000h';

/**
 * POST /api/it-admin/users/action
 * Body: { userId: string, action: 'lock' | 'unlock' | 'reset-password' | 'revoke-sessions' }
 *
 * lock            → suspend account, ban auth user, revoke all sessions
 * unlock          → reactivate account, lift ban
 * reset-password  → issue a password-recovery link (returned to caller)
 * revoke-sessions → force logout from all devices (sessions only)
 */
export async function POST(request: NextRequest) {
  const auth = await requireItAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { actorId, role, admin } = auth.ctx;

  const body = await request.json().catch(() => ({}));
  const { userId, action } = body as { userId?: string; action?: Action };

  if (!userId || !action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'userId and a valid action are required.' }, { status: 400 });
  }
  if (userId === actorId) {
    return NextResponse.json({ error: 'You cannot perform this action on your own account.' }, { status: 400 });
  }

  const { data: target } = await admin
    .from('users')
    .select('id, email, role, status, auth_user_id')
    .eq('id', userId)
    .single();

  const t = target as
    | { id: string; email: string; role: string; status: string; auth_user_id: string | null }
    | null;
  if (!t) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

  // Only a full admin may act on another admin account.
  if (t.role === 'admin' && role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can manage an admin account.' }, { status: 403 });
  }

  switch (action) {
    case 'lock': {
      const { error: updErr } = await admin
        .from('users')
        .update({ status: 'suspended' })
        .eq('id', userId);
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

      if (t.auth_user_id) {
        await admin.auth.admin.updateUserById(t.auth_user_id, { ban_duration: LOCK_BAN_DURATION });
        await admin.rpc('revoke_user_sessions', { p_auth_user_id: t.auth_user_id });
      }
      await writeAuditLog(admin, {
        actorId, action: 'user.lock', targetType: 'user', targetId: userId,
        details: { email: t.email, role: t.role }, request,
      });
      return NextResponse.json({ success: true, message: 'Account locked.' });
    }

    case 'unlock': {
      const { error: updErr } = await admin
        .from('users')
        .update({ status: 'active' })
        .eq('id', userId);
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

      if (t.auth_user_id) {
        await admin.auth.admin.updateUserById(t.auth_user_id, { ban_duration: 'none' });
      }
      await writeAuditLog(admin, {
        actorId, action: 'user.unlock', targetType: 'user', targetId: userId,
        details: { email: t.email, role: t.role }, request,
      });
      return NextResponse.json({ success: true, message: 'Account unlocked.' });
    }

    case 'reset-password': {
      if (!t.email) return NextResponse.json({ error: 'User has no email on file.' }, { status: 400 });
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: t.email,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await writeAuditLog(admin, {
        actorId, action: 'user.password_reset', targetType: 'user', targetId: userId,
        details: { email: t.email }, request,
      });
      return NextResponse.json({
        success: true,
        message: 'Password reset link generated.',
        resetLink: (data as { properties?: { action_link?: string } })?.properties?.action_link ?? null,
      });
    }

    case 'revoke-sessions': {
      if (!t.auth_user_id) {
        return NextResponse.json({ error: 'User has no auth account.' }, { status: 400 });
      }
      const { data, error } = await admin.rpc('revoke_user_sessions', { p_auth_user_id: t.auth_user_id });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await writeAuditLog(admin, {
        actorId, action: 'user.session_revoke', targetType: 'user', targetId: userId,
        details: { email: t.email, sessions_removed: data ?? 0 }, request,
      });
      return NextResponse.json({
        success: true,
        message: `Signed out of all devices${typeof data === 'number' ? ` (${data} session${data === 1 ? '' : 's'})` : ''}.`,
      });
    }
  }
}
