'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface LeaveSummary { leave_type: string; approved: number; pending: number; rejected: number; total_days: number; }
interface WorkloadRow { name: string; courses: number; total_enrolled: number; }

export default function DeptHeadReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [leaveSummary, setLeaveSummary] = useState<LeaveSummary[]>([]);
  const [workload, setWorkload] = useState<WorkloadRow[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { router.replace('/login'); return; }
        const { data: currentUser } = await supabase.from('users').select('id').eq('auth_user_id', authUser.id).single();
        if (!currentUser) return;
        const userId = (currentUser as any).id;

        const { data: dhProfile } = await supabase.from('department_head_profiles').select('department_id').eq('user_id', userId).single();
        const deptId = (dhProfile as any)?.department_id;
        if (!deptId) { setLoading(false); return; }

        const { data: instrProfiles } = await supabase
          .from('instructor_profiles')
          .select('user_id, users!instructor_profiles_user_id_fkey(first_name, last_name)')
          .eq('department_id', deptId);
        const instrUserIds = (instrProfiles ?? []).map((p: any) => p.user_id);

        if (instrUserIds.length === 0) { setLoading(false); return; }

        // Leave summary
        const { data: leaveData } = await supabase
          .from('leave_requests')
          .select('leave_type, status, total_days')
          .in('requester_id', instrUserIds);

        const summaryMap: Record<string, LeaveSummary> = {};
        ((leaveData ?? []) as any[]).forEach(l => {
          if (!summaryMap[l.leave_type]) {
            summaryMap[l.leave_type] = { leave_type: l.leave_type, approved: 0, pending: 0, rejected: 0, total_days: 0 };
          }
          if (l.status === 'approved') { summaryMap[l.leave_type].approved++; summaryMap[l.leave_type].total_days += l.total_days; }
          else if (l.status === 'pending') summaryMap[l.leave_type].pending++;
          else if (l.status === 'rejected') summaryMap[l.leave_type].rejected++;
        });
        setLeaveSummary(Object.values(summaryMap));

        // Workload
        const workloadRows: WorkloadRow[] = [];
        for (const p of (instrProfiles ?? []) as any[]) {
          const { data: ciData } = await supabase
            .from('course_instructors')
            .select('offering_id, course_offerings(enrolled_count)')
            .eq('instructor_id', p.user_id);
          const courses = (ciData ?? []).length;
          const totalEnrolled = ((ciData ?? []) as any[]).reduce((sum, c) => sum + (c.course_offerings?.enrolled_count ?? 0), 0);
          workloadRows.push({
            name: p.users ? `${p.users.first_name || ''} ${p.users.last_name || ''}`.trim() : 'Unknown',
            courses,
            total_enrolled: totalEnrolled,
          });
        }
        setWorkload(workloadRows.sort((a, b) => b.courses - a.courses));
      } catch (e: any) {
        setError(e.message ?? 'Failed to load reports');
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
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Department Reports</h1>
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* Leave Summary */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Leave Summary by Type</h2>
        </div>
        {leaveSummary.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">No leave data</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-5 py-3 text-left">Leave Type</th>
                  <th className="px-5 py-3 text-right">Approved</th>
                  <th className="px-5 py-3 text-right">Pending</th>
                  <th className="px-5 py-3 text-right">Rejected</th>
                  <th className="px-5 py-3 text-right">Total Days Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leaveSummary.map(s => (
                  <tr key={s.leave_type} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900 capitalize">{s.leave_type}</td>
                    <td className="px-5 py-3 text-right text-green-700 font-medium">{s.approved}</td>
                    <td className="px-5 py-3 text-right text-yellow-700">{s.pending}</td>
                    <td className="px-5 py-3 text-right text-red-700">{s.rejected}</td>
                    <td className="px-5 py-3 text-right text-gray-900 font-medium">{s.total_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Workload */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Instructor Workload</h2>
        </div>
        {workload.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">No instructors</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-5 py-3 text-left">Instructor</th>
                  <th className="px-5 py-3 text-right">Courses</th>
                  <th className="px-5 py-3 text-right">Total Students</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {workload.map((w, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{w.name}</td>
                    <td className="px-5 py-3 text-right text-gray-900">{w.courses}</td>
                    <td className="px-5 py-3 text-right text-gray-900">{w.total_enrolled}</td>
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
