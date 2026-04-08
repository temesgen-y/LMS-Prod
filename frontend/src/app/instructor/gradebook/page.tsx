import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Redirect to the instructor's current course gradebook.
// This page is hit when no offeringId is known (e.g. direct nav to /instructor/gradebook).
export default async function InstructorGradebookRedirectPage() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) redirect('/login');

  const { data: appUser } = await supabase
    .from('users')
    .select('id')
    .eq('auth_user_id', authUser.id)
    .single();
  if (!appUser) redirect('/instructor/dashboard');

  const { data: assignments } = await supabase
    .from('course_instructors')
    .select(`offering_id, course_offerings(id, academic_terms(is_current))`)
    .eq('instructor_id', (appUser as any).id);

  if (!assignments || assignments.length === 0) redirect('/instructor/dashboard');

  const sorted = [...assignments].sort((a: any, b: any) => {
    const aIsCurrent = a.course_offerings?.academic_terms?.is_current ? 1 : 0;
    const bIsCurrent = b.course_offerings?.academic_terms?.is_current ? 1 : 0;
    return bIsCurrent - aIsCurrent;
  });

  const offeringId = (sorted[0] as any).offering_id;
  redirect(`/instructor/courses/${offeringId}/gradebook`);
}
