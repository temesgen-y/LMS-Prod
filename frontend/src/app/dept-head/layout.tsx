import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRoleNames } from '@/lib/auth/get-user-roles';
import { getHighestRole, type RoleName } from '@/types/auth';
import DeptHeadLayoutClient from './DeptHeadLayoutClient';

export default async function DeptHeadLayout({
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

  if (role !== 'DEPARTMENT_HEAD' && role !== 'ADMIN') {
    if (role === 'STUDENT') redirect('/dashboard');
    if (role === 'REGISTRAR') redirect('/registrar/dashboard');
    if (role === 'INSTRUCTOR') redirect('/instructor/dashboard');
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

  const deptHeadUser = {
    id: appUser?.id ?? authUser.id,
    name: (displayName || authUser.email) ?? 'Dept. Head',
    email: (appUser?.email ?? authUser.email) ?? '',
  };

  return (
    <DeptHeadLayoutClient user={deptHeadUser}>
      {children}
    </DeptHeadLayoutClient>
  );
}
