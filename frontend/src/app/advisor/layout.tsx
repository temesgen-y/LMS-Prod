import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRoleNames } from '@/lib/auth/get-user-roles';
import { getHighestRole, type RoleName } from '@/types/auth';
import AdvisorLayoutClient from './AdvisorLayoutClient';

export default async function AdvisorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) redirect('/login');

  const adminDb = createAdminClient();
  const roleNames = await getUserRoleNames(adminDb, authUser.id);
  const role = getHighestRole(roleNames as RoleName[]);

  if (role !== 'ACADEMIC_ADVISOR' && role !== 'ADMIN') {
    if (role === 'STUDENT') redirect('/dashboard');
    if (role === 'INSTRUCTOR') redirect('/instructor/dashboard');
    if (role === 'REGISTRAR') redirect('/registrar/dashboard');
    if (role === 'DEPARTMENT_HEAD') redirect('/dept-head/home');
    redirect('/unauthorized');
  }

  const { data: appUser } = await adminDb
    .from('users')
    .select('id, email, first_name, last_name')
    .eq('auth_user_id', authUser.id)
    .single();

  const displayName = appUser
    ? [appUser.first_name, appUser.last_name].filter(Boolean).join(' ').trim()
    : '';

  const advisorUser = {
    id: appUser?.id ?? authUser.id,
    name: (displayName || authUser.email) ?? 'Advisor',
    email: (appUser?.email ?? authUser.email) ?? '',
  };

  return <AdvisorLayoutClient user={advisorUser}>{children}</AdvisorLayoutClient>;
}
