import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Finds the user_id to notify when an instructor submits a leave request.
 * Returns the dept head's user_id, or an admin's user_id if no dept head found,
 * or null if neither is available.
 */
export async function findDeptHeadForInstructor(
  supabase: SupabaseClient,
  instructorId: string,
): Promise<string | null> {
  // Step 1: get instructor's department (UUID stored in `department` column)
  const { data: profile } = await supabase
    .from('instructor_profiles')
    .select('department')
    .eq('user_id', instructorId)
    .single();

  if (!profile?.department) {
    // No department — fall back to admin
    const { data: admin } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .single();
    return admin?.id ?? null;
  }

  const departmentId = profile.department;

  // Step 2: find active dept head for that department
  const { data: deptHead } = await supabase
    .from('department_head_profiles')
    .select('user_id')
    .eq('department_id', departmentId)
    .eq('profile_status', 'active')
    .single();

  if (!deptHead) {
    // No dept head — fall back to admin
    const { data: admin } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .single();
    return admin?.id ?? null;
  }

  // Step 3: dept head cannot be notified of their own leave
  if (deptHead.user_id === instructorId) {
    const { data: admin } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .single();
    return admin?.id ?? null;
  }

  return deptHead.user_id;
}
