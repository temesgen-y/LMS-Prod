'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface StatCard {
  label: string;
  count: number;
  bg: string;
  href: string;
}

interface RecentRequest {
  id: string;
  student_name: string;
  course_code: string;
  course_title: string;
  request_type: string;
  updated_at: string;
  status: string;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-600',
    under_review: 'bg-blue-100 text-blue-800',
  };
  return map[status] ?? 'bg-gray-100 text-gray-600';
}

export default function RegistrarDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [firstName, setFirstName] = useState('');
  const [stats, setStats] = useState<StatCard[]>([]);
  const [recent, setRecent] = useState<RecentRequest[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { router.replace('/login'); return; }

        const { data: currentUser } = await supabase
          .from('users').select('id, first_name, last_name, role').eq('auth_user_id', authUser.id).single();
        if (!currentUser) { router.replace('/login'); return; }

        setFirstName((currentUser as any).first_name || 'Registrar');

        // Stat counts
        const [pendingReg, pendingAddDrop, pendingWithdrawal, pendingReadmission, pendingClearance, totalStudents] = await Promise.all([
          supabase.from('registration_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('request_type', 'registration'),
          supabase.from('registration_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').in('request_type', ['add', 'drop']),
          supabase.from('withdrawal_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('readmission_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('clearance_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('status', 'active'),
        ]);

        setStats([
          { label: 'Pending Registrations', count: pendingReg.count ?? 0, bg: 'bg-purple-50', href: '/registrar/registrations' },
          { label: 'Pending Add/Drop', count: pendingAddDrop.count ?? 0, bg: 'bg-blue-50', href: '/registrar/add-drop' },
          { label: 'Pending Withdrawals', count: pendingWithdrawal.count ?? 0, bg: 'bg-amber-50', href: '/registrar/withdrawals' },
          { label: 'Pending Readmissions', count: pendingReadmission.count ?? 0, bg: 'bg-green-50', href: '/registrar/readmissions' },
          { label: 'Pending Clearances', count: pendingClearance.count ?? 0, bg: 'bg-teal-50', href: '/registrar/clearance' },
          { label: 'Total Active Students', count: totalStudents.count ?? 0, bg: 'bg-rose-50', href: '/registrar/students' },
        ]);

        // Recent activity
        const { data: recentData } = await supabase
          .from('registration_requests')
          .select(`
            id, request_type, status, updated_at,
            users!student_id(first_name, last_name),
            course_offerings!offering_id(courses(code, title))
          `)
          .order('updated_at', { ascending: false })
          .limit(15);

        if (recentData) {
          setRecent((recentData as any[]).map(r => ({
            id: r.id,
            student_name: r.users ? `${r.users.first_name || ''} ${r.users.last_name || ''}`.trim() : 'Unknown',
            course_code: r.course_offerings?.courses?.code ?? '—',
            course_title: r.course_offerings?.courses?.title ?? '—',
            request_type: r.request_type,
            updated_at: r.updated_at,
            status: r.status,
          })));
        }
      } catch {
        setError('Failed to load dashboard data.');
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
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-6">{error}</div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <span className="self-start sm:self-auto inline-flex items-center px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-sm font-medium">
          Registrar
        </span>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {stats.map(card => (
          <button
            key={card.label}
            type="button"
            onClick={() => router.push(card.href)}
            className={`${card.bg} rounded-xl p-5 text-left hover:shadow-md transition-shadow border border-transparent hover:border-purple-100`}
          >
            <p className="text-sm text-gray-600 font-medium">{card.label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{card.count}</p>
          </button>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Registration Activity</h2>
        </div>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Student</th>
                  <th className="px-5 py-3 text-left font-medium">Course</th>
                  <th className="px-5 py-3 text-left font-medium">Type</th>
                  <th className="px-5 py-3 text-left font-medium">Date</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recent.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{r.student_name}</td>
                    <td className="px-5 py-3 text-gray-600">{r.course_code} — {r.course_title}</td>
                    <td className="px-5 py-3 capitalize text-gray-600">{r.request_type.replace('_', ' ')}</td>
                    <td className="px-5 py-3 text-gray-500">
                      {new Date(r.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(r.status)}`}>
                        {r.status.replace('_', ' ')}
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
