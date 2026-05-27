import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { guardRoute } from '@/lib/security/rbac';
import { writeAuditLog, requestMeta } from '@/lib/security/auditLog';
import { validateCsrf } from '@/lib/security/csrf';

/**
 * POST /api/admin/students/:id/reject
 * Admin or Registrar only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = validateCsrf(request);
    if (!csrf.ok) return csrf.response;

    const guard = await guardRoute(request, ['ADMIN', 'REGISTRAR']);
    if (!guard.ok) return guard.response;
    const { appUserId: actorId } = guard.ctx;

    const { id: studentId } = await params;
    const adminDb = createAdminClient();

    const { data: result, error: rpcError } = await adminDb.rpc('reject_student_registration', {
      p_student_id: studentId,
      p_admin_id:   actorId,
    });

    if (rpcError) {
      const msg = rpcError.message ?? '';
      if (msg.includes('student_not_found')) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
      if (msg.includes('not_a_student'))     return NextResponse.json({ error: 'The target user is not a student.' }, { status: 422 });
      if (msg.includes('not_pending'))       return NextResponse.json({ error: 'Student has already been approved or rejected.' }, { status: 409 });
      return NextResponse.json({ error: msg || 'Rejection failed.' }, { status: 500 });
    }

    const { user_id } = result as { user_id: string };

    const { ipAddress, userAgent } = requestMeta(request);
    await writeAuditLog({
      actorId,
      action:     'student_rejected',
      targetType: 'users',
      targetId:   studentId,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ success: true, user_id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
