'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Term = { id: string; termName: string; yearStart: number | null };
type ReadmissionRecord = {
  id          : string;
  termName    : string;
  status      : string;
  decisionNote: string | null;
  createdAt   : string;
};

const STATUS_BADGE: Record<string, string> = {
  pending     : 'bg-yellow-100 text-yellow-800',
  approved    : 'bg-green-100 text-green-800',
  rejected    : 'bg-red-100 text-red-800',
  deferred    : 'bg-blue-100 text-blue-800',
  under_review: 'bg-indigo-100 text-indigo-800',
  cancelled   : 'bg-gray-100 text-gray-600',
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ReadmissionRequestPage() {
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  const [studentId, setStudentId]   = useState('');
  const [terms, setTerms]           = useState<Term[]>([]);
  const [past, setPast]             = useState<ReadmissionRecord[]>([]);
  const [termId, setTermId]         = useState('');
  const [reason, setReason]         = useState('');
  const [gap, setGap]               = useState('');
  const [submitting, setSubmitting] = useState(false);

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

      // Future / active terms
      const { data: termData } = await supabase
        .from('academic_terms')
        .select('id, term_name, year_start')
        .in('status', ['upcoming', 'active'])
        .order('year_start', { ascending: true });

      setTerms(((termData ?? []) as any[]).map((t: any) => ({
        id:        t.id,
        termName:  t.term_name,
        yearStart: t.year_start,
      })));

      // Past readmission requests
      const { data: rData } = await supabase
        .from('readmission_requests')
        .select(`
          id, status, decision_note, created_at,
          academic_terms!term_requested(term_name, year_start)
        `)
        .eq('student_id', sid)
        .order('created_at', { ascending: false });

      setPast(((rData ?? []) as any[]).map((r: any) => ({
        id:           r.id,
        termName:     r.academic_terms?.term_name ?? '—',
        status:       r.status,
        decisionNote: r.decision_note,
        createdAt:    r.created_at,
      })));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!termId || reason.trim().length < 20 || gap.trim().length < 30) return;
    setSubmitting(true);
    setError(''); setSuccess('');
    try {
      const supabase = createClient();
      // Duplicate check: pending request for same term
      const { data: dup } = await supabase
        .from('readmission_requests').select('id')
        .eq('student_id', studentId).eq('term_requested', termId)
        .in('status', ['pending', 'under_review']).maybeSingle();
      if (dup) { setError('You already have a pending readmission request for that term.'); setSubmitting(false); return; }

      const { error: insErr } = await supabase.from('readmission_requests').insert({
        student_id:      studentId,
        term_requested:  termId,
        reason:          reason.trim(),
        gap_explanation: gap.trim(),
        status:          'pending',
      });
      if (insErr) throw insErr;
      setSuccess('Readmission request submitted. The registrar will review your application.');
      setTermId(''); setReason(''); setGap('');
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
        <h1 className="text-2xl font-bold text-gray-900">Readmission Request</h1>
        <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          ℹ️ Apply for readmission if you were previously enrolled and wish to return. Your academic record will be reviewed.
        </div>
      </div>

      {error   && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">New Application</h2>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Requested Term *</label>
            <select
              value={termId}
              onChange={e => setTermId(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]"
            >
              <option value="">Select term</option>
              {terms.map(t => (
                <option key={t.id} value={t.id}>
                  {t.termName}{t.yearStart ? ` (${t.yearStart})` : ''}
                </option>
              ))}
            </select>
            {terms.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">No upcoming terms are available.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Readmission * <span className="text-gray-400 font-normal">(min 20 characters)</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={4}
              minLength={20}
              required
              placeholder="Explain why you wish to return..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95] resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">{reason.length} / 20 minimum</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Explain Your Absence Period * <span className="text-gray-400 font-normal">(min 30 characters)</span>
            </label>
            <textarea
              value={gap}
              onChange={e => setGap(e.target.value)}
              rows={4}
              minLength={30}
              required
              placeholder="Describe what you were doing during your absence from the university..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95] resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">{gap.length} / 30 minimum</p>
          </div>

          <button
            type="submit"
            disabled={submitting || !termId || reason.trim().length < 20 || gap.trim().length < 30}
            className="w-full py-2.5 bg-[#4c1d95] hover:bg-[#5b21b6] text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Readmission Request'}
          </button>
        </form>
      </div>

      {/* ── Past Requests ─────────────────────────────────────────────────── */}
      {past.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Previous Applications</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Term Requested</th>
                    <th className="px-5 py-3 text-left font-medium">Submitted</th>
                    <th className="px-5 py-3 text-left font-medium">Status</th>
                    <th className="px-5 py-3 text-left font-medium">Decision Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {past.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{r.termName}</td>
                      <td className="px-5 py-3 text-gray-500">{fmtDate(r.createdAt)}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {r.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 max-w-xs">{r.decisionNote ?? '—'}</td>
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
