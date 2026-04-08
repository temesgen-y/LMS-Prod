'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { updateGradebookItem } from '@/utils/updateGradebook';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'pending' | 'graded' | 'not_submitted';

type QuestionOption = {
  id: string;
  body: string;
  is_correct: boolean;
  sort_order: number;
};

type QuestionRow = {
  id: string;
  body: string;
  type: string;
  marks: number;
  sort_order: number;
  options: QuestionOption[];
};

type AnswerRow = {
  questionId: string;
  textAnswer: string | null;
  selectedOptions: string[] | null;
  isCorrect: boolean | null;
  marksAwarded: number;
};

type Attempt = {
  id: string;
  studentId: string;
  studentName: string;
  studentNo: string | null;
  enrollmentId: string;
  attemptNumber: number;
  status: string;
  submittedAt: string | null;
  score: number | null;
  scorePct: number | null;
  textResponse: string | null;
  answers: AnswerRow[];
  // grading state
  scoreInput: string;
  questionMarks: Record<string, string>; // questionId → marks for open-ended
  saving: boolean;
};

type NotSubmittedStudent = {
  studentId: string;
  studentName: string;
  studentNo: string | null;
  enrollmentId: string;
};

type AssessmentInfo = {
  id: string;
  title: string;
  type: string;
  total_marks: number;
  offeringId: string;
  courseLabel: string;
};

