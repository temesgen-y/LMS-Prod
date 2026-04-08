import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoleName } from '@/types/auth';

function normalizeRoleName(value: unknown): RoleName | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase().replace(/_/g, '_');
  const map: Record<string, RoleName> = {
    ADMIN: 'ADMIN', INSTRUCTOR: 'INSTRUCTOR', STUDENT: 'STUDENT',
    REGISTRAR: 'REGISTRAR', ACADEMIC_ADVISOR: 'ACADEMIC_ADVISOR',
    DEPARTMENT_HEAD: 'DEPARTMENT_HEAD', IT_ADMIN: 'IT_ADMIN',
  };
  return map[upper] ?? null;
}

export async function getUserRoleNames(supabase: SupabaseClient, authUserId: string): Promise<RoleName[]> {
  const { data: appUser, error: userError } = await supabase
    .from('users').select('id, role').eq('auth_user_id', authUserId).single();
  if (userError || !appUser) return [];
  const userId = (appUser as { id: string }).id;
  const roleFromColumn = normalizeRoleName((appUser as { role?: unknown }).role);
  if (roleFromColumn) return [roleFromColumn];
  // Derive from profile tables (fallback for legacy accounts)
  const [adminRes, instructorRes, studentRes] = await Promise.all([
    supabase.from('admin_profiles').select('user_id').eq('user_id', userId).limit(1).maybeSingle(),
    supabase.from('instructor_profiles').select('user_id').eq('user_id', userId).limit(1).maybeSingle(),
    supabase.from('student_profiles').select('user_id').eq('user_id', userId).limit(1).maybeSingle(),
  ]);
  if (!adminRes.error && adminRes.data) return ['ADMIN'];
  if (!instructorRes.error && instructorRes.data) return ['INSTRUCTOR'];
  if (!studentRes.error && studentRes.data) return ['STUDENT'];
  return [];
}
