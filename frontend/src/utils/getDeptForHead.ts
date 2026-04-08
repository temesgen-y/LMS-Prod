import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Get the department ID for a department head user.
 *
 * Primary:  department_head_profiles (profile_status = 'active')
 * Fallback: departments.head_id
 *
 * The fallback is essential because the promoteDeptHead utility previously
 * failed to insert the profile row when the appointed_at column was missing.
 * Existing dept heads may only have departments.head_id set.
 */
export async function getDeptIdForHead(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  // Primary source
  const { data: profile } = await supabase
    .from('department_head_profiles')
    .select('department_id')
    .eq('user_id', userId)
    .eq('profile_status', 'active')
    .maybeSingle();

  if ((profile as any)?.department_id) return (profile as any).department_id as string;

  // Fallback: departments.head_id
  const { data: dept } = await supabase
    .from('departments')
    .select('id')
    .eq('head_id', userId)
    .maybeSingle();

  return (dept as any)?.id ?? null;
}
