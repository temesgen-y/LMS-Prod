import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRoleNames } from '@/lib/auth/get-user-roles';
import { getHighestRole } from '@/types/auth';

/**
 * POST /api/admin/instructors/assign-department
 * Body: { instructorUserId: string, departmentId: string | null }
 *
 * - departmentId = UUID  → assign/reassign instructor to that department
 * - departmentId = null  → remove instructor from their current department
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const roles = await getUserRoleNames(supabase, authUser.id);
  const role = getHighestRole(roles);
  if (role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: adminUser } = await supabase
    .from('users').select('id').eq('auth_user_id', authUser.id).single();
  if (!adminUser) return NextResponse.json({ error: 'Admin user not found' }, { status: 403 });
  const adminUserId = (adminUser as any).id;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { instructorUserId, departmentId } = body;
  if (!instructorUserId) return NextResponse.json({ error: 'instructorUserId is required' }, { status: 400 });

  // Verify target user
  const { data: targetUser } = await admin
    .from('users').select('id, role').eq('id', instructorUserId).single();
  if (!targetUser) return NextResponse.json({ error: 'Instructor not found' }, { status: 404 });
  if (!['instructor', 'department_head'].includes((targetUser as any).role)) {
    return NextResponse.json({ error: 'User is not an instructor' }, { status: 400 });
  }

  // Resolve department name
  let deptName: string = 'Unassigned';
  if (departmentId) {
    const { data: dept } = await admin.from('departments').select('name').eq('id', departmentId).single();
    if (!dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    deptName = (dept as any).name;
  }

  // Check if profile already exists
  const { data: existing } = await admin
    .from('instructor_profiles').select('id').eq('user_id', instructorUserId).maybeSingle();

  // Build the payload — department text field is the reliable column (NOT NULL, always exists).
  // We try to also set department_id (UUID FK added by migration); if that column doesn't exist
  // yet the upsert still succeeds via the text field.
  const basePayload: Record<string, any> = {
    department: deptName,
    updated_at: new Date().toISOString(),
  };

  // Attempt to include department_id; ignore if column not present
  const withDeptId = { ...basePayload, department_id: departmentId ?? null };

  if (existing) {
    // Try with department_id first, fall back to text-only on column error
    const { error: e1 } = await admin
      .from('instructor_profiles').update(withDeptId).eq('user_id', instructorUserId);
    if (e1) {
      if (e1.message.includes('department_id') || e1.code === '42703') {
        const { error: e2 } = await admin
          .from('instructor_profiles').update(basePayload).eq('user_id', instructorUserId);
        if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
      } else {
        return NextResponse.json({ error: e1.message }, { status: 500 });
      }
    }
  } else {
    const insertPayload = {
      ...withDeptId,
      user_id: instructorUserId,
      profile_status: 'active',
      employment_status: 'full_time',
      created_by: adminUserId,
    };
    const { error: e1 } = await admin.from('instructor_profiles').insert(insertPayload);
    if (e1) {
      if (e1.message.includes('department_id') || e1.code === '42703') {
        // Column not yet added by migration — insert without it
        const { error: e2 } = await admin.from('instructor_profiles').insert({
          ...basePayload,
          user_id: instructorUserId,
          profile_status: 'active',
          employment_status: 'full_time',
          created_by: adminUserId,
        });
        if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
      } else {
        return NextResponse.json({ error: e1.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ success: true });
}
