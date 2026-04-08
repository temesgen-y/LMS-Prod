import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRoleNames } from '@/lib/auth/get-user-roles';
import { getHighestRole, type RoleName } from '@/types/auth';

/**
 * POST /api/admin/students/:id/approve
 * Admin-only. Runs the full approval transaction via RPC:
 *   1. UPDATE users SET status = 'active', created_by = admin_id
 *   2. INSERT student_profiles (with auto-generated student_no)
 *   3. INSERT audit_logs
 * Returns: { success: true, student_no, user_id }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: studentId } = await params;

    const supabase = await createClient();
    const { data: { user: authUser }, error: sessionError } = await supabase.auth.getUser();

    if (sessionError || !authUser) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const adminDb = createAdminClient();
    const roleNames = await getUserRoleNames(adminDb, authUser.id);
    const role = getHighestRole(roleNames as RoleName[]);
    if (role !== 'ADMIN' && role !== 'REGISTRAR') {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    // Get actor's public.users id (admin or registrar)
    const { data: adminUser } = await adminDb
      .from('users')
      .select('id')
      .eq('auth_user_id', authUser.id)
      .single();

    if (!adminUser) {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 403 });
    }

    // Read program + degree_level from student's auth metadata
    const { data: studentAuthRow } = await adminDb
      .from('users')
      .select('auth_user_id')
      .eq('id', studentId)
      .single();

    let program = '';
    let degree_level = '';

    if (studentAuthRow?.auth_user_id) {
      const { data: authUserData } = await adminDb.auth.admin.getUserById(studentAuthRow.auth_user_id);
      program = authUserData?.user?.user_metadata?.program ?? '';
      degree_level = authUserData?.user?.user_metadata?.degree_level ?? '';
    }

    // Call the atomic RPC — wraps UPDATE users + INSERT student_profiles + INSERT audit_logs
    const { data: result, error: rpcError } = await adminDb.rpc('approve_student_registration', {
      p_student_id:   studentId,
      p_admin_id:     (adminUser as { id: string }).id,
      p_program:      program,
      p_degree_level: degree_level,
    });

    if (rpcError) {
      const msg = rpcError.message ?? '';

      if (msg.includes('student_not_found')) {
        return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
      }
      if (msg.includes('not_a_student')) {
        return NextResponse.json({ error: 'The target user is not a student.' }, { status: 422 });
      }
      if (msg.includes('not_pending')) {
        return NextResponse.json(
          { error: 'Student has already been approved or rejected.' },
          { status: 409 }
        );
      }
      if (msg.includes('uq_student_profiles_student_no') || msg.includes('student_no')) {
        return NextResponse.json(
          { error: 'Failed to generate a unique student number. Please try again.' },
          { status: 500 }
        );
      }

      return NextResponse.json({ error: msg || 'Approval transaction failed.' }, { status: 500 });
    }

    const { student_no, user_id } = result as { student_no: string; user_id: string };

    return NextResponse.json({ success: true, student_no, user_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
