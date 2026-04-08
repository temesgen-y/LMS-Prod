'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface LeaveRequest {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  status: string;
  review_note: string | null;
  created_at: string;
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

export default function LeaveHistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [filterYear, setFilterYear] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [years, setYears] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { router.replace('/login'); return; }
        const { data: currentUser } = await supabase.from('users').select('id').eq('auth_user_id', authUser.id).single();
        if (!currentUser) return;
        const userId = (currentUser as any).id;

        const { data, error: fetchErr } = await supabase
          .from('leave_requests')
          .select('id, leave_type, start_date, end_date, total_days, reason, status, review_note, created_at')
          .eq('requester_id', userId)
          .order('created_at', { ascending: false });

        if (fetchErr) throw new Error(fetchErr.message);
        const leaves = (data ?? []) as LeaveRequest[];
        setRequests(leaves);

        // Derive years
        const yearSet = new Set<string>();
        leaves.forEach(l => yearSet.add(new Date(l.created_at).getFullYear().toString()));
        setYears(Array.from(yearSet).sort((a, b) => Number(b) - Number(a)));
      } catch (e: any) {
        setError(e.message ?? 'Failed to load leave history');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const filtered = requests.filter(r => {
    if (filterYear && new Date(r.created_at).getFullYear().toString() !== filterYear) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Leave History</h1>
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>}

      <div className="flex flex-wrap gap-3 mb-4">
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="">All Status</option>
          {['pending', 'approved', 'rejected', 'cancelled', 'under_review'].map(s => (
            <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-sm">No leave requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Type</th>
                  <th className="px-5 py-3 text-left font-medium">From</th>
                  <th className="px-5 py-3 text-left font-medium">To</th>
                  <th className="px-5 py-3 text-right font-medium">Days</th>
                  <th className="px-5 py-3 text-left font-medium">Submitted</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3 text-left font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900 capitalize">{r.leave_type}</td>
                    <td className="px-5 py-3 text-gray-600">{new Date(r.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="px-5 py-3 text-gray-600">{new Date(r.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="px-5 py-3 text-right text-gray-900">{r.total_days}</td>
                    <td className="px-5 py-3 text-gray-500">{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(r.status)}`}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 max-w-xs truncate">{r.review_note ?? '—'}</td>
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
