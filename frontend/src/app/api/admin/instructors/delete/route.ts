import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { guardRoute } from '@/lib/security/rbac';
import { writeAuditLog, requestMeta } from '@/lib/security/auditLog';
import { validateCsrf } from '@/lib/security/csrf';

/**
 * POST /api/admin/instructors/delete
 * Admin-only. Permanently deletes an instructor:
 *   1. instructor_profiles row
 *   2. public.users row
 *   3. Supabase Auth user
 * Body: { instructorUserId: string }  (public.users.id)
 */
export async function POST(request: NextRequest) {
  try {
    const csrf = validateCsrf(request);
    if (!csrf.ok) return csrf.response;

    const guard = await guardRoute(request, ['ADMIN']);
    if (!guard.ok) return guard.response;
    const { appUserId: actorId } = guard.ctx;

    const body = await request.json();
    const instructorUserId = typeof body.instructorUserId === 'string' ? body.instructorUserId.trim() : '';
    if (!instructorUserId) {
      return NextResponse.json({ error: 'instructorUserId is required.' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: targetUser, error: lookupError } = await admin
      .from('users')
      .select('id, auth_user_id, role, email')
      .eq('id', instructorUserId)
      .maybeSingle();

    if (lookupError || !targetUser) {
      return NextResponse.json({ error: 'Instructor not found.' }, { status: 404 });
    }

    const target = targetUser as { id: string; auth_user_id: string | null; role: string; email: string };

    if (target.role !== 'instructor') {
      return NextResponse.json({ error: 'User is not an instructor.' }, { status: 400 });
    }

    if (actorId === instructorUserId) {
      return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
    }

    // 1. Delete instructor_profiles
    await admin.from('instructor_profiles').delete().eq('user_id', instructorUserId);

    // 2. Invalidate any pending invite tokens
    await admin
      .from('instructor_invites')
      .update({ used: true, used_at: new Date().toISOString() })
      .eq('email', target.email)
      .eq('used', false);

    // 3. Delete public.users row
    const { error: userDeleteError } = await admin
      .from('users').delete().eq('id', instructorUserId);

    if (userDeleteError) {
      return NextResponse.json(
        { error: userDeleteError.message || 'Failed to delete user record. The instructor may be assigned to active courses.' },
        { status: 500 }
      );
    }

    // 4. Delete Supabase Auth user (best-effort)
    if (target.auth_user_id) {
      const { error: authErr } = await admin.auth.admin.deleteUser(target.auth_user_id);
      if (authErr) console.error('[delete-instructor] Auth user delete failed:', authErr.message);
    }

    const { ipAddress, userAgent } = requestMeta(request);
    await writeAuditLog({
      actorId,
      action:     'instructor_deleted',
      targetType: 'users',
      targetId:   instructorUserId,
      details:    { email: target.email },
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
