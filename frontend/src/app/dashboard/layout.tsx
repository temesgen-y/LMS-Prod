import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRoleNames } from '@/lib/auth/get-user-roles';
import { getHighestRole, type RoleName } from '@/types/auth';
import DashboardLayoutClient from './DashboardLayoutClient';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    redirect('/login');
  }

  // Use admin client for DB queries so RLS never blocks role detection.
  const adminDb = createAdminClient();
  const roleNames = await getUserRoleNames(adminDb, authUser.id);
  const role = getHighestRole(roleNames as RoleName[]);

  if (role !== 'STUDENT') {
    if (role === 'ADMIN') redirect('/admin/dashboard');
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

  if (!appUser) {
    redirect('/unauthorized');
  }

  const displayName = [appUser.first_name, appUser.last_name].filter(Boolean).join(' ').trim();
  const dashboardUser = {
    id: appUser.id,
    name: (displayName || authUser.email) ?? 'Student',
    email: (appUser.email ?? authUser.email) ?? '',
    role: 'student',
  };

  const { data: settings } = await supabase
    .from('institution_settings')
    .select('features')
    .single();
  const studyGroupsEnabled = !!((settings?.features as Record<string, unknown>)?.study_groups ?? false);

  return (
    <DashboardLayoutClient user={dashboardUser} studyGroupsEnabled={studyGroupsEnabled}>
      {children}
    </DashboardLayoutClient>
  );
}
