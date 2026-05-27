'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { toast } from 'sonner';
import { upsertGradebookItem } from '@/services/grading.service';
import { InlineAnnotator, type Annotation } from '@/components/instructor/InlineAnnotator';

type AssignmentInfo = {
  id: string;
  title: string;
  max_score: number;
  offering_id: string;
  course_name: string;
  due_date: string;
};

type MatchedPassage = { text: string; startWord: number };

type SourceMatch = {
  submission_id: string;
  student_id: string;
  similarity_pct: number;
  matched_passages: MatchedPassage[];
};

type PlagiarismReport = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  similarity_pct: number | null;
  source_matches: SourceMatch[] | null;
  provider: string;
  provider_report_url: string | null;
  error_message: string | null;
  completed_at: string | null;
};

type Submission = {
  id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  text_body: string | null;
  file_urls: string[] | null;
  status: string;
  submitted_at: string;
  is_late: boolean;
  score: number | null;
  final_score: number | null;
  feedback: string | null;
  enrollment_id: string;
  annotations: Annotation[];
  inputScore: string;
  inputFeedback: string;
  saving: boolean;
  plagReport: PlagiarismReport | null;
  plagChecking: boolean;
  plagProvider: 'native' | 'turnitin';
  showPlagPanel: boolean;
};

function SimilarityBadge({ pct }: { pct: number }) {
  if (pct < 20) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
      {pct}% similar
    </span>
  );
  if (pct < 40) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
      {pct}% similar
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
      {pct}% similar
    </span>
  );
}

