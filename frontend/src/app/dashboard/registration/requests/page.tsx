'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Request = {
  id            : string;
  requestType   : string;
  status        : string;
  reason        : string | null;
  rejectionNote : string | null;
  prereqOverride: boolean;
  createdAt     : string;
  updatedAt     : string;
  courseCode    : string;
  courseTitle   : string;
  termName      : string;
  sectionName   : string | null;
};

const STATUS_BADGE: Record<string, string> = {
  pending      : 'bg-yellow-100 text-yellow-800',
  approved     : 'bg-green-100 text-green-800',
  rejected     : 'bg-red-100 text-red-800',
  cancelled    : 'bg-gray-100 text-gray-600',
  under_review : 'bg-blue-100 text-blue-800',
};

const TYPE_BADGE: Record<string, string> = {
  registration : 'bg-purple-100 text-purple-800',
  add          : 'bg-green-100 text-green-800',
  drop         : 'bg-orange-100 text-orange-800',
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MyRequestsPage() {
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [requests, setRequests] = useState<Request[]>([]);
  const [tab, setTab]           = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const { data: currentUser } = await supabase
        .from('users').select('id').eq('auth_user_id', authUser.id).single();
      if (!currentUser) return;

      const { data, error: fetchErr } = await supabase
        .from('registration_requests')
        .select(`
          id, request_type, status, reason, rejection_note, prereq_override, created_at, updated_at,
          course_offerings!offering_id(
            section_name,
            courses(code, title),
            academic_terms(term_name)
          )
        `)
        .eq('student_id', (currentUser as any).id)
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      setRequests(((data ?? []) as any[]).map((r: any) => ({
        id:             r.id,
        requestType:    r.request_type,
        status:         r.status,
        reason:         r.reason,
        rejectionNote:  r.rejection_note,
        prereqOverride: r.prereq_override,
        createdAt:      r.created_at,
        updatedAt:      r.updated_at,
        courseCode:     r.course_offerings?.courses?.code ?? '—',
        courseTitle:    r.course_offerings?.courses?.title ?? '—',
        termName:       r.course_offerings?.academic_terms?.term_name ?? '—',
        sectionName:    r.course_offerings?.section_name ?? null,
      })));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = requests.filter(r => tab === 'all' || r.status === tab);

  const counts = {
    all:      requests.length,
    pending:  requests.filter(r => r.status === 'pending' || r.status === 'under_review').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected' || r.status === 'cancelled').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4c1d95]" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Registration Requests</h1>
        <p className="text-sm text-gray-500 mt-1">Track the status of all your submitted registration requests.</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {(['all', 'pending', 'approved', 'rejected'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg -mb-px capitalize transition-colors ${
              tab === t
                ? 'bg-white border border-b-white border-gray-200 text-[#4c1d95]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab === t ? 'bg-[#4c1d95]/10 text-[#4c1d95]' : 'bg-gray-100 text-gray-500'}`}>
              {counts[t]}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="font-medium">No requests found</p>
          <p className="text-xs mt-1">You have not submitted any registration requests yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Course</th>
                  <th className="px-5 py-3 text-left font-medium">Section</th>
                  <th className="px-5 py-3 text-left font-medium">Term</th>
                  <th className="px-5 py-3 text-left font-medium">Type</th>
                  <th className="px-5 py-3 text-left font-medium">Submitted</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3 text-left font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{r.courseCode}</p>
                      <p className="text-xs text-gray-500">{r.courseTitle}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{r.sectionName ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{r.termName}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TYPE_BADGE[r.requestType] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.requestType}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{fmtDate(r.createdAt)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 max-w-xs truncate">
                      {r.rejectionNote ? (
                        <span className="text-red-600">{r.rejectionNote}</span>
                      ) : r.prereqOverride ? (
                        <span className="text-amber-600 text-xs">Prereq override granted</span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
