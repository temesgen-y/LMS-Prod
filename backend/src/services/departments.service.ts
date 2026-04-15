import { supabaseAdmin } from '../lib/supabase';
import { createError } from '../middleware/errorHandler';

export const assignDeptHead = async (
  instructorId: string,
  departmentId: string,
  adminId: string,
): Promise<void> => {
  const { data: instructor } = await supabaseAdmin
    .from('users')
    .select('id, role, first_name, last_name')
    .eq('id', instructorId)
    .single();

  if (!instructor) {
    throw createError('Instructor not found', 404);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instr = instructor as any;

  if (!['instructor', 'department_head'].includes(instr.role)) {
    throw createError('Selected person is not an instructor', 400, 'NOT_INSTRUCTOR');
  }

  // Check not already dept head of a DIFFERENT department
  const { data: existingActive } = await supabaseAdmin
    .from('department_head_profiles')
    .select('id, department_id')
    .eq('user_id', instructorId)
    .eq('profile_status', 'active')
    .neq('department_id', departmentId)
    .maybeSingle();

  if (existingActive) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: otherDept } = await supabaseAdmin
      .from('departments')
      .select('name')
      .eq('id', (existingActive as any).department_id)
      .single();
    const deptName = (otherDept as any)?.name ?? 'another department';
    throw createError(
      `${instr.first_name} ${instr.last_name} is already department head of ${deptName}. Remove them first.`,
      409,
      'ALREADY_DEPT_HEAD',
    );
  }

  // Deactivate current dept head of this department (if different person)
  const { data: currentDH } = await supabaseAdmin
    .from('department_head_profiles')
    .select('id, user_id')
    .eq('department_id', departmentId)
    .eq('profile_status', 'active')
    .neq('user_id', instructorId)
    .maybeSingle();

  if (currentDH) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dh = currentDH as any;
    await supabaseAdmin
      .from('department_head_profiles')
      .update({ profile_status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', dh.id);

    await supabaseAdmin
      .from('users')
      .update({ role: 'instructor' })
      .eq('id', dh.user_id);
  }

  // Upsert dept head profile (lookup by user_id only — unique constraint)
  const { data: existingProfile } = await supabaseAdmin
    .from('department_head_profiles')
    .select('id')
    .eq('user_id', instructorId)
    .maybeSingle();

  if (existingProfile) {
    const { error: upErr } = await supabaseAdmin
      .from('department_head_profiles')
      .update({
        department_id: departmentId,
        profile_status: 'active',
        appointed_at: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq('id', (existingProfile as any).id);
    if (upErr) throw new Error(upErr.message);
  } else {
    const { error: insErr } = await supabaseAdmin.from('department_head_profiles').insert({
      user_id: instructorId,
      department_id: departmentId,
      profile_status: 'active',
      appointed_at: new Date().toISOString().split('T')[0],
      created_by: adminId,
    });
    if (insErr) throw new Error(insErr.message);
  }

  // Promote user role
  await supabaseAdmin.from('users').update({ role: 'department_head' }).eq('id', instructorId);

  // Sync departments.head_id
  await supabaseAdmin.from('departments').update({ head_id: instructorId }).eq('id', departmentId);
};

export const removeDeptHead = async (departmentId: string): Promise<void> => {
  const { data: currentDH } = await supabaseAdmin
    .from('department_head_profiles')
    .select('id, user_id')
    .eq('department_id', departmentId)
    .eq('profile_status', 'active')
    .maybeSingle();

  if (currentDH) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dh = currentDH as any;
    await supabaseAdmin
      .from('department_head_profiles')
      .update({ profile_status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', dh.id);

    await supabaseAdmin.from('users').update({ role: 'instructor' }).eq('id', dh.user_id);
  }

  // Clear head_id on the department
  await supabaseAdmin.from('departments').update({ head_id: null }).eq('id', departmentId);
};
