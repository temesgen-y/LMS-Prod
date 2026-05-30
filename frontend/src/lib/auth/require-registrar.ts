import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRoleNames } from '@/lib/auth/get-user-roles';
import { getHighestRole, type RoleName } from '@/types/auth';
import type { SupabaseClient } from '@supabase/supabase-js';

export type RegistrarContext = {
  /** public.users.id of the acting staff member */
  actorId: string;
  role: 'REGISTRAR' | 'ADMIN';
  admin: SupabaseClient;
};

export type RequireRegistrarResult =
  | { ok: true; ctx: RegistrarContext }
  | { ok: false; status: number; error: string };

/** Gate an API route to registrars (and admins, who outrank them). */
export async function requireRegistrar(): Promise<RequireRegistrarResult> {
  const server = await createClient();
  const { data: { user: authUser } } = await server.auth.getUser();
  if (!authUser) return { ok: false, status: 401, error: 'You must be signed in.' };

  const admin = createAdminClient();
  const roleNames = await getUserRoleNames(admin, authUser.id);
  const role = getHighestRole(roleNames as RoleName[]);
  if (role !== 'ADMIN' && role !== 'REGISTRAR') {
    return { ok: false, status: 403, error: 'Registrar access required.' };
  }

  const { data: me } = await admin.from('users').select('id').eq('auth_user_id', authUser.id).single();
  return {
    ok: true,
    ctx: { actorId: (me as { id: string } | null)?.id ?? '', role, admin },
  };
}
