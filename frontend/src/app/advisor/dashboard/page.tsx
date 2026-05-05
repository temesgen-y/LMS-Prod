'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface Stats {
  assignedStudents: number;
  upcomingAppointments: number;
  activeHolds: number;
  completedSessions: number;
}

interface RecentAppointment {
  id: string;
  student_name: string;
  scheduled_at: string;
  purpose: string;
  status: string;
}

export default function AdvisorDashboard() {
  const supabase = createClient();
  const [advisorId, setAdvisorId] = useState('');
  const [stats, setStats] = useState<Stats>({ assignedStudents: 0, upcomingAppointments: 0, activeHolds: 0, completedSessions: 0 });
  const [recent, setRecent] = useState<RecentAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
      if (!data) return;
      const aid = (data as { id: string }).id;
      setAdvisorId(aid);

      const now = new Date().toISOString();
      const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString();
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      const [assigned, upcoming, holds, completed, recentApts] = await Promise.all([
        supabase.from('advisor_assignments').select('id', { count: 'exact', head: true }).eq('advisor_id', aid).eq('is_active', true),
        supabase.from('advisor_appointments').select('id', { count: 'exact', head: true }).eq('advisor_id', aid).eq('status', 'scheduled').gte('scheduled_at', now).lte('scheduled_at', weekEnd),
        supabase.from('student_holds').select('id', { count: 'exact', head: true }).eq('placed_by', aid).eq('is_active', true),
        supabase.from('advisor_appointments').select('id', { count: 'exact', head: true }).eq('advisor_id', aid).eq('status', 'completed').gte('scheduled_at', monthStart),
        supabase.from('advisor_appointments')
          .select('id, scheduled_at, purpose, status, users!fk_apt_student(first_name, last_name)')
          .eq('advisor_id', aid)
          .order('scheduled_at', { ascending: false })
          .limit(5),
      ]);

      setStats({
        assignedStudents: assigned.count ?? 0,
        upcomingAppointments: upcoming.count ?? 0,
        activeHolds: holds.count ?? 0,
        completedSessions: completed.count ?? 0,
      });

      setRecent(
        ((recentApts.data ?? []) as any[]).map(r => ({
          id: r.id,
          student_name: r.users ? `${r.users.first_name} ${r.users.last_name}` : '—',
          scheduled_at: r.scheduled_at,
          purpose: r.purpose,
          status: r.status,
        }))
      );
      setLoading(false);
    };
    init();
  }, []);

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      scheduled: 'bg-blue-100 text-blue-700',
      completed: 'bg-green-100 text-green-700',
      cancelled: 'bg-gray-100 text-gray-500',
      no_show: 'bg-red-100 text-red-600',
    };
    return map[s] ?? 'bg-gray-100 text-gray-600';
  };

  const statCards = [
    { label: 'Assigned Students', value: stats.assignedStudents, color: 'text-teal-600', link: '/advisor/students' },
    { label: 'Appointments This Week', value: stats.upcomingAppointments, color: 'text-blue-600', link: '/advisor/appointments' },
    { label: 'Active Holds', value: stats.activeHolds, color: 'text-red-600', link: '/advisor/holds' },
    { label: 'Sessions This Month', value: stats.completedSessions, color: 'text-green-600', link: '/advisor/appointments' },
  ];

  if (loading) return <div className="p-8 text-center text-gray-500">Loading…</div>;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overview of your advising activities</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(c => (
          <Link key={c.label} href={c.link} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition">
            <div className={`text-3xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-sm text-gray-500 mt-1">{c.label}</div>
          </Link>
        ))}
      </div>

      {/* Recent appointments */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Appointments</h2>
          <Link href="/advisor/appointments" className="text-sm text-teal-600 hover:underline">View all</Link>
        </div>
        {recent.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">No appointments yet</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {recent.map(a => (
              <div key={a.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{a.student_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{a.purpose}</p>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(a.status)}`}>
                    {a.status.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {new Date(a.scheduled_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="mt-6 flex gap-3 flex-wrap">
        <Link href="/advisor/students" className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
          View My Students
        </Link>
        <Link href="/advisor/appointments" className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
          Schedule Appointment
        </Link>
        <Link href="/advisor/holds" className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
          Manage Holds
        </Link>
      </div>
    </div>
  );
}
