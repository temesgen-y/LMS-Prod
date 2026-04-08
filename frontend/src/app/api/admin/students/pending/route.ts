import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRoleNames } from '@/lib/auth/get-user-roles';
import { getHighestRole, type RoleName } from '@/types/auth';

/**
 * GET /api/admin/students/pending
 * Admin-only. Returns all students with status = 'pending', oldest first.
 * program + degree_level are read from Supabase Auth user metadata
 * (stored during self-registration via signUp options.data).
 */
export async function GET() {
  try {
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

    const admin = createAdminClient();

    // Query all pending students (DB uses uppercase 'STUDENT' / 'PENDING')
    const { data: pendingUsers, error: queryError } = await admin
      .from('users')
      .select('id, email, first_name, last_name, created_at, auth_user_id')
      .in('role', ['STUDENT', 'student'])
      .in('status', ['PENDING', 'pending'])
      .order('created_at', { ascending: true });

    if (queryError) {
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    if (!pendingUsers || pendingUsers.length === 0) {
      return NextResponse.json({ students: [] });
    }

    // Enrich each student with program + degree_level from auth metadata
    const students = await Promise.all(
      (pendingUsers as { id: string; email: string; first_name: string; last_name: string; created_at: string; auth_user_id: string }[]).map(async (u) => {
        let program = '';
        let degree_level = '';

        if (u.auth_user_id) {
          const { data: authUserData } = await admin.auth.admin.getUserById(u.auth_user_id);
          program = authUserData?.user?.user_metadata?.program ?? '';
          degree_level = authUserData?.user?.user_metadata?.degree_level ?? '';
        }

        return {
          id: u.id,
          email: u.email,
          first_name: u.first_name,
          last_name: u.last_name,
          registered_at: u.created_at,
          program,
          degree_level,
        };
      })
    );

    return NextResponse.json({ students });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
