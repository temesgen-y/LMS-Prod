import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { guardRoute } from '@/lib/security/rbac';
import { writeAuditLog, requestMeta } from '@/lib/security/auditLog';
import { validateCsrf } from '@/lib/security/csrf';

/**
 * POST /api/admin/students/:id/approve
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

    // Read program + degree_level from student's auth metadata
    const { data: studentAuthRow } = await adminDb
      .from('users').select('auth_user_id').eq('id', studentId).single();

    let program = '', degree_level = '';
    if (studentAuthRow?.auth_user_id) {
      const { data: authUserData } = await adminDb.auth.admin.getUserById(
        (studentAuthRow as { auth_user_id: string }).auth_user_id
      );
      program      = authUserData?.user?.user_metadata?.program      ?? '';
      degree_level = authUserData?.user?.user_metadata?.degree_level ?? '';
    }

    const { data: result, error: rpcError } = await adminDb.rpc('approve_student_registration', {
      p_student_id:   studentId,
      p_admin_id:     actorId,
      p_program:      program,
      p_degree_level: degree_level,
    });

    if (rpcError) {
      const msg = rpcError.message ?? '';
      if (msg.includes('student_not_found'))  return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
      if (msg.includes('not_a_student'))      return NextResponse.json({ error: 'The target user is not a student.' }, { status: 422 });
      if (msg.includes('not_pending'))        return NextResponse.json({ error: 'Student has already been approved or rejected.' }, { status: 409 });
      if (msg.includes('student_no'))         return NextResponse.json({ error: 'Failed to generate a unique student number. Please try again.' }, { status: 500 });
      return NextResponse.json({ error: msg || 'Approval transaction failed.' }, { status: 500 });
    }

    const { student_no, user_id } = result as { student_no: string; user_id: string };

    const { ipAddress, userAgent } = requestMeta(request);
    await writeAuditLog({
      actorId,
      action:     'student_approved',
      targetType: 'users',
      targetId:   studentId,
      details:    { student_no, program, degree_level },
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ success: true, student_no, user_id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
