'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDeptIdForHead } from '@/utils/getDeptForHead';

interface LeaveRequest {
  id: string;
  requester_id: string;
  requester_name: string;
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

function leaveTypeColor(type: string) {
  const map: Record<string, string> = {
    annual: 'bg-green-100 text-green-800',
    sick: 'bg-red-100 text-red-800',
    emergency: 'bg-orange-100 text-orange-800',
    maternity: 'bg-pink-100 text-pink-800',
    paternity: 'bg-blue-100 text-blue-800',
    study: 'bg-purple-100 text-purple-800',
    unpaid: 'bg-gray-100 text-gray-600',
  };
  return map[type] ?? 'bg-gray-100 text-gray-600';
}

export default function DeptHeadLeavePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [activeTab, setActiveTab] = useState('pending');
  const [approveModal, setApproveModal] = useState<LeaveRequest | null>(null);
  const [rejectModal, setRejectModal] = useState<LeaveRequest | null>(null);
  const [approveNote, setApproveNote] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.replace('/login'); return; }
      const { data: currentUser } = await supabase.from('users').select('id').eq('auth_user_id', authUser.id).single();
      if (!currentUser) return;
      const userId = (currentUser as any).id;
      setCurrentUserId(userId);

      // Get department (with fallback to departments.head_id)
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

      const { data, error: fetchErr } = await supabase
        .from('leave_requests')
        .select('id, requester_id, leave_type, start_date, end_date, total_days, reason, status, review_note, created_at')
        .in('requester_id', instrUserIds)
        .order('created_at', { ascending: false });

      if (fetchErr) throw new Error(fetchErr.message);

      // Fetch requester names separately to avoid FK ambiguity
      const requesterIds = [...new Set((data ?? []).map((l: any) => l.requester_id))];
      let userNameMap: Record<string, string> = {};
      if (requesterIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users').select('id, first_name, last_name').in('id', requesterIds);
        for (const u of usersData ?? []) {
          userNameMap[u.id] = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown';
        }
      }

      setRequests(((data ?? []) as any[]).map(l => ({
        id: l.id,
        requester_id: l.requester_id,
        requester_name: userNameMap[l.requester_id] ?? 'Unknown',
        leave_type: l.leave_type,
        start_date: l.start_date,
        end_date: l.end_date,
        total_days: l.total_days,
        reason: l.reason,
        status: l.status,
        review_note: l.review_note,
        created_at: l.created_at,
      })));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = activeTab === 'all' ? requests : requests.filter(r => r.status === activeTab);

  const handleApprove = async () => {
    if (!approveModal) return;
    setActionLoading(true);
    try {
      const supabase = createClient();
      await supabase.from('leave_requests').update({
        status: 'approved',
        reviewed_by: currentUserId,
        reviewed_at: new Date().toISOString(),
        review_note: approveNote || null,
        updated_at: new Date().toISOString(),
      }).eq('id', approveModal.id);

      // Update leave balance
      const currentYear = new Date().getFullYear();
      const academicYear = `${currentYear}-${currentYear + 1}`;
      const { data: balance } = await supabase.from('leave_balances')
        .select('id, used_days, remaining_days')
        .eq('user_id', approveModal.requester_id)
        .eq('academic_year', academicYear)
        .eq('leave_type', approveModal.leave_type)
        .maybeSingle();

      if (balance) {
        const newUsed = (balance as any).used_days + approveModal.total_days;
        const newRemaining = Math.max(0, (balance as any).remaining_days - approveModal.total_days);
        await supabase.from('leave_balances').update({ used_days: newUsed, remaining_days: newRemaining, updated_at: new Date().toISOString() }).eq('id', (balance as any).id);
      }

      await supabase.from('notifications').insert({
        user_id: approveModal.requester_id,
        title: 'Leave Request Approved',
        body: `Your ${approveModal.leave_type} leave request has been approved.${approveNote ? ` Note: ${approveNote}` : ''}`,
        type: 'leave',
      });

      setApproveModal(null);
      setApproveNote('');
      loadData();
    } catch (e: any) {
      setError(e.message ?? 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModal || !rejectNote.trim()) return;
    setActionLoading(true);
    try {
      const supabase = createClient();
      await supabase.from('leave_requests').update({
        status: 'rejected',
        reviewed_by: currentUserId,
        reviewed_at: new Date().toISOString(),
        review_note: rejectNote,
        updated_at: new Date().toISOString(),
      }).eq('id', rejectModal.id);

      await supabase.from('notifications').insert({
        user_id: rejectModal.requester_id,
        title: 'Leave Request Rejected',
        body: `Your ${rejectModal.leave_type} leave request was rejected. Reason: ${rejectNote}`,
        type: 'leave',
      });

      setRejectModal(null);
      setRejectNote('');
      loadData();
    } catch (e: any) {
      setError(e.message ?? 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Leave Requests</h1>
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>}

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {['pending', 'approved', 'rejected', 'all'].map(tab => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg -mb-px capitalize ${
              activeTab === tab ? 'bg-white border border-b-white border-gray-200 text-purple-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${activeTab === tab ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
              {tab === 'all' ? requests.length : requests.filter(r => r.status === tab).length}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-sm">No leave requests</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Instructor</th>
                  <th className="px-5 py-3 text-left font-medium">Type</th>
                  <th className="px-5 py-3 text-left font-medium">From</th>
                  <th className="px-5 py-3 text-left font-medium">To</th>
                  <th className="px-5 py-3 text-right font-medium">Days</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{r.requester_name}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${leaveTypeColor(r.leave_type)}`}>
                        {r.leave_type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{new Date(r.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="px-5 py-3 text-gray-600">{new Date(r.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="px-5 py-3 text-right text-gray-900 font-medium">{r.total_days}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(r.status)}`}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {r.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => { setApproveModal(r); setApproveNote(''); }} className="text-xs px-2 py-1 rounded bg-green-100 hover:bg-green-200 text-green-700">Approve</button>
                          <button type="button" onClick={() => { setRejectModal(r); setRejectNote(''); }} className="text-xs px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700">Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approve Modal */}
      {approveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Approve Leave</h2>
              <button type="button" onClick={() => setApproveModal(null)} className="p-2 rounded hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="font-medium text-gray-900">{approveModal.requester_name}</p>
                <p className="text-gray-600 mt-1 capitalize">{approveModal.leave_type} leave · {approveModal.total_days} day{approveModal.total_days !== 1 ? 's' : ''}</p>
                <p className="text-gray-600">{new Date(approveModal.start_date + 'T12:00:00').toLocaleDateString()} – {new Date(approveModal.end_date + 'T12:00:00').toLocaleDateString()}</p>
                <p className="text-gray-500 mt-1">{approveModal.reason}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                <textarea value={approveNote} onChange={e => setApproveNote(e.target.value)} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="Optional note for the instructor..." />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={handleApprove} disabled={actionLoading} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {actionLoading ? 'Processing...' : 'Confirm Approval'}
                </button>
                <button type="button" onClick={() => setApproveModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Reject Leave</h2>
              <button type="button" onClick={() => setRejectModal(null)} className="p-2 rounded hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-700">Rejecting leave for <strong>{rejectModal.requester_name}</strong></p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" placeholder="Provide reason for rejection..." />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={handleReject} disabled={actionLoading || !rejectNote.trim()} className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {actionLoading ? 'Processing...' : 'Confirm Rejection'}
                </button>
                <button type="button" onClick={() => setRejectModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
