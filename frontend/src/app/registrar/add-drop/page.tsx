'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type TabStatus = 'all' | 'pending' | 'approved' | 'rejected' | 'under_review' | 'cancelled';

interface AddDropRequest {
  id: string;
  student_id: string;
  offering_id: string;
  term_id: string;
  request_type: string;
  status: string;
  reason: string | null;
  rejection_note: string | null;
  created_at: string;
  updated_at: string;
  student_name: string;
  student_no: string;
  course_code: string;
  course_title: string;
  term_name: string;
}

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-600',
    under_review: 'bg-blue-100 text-blue-800',
  };
  return map[status] ?? 'bg-gray-100 text-gray-600';
}

export default function AddDropPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [requests, setRequests] = useState<AddDropRequest[]>([]);
  const [filtered, setFiltered] = useState<AddDropRequest[]>([]);
  const [activeTab, setActiveTab] = useState<TabStatus>('all');
  const [search, setSearch] = useState('');
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [selectedRequest, setSelectedRequest] = useState<AddDropRequest | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.replace('/login'); return; }
      const { data: currentUser } = await supabase
        .from('users').select('id').eq('auth_user_id', authUser.id).single();
      if (!currentUser) return;
      setCurrentUserId((currentUser as any).id);

      const { data, error: fetchErr } = await supabase
        .from('registration_requests')
        .select(`
          id, student_id, offering_id, term_id, request_type, status, reason, rejection_note, created_at, updated_at,
          users!student_id(first_name, last_name, student_profiles!user_id(student_no)),
          course_offerings!offering_id(courses(code, title)),
          academic_terms!term_id(term_name)
        `)
        .in('request_type', ['add', 'drop'])
        .order('updated_at', { ascending: false });

      if (fetchErr) throw new Error(fetchErr.message);

      const mapped: AddDropRequest[] = (data ?? []).map((r: any) => ({
        id: r.id,
        student_id: r.student_id,
        offering_id: r.offering_id,
        term_id: r.term_id,
        request_type: r.request_type,
        status: r.status,
        reason: r.reason,
        rejection_note: r.rejection_note,
        created_at: r.created_at,
        updated_at: r.updated_at,
        student_name: r.users ? `${r.users.first_name || ''} ${r.users.last_name || ''}`.trim() : 'Unknown',
        student_no: (Array.isArray(r.users?.student_profiles) ? r.users?.student_profiles?.[0] : r.users?.student_profiles)?.student_no ?? '—',
        course_code: r.course_offerings?.courses?.code ?? '—',
        course_title: r.course_offerings?.courses?.title ?? '—',
        term_name: r.academic_terms?.term_name ?? '—',
      }));

      setRequests(mapped);
      const counts: Record<string, number> = { all: mapped.length };
      ['pending', 'approved', 'rejected', 'under_review', 'cancelled'].forEach(s => {
        counts[s] = mapped.filter(r => r.status === s).length;
      });
      setTabCounts(counts);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    let result = requests;
    if (activeTab !== 'all') result = result.filter(r => r.status === activeTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.student_name.toLowerCase().includes(q) ||
        r.student_no.toLowerCase().includes(q) ||
        r.course_code.toLowerCase().includes(q)
      );
    }
    setFiltered(result);
  }, [requests, activeTab, search]);

  const handleApprove = async (req: AddDropRequest) => {
    setActionLoading(true);
    try {
      const supabase = createClient();
      await supabase.from('registration_requests').update({
        status: 'approved',
        reviewed_by: currentUserId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', req.id);

      if (req.request_type === 'add') {
        await supabase.from('enrollments').upsert({
          student_id: req.student_id,
          offering_id: req.offering_id,
          status: 'active',
          enrollment_date: new Date().toISOString().split('T')[0],
        }, { onConflict: 'student_id,offering_id' });

        await supabase.from('notifications').insert({
          user_id: req.student_id,
          title: 'Course Add Approved',
          body: `Your request to add ${req.course_code} has been approved.`,
          type: 'registration',
        });
      } else {
        await supabase.from('enrollments')
          .update({ status: 'dropped' })
          .eq('student_id', req.student_id)
          .eq('offering_id', req.offering_id);

        await supabase.from('notifications').insert({
          user_id: req.student_id,
          title: 'Course Drop Approved',
          body: `Your request to drop ${req.course_code} has been approved.`,
          type: 'registration',
        });
      }

      loadData();
    } catch (e: any) {
      setError(e.message ?? 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !rejectNote.trim()) return;
    setActionLoading(true);
    try {
      const supabase = createClient();
      await supabase.from('registration_requests').update({
        status: 'rejected',
        reviewed_by: currentUserId,
        reviewed_at: new Date().toISOString(),
        rejection_note: rejectNote,
        updated_at: new Date().toISOString(),
      }).eq('id', selectedRequest.id);

      await supabase.from('notifications').insert({
        user_id: selectedRequest.student_id,
        title: `Course ${selectedRequest.request_type === 'add' ? 'Add' : 'Drop'} Rejected`,
        body: `Your request for ${selectedRequest.course_code} was rejected. Reason: ${rejectNote}`,
        type: 'registration',
      });

      setSelectedRequest(null);
      setShowRejectModal(false);
      setRejectNote('');
      loadData();
    } catch (e: any) {
      setError(e.message ?? 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const tabs: { key: TabStatus; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Rejected' },
    { key: 'under_review', label: 'Under Review' }, { key: 'cancelled', label: 'Cancelled' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Course Add/Drop Requests</h1>
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>}

      <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors -mb-px ${
              activeTab === tab.key ? 'bg-white border border-b-white border-gray-200 text-purple-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tabCounts[tab.key] !== undefined && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${activeTab === tab.key ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                {tabCounts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by student name or course..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-80 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-sm">No requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Student</th>
                  <th className="px-5 py-3 text-left font-medium">Student No</th>
                  <th className="px-5 py-3 text-left font-medium">Course</th>
                  <th className="px-5 py-3 text-left font-medium">Term</th>
                  <th className="px-5 py-3 text-left font-medium">Type</th>
                  <th className="px-5 py-3 text-left font-medium">Submitted</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{r.student_name}</td>
                    <td className="px-5 py-3 text-gray-600">{r.student_no}</td>
                    <td className="px-5 py-3 text-gray-600">{r.course_code} — {r.course_title}</td>
                    <td className="px-5 py-3 text-gray-600">{r.term_name}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${r.request_type === 'add' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                        {r.request_type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadgeClass(r.status)}`}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {r.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApprove(r)}
                              disabled={actionLoading}
                              className="text-xs px-2 py-1 rounded bg-green-100 hover:bg-green-200 text-green-700 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => { setSelectedRequest(r); setShowRejectModal(true); }}
                              className="text-xs px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showRejectModal && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Reject {selectedRequest.request_type === 'add' ? 'Add' : 'Drop'} Request</h2>
              <button type="button" onClick={() => { setShowRejectModal(false); setSelectedRequest(null); }} className="p-2 rounded hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-700">Rejecting for <strong>{selectedRequest.student_name}</strong> — {selectedRequest.course_code}</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason *</label>
                <textarea
                  value={rejectNote}
                  onChange={e => setRejectNote(e.target.value)}
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Provide reason for rejection..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={actionLoading || !rejectNote.trim()}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {actionLoading ? 'Processing...' : 'Confirm Rejection'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowRejectModal(false); setSelectedRequest(null); }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
