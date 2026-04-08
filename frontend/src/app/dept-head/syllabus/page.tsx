import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function DeptHeadSyllabusFallback() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) redirect('/login');

  const { data: appUser } = await supabase
    .from('users').select('id').eq('auth_user_id', authUser.id).single();
  if (!appUser) redirect('/dept-head/home');

  const { data: assignments } = await supabase
    .from('course_instructors')
    .select('offering_id, course_offerings(id, academic_terms(is_current))')
    .eq('instructor_id', (appUser as any).id);

  if (!assignments || assignments.length === 0) redirect('/dept-head/home');

  const sorted = [...assignments].sort((a: any, b: any) =>
    (b.course_offerings?.academic_terms?.is_current ? 1 : 0) -
    (a.course_offerings?.academic_terms?.is_current ? 1 : 0)
  );

  redirect(`/dept-head/courses/${(sorted[0] as any).offering_id}/syllabus`);
}
