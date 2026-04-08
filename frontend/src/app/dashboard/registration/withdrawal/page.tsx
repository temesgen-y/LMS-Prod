'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Enrollment = { id: string; offeringId: string; courseCode: string; courseTitle: string };
type WithdrawalRecord = {
  id           : string;
  courseCode   : string;
  courseTitle  : string;
  category     : string;
  status       : string;
  reviewNote   : string | null;
  createdAt    : string;
};

const STATUS_BADGE: Record<string, string> = {
  pending  : 'bg-yellow-100 text-yellow-800',
  approved : 'bg-green-100 text-green-800',
  rejected : 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

const CATEGORIES = ['medical', 'financial', 'personal', 'academic', 'military', 'other'] as const;

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function WithdrawalRequestPage() {
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [success, setSuccess]           = useState('');
  const [studentId, setStudentId]       = useState('');
  const [enrollments, setEnrollments]   = useState<Enrollment[]>([]);
  const [past, setPast]                 = useState<WithdrawalRecord[]>([]);
  const [selectedOffering, setSelectedOffering] = useState('');
  const [category, setCategory]         = useState('');
  const [reason, setReason]             = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [alreadyPending, setAlreadyPending] = useState(false);

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
      const sid = (currentUser as any).id as string;
      setStudentId(sid);

      // Active enrollments
      const { data: enrollData } = await supabase
        .from('enrollments')
        .select(`
          id, offering_id,
          course_offerings!offering_id(courses(code, title))
        `)
        .eq('student_id', sid)
        .eq('status', 'active');

      setEnrollments(((enrollData ?? []) as any[]).map((e: any) => ({
        id:          e.id,
        offeringId:  e.offering_id,
        courseCode:  e.course_offerings?.courses?.code ?? '—',
        courseTitle: e.course_offerings?.courses?.title ?? '—',
      })));

      // Past withdrawal requests
      const { data: wData } = await supabase
        .from('withdrawal_requests')
        .select(`
          id, reason_category, status, review_note, created_at,
          course_offerings!offering_id(courses(code, title))
        `)
        .eq('student_id', sid)
        .order('created_at', { ascending: false });

      setPast(((wData ?? []) as any[]).map((w: any) => ({
        id:          w.id,
        courseCode:  w.course_offerings?.courses?.code ?? '—',
        courseTitle: w.course_offerings?.courses?.title ?? '—',
        category:    w.reason_category,
        status:      w.status,
        reviewNote:  w.review_note,
        createdAt:   w.created_at,
      })));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Check if selected course already has a pending withdrawal
  useEffect(() => {
    if (!selectedOffering) { setAlreadyPending(false); return; }
    const has = past.some(w => {
      const enroll = enrollments.find(e => e.offeringId === selectedOffering);
      return enroll && w.courseCode === enroll.courseCode && (w.status === 'pending');
    });
    setAlreadyPending(has);
  }, [selectedOffering, past, enrollments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOffering || !category || reason.trim().length < 20) return;
    setSubmitting(true);
    setError(''); setSuccess('');
    try {
      const supabase = createClient();

      // Duplicate check
      const { data: dup } = await supabase
        .from('withdrawal_requests').select('id')
        .eq('student_id', studentId).eq('offering_id', selectedOffering)
        .eq('status', 'pending').maybeSingle();
      if (dup) { setError('You already have a pending withdrawal request for this course.'); setSubmitting(false); return; }

      const { error: insErr } = await supabase.from('withdrawal_requests').insert({
        student_id:      studentId,
        offering_id:     selectedOffering,
        reason:          reason.trim(),
        reason_category: category,
        status:          'pending',
        grade_impact:    'W',
      });
      if (insErr) throw insErr;
      setSuccess('Withdrawal request submitted. The registrar will review it.');
      setSelectedOffering(''); setCategory(''); setReason('');
      load();
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4c1d95]" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Withdrawal Request</h1>
        <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          ⚠️ Withdrawal after the add/drop deadline results in a <strong>W grade</strong> on your transcript. Contact your academic advisor before proceeding.
        </div>
      </div>

      {error   && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">New Withdrawal Request</h2>

        {enrollments.length === 0 ? (
          <p className="text-sm text-gray-500">You have no active enrollments to withdraw from.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Course *</label>
              <select
                value={selectedOffering}
                onChange={e => setSelectedOffering(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]"
              >
                <option value="">Select a course</option>
                {enrollments.map(enr => (
                  <option key={enr.offeringId} value={enr.offeringId}>
                    {enr.courseCode} — {enr.courseTitle}
                  </option>
                ))}
              </select>
              {alreadyPending && (
                <p className="text-xs text-red-600 mt-1">You already have a pending withdrawal for this course.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason Category *</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]"
              >
                <option value="">Select category</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Detailed Reason * <span className="text-gray-400 font-normal">(min 20 characters)</span>
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={4}
                minLength={20}
                required
                placeholder="Explain your reason for withdrawal..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95] resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">{reason.length} / 20 minimum</p>
            </div>

            <button
              type="submit"
              disabled={submitting || alreadyPending || !selectedOffering || !category || reason.trim().length < 20}
              className="w-full py-2.5 bg-[#4c1d95] hover:bg-[#5b21b6] text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Withdrawal Request'}
            </button>
          </form>
        )}
      </div>

      {/* ── Past Requests ─────────────────────────────────────────────────── */}
      {past.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Past Withdrawal Requests</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Course</th>
                    <th className="px-5 py-3 text-left font-medium">Category</th>
                    <th className="px-5 py-3 text-left font-medium">Submitted</th>
                    <th className="px-5 py-3 text-left font-medium">Status</th>
                    <th className="px-5 py-3 text-left font-medium">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {past.map(w => (
                    <tr key={w.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{w.courseCode}</p>
                        <p className="text-xs text-gray-500">{w.courseTitle}</p>
                      </td>
                      <td className="px-5 py-3 capitalize text-gray-600">{w.category}</td>
                      <td className="px-5 py-3 text-gray-500">{fmtDate(w.createdAt)}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[w.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {w.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 max-w-xs truncate">{w.reviewNote ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