const TYPE_LABELS: Record<string, string> = {
  quiz: 'Quiz', midterm: 'Midterm', final_exam: 'Final Exam', practice: 'Practice',
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssessmentSubmissionsPage() {
  const params        = useParams();
  const searchParams  = useSearchParams();
  const assessmentId  = params?.assessmentId as string;

  const [info, setInfo]           = useState<AssessmentInfo | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [attempts, setAttempts]   = useState<Attempt[]>([]);
  const [notSubmitted, setNotSubmitted] = useState<NotSubmittedStudent[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [tab, setTab]             = useState<Tab>((searchParams?.get('tab') as Tab) ?? 'pending');
  const [search, setSearch]       = useState(searchParams?.get('search') ?? '');

  const load = useCallback(async () => {
    if (!assessmentId) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      // ── Auth ────────────────────────────────────────────────────────────
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setError('Not authenticated.'); return; }

      const { data: appUser } = await supabase
        .from('users').select('id').eq('auth_user_id', authData.user.id).maybeSingle();
      if (!appUser) { setError('User not found.'); return; }

      // ── Assessment info ──────────────────────────────────────────────────
      const { data: assess } = await supabase
        .from('assessments')
        .select('id, title, type, total_marks, offering_id')
        .eq('id', assessmentId)
        .maybeSingle();
      if (!assess) { setError(`Assessment not found (id: ${assessmentId})`); return; }
      const a = assess as any;

      // ── Course label (non-blocking) ──────────────────────────────────────
      let courseLabel = '';
      const { data: offeringData } = await supabase
        .from('course_offerings')
        .select('section_name, courses!fk_course_offerings_course(code, title)')
        .eq('id', a.offering_id)
        .maybeSingle();
      if (offeringData) {
        const c = (offeringData as any).courses ?? {};
        courseLabel = `${c.code ? c.code.toUpperCase() + ' — ' : ''}${c.title ?? ''}`;
      }

      setInfo({
        id: a.id, title: a.title, type: a.type,
        total_marks: a.total_marks,
        offeringId: a.offering_id, courseLabel,
      });

      // ── Questions (primary fetch by assessment_id) ────────────────────────
      let { data: qsData } = await supabase
        .from('questions')
        .select('id, body, type, marks, sort_order')
        .eq('assessment_id', assessmentId)
        .order('sort_order');

      // questions are loaded after student answers below so we defer building mappedQs

      // ── Enrolled students ────────────────────────────────────────────────
      const { data: enrollData } = await supabase
        .from('enrollments')
        .select('id, student_id')
        .eq('offering_id', a.offering_id)
        .in('status', ['active', 'completed']);

      const enrolledRows = (enrollData ?? []) as any[];
      const studentIds = enrolledRows.map((e: any) => e.student_id);
      const enrollmentByStudent: Record<string, string> = {};
      enrolledRows.forEach((e: any) => { enrollmentByStudent[e.student_id] = e.id; });

      const studentInfoMap: Record<string, { name: string; studentNo: string | null }> = {};
      if (studentIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users').select('id, first_name, last_name').in('id', studentIds);
        ((usersData ?? []) as any[]).forEach((u: any) => {
          studentInfoMap[u.id] = {
            name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || '—',
            studentNo: null,
          };
        });
        const { data: spData } = await supabase
          .from('student_profiles').select('user_id, student_no').in('user_id', studentIds);
        ((spData ?? []) as any[]).forEach((sp: any) => {
          if (studentInfoMap[sp.user_id]) studentInfoMap[sp.user_id].studentNo = sp.student_no ?? null;
        });
      }

      // ── Attempts (ALL non-in_progress) ───────────────────────────────────
      const { data: attData, error: attErr } = await supabase
        .from('assessment_attempts')
        .select('id, student_id, enrollment_id, attempt_number, status, submitted_at, score, score_pct, text_response')
        .eq('assessment_id', assessmentId)
        .not('status', 'eq', 'in_progress')
        .order('submitted_at', { ascending: false });

      if (attErr) throw attErr;

      const attRows = (attData ?? []) as any[];
      const attemptIds = attRows.map((x: any) => x.id);
      const submittedStudentIds = new Set(attRows.map((x: any) => x.student_id));

      // ── Student answers ──────────────────────────────────────────────────
      let saByAttempt: Record<string, AnswerRow[]> = {};
      let allSaRows: any[] = [];
      if (attemptIds.length > 0) {
        const { data: saData } = await supabase
          .from('student_answers')
          .select('attempt_id, question_id, text_answer, selected_options, is_correct, marks_awarded')
          .in('attempt_id', attemptIds);
        allSaRows = (saData ?? []) as any[];
        allSaRows.forEach((sa: any) => {
          if (!saByAttempt[sa.attempt_id]) saByAttempt[sa.attempt_id] = [];
          saByAttempt[sa.attempt_id].push({
            questionId:      sa.question_id,
            textAnswer:      sa.text_answer ?? null,
            selectedOptions: sa.selected_options ?? null,
            isCorrect:       sa.is_correct ?? null,
            marksAwarded:    sa.marks_awarded ?? 0,
          });
        });
      }

      // ── Fallback: if primary questions fetch empty, fetch by IDs from answers
      if ((!qsData || qsData.length === 0) && allSaRows.length > 0) {
        const answerQIds = [...new Set(allSaRows.map((sa: any) => sa.question_id).filter(Boolean))];
        if (answerQIds.length > 0) {
          const { data: fallbackQs } = await supabase
            .from('questions')
            .select('id, body, type, marks, sort_order')
            .in('id', answerQIds)
            .order('sort_order');
          if (fallbackQs && fallbackQs.length > 0) qsData = fallbackQs;
        }
      }

      // ── Build questions + options ────────────────────────────────────────
      const qIds = ((qsData ?? []) as any[]).map((q: any) => q.id);
      let optsByQuestion: Record<string, QuestionOption[]> = {};
      if (qIds.length > 0) {
        const { data: optsData } = await supabase
          .from('question_options')
          .select('id, question_id, body, is_correct, sort_order')
          .in('question_id', qIds)
          .order('sort_order');
        ((optsData ?? []) as any[]).forEach((o: any) => {
          if (!optsByQuestion[o.question_id]) optsByQuestion[o.question_id] = [];
          optsByQuestion[o.question_id].push({ id: o.id, body: o.body, is_correct: o.is_correct, sort_order: o.sort_order });
        });
      }

      const mappedQs: QuestionRow[] = ((qsData ?? []) as any[]).map((q: any) => ({
        id: q.id, body: q.body, type: q.type, marks: q.marks, sort_order: q.sort_order,
        options: (optsByQuestion[q.id] ?? []).sort((x, y) => x.sort_order - y.sort_order),
      }));
      setQuestions(mappedQs);

      // ── Build Attempt objects ────────────────────────────────────────────
      const mapped: Attempt[] = attRows.map((att: any) => {
        const si = studentInfoMap[att.student_id] ?? { name: att.student_id?.slice(0, 8) ?? '—', studentNo: null };
        const answers: AnswerRow[] = saByAttempt[att.id] ?? [];
        const questionMarks: Record<string, string> = {};
        answers.forEach(a => {
          const q = mappedQs.find(q => q.id === a.questionId);
          if (q && (q.type === 'essay' || q.type === 'short_answer')) {
            questionMarks[a.questionId] = a.marksAwarded > 0 ? String(a.marksAwarded) : '';
          }
        });
        const autoScore = calcAutoScore(answers, mappedQs, questionMarks);
        const enrollmentId = att.enrollment_id ?? enrollmentByStudent[att.student_id] ?? '';
        return {
          id:            att.id,
          studentId:     att.student_id,
          studentName:   si.name,
          studentNo:     si.studentNo,
          enrollmentId,
          attemptNumber: att.attempt_number,
          status:        att.status,
          submittedAt:   att.submitted_at ?? null,
          score:         att.score ?? null,
          scorePct:      att.score_pct ?? null,
          textResponse:  att.text_response ?? null,
          answers,
          scoreInput:    att.score != null ? String(att.score) : autoScore > 0 ? String(autoScore) : '',
          questionMarks,
          saving:        false,
        };
      });
      setAttempts(mapped);

      // ── Not-submitted students ────────────────────────────────────────────
      const notSub: NotSubmittedStudent[] = studentIds
        .filter(sid => !submittedStudentIds.has(sid))
        .map(sid => ({
          studentId:    sid,
          studentName:  studentInfoMap[sid]?.name ?? '—',
          studentNo:    studentInfoMap[sid]?.studentNo ?? null,
          enrollmentId: enrollmentByStudent[sid] ?? '',
        }))
        .sort((a, b) => a.studentName.localeCompare(b.studentName));
      setNotSubmitted(notSub);

    } catch (err: any) {
      console.error('Submissions page load error:', err);
      setError(`Failed to load submissions: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => { load(); }, [load]);

  // ── Grading helpers ────────────────────────────────────────────────────────

  const updateQuestionMark = (attemptId: string, questionId: string, value: string, maxMark: number) => {
    // Clamp to question's max marks
    const num = parseFloat(value);
    const clamped = !isNaN(num) && num > maxMark ? String(maxMark) : value;
    setAttempts(prev => prev.map(att => {
      if (att.id !== attemptId) return att;
      const newQM = { ...att.questionMarks, [questionId]: clamped };
      const total = calcAutoScore(att.answers, questions, newQM);
      const cappedTotal = info ? Math.min(total, info.total_marks) : total;
      return { ...att, questionMarks: newQM, scoreInput: String(cappedTotal) };
    }));
  };

  const updateScore = (attemptId: string, value: string) => {
    // Clamp to assessment's total marks
    const num = parseFloat(value);
    const maxMarks = info?.total_marks ?? 9999;
    const clamped = !isNaN(num) && num > maxMarks ? String(maxMarks) : value;
    setAttempts(prev => prev.map(a => a.id === attemptId ? { ...a, scoreInput: clamped } : a));
  };

  const saveGrade = async (att: Attempt) => {
    if (!info) return;
    const raw = parseFloat(att.scoreInput);
    if (isNaN(raw) || raw < 0 || raw > info.total_marks) {
      toast.error(`Score must be between 0 and ${info.total_marks}.`);
      return;
    }
    setAttempts(prev => prev.map(a => a.id === att.id ? { ...a, saving: true } : a));

    const supabase = createClient();
    const scorePct = info.total_marks > 0 ? Math.round((raw / info.total_marks) * 10000) / 100 : 0;

    const { data: authData } = await supabase.auth.getUser();
    const { data: appUser }  = await supabase.from('users').select('id').eq('auth_user_id', authData.user!.id).single();
    const instructorId = (appUser as any)?.id;

    // Save per-question marks for open-ended questions
    await Promise.all(
      Object.entries(att.questionMarks).map(([qId, marksStr]) => {
        const m = parseFloat(marksStr);
        if (isNaN(m)) return Promise.resolve();
        return supabase
          .from('student_answers')
          .update({ marks_awarded: m })
          .eq('attempt_id', att.id)
          .eq('question_id', qId);
      })
    );

    // Save overall score on attempt
    const { error: updErr } = await supabase.from('assessment_attempts').update({
      score:     raw,
      score_pct: scorePct,
      passed:    scorePct >= 50,
      status:    'graded',
      graded_at: new Date().toISOString(),
      graded_by: instructorId,
    }).eq('id', att.id);

    if (updErr) {
      toast.error('Failed to save grade.');
      setAttempts(prev => prev.map(a => a.id === att.id ? { ...a, saving: false } : a));
      return;
    }

    // Sync to gradebook
    await updateGradebookItem(supabase, att.enrollmentId, att.studentId, info.id, 'assessment', raw, info.total_marks, 0);

    toast.success(`Grade saved: ${raw}/${info.total_marks}`);
    setAttempts(prev => prev.map(a =>
      a.id === att.id ? { ...a, status: 'graded', score: raw, scorePct, saving: false } : a
    ));
  };

  // ── Derived lists ─────────────────────────────────────────────────────────

  const pending  = attempts.filter(a => a.status !== 'graded');
  const graded   = attempts.filter(a => a.status === 'graded');
  const total    = attempts.length + notSubmitted.length;

  const filterBySearch = <T extends { studentName: string }>(list: T[]) =>
    search.trim()
      ? list.filter(a => a.studentName.toLowerCase().includes(search.toLowerCase()))
      : list;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-7 bg-gray-200 rounded w-48" />
      <div className="h-5 bg-gray-100 rounded w-72" />
      <div className="grid grid-cols-4 gap-3">{[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}</div>
      {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-xl" />)}
    </div>
  );

  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
        <p className="text-red-700 font-medium">{error}</p>
        <Link href="/instructor/assessments" className="text-sm text-[#4c1d95] hover:underline mt-3 inline-block">← Back to Assessments</Link>
      </div>
    </div>
  );

  const tabList = (tab === 'pending' ? pending : tab === 'graded' ? graded : []) as Attempt[];
  const filteredAttempts   = filterBySearch(tabList);
  const filteredNotSub     = filterBySearch(notSubmitted);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <Link href="/instructor/assessments" className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 mb-2">
          ← Back to Assessments
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{info?.title}</h1>
        <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
          {info?.courseLabel && <span>{info.courseLabel}</span>}
          <span className="text-gray-300">·</span>
          <span>{TYPE_LABELS[info?.type ?? ''] ?? info?.type}</span>
          <span className="text-gray-300">·</span>
          <span>{info?.total_marks} marks</span>
        </p>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Enrolled',      value: total,               color: 'text-gray-800' },
          { label: 'Submitted',     value: attempts.length,     color: 'text-blue-600' },
          { label: 'Pending Grade', value: pending.length,      color: 'text-amber-600' },
          { label: 'Graded',        value: graded.length,       color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Search + Tabs ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <input
          type="text"
          placeholder="Search student…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-64 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95]"
        />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {([
            { key: 'pending',       label: 'Pending Grade',  count: pending.length },
            { key: 'graded',        label: 'Graded',         count: graded.length },
            { key: 'not_submitted', label: 'Not Submitted',  count: notSubmitted.length },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                tab === t.key ? 'bg-white text-[#4c1d95] shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                tab === t.key ? 'bg-[#4c1d95]/10 text-[#4c1d95]' : 'bg-gray-200 text-gray-500'
              }`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Not Submitted List ────────────────────────────────────────────── */}
      {tab === 'not_submitted' && (
        <NotSubmittedList students={filteredNotSub} />
      )}

      {/* ── Attempt List ──────────────────────────────────────────────────── */}
      {tab !== 'not_submitted' && (
        filteredAttempts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <span className="text-4xl block mb-3">{tab === 'pending' ? '📭' : '📋'}</span>
            <p className="text-gray-400 font-medium">
              {tab === 'pending' ? 'No submissions pending grading.' : 'No graded submissions yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAttempts.map(att => (
              <AttemptCard
                key={att.id}
                att={att}
                questions={questions}
                info={info!}
                onUpdateScore={updateScore}
                onUpdateQuestionMark={updateQuestionMark}
                onSaveGrade={saveGrade}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── Helper: auto-calculate total score ────────────────────────────────────

function calcAutoScore(
  answers: AnswerRow[],
  questions: QuestionRow[],
  questionMarks: Record<string, string>,
): number {
  return answers.reduce((sum, a) => {
    const q = questions.find(q => q.id === a.questionId);
    if (!q) return sum;
    if (q.type === 'mcq' || q.type === 'true_false') {
      return sum + (a.marksAwarded ?? 0);
    }
    if (q.type === 'essay' || q.type === 'short_answer' || q.type === 'fill_blank') {
      const n = parseFloat(questionMarks[q.id] ?? '');
      return sum + (isNaN(n) ? 0 : n);
    }
    return sum;
  }, 0);
}

// ─── Not Submitted List ────────────────────────────────────────────────────

function NotSubmittedList({ students }: { students: NotSubmittedStudent[] }) {
  if (students.length === 0) return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
      <span className="text-4xl block mb-3">✅</span>
      <p className="text-gray-500 font-medium">All enrolled students have submitted.</p>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {students.length} student{students.length !== 1 ? 's' : ''} have not submitted
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100">
          <tr>
            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Student</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Student No.</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {students.map(s => (
            <tr key={s.studentId} className="hover:bg-gray-50/50">
              <td className="px-5 py-3.5 font-medium text-gray-900 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  {s.studentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                {s.studentName}
              </td>
              <td className="px-5 py-3.5 text-gray-500">{s.studentNo ?? '—'}</td>
              <td className="px-5 py-3.5">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
                  Not Submitted
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Single Attempt Card ───────────────────────────────────────────────────

function AttemptCard({
  att, questions, info,
  onUpdateScore, onUpdateQuestionMark, onSaveGrade,
}: {
  att: Attempt;
  questions: QuestionRow[];
  info: AssessmentInfo;
  onUpdateScore: (id: string, v: string) => void;
  onUpdateQuestionMark: (attemptId: string, qId: string, v: string, maxMark: number) => void;
  onSaveGrade: (att: Attempt) => void;
}) {
  const needsGrade = att.status !== 'graded';

  const statusStyles: Record<string, string> = {
    submitted:  'bg-amber-50 text-amber-700 border-amber-200',
    graded:     'bg-green-50 text-green-700 border-green-200',
    timed_out:  'bg-orange-50 text-orange-700 border-orange-200',
  };
  const statusLabels: Record<string, string> = {
    submitted: 'Pending Grade',
    graded:    'Graded',
    timed_out: 'Timed Out',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

      {/* ── Student header ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-4 bg-gray-50 border-b border-gray-200">
        <div className="w-9 h-9 rounded-full bg-[#4c1d95] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
          {att.studentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{att.studentName}</p>
          <p className="text-xs text-gray-400">
            {att.studentNo ? `#${att.studentNo} · ` : ''}
            Attempt #{att.attemptNumber} · Submitted {fmtDate(att.submittedAt)}
          </p>
        </div>
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${statusStyles[att.status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
          {statusLabels[att.status] ?? att.status}
        </span>
        {att.score != null && (
          <span className="text-sm font-bold text-gray-600 flex-shrink-0">
            {att.score}/{info.total_marks}
          </span>
        )}
      </div>

      {/* ── Open-ended text response (no structured questions) ────────────── */}
      {questions.length === 0 && (
        <div className="px-5 py-4 bg-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Student Response</p>
          {att.textResponse ? (
            <div
              className="prose prose-sm max-w-none bg-gray-50 border border-gray-200 rounded-lg p-3.5 text-gray-700 text-sm"
              dangerouslySetInnerHTML={{ __html: att.textResponse }}
            />
          ) : (
            <p className="text-sm text-gray-400 italic bg-white border border-dashed border-gray-200 rounded-lg px-3 py-2">
              No response submitted.
            </p>
          )}
        </div>
      )}

      {/* ── Per-question answers (always visible) ─────────────────────────── */}
      {questions.length > 0 && (
        <div className="divide-y divide-gray-100">
          {questions.map((q, qi) => {
            const answer = att.answers.find(a => a.questionId === q.id);
            const isMCQ       = q.type === 'mcq' || q.type === 'true_false';
            const isOpenEnded = q.type === 'essay' || q.type === 'short_answer' || q.type === 'fill_blank';

            return (
              <div key={q.id} className="px-5 py-4 bg-white">
                {/* Question */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <span className="mt-0.5 w-6 h-6 rounded-full bg-[#4c1d95]/10 text-[#4c1d95] text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                      {qi + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mr-2">
                        {q.type.replace(/_/g, ' ')}
                      </span>
                      <span
                        className="text-sm text-gray-800 font-medium prose prose-sm inline"
                        dangerouslySetInnerHTML={{ __html: q.body }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
                </div>

                {/* MCQ options */}
                {isMCQ && (
                  <div className="ml-8 space-y-2">
                    {q.options.length === 0 && (
                      <p className="text-xs text-gray-400 italic">No options recorded.</p>
                    )}
                    {q.options.map(opt => {
                      const isSelected = answer?.selectedOptions?.includes(opt.id) ?? false;
                      const isCorrect  = opt.is_correct;

                      let optStyle = 'bg-white border-gray-200 text-gray-700';
                      if (isSelected && isCorrect)        optStyle = 'bg-green-50 border-green-400 text-green-800';
                      else if (isSelected && !isCorrect)  optStyle = 'bg-red-50 border-red-400 text-red-800';
                      else if (!isSelected && isCorrect)  optStyle = 'bg-green-50/60 border-green-200 text-green-700';

                      return (
                        <div key={opt.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm ${optStyle}`}>
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected
                              ? (isCorrect ? 'border-green-500 bg-green-500' : 'border-red-500 bg-red-500')
                              : 'border-gray-300 bg-white'
                          }`}>
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <span className="flex-1" dangerouslySetInnerHTML={{ __html: opt.body }} />
                          {isSelected && (
                            <span className={`text-[11px] font-semibold flex-shrink-0 ${isCorrect ? 'text-green-700' : 'text-red-600'}`}>
                              {isCorrect ? '✓ Correct' : '✗ Incorrect'}
                            </span>
                          )}
                          {!isSelected && isCorrect && (
                            <span className="text-[11px] font-semibold text-green-600 flex-shrink-0">Correct answer</span>
                          )}
                        </div>
                      );
                    })}
                    <p className="text-xs text-gray-400 mt-1">
                      Auto-graded: <span className="font-semibold">{answer?.marksAwarded ?? 0}/{q.marks}</span>
                    </p>
                  </div>
                )}

                {/* Open-ended */}
                {isOpenEnded && (
                  <div className="ml-8 space-y-2">
                    {answer?.textAnswer ? (
                      <div
                        className="prose prose-sm max-w-none bg-gray-50 border border-gray-200 rounded-lg p-3.5 text-gray-700 text-sm"
                        dangerouslySetInnerHTML={{ __html: answer.textAnswer }}
                      />
                    ) : (
                      <p className="text-sm text-gray-400 italic bg-white border border-dashed border-gray-200 rounded-lg px-3 py-2">
                        No answer provided.
                      </p>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <label className="text-xs text-gray-500 font-medium">Award marks:</label>
                      <input
                        type="number"
                        min={0}
                        max={q.marks}
                        step={0.5}
                        value={att.questionMarks[q.id] ?? ''}
                        onChange={e => onUpdateQuestionMark(att.id, q.id, e.target.value, q.marks)}
                        placeholder="0"
                        className={`w-20 px-2 py-1 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95] ${
                          parseFloat(att.questionMarks[q.id] ?? '0') > q.marks
                            ? 'border-red-400 bg-red-50'
                            : 'border-gray-300'
                        }`}
                      />
                      <span className="text-xs font-medium text-gray-500">/ {q.marks} max</span>
                      {parseFloat(att.questionMarks[q.id] ?? '0') > q.marks && (
                        <span className="text-xs text-red-600 font-semibold">Exceeds max!</span>
                      )}
                    </div>
                  </div>
                )}

                {!answer && (
                  <p className="ml-8 text-sm text-gray-400 italic">No answer recorded.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Grade footer ──────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="text-sm text-gray-600">
          <span className="font-medium">Total score to award:</span>
          <span className="ml-2 text-gray-400 text-xs">
            (MCQ auto-graded · Enter marks for open-ended questions above)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="number"
              min={0}
              max={info.total_marks}
              step={0.5}
              value={att.scoreInput}
              onChange={e => onUpdateScore(att.id, e.target.value)}
              placeholder="Score"
              className={`w-28 pl-3 pr-10 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95] ${
                parseFloat(att.scoreInput) > info.total_marks ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
              /{info.total_marks}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSaveGrade(att)}
            disabled={att.saving || !att.scoreInput}
            className="px-4 py-2 rounded-lg bg-[#4c1d95] text-white text-sm font-semibold hover:bg-[#3b1677] disabled:opacity-50 transition-colors"
          >
            {att.saving ? 'Saving…' : needsGrade ? 'Save Grade' : 'Update Grade'}
          </button>
        </div>
      </div>
    </div>
  );
}
