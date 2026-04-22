import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRoleNames } from '@/lib/auth/get-user-roles';
import { getHighestRole, type RoleName } from '@/types/auth';

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
    const admin = createAdminClient();
    let authUser: import('@supabase/supabase-js').User | null = null;

    const authHeader = request.headers.get('Authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (bearerToken) {
      const { data, error } = await admin.auth.getUser(bearerToken);
      if (error || !data.user) {
        return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
      }
      authUser = data.user;
    } else {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
      }
      authUser = data.user;
    }

    const roleNames = await getUserRoleNames(admin, authUser.id);
    if (getHighestRole(roleNames as RoleName[]) !== 'ADMIN') {
      return NextResponse.json({ error: 'Only admins can delete instructors.' }, { status: 403 });
    }

    const body = await request.json();
    const instructorUserId = typeof body.instructorUserId === 'string' ? body.instructorUserId.trim() : '';
    if (!instructorUserId) {
      return NextResponse.json({ error: 'instructorUserId is required.' }, { status: 400 });
    }

    // Look up the instructor's public.users row to get auth_user_id
    const { data: targetUser, error: lookupError } = await admin
      .from('users')
      .select('id, auth_user_id, role')
      .eq('id', instructorUserId)
      .maybeSingle();

    if (lookupError || !targetUser) {
      return NextResponse.json({ error: 'Instructor not found.' }, { status: 404 });
    }

    const target = targetUser as { id: string; auth_user_id: string | null; role: string };

    if (target.role !== 'instructor') {
      return NextResponse.json({ error: 'User is not an instructor.' }, { status: 400 });
    }

    // Prevent admin from deleting themselves
    const { data: callerUser } = await admin
      .from('users')
      .select('id')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();
    if ((callerUser as { id: string } | null)?.id === instructorUserId) {
      return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
    }

    // 1. Delete instructor_profiles
    await admin.from('instructor_profiles').delete().eq('user_id', instructorUserId);

    // 2. Invalidate any pending invite tokens for this user
    const { data: inviteEmail } = await admin
      .from('users')
      .select('email')
      .eq('id', instructorUserId)
      .maybeSingle();
    if (inviteEmail) {
      await admin
        .from('instructor_invites')
        .update({ used: true, used_at: new Date().toISOString() })
        .eq('email', (inviteEmail as { email: string }).email)
        .eq('used', false);
    }

    // 3. Delete public.users row
    const { error: userDeleteError } = await admin
      .from('users')
      .delete()
      .eq('id', instructorUserId);

    if (userDeleteError) {
      return NextResponse.json(
        { error: userDeleteError.message || 'Failed to delete user record. The instructor may be assigned to active courses.' },
        { status: 500 }
      );
    }

    // 4. Delete Supabase Auth user (best-effort — don't fail if this errors)
    if (target.auth_user_id) {
      const { error: authDeleteError } = await admin.auth.admin.deleteUser(target.auth_user_id);
      if (authDeleteError) {
        console.error('[delete-instructor] Auth user delete failed:', authDeleteError.message);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
