'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDeptIdForHead } from '@/utils/getDeptForHead';

interface CourseOffering {
  id: string;
  course_code: string;
  course_title: string;
  section: string;
  term_name: string;
  enrolled: number;
  instructor_name: string;
  status: string;
}

export default function DeptCourseOfferingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offerings, setOfferings] = useState<CourseOffering[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { router.replace('/login'); return; }
        const { data: currentUser } = await supabase.from('users').select('id').eq('auth_user_id', authUser.id).single();
        if (!currentUser) return;
        const userId = (currentUser as any).id;

        const deptId = await getDeptIdForHead(supabase, userId);
        if (!deptId) { setLoading(false); return; }

        const { data: deptRow } = await supabase.from('departments').select('name').eq('id', deptId).maybeSingle();
        const deptName = (deptRow as any)?.name ?? '';
        const [q1, q2, q3] = await Promise.all([
          supabase.from('instructor_profiles').select('user_id').eq('department_id', deptId),
          supabase.from('instructor_profiles').select('user_id').eq('department', deptId),
          deptName ? supabase.from('instructor_profiles').select('user_id').ilike('department', deptName) : Promise.resolve({ data: [] as any[] }),
        ]);
        const profileSet = new Map<string, string>();
        for (const p of [...(q1.data ?? []), ...(q2.data ?? []), ...(q3.data ?? [])]) profileSet.set((p as any).user_id, (p as any).user_id);
        const instrProfiles = Array.from(profileSet.values()).map(uid => ({ user_id: uid }));
        const instrUserIds = (instrProfiles ?? []).map((p: any) => p.user_id);

        if (instrUserIds.length === 0) { setLoading(false); return; }

        const { data: ciData } = await supabase
          .from('course_instructors')
          .select('offering_id, instructor_id')
          .in('instructor_id', instrUserIds);

        const offeringIds = [...new Set((ciData ?? []).map((c: any) => c.offering_id))];
        if (offeringIds.length === 0) { setLoading(false); return; }

        const { data, error: fetchErr } = await supabase
          .from('course_offerings')
          .select(`
            id, section_name, enrolled_count, status,
            courses(code, title),
            academic_terms(term_name),
            course_instructors(
              users!course_instructors_instructor_id_fkey(first_name, last_name)
            )
          `)
          .in('id', offeringIds)
          .order('created_at', { ascending: false });

        if (fetchErr) throw new Error(fetchErr.message);

        setOfferings(((data ?? []) as any[]).map(o => ({
          id: o.id,
          course_code: o.courses?.code ?? '—',
          course_title: o.courses?.title ?? '—',
          section: o.section_name ?? '—',
          term_name: o.academic_terms?.term_name ?? '—',
          enrolled: o.enrolled_count ?? 0,
          instructor_name: o.course_instructors?.[0]?.users
            ? `${o.course_instructors[0].users.first_name || ''} ${o.course_instructors[0].users.last_name || ''}`.trim()
            : 'Unassigned',
          status: o.status ?? 'active',
        })));
      } catch (e: any) {
        setError(e.message ?? 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Department Course Offerings</h1>
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {offerings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-sm">No course offerings found for your department</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Course</th>
                  <th className="px-5 py-3 text-left font-medium">Section</th>
                  <th className="px-5 py-3 text-left font-medium">Term</th>
                  <th className="px-5 py-3 text-right font-medium">Enrolled</th>
                  <th className="px-5 py-3 text-left font-medium">Instructor</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {offerings.map(o => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{o.course_code} — {o.course_title}</td>
                    <td className="px-5 py-3 text-gray-600">{o.section}</td>
                    <td className="px-5 py-3 text-gray-600">{o.term_name}</td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">{o.enrolled}</td>
                    <td className="px-5 py-3 text-gray-600">{o.instructor_name}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${o.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
