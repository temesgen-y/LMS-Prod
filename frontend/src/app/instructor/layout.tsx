import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRoleNames } from '@/lib/auth/get-user-roles';
import { getHighestRole, type RoleName } from '@/types/auth';
import InstructorLayoutClient, { type CourseInfo } from './InstructorLayoutClient';

export default async function InstructorLayout({
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

  if (role !== 'ADMIN' && role !== 'INSTRUCTOR' && role !== 'DEPARTMENT_HEAD') {
    if (role === 'STUDENT') redirect('/dashboard');
    if (role === 'REGISTRAR') redirect('/registrar/dashboard');
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
  const instructorUser = {
    id: appUser?.id ?? authUser.id,
    name: (displayName || authUser.email) ?? 'Instructor',
    email: (appUser?.email ?? authUser.email) ?? '',
  };

  // Fetch the instructor's current course offering
  let courseInfo: CourseInfo | null = null;
  if (appUser?.id) {
    const { data: assignments } = await adminDb
      .from('course_instructors')
      .select(`
        offering_id,
        course_offerings (
          id,
          enrolled_count,
          section_name,
          courses ( code, title ),
          academic_terms ( term_name, term_number, start_date, end_date, is_current )
        )
      `)
      .eq('instructor_id', appUser.id);

    if (assignments && assignments.length > 0) {
      // Prefer the offering in the current term, otherwise most recent
      const sorted = [...assignments].sort((a: any, b: any) => {
        const aIsCurrent = a.course_offerings?.academic_terms?.is_current ? 1 : 0;
        const bIsCurrent = b.course_offerings?.academic_terms?.is_current ? 1 : 0;
        return bIsCurrent - aIsCurrent;
      });
      const co = (sorted[0] as any).course_offerings;
      if (co) {
        courseInfo = {
          offeringId: co.id ?? '',
          courseCode: co.courses?.code ?? '',
          courseTitle: co.courses?.title ?? '',
          termName: co.academic_terms?.term_name ?? '',
          termNumber: co.academic_terms?.term_number ?? null,
          startDate: co.academic_terms?.start_date ?? null,
          endDate: co.academic_terms?.end_date ?? null,
          enrolledCount: co.enrolled_count ?? 0,
        };
      }
    }
  }

  return (
    <InstructorLayoutClient user={instructorUser} courseInfo={courseInfo}>
      {children}
    </InstructorLayoutClient>
  );
}
