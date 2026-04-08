'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { toast } from 'sonner';
import { updateGradebookItem } from '@/utils/updateGradebook';

type AssignmentInfo = {
  id: string;
  title: string;
  max_score: number;
  offering_id: string;
  course_name: string;
  due_date: string;
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
  // grade entry state
  inputScore: string;
  inputFeedback: string;
  saving: boolean;
};

export default function AssignmentSubmissionsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [assignment, setAssignment] = useState<AssignmentInfo | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [instructorUserId, setInstructorUserId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'graded'>('all');

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

      // Fetch assignment details
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

      // Fetch all submissions
      const { data: subs } = await supabase
        .from('assignment_submissions')
        .select(`id, student_id, enrollment_id, text_body, file_urls, status, submitted_at, is_late, score, final_score, feedback`)
        .eq('assignment_id', id)
        .order('submitted_at', { ascending: false });

      // Fetch student names separately
      const studentIds = (subs ?? []).map((s: any) => s.student_id);
      let studentMap = new Map<string, { name: string; email: string }>();
      if (studentIds.length > 0) {
        const { data: studentRows } = await supabase
          .from('users')
          .select('id, first_name, last_name, email')
          .in('id', studentIds);
        (studentRows ?? []).forEach((u: any) => {
          const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Unknown';
          studentMap.set(u.id, { name, email: u.email ?? '' });
        });
      }

      const mapped: Submission[] = (subs ?? []).map((s: any) => ({
        id: s.id,
        student_id: s.student_id,
        student_name: studentMap.get(s.student_id)?.name ?? 'Unknown',
        student_email: studentMap.get(s.student_id)?.email ?? '',
        text_body: s.text_body,
        file_urls: s.file_urls,
        status: s.status,
        submitted_at: s.submitted_at,
        is_late: s.is_late,
        score: s.score,
        final_score: s.final_score,
        feedback: s.feedback,
        enrollment_id: s.enrollment_id,
        inputScore: s.score !== null ? String(s.score) : '',
        inputFeedback: s.feedback ?? '',
        saving: false,
      }));

      setSubmissions(mapped);
      setLoading(false);
    };
    load();
  }, [id]);

  const updateField = (subId: string, field: 'inputScore' | 'inputFeedback', value: string) => {
    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, [field]: value } : s));
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

    // Update assignment_submissions
    const { error: subError } = await supabase
      .from('assignment_submissions')
      .update({
        score: scoreNum,
        final_score: scoreNum,
        feedback: sub.inputFeedback.trim() || null,
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

    // Update grades table + gradebook_items + recalculate final grade
    try {
      await updateGradebookItem(
        supabase,
        sub.enrollment_id,
        sub.student_id,
        assignment.id,
        'assignment',
        scoreNum,
        assignment.max_score,
        0,
      );
      toast.success(`Grade saved for ${sub.student_name}`);
    } catch (err: any) {
      toast.error('Grade saved to submission but failed to update gradebook: ' + (err?.message ?? err));
    }

    // Notify student
    await supabase.from('notifications').insert({
      user_id: sub.student_id,
      type: 'assignment_graded',
      title: 'Assignment Graded',
      body: `Your submission for "${assignment.title}" has been graded: ${scoreNum}/${assignment.max_score}`,
    });

    setSubmissions(prev => prev.map(s =>
      s.id === sub.id
        ? { ...s, saving: false, score: scoreNum, final_score: scoreNum, feedback: sub.inputFeedback.trim() || null, status: 'graded' }
        : s
    ));
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
      {/* Back */}
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

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 border-b border-gray-200">
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
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {sub.is_late && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">Late</span>
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
                  <div className="border-t border-gray-100 px-5 py-5 bg-gray-50/30">
                    {/* Text response */}
                    {sub.text_body && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Text Response</p>
                        <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap max-h-64 overflow-y-auto">
                          {sub.text_body}
                        </div>
                      </div>
                    )}

                    {/* File attachments */}
                    {sub.file_urls && sub.file_urls.length > 0 && (
                      <div className="mb-4">
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
                      <p className="text-sm text-gray-400 italic mb-4">No content submitted.</p>
                    )}

                    {/* Grading form */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">Grade Submission</p>
                      <div className="flex flex-col sm:flex-row gap-3">
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
                          <label className="block text-xs text-gray-500 mb-1">Feedback (optional)</label>
                          <input
                            type="text"
                            value={sub.inputFeedback}
                            onChange={e => updateField(sub.id, 'inputFeedback', e.target.value)}
                            placeholder="Great work! / Please revise..."
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]"
                          />
                        </div>
                        <div className="flex items-end">
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
