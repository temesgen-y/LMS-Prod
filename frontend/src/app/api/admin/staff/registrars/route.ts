import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRoleNames } from '@/lib/auth/get-user-roles';
import { getHighestRole, type RoleName } from '@/types/auth';

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser }, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const roleNames = await getUserRoleNames(supabase, authUser.id);
    if (getHighestRole(roleNames as RoleName[]) !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: profiles, error: profilesError } = await admin
      .from('registrar_profiles')
      .select('id, staff_no, department, profile_status, created_at, user_id')
      .order('created_at', { ascending: false });

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 });
    }

    const userIds = (profiles ?? []).map((p: any) => p.user_id).filter(Boolean);
    let usersMap: Record<string, any> = {};

    if (userIds.length > 0) {
      const { data: usersData, error: usersError } = await admin
        .from('users')
        .select('id, first_name, last_name, email')
        .in('id', userIds);
      if (usersError) {
        return NextResponse.json({ error: usersError.message }, { status: 500 });
      }
      for (const u of usersData ?? []) {
        usersMap[u.id] = u;
      }
    }

    const registrars = (profiles ?? []).map((row: any) => {
      const u = usersMap[row.user_id] ?? {};
      return {
        userId: row.user_id,
        profileId: row.id,
        fullName: [u.first_name, u.last_name].filter(Boolean).join(' ') || '—',
        email: u.email ?? '—',
        staffNo: row.staff_no ?? '',
        department: row.department ?? '',
        status: row.profile_status ?? 'active',
        createdAt: row.created_at,
      };
    });

    return NextResponse.json({ registrars });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
