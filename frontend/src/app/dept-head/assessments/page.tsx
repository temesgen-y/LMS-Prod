'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getDeptIdForHead } from '@/utils/getDeptForHead';

type Assessment = {
  id: string;
  offeringId: string;
  offeringLabel: string;
  title: string;
  type: string;
  totalMarks: number;
  status: string;
  availableFrom: string | null;
  availableUntil: string | null;
  pendingCount: number;
  gradedCount: number;
};

const TYPE_LABELS: Record<string, string> = {
  quiz: 'Quiz', midterm: 'Midterm', final_exam: 'Final Exam', practice: 'Practice',
};
const STATUS_COLORS: Record<string, string> = {
  draft: 'text-gray-500', published: 'text-green-600',
  closed: 'text-amber-600', archived: 'text-gray-400',
};
const PAGE_SIZE = 15;

export default function DeptHeadAssessmentsPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [search, setSearch]           = useState('');
  const [filterType, setFilterType]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage]               = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setError('Not authenticated'); setLoading(false); return; }

      const { data: appUser } = await supabase
        .from('users').select('id').eq('auth_user_id', authData.user.id).single();
      if (!appUser) { setError('User not found'); setLoading(false); return; }
      const userId = (appUser as any).id as string;

      // Get dept-head's department
      const deptId = await getDeptIdForHead(supabase, userId);
      if (!deptId) {
        setAssessments([]);
        setLoading(false);
        return;
      }

      // Get all instructors in the department
      const { data: profiles } = await supabase
        .from('instructor_profiles')
        .select('user_id')
        .eq('department_id', deptId);

      const instrIds = ((profiles ?? []) as any[]).map((p: any) => p.user_id);
      if (!instrIds.length) { setAssessments([]); setLoading(false); return; }

      // Get all offering IDs for those instructors
      const { data: ciRows } = await supabase
        .from('course_instructors')
        .select('offering_id')
        .in('instructor_id', instrIds);

      const offeringIds = [...new Set(((ciRows ?? []) as any[]).map((r: any) => r.offering_id))];
      if (!offeringIds.length) { setAssessments([]); setLoading(false); return; }

      // Fetch all assessments for those offerings
      const { data: rows, error: qErr } = await supabase
        .from('assessments')
        .select(`
          id, offering_id, title, type, total_marks, status,
          available_from, available_until,
          course_offerings!fk_assessments_offering(
            section_name,
            courses!fk_course_offerings_course(code, title),
            academic_terms!fk_course_offerings_term(academic_year_label, term_name)
          )
        `)
        .in('offering_id', offeringIds)
        .order('created_at', { ascending: false });

      if (qErr) { setError(qErr.message); setLoading(false); return; }

      // Fetch submission counts
      const assessmentIds = ((rows ?? []) as any[]).map((r: any) => r.id);
      const pendingMap: Record<string, number> = {};
      const gradedMap:  Record<string, number> = {};
      if (assessmentIds.length > 0) {
        const { data: attRows } = await supabase
          .from('assessment_attempts')
          .select('assessment_id, status')
          .in('assessment_id', assessmentIds)
          .in('status', ['submitted', 'graded', 'timed_out']);
        ((attRows ?? []) as any[]).forEach((a: any) => {
          if (a.status === 'graded') gradedMap[a.assessment_id] = (gradedMap[a.assessment_id] ?? 0) + 1;
          else pendingMap[a.assessment_id] = (pendingMap[a.assessment_id] ?? 0) + 1;
        });
      }

      setAssessments(((rows ?? []) as any[]).map(r => {
        const o = r.course_offerings ?? {};
        const c = o.courses ?? {};
        const t = o.academic_terms ?? {};
        return {
          id: r.id,
          offeringId: r.offering_id,
          offeringLabel: `${(c.code ?? '').toUpperCase()} — ${c.title ?? '—'} · ${[t.academic_year_label, t.term_name].filter(Boolean).join(' · ')} · Sec ${o.section_name ?? 'A'}`,
          title: r.title ?? '',
          type: r.type ?? 'quiz',
          totalMarks: r.total_marks ?? 0,
          status: r.status ?? 'draft',
          availableFrom: r.available_from ?? null,
          availableUntil: r.available_until ?? null,
          pendingCount: pendingMap[r.id] ?? 0,
          gradedCount: gradedMap[r.id] ?? 0,
        };
      }));
    } catch (e: unknown) {
      setError((e as Error)?.message ?? 'Failed to load assessments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = assessments.filter(a => {
    const matchS = !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.offeringLabel.toLowerCase().includes(search.toLowerCase());
    const matchT  = !filterType   || a.type   === filterType;
    const matchSt = !filterStatus || a.status === filterStatus;
    return matchS && matchT && matchSt;
  });

  const totalCount = filtered.length;
  const start      = (page - 1) * PAGE_SIZE;
  const end        = Math.min(start + PAGE_SIZE, totalCount);
  const paginated  = filtered.slice(start, end);

  function fmtDate(ts: string | null) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-2xl">📋</span>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assessments</h1>
          <p className="text-sm text-gray-500">All assessments across your department's course offerings</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <input
            type="search"
            placeholder="Search by title or course..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95]"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <select
          value={filterType}
          onChange={e => { setFilterType(e.target.value); setPage(1); }}
          className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20"
        >
          <option value="">All Types</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20"
        >
          <option value="">All Statuses</option>
          {['draft', 'published', 'closed', 'archived'].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Assessment', 'Type', 'Marks', 'Submissions', 'Status', 'Available'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">Loading assessments…</td></tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <span className="text-3xl block mb-2">📋</span>
                    <p className="text-gray-400 font-medium">No assessments found.</p>
                    <p className="text-gray-400 text-xs mt-1">Assessments created by instructors in your department will appear here.</p>
                  </td>
                </tr>
              ) : paginated.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{a.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{a.offeringLabel}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-medium">
                      {TYPE_LABELS[a.type] ?? a.type}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-700 font-medium">{a.totalMarks}</td>
                  <td className="px-5 py-3">
                    {a.pendingCount > 0 || a.gradedCount > 0 ? (
                      <div className="flex items-center gap-1.5 text-xs">
                        {a.pendingCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                            {a.pendingCount} pending
                          </span>
                        )}
                        {a.gradedCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
                            {a.gradedCount} graded
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">No submissions</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-sm font-medium capitalize ${STATUS_COLORS[a.status] ?? 'text-gray-500'}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {a.availableFrom ? (
                      <span>{fmtDate(a.availableFrom)} → {fmtDate(a.availableUntil)}</span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50/50">
          <p className="text-sm text-gray-500">
            {totalCount === 0 ? 'No results' : `Showing ${start + 1}–${end} of ${totalCount}`}
          </p>
          <div className="flex gap-1">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button type="button" onClick={() => setPage(p => p + 1)} disabled={end >= totalCount}
              className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      {!loading && assessments.length > 0 && (
        <div className="flex flex-wrap gap-4">
          {[
            { label: 'Total', value: assessments.length, color: 'bg-gray-50 border-gray-200' },
            { label: 'Published', value: assessments.filter(a => a.status === 'published').length, color: 'bg-green-50 border-green-200' },
            { label: 'Draft', value: assessments.filter(a => a.status === 'draft').length, color: 'bg-gray-50 border-gray-200' },
            { label: 'Pending Grades', value: assessments.reduce((s, a) => s + a.pendingCount, 0), color: 'bg-amber-50 border-amber-200' },
          ].map(stat => (
            <div key={stat.label} className={`border rounded-lg px-4 py-3 text-center min-w-[100px] ${stat.color}`}>
              <p className="text-xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
