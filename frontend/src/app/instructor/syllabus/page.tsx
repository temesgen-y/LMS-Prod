import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function InstructorSyllabusRedirectPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect('/login');

  const { data: appUser } = await supabase
    .from('users').select('id').eq('auth_user_id', authData.user.id).single();
  if (!appUser) redirect('/login');

  const { data: ci } = await supabase
    .from('course_instructors')
    .select('offering_id')
    .eq('instructor_id', (appUser as any).id)
    .eq('role', 'primary')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (ci) redirect(`/instructor/courses/${(ci as any).offering_id}/syllabus`);
  redirect('/instructor/dashboard');
}
