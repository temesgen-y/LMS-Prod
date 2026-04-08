import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRoleNames } from '@/lib/auth/get-user-roles';
import { getHighestRole, type RoleName } from '@/types/auth';

export default async function ItAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    redirect('/login');
  }

  const adminDb = createAdminClient();
  const roleNames = await getUserRoleNames(adminDb, authUser.id);
  const role = getHighestRole(roleNames as RoleName[]);

  if (role !== 'IT_ADMIN' && role !== 'ADMIN') {
    if (role === 'STUDENT') redirect('/dashboard');
    if (role === 'INSTRUCTOR') redirect('/instructor/dashboard');
    if (role === 'REGISTRAR') redirect('/registrar/dashboard');
    if (role === 'DEPARTMENT_HEAD') redirect('/dept-head/home');
    redirect('/unauthorized');
  }

  return <>{children}</>;
}
