import type { SupabaseClient } from '@supabase/supabase-js';

export interface PromoteResult {
  success: boolean;
  error?: string;
}

/**
 * Assign an instructor as department head of a department.
 * - Deactivates any existing dept head for that department.
 * - Creates/reactivates a department_head_profiles row.
 * - Updates users.role to 'department_head'.
 * - Syncs departments.head_id.
 */
export async function assignDeptHead(
  supabase: SupabaseClient,
  instructorId: string,
  departmentId: string,
  adminId: string,
): Promise<PromoteResult> {
  try {
    // Step 1: verify the instructor exists and has a valid role
    const { data: instructor } = await supabase
      .from('users')
      .select('id, role, first_name, last_name')
      .eq('id', instructorId)
      .single();

    if (!instructor) {
      return { success: false, error: 'Instructor not found.' };
    }
    if (!['instructor', 'department_head'].includes((instructor as any).role)) {
      return { success: false, error: 'Selected person is not an instructor.' };
    }

    // Step 2: check if this person is already dept head of a DIFFERENT department
    const { data: existingActive } = await supabase
      .from('department_head_profiles')
      .select('id, department_id')
      .eq('user_id', instructorId)
      .eq('profile_status', 'active')
      .neq('department_id', departmentId)
      .maybeSingle();

    if (existingActive) {
      // Get that department's name for the error message
      const { data: otherDept } = await supabase
        .from('departments')
        .select('name')
        .eq('id', (existingActive as any).department_id)
        .single();
      const deptName = (otherDept as any)?.name ?? 'another department';
      return {
        success: false,
        error: `${(instructor as any).first_name} ${(instructor as any).last_name} is already department head of ${deptName}. Remove them from that department first.`,
      };
    }

    // Step 3: deactivate current dept head of THIS department (if different person)
    const { data: currentDH } = await supabase
      .from('department_head_profiles')
      .select('id, user_id')
      .eq('department_id', departmentId)
      .eq('profile_status', 'active')
      .neq('user_id', instructorId)
      .maybeSingle();

    if (currentDH) {
      await supabase
        .from('department_head_profiles')
        .update({ profile_status: 'inactive', updated_at: new Date().toISOString() })
        .eq('id', (currentDH as any).id);

      await supabase
        .from('users')
        .update({ role: 'instructor' })
        .eq('id', (currentDH as any).user_id);
    }

    // Step 4: upsert dept head profile (look up only by user_id — department_id may be
    // null or stale from a previous assignment, and user_id has a UNIQUE constraint)
    const { data: existingProfile } = await supabase
      .from('department_head_profiles')
      .select('id')
      .eq('user_id', instructorId)
      .maybeSingle();

    if (existingProfile) {
      const { error: upErr } = await supabase
        .from('department_head_profiles')
        .update({
          department_id: departmentId,
          profile_status: 'active',
          appointed_at: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        })
        .eq('id', (existingProfile as any).id);
      if (upErr) throw new Error(upErr.message);
    } else {
      const { error: insErr } = await supabase.from('department_head_profiles').insert({
        user_id: instructorId,
        department_id: departmentId,
        profile_status: 'active',
        appointed_at: new Date().toISOString().split('T')[0],
        created_by: adminId,
      });
      if (insErr) throw new Error(insErr.message);
    }

    // Step 5: promote user role
    await supabase
      .from('users')
      .update({ role: 'department_head' })
      .eq('id', instructorId);

    // Step 6: sync departments.head_id
    await supabase
      .from('departments')
      .update({ head_id: instructorId })
      .eq('id', departmentId);

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Remove the current department head from a department.
 * - Sets profile_status to 'inactive'.
 * - Reverts their role to 'instructor'.
 * - Clears departments.head_id.
 */
export async function removeDeptHead(
  supabase: SupabaseClient,
  departmentId: string,
): Promise<PromoteResult> {
  try {
    const { data: currentDH } = await supabase
      .from('department_head_profiles')
      .select('id, user_id')
      .eq('department_id', departmentId)
      .eq('profile_status', 'active')
      .maybeSingle();

    if (currentDH) {
      await supabase
        .from('department_head_profiles')
        .update({ profile_status: 'inactive', updated_at: new Date().toISOString() })
        .eq('id', (currentDH as any).id);

      await supabase
        .from('users')
        .update({ role: 'instructor' })
        .eq('id', (currentDH as any).user_id);
    }

    // Clear head_id on the department
    await supabase
      .from('departments')
      .update({ head_id: null })
      .eq('id', departmentId);

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
