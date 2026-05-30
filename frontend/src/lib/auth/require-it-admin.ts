import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ItAdminContext = {
  /** public.users.id of the acting staff member */
  actorId: string;
  /** lowercase role string from public.users.role */
  role: 'it_admin' | 'admin';
  /** service-role client for privileged operations */
  admin: SupabaseClient;
};

export type RequireItAdminResult =
  | { ok: true; ctx: ItAdminContext }
  | { ok: false; status: number; error: string };

/**
 * Gate an API route to IT admins (and admins, who outrank them).
 * Returns the acting user's public.users.id plus a service-role client.
 */
export async function requireItAdmin(): Promise<RequireItAdminResult> {
  const server = await createClient();
  const { data: { user: authUser } } = await server.auth.getUser();
  if (!authUser) {
    return { ok: false, status: 401, error: 'You must be signed in.' };
  }

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('id, role')
    .eq('auth_user_id', authUser.id)
    .single();

  const row = me as { id: string; role: string } | null;
  if (!row || (row.role !== 'it_admin' && row.role !== 'admin')) {
    return { ok: false, status: 403, error: 'IT admin access required.' };
  }

  return {
    ok: true,
    ctx: { actorId: row.id, role: row.role as 'it_admin' | 'admin', admin },
  };
}

/** Best-effort audit log write. Never throws. */
export async function writeAuditLog(
  admin: SupabaseClient,
  entry: {
    actorId: string | null;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    details?: Record<string, unknown> | null;
    request?: Request;
  }
): Promise<void> {
  try {
    const ip = entry.request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const userAgent = entry.request?.headers.get('user-agent') ?? null;
    await admin.from('audit_logs').insert({
      actor_id: entry.actorId,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      details: entry.details ?? null,
      ip_address: ip,
      user_agent: userAgent,
    });
  } catch {
    /* audit logging is best-effort; never block the operation */
  }
}
