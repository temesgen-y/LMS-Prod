'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDeptIdForHead } from '@/utils/getDeptForHead';

interface LeaveRequest {
  id: string;
  requester_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  status: string;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DeptHeadDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [firstName, setFirstName] = useState('');
  const [deptName, setDeptName] = useState('');
  const [deptId, setDeptId] = useState('');
  const [stats, setStats] = useState({ pendingLeave: 0, totalInstructors: 0, activeOfferings: 0, onLeave: 0 });
  const [recentLeave, setRecentLeave] = useState<LeaveRequest[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { router.replace('/login'); return; }

        const { data: currentUser } = await supabase
          .from('users').select('id, first_name, last_name').eq('auth_user_id', authUser.id).single();
        if (!currentUser) { router.replace('/login'); return; }

        setFirstName((currentUser as any).first_name || 'Dept. Head');
        const userId = (currentUser as any).id;

        // Get dept head's department
        const departmentId = await getDeptIdForHead(supabase, userId) ?? '';
        setDeptId(departmentId);

        if (!departmentId) {
          setLoading(false);
          return;
        }

        const { data: deptRow } = await supabase
          .from('departments').select('name').eq('id', departmentId).maybeSingle();
        const deptNameText = (deptRow as any)?.name ?? '';
        setDeptName(deptNameText || 'Your Department');

        const [q1, q2, q3] = await Promise.all([
          supabase.from('instructor_profiles').select('user_id').eq('department_id', departmentId),
          supabase.from('instructor_profiles').select('user_id').eq('department', departmentId),
          deptNameText ? supabase.from('instructor_profiles').select('user_id').ilike('department', deptNameText) : Promise.resolve({ data: [] as any[] }),
        ]);
        const profileSet = new Map<string, string>();
        for (const p of [...(q1.data ?? []), ...(q2.data ?? []), ...(q3.data ?? [])]) profileSet.set((p as any).user_id, (p as any).user_id);
        const instrProfiles = Array.from(profileSet.values()).map(uid => ({ user_id: uid }));

        const instrUserIds = (instrProfiles ?? []).map((p: any) => p.user_id);

        const [pendingLeaveRes, activeOfferingsRes, onLeaveRes] = await Promise.all([
          instrUserIds.length > 0
            ? supabase.from('leave_requests').select('id', { count: 'exact', head: true }).in('requester_id', instrUserIds).eq('status', 'pending')
            : Promise.resolve({ count: 0 }),
          supabase.from('course_offerings').select('id', { count: 'exact', head: true })
            .in('id', instrUserIds.length > 0
              ? await supabase.from('course_instructors').select('offering_id').in('instructor_id', instrUserIds).then(r => (r.data ?? []).map((x: any) => x.offering_id))
              : []
            ),
          instrUserIds.length > 0
            ? supabase.from('leave_requests').select('id', { count: 'exact', head: true })
                .in('requester_id', instrUserIds)
                .eq('status', 'approved')
                .lte('start_date', new Date().toISOString().split('T')[0])
                .gte('end_date', new Date().toISOString().split('T')[0])
            : Promise.resolve({ count: 0 }),
        ]);

        setStats({
          pendingLeave: (pendingLeaveRes as any).count ?? 0,
          totalInstructors: instrUserIds.length,
          activeOfferings: (activeOfferingsRes as any).count ?? 0,
          onLeave: (onLeaveRes as any).count ?? 0,
        });

        // Recent pending leave requests
        if (instrUserIds.length > 0) {
          const { data: leaveData } = await supabase
            .from('leave_requests')
            .select('id, requester_id, leave_type, start_date, end_date, total_days, status')
            .in('requester_id', instrUserIds)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(5);

          // Fetch requester names separately to avoid FK ambiguity
          const rIds = [...new Set((leaveData ?? []).map((l: any) => l.requester_id))];
          let nameMap: Record<string, string> = {};
          if (rIds.length > 0) {
            const { data: uData } = await supabase
              .from('users').select('id, first_name, last_name').in('id', rIds);
            for (const u of uData ?? []) {
              nameMap[u.id] = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown';
            }
          }

          setRecentLeave(((leaveData ?? []) as any[]).map(l => ({
            id: l.id,
            requester_name: nameMap[l.requester_id] ?? 'Unknown',
            leave_type: l.leave_type,
            start_date: l.start_date,
            end_date: l.end_date,
            total_days: l.total_days,
            status: l.status,
          })));
        }
      } catch (e: any) {
        setError(e.message ?? 'Failed to load dashboard');
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
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-6">{error}</div>}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{getGreeting()}, {firstName}</h1>
        <p className="text-sm text-gray-500 mt-1">{deptName} · {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Pending Leave', value: stats.pendingLeave, bg: 'bg-yellow-50', href: '/dept-head/leave' },
          { label: 'Total Instructors', value: stats.totalInstructors, bg: 'bg-blue-50', href: '/dept-head/instructors' },
          { label: 'Active Offerings', value: stats.activeOfferings, bg: 'bg-green-50', href: '/dept-head/course-offerings' },
          { label: 'On Leave Today', value: stats.onLeave, bg: 'bg-orange-50', href: '/dept-head/leave/calendar' },
        ].map(card => (
          <button key={card.label} type="button" onClick={() => router.push(card.href)}
            className={`${card.bg} rounded-xl p-5 text-left hover:shadow-md transition-shadow`}
          >
            <p className="text-sm text-gray-600 font-medium">{card.label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{card.value}</p>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Pending Leave Requests</h2>
          <button type="button" onClick={() => router.push('/dept-head/leave')} className="text-sm text-purple-700 hover:underline">
            View All
          </button>
        </div>
        {recentLeave.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <p className="text-sm">No pending leave requests</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentLeave.map(l => (
              <div key={l.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{l.requester_name}</p>
                  <p className="text-xs text-gray-500 capitalize mt-0.5">
                    {l.leave_type} leave · {l.total_days} day{l.total_days !== 1 ? 's' : ''} · {new Date(l.start_date + 'T12:00:00').toLocaleDateString()} – {new Date(l.end_date + 'T12:00:00').toLocaleDateString()}
                  </p>
                </div>
                <button type="button" onClick={() => router.push('/dept-head/leave')} className="text-xs px-3 py-1.5 rounded bg-purple-100 hover:bg-purple-200 text-purple-700">
                  Review
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