export default function AssignmentSubmissionsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [assignment, setAssignment] = useState<AssignmentInfo | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [instructorUserId, setInstructorUserId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'graded'>('all');
  const [bulkChecking, setBulkChecking] = useState(false);
  const [studentNameMap, setStudentNameMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();
      if (!profile) { setLoading(false); return; }
      setInstructorUserId(profile.id);

      const { data: asgn } = await supabase
        .from('assignments')
        .select(`id, title, max_score, offering_id, due_date, course_offerings(courses(title))`)
        .eq('id', id)
        .single();

      if (!asgn) { setLoading(false); return; }

      setAssignment({
        id: asgn.id,
        title: asgn.title,
        max_score: asgn.max_score,
        offering_id: asgn.offering_id,
        due_date: asgn.due_date,
        course_name: (asgn as any).course_offerings?.courses?.title ?? 'Unknown Course',
      });

      const { data: subs } = await supabase
        .from('assignment_submissions')
        .select(`id, student_id, enrollment_id, text_body, file_urls, status, submitted_at, is_late, score, final_score, feedback, annotations`)
        .eq('assignment_id', id)
        .order('submitted_at', { ascending: false });

      const studentIds = (subs ?? []).map((s: any) => s.student_id);
      const nameMap = new Map<string, { name: string; email: string }>();
      if (studentIds.length > 0) {
        const { data: studentRows } = await supabase
          .from('users')
          .select('id, first_name, last_name, email')
          .in('id', studentIds);
        (studentRows ?? []).forEach((u: any) => {
          const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Unknown';
          nameMap.set(u.id, { name, email: u.email ?? '' });
        });
      }
      setStudentNameMap(new Map([...nameMap.entries()].map(([k, v]) => [k, v.name])));

      // Fetch existing plagiarism reports
      const subIds = (subs ?? []).map((s: any) => s.id);
      const reportMap = new Map<string, PlagiarismReport>();
      if (subIds.length > 0) {
        const { data: reports } = await supabase
          .from('plagiarism_reports')
          .select('*')
          .in('submission_id', subIds);
        (reports ?? []).forEach((r: any) => {
          reportMap.set(r.submission_id, r as PlagiarismReport);
        });
      }

      const mapped: Submission[] = (subs ?? []).map((s: any) => ({
        id: s.id,
        student_id: s.student_id,
        student_name: nameMap.get(s.student_id)?.name ?? 'Unknown',
        student_email: nameMap.get(s.student_id)?.email ?? '',
        text_body: s.text_body,
        file_urls: s.file_urls,
        status: s.status,
        submitted_at: s.submitted_at,
        is_late: s.is_late,
        score: s.score,
        final_score: s.final_score,
        feedback: s.feedback,
        enrollment_id: s.enrollment_id,
        annotations: Array.isArray(s.annotations) ? s.annotations : [],
        inputScore: s.score !== null ? String(s.score) : '',
        inputFeedback: s.feedback ?? '',
        saving: false,
        plagReport: reportMap.get(s.id) ?? null,
        plagChecking: false,
        plagProvider: 'native',
        showPlagPanel: false,
      }));

      setSubmissions(mapped);
      setLoading(false);
    };
    load();
  }, [id]);

  const updateField = (subId: string, field: 'inputScore' | 'inputFeedback', value: string) => {
    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, [field]: value } : s));
  };

  const updateAnnotations = (subId: string, anns: Annotation[]) => {
    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, annotations: anns } : s));
  };

  const saveGrade = async (sub: Submission) => {
    if (!assignment) return;
    const scoreNum = parseFloat(sub.inputScore);
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > assignment.max_score) {
      toast.error(`Score must be between 0 and ${assignment.max_score}`);
      return;
    }

    setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, saving: true } : s));
    const supabase = createClient();

    const { error: subError } = await supabase
      .from('assignment_submissions')
      .update({
        score: scoreNum,
        final_score: scoreNum,
        feedback: sub.inputFeedback.trim() || null,
        annotations: sub.annotations,
        status: 'graded',
        graded_by: instructorUserId,
        graded_at: new Date().toISOString(),
      })
      .eq('id', sub.id);

    if (subError) {
      toast.error('Failed to save grade: ' + subError.message);
      setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, saving: false } : s));
      return;
    }

    try {
      await upsertGradebookItem(
        sub.enrollment_id,
        assignment.id,
        'assignment',
        scoreNum,
        assignment.max_score,
      );
      toast.success(`Grade saved for ${sub.student_name}`);
    } catch (err: any) {
      toast.error('Grade saved to submission but failed to update gradebook: ' + (err?.message ?? err));
    }

    const supabase2 = createClient();
    await supabase2.from('notifications').insert({
      user_id: sub.student_id,
      type: 'assignment_graded',
      title: 'Assignment Graded',
      body: `Your submission for "${assignment.title}" has been graded: ${scoreNum}/${assignment.max_score}`,
    });

    setSubmissions(prev => prev.map(s =>
      s.id === sub.id
        ? { ...s, saving: false, score: scoreNum, final_score: scoreNum, feedback: sub.inputFeedback.trim() || null, status: 'graded', annotations: sub.annotations }
        : s
    ));
  };

  const checkPlagiarism = useCallback(async (subId: string) => {
    const sub = submissions.find(s => s.id === subId);
    if (!sub) return;

    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, plagChecking: true } : s));

    try {
      const res = await fetch('/api/plagiarism/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: subId, provider: sub.plagProvider }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Plagiarism check failed');
        setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, plagChecking: false } : s));
        return;
      }

      if (data.message) {
        // Turnitin async — set pending state
        toast.info('Turnitin analysis submitted. Results will appear when ready.');
        setSubmissions(prev => prev.map(s =>
          s.id === subId
            ? { ...s, plagChecking: false, plagReport: { id: data.report_id, status: 'pending', similarity_pct: null, source_matches: null, provider: 'turnitin', provider_report_url: null, error_message: null, completed_at: null } }
            : s
        ));
      } else {
        setSubmissions(prev => prev.map(s =>
          s.id === subId
            ? { ...s, plagChecking: false, showPlagPanel: true, plagReport: { id: data.report_id, status: 'completed', similarity_pct: data.similarity_pct, source_matches: data.source_matches, provider: sub.plagProvider, provider_report_url: null, error_message: null, completed_at: new Date().toISOString() } }
            : s
        ));
      }
    } catch {
      toast.error('Plagiarism check failed');
      setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, plagChecking: false } : s));
    }
  }, [submissions]);

  const bulkCheckPlagiarism = async () => {
    const textSubs = submissions.filter(s => s.text_body && s.text_body.trim().length >= 50);
    if (textSubs.length === 0) {
      toast.info('No text submissions to check');
      return;
    }
    setBulkChecking(true);
    toast.info(`Checking ${textSubs.length} submissions…`);

    for (const sub of textSubs) {
      await fetch('/api/plagiarism/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: sub.id, provider: 'native' }),
      }).then(r => r.json()).then(data => {
        if (data.report_id !== undefined) {
          setSubmissions(prev => prev.map(s =>
            s.id === sub.id
              ? { ...s, plagReport: { id: data.report_id, status: 'completed', similarity_pct: data.similarity_pct, source_matches: data.source_matches, provider: 'native', provider_report_url: null, error_message: null, completed_at: new Date().toISOString() } }
              : s
          ));
        }
      }).catch(() => {});
    }

    setBulkChecking(false);
    toast.success('Bulk plagiarism check complete');
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const filtered = submissions.filter(s => {
    if (filter === 'pending') return s.status !== 'graded';
    if (filter === 'graded') return s.status === 'graded';
    return true;
  });

  const pendingCount = submissions.filter(s => s.status !== 'graded').length;
  const gradedCount = submissions.filter(s => s.status === 'graded').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#4c1d95] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p className="text-4xl mb-3">📭</p>
        <p>Assignment not found.</p>
        <Link href="/instructor/assignments" className="text-[#4c1d95] underline text-sm mt-2 inline-block">Back</Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link
        href="/instructor/assignments"
        className="inline-flex items-center gap-1 text-sm text-[#4c1d95] hover:underline mb-4"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
        </svg>
        Back to Assignments
      </Link>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm mb-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-[#4c1d95] font-medium mb-1">{assignment.course_name}</p>
            <h1 className="text-xl font-bold text-gray-900">{assignment.title}</h1>
            <p className="text-sm text-gray-500 mt-1">
              Due {formatDate(assignment.due_date)} · Max score: {assignment.max_score} pts
            </p>
          </div>
          <div className="flex gap-4 text-center">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
              <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
              <p className="text-xs text-amber-700 font-medium">Pending</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3">
              <p className="text-2xl font-bold text-green-600">{gradedCount}</p>
              <p className="text-xs text-green-700 font-medium">Graded</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3">
              <p className="text-2xl font-bold text-blue-600">{submissions.length}</p>
              <p className="text-xs text-blue-700 font-medium">Total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter tabs + bulk plagiarism */}
      <div className="flex items-center justify-between mb-4 border-b border-gray-200">
        <div className="flex gap-2">
          {(['all', 'pending', 'graded'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                filter === f ? 'border-[#4c1d95] text-[#4c1d95]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {f === 'all' ? `All (${submissions.length})` : f === 'pending' ? `Pending (${pendingCount})` : `Graded (${gradedCount})`}
            </button>
          ))}
        </div>
        <button
          onClick={bulkCheckPlagiarism}
          disabled={bulkChecking}
          className="mb-1 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100 disabled:opacity-60 transition-colors"
        >
          {bulkChecking ? (
            <svg className="w-3.5 h-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v8H4Z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M8 1a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM4.5 7.5A.5.5 0 0 1 5 7h6a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5v-1ZM3 11a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v3H3v-3Z" />
            </svg>
          )}
          {bulkChecking ? 'Checking…' : 'Check All Plagiarism'}
        </button>
      </div>

      {/* Submission list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p className="font-medium">No submissions yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(sub => {
            const isExpanded = expandedId === sub.id;
            const isGraded = sub.status === 'graded';
            const hasReport = sub.plagReport?.status === 'completed';
            const simPct = sub.plagReport?.similarity_pct ?? null;

            return (
              <div
                key={sub.id}
                className={`bg-white border rounded-xl shadow-sm overflow-hidden ${
                  isGraded ? 'border-green-200' : 'border-amber-200'
                }`}
              >
                {/* Summary row */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50/50 gap-4"
                  onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-[#4c1d95]">
                        {sub.student_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate">{sub.student_name}</p>
                      <p className="text-xs text-gray-500 truncate">{sub.student_email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                    {sub.is_late && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">Late</span>
                    )}
                    {hasReport && simPct !== null && <SimilarityBadge pct={simPct} />}
                    {sub.plagReport?.status === 'pending' && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 animate-pulse">Checking…</span>
                    )}
                    {isGraded ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                        {sub.final_score ?? sub.score}/{assignment.max_score}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Needs grading</span>
                    )}
                    <p className="text-xs text-gray-400 hidden sm:block">{formatDate(sub.submitted_at)}</p>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    >
                      <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 py-5 bg-gray-50/30 space-y-4">
                    {/* Text response with inline annotation */}
                    {sub.text_body && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Text Response</p>
                        <InlineAnnotator
                          text={sub.text_body}
                          annotations={sub.annotations}
                          onChange={anns => updateAnnotations(sub.id, anns)}
                        />
                      </div>
                    )}

                    {/* File attachments */}
                    {sub.file_urls && sub.file_urls.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Attachments</p>
                        <div className="flex flex-wrap gap-2">
                          {sub.file_urls.map((url, i) => {
                            const fileName = url.split('/').pop()?.replace(/^\d+_/, '') ?? `File ${i + 1}`;
                            return (
                              <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-[#4c1d95] hover:bg-purple-50 hover:border-purple-300 transition-colors"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                  <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h6.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V12.5A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-9Z" />
                                </svg>
                                {fileName}
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {!sub.text_body && (!sub.file_urls || sub.file_urls.length === 0) && (
                      <p className="text-sm text-gray-400 italic">No content submitted.</p>
                    )}

                    {/* Plagiarism section */}
                    <div className="bg-white border border-violet-100 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Plagiarism Check</p>
                        <div className="flex items-center gap-2">
                          {/* Provider selector */}
                          <select
                            value={sub.plagProvider}
                            onChange={e => setSubmissions(prev => prev.map(s =>
                              s.id === sub.id ? { ...s, plagProvider: e.target.value as 'native' | 'turnitin' } : s
                            ))}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-violet-400"
                          >
                            <option value="native">Native (n-gram)</option>
                            <option value="turnitin">Turnitin TCA</option>
                          </select>
                          <button
                            onClick={() => checkPlagiarism(sub.id)}
                            disabled={sub.plagChecking || !sub.text_body}
                            title={!sub.text_body ? 'Only text submissions can be checked' : ''}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
                          >
                            {sub.plagChecking ? (
                              <svg className="w-3.5 h-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v8H4Z" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
                              </svg>
                            )}
                            {sub.plagChecking ? 'Checking…' : hasReport ? 'Re-check' : 'Check'}
                          </button>
                          {hasReport && (
                            <button
                              onClick={() => setSubmissions(prev => prev.map(s =>
                                s.id === sub.id ? { ...s, showPlagPanel: !s.showPlagPanel } : s
                              ))}
                              className="text-xs text-violet-600 hover:underline"
                            >
                              {sub.showPlagPanel ? 'Hide results' : 'Show results'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Report summary */}
                      {sub.plagReport?.status === 'processing' && (
                        <p className="text-xs text-gray-500 animate-pulse">Processing…</p>
                      )}
                      {sub.plagReport?.status === 'pending' && (
                        <p className="text-xs text-gray-500">Turnitin analysis queued. Refresh to see results.</p>
                      )}
                      {sub.plagReport?.status === 'failed' && (
                        <p className="text-xs text-red-500">{sub.plagReport.error_message ?? 'Check failed.'}</p>
                      )}
                      {hasReport && simPct !== null && (
                        <div className="mb-2">
                          <div className="flex items-center gap-3 mb-1">
                            <SimilarityBadge pct={simPct} />
                            <span className="text-xs text-gray-500">
                              {sub.plagReport?.provider === 'turnitin' ? 'via Turnitin' : 'native n-gram Jaccard'}
                            </span>
                          </div>
                          {/* Bar */}
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                simPct < 20 ? 'bg-green-400' : simPct < 40 ? 'bg-yellow-400' : 'bg-red-400'
                              }`}
                              style={{ width: `${Math.min(simPct, 100)}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            {simPct < 20 ? 'Low similarity — looks original.' : simPct < 40 ? 'Moderate similarity — review recommended.' : 'High similarity — potential plagiarism.'}
                          </p>
                        </div>
                      )}

                      {/* Matched passages panel */}
                      {hasReport && sub.showPlagPanel && sub.plagReport?.source_matches && sub.plagReport.source_matches.length > 0 && (
                        <div className="mt-3 space-y-3">
                          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Matched Sources</p>
                          {sub.plagReport.source_matches.map((match, i) => (
                            <div key={i} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-gray-700">
                                  {studentNameMap.get(match.student_id) ?? `Student ${i + 1}`}
                                </span>
                                <SimilarityBadge pct={match.similarity_pct} />
                              </div>
                              {match.matched_passages.slice(0, 3).map((passage, pi) => (
                                <div key={pi} className="mt-1.5 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
                                  <p className="text-xs text-yellow-900 italic">"{passage.text}"</p>
                                  <p className="text-xs text-yellow-600 mt-0.5">Word {passage.startWord + 1}</p>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      {hasReport && sub.showPlagPanel && simPct === 0 && (
                        <p className="text-xs text-green-600 mt-2">No matching content found among other submissions.</p>
                      )}

                      {!sub.text_body && (
                        <p className="text-xs text-gray-400">Only text submissions can be checked for plagiarism.</p>
                      )}
                    </div>

                    {/* Grading form */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">Grade Submission</p>
                      <div className="flex flex-col gap-3">
                        <div className="flex-shrink-0">
                          <label className="block text-xs text-gray-500 mb-1">
                            Score (max: {assignment.max_score})
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={assignment.max_score}
                            step={0.5}
                            value={sub.inputScore}
                            onChange={e => updateField(sub.id, 'inputScore', e.target.value)}
                            placeholder={`0–${assignment.max_score}`}
                            className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs text-gray-500 mb-1">Overall Feedback (optional)</label>
                          <textarea
                            rows={3}
                            value={sub.inputFeedback}
                            onChange={e => updateField(sub.id, 'inputFeedback', e.target.value)}
                            placeholder="Great work! / Please revise the second paragraph…"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95] resize-y"
                          />
                        </div>
                        <div className="flex items-start">
                          <button
                            type="button"
                            onClick={() => saveGrade(sub)}
                            disabled={sub.saving || !sub.inputScore}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-[#4c1d95] text-white text-sm font-semibold rounded-lg hover:bg-[#3b0764] transition-colors disabled:opacity-60"
                          >
                            {sub.saving && (
                              <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v8H4Z" />
                              </svg>
                            )}
                            {isGraded ? 'Update Grade' : 'Save Grade'}
                          </button>
                        </div>
                      </div>
                      {isGraded && (
                        <p className="text-xs text-green-600 mt-2">
                          Graded: {sub.final_score ?? sub.score}/{assignment.max_score}
                          {sub.feedback ? ` · "${sub.feedback}"` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
