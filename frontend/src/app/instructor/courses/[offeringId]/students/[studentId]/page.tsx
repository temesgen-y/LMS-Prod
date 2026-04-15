'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { upsertGradebookItem } from '@/services/grading.service';
import { getGradeColor } from '@/utils/gradeCalculator';

// ─── Types ─────────────────────────────────────────────────────────────────

type QuestionOption = { id: string; body: string; is_correct: boolean; sort_order: number };
type QuestionRow    = { id: string; body: string; type: string; marks: number; sort_order: number; options: QuestionOption[] };

type AnswerRow = {
  questionId: string;
  textAnswer: string | null;
  selectedOptions: string[] | null;
  isCorrect: boolean | null;
  marksAwarded: number;
};

type AssessmentAttempt = {
  id:            string;
  assessmentId:  string;
  assessTitle:   string;
  assessType:    string;
  totalMarks:    number;
  attemptNumber: number;
  status:        string;
  submittedAt:   string | null;
  score:         number | null;
  scorePct:      number | null;
  textResponse:  string | null;
  answers:       AnswerRow[];
  questions:     QuestionRow[];
  // UI state
  expanded:      boolean;
  scoreInput:    string;
  questionMarks: Record<string, string>;
  saving:        boolean;
};

type AssignmentSubmission = {
  id:           string;
  assignmentId: string;
  assignTitle:  string;
  maxScore:     number;
  textBody:     string | null;
  fileUrls:     string[] | null;
  status:       string;
  submittedAt:  string | null;
  isLate:       boolean;
  score:        number | null;
  feedback:     string | null;
  // UI state
  expanded:     boolean;
  scoreInput:   string;
  feedbackInput:string;
  saving:       boolean;
};

type GradeSummaryRow = {
  title:    string;
  type:     string;
  rawScore: number | null;
  maxScore: number;
};

type StudentInfo = {
  name:         string;
  studentNo:    string;
  email:        string;
  enrollmentId: string;
  finalScore:   number | null;
  finalGrade:   string | null;
};

type CourseInfo = {
  courseCode:  string;
  courseTitle: string;
  sectionName: string;
  termName:    string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  quiz: 'Quiz', midterm: 'Midterm', final_exam: 'Final Exam', assignment: 'Assignment',
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function calcAutoScore(answers: AnswerRow[], questions: QuestionRow[], marks: Record<string, string>): number {
  return answers.reduce((sum, a) => {
    const q = questions.find(q => q.id === a.questionId);
    if (!q) return sum;
    if (q.type === 'mcq' || q.type === 'true_false') return sum + (a.marksAwarded ?? 0);
    const n = parseFloat(marks[q.id] ?? '');
    return sum + (isNaN(n) ? 0 : n);
  }, 0);
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function StudentDetailPage() {
  const params     = useParams();
  const offeringId = params?.offeringId as string;
  const studentId  = params?.studentId  as string;

  const [courseInfo, setCourseInfo]     = useState<CourseInfo | null>(null);
  const [student, setStudent]           = useState<StudentInfo | null>(null);
  const [attempts, setAttempts]         = useState<AssessmentAttempt[]>([]);
  const [submissions, setSubmissions]   = useState<AssignmentSubmission[]>([]);
  const [gradeSummary, setGradeSummary] = useState<GradeSummaryRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!offeringId || !studentId) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      // ── Course info ──────────────────────────────────────────────────
      const { data: offeringData } = await supabase
        .from('course_offerings')
        .select('section_name, courses!fk_course_offerings_course(code, title), academic_terms!fk_course_offerings_term(term_name)')
        .eq('id', offeringId)
        .maybeSingle();

      if (!offeringData) { setError('Course not found.'); return; }
      const oc = (offeringData as any).courses ?? {};
      const ot = (offeringData as any).academic_terms ?? {};
      setCourseInfo({
        courseCode:  oc.code ?? '—',
        courseTitle: oc.title ?? '—',
        sectionName: (offeringData as any).section_name ?? '—',
        termName:    ot.term_name ?? '—',
      });

      // ── Student info ─────────────────────────────────────────────────
      const { data: userData } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .eq('id', studentId)
        .maybeSingle();

      if (!userData) { setError('Student not found.'); return; }
      const u = userData as any;

      const { data: spData } = await supabase
        .from('student_profiles')
        .select('student_no')
        .eq('user_id', studentId)
        .maybeSingle();

      // ── Enrollment ───────────────────────────────────────────────────
      const { data: enrollData } = await supabase
        .from('enrollments')
        .select('id, final_score, final_grade')
        .eq('offering_id', offeringId)
        .eq('student_id', studentId)
        .in('status', ['active', 'completed'])
        .maybeSingle();

      if (!enrollData) { setError('Student is not enrolled in this course.'); return; }
      const enroll = enrollData as any;

      setStudent({
        name:         `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || '—',
        studentNo:    (spData as any)?.student_no ?? '—',
        email:        u.email ?? '—',
        enrollmentId: enroll.id,
        finalScore:   enroll.final_score ?? null,
        finalGrade:   enroll.final_grade ?? null,
      });

      // ── Assessments ──────────────────────────────────────────────────
      const { data: assessData } = await supabase
        .from('assessments')
        .select('id, title, type, total_marks')
        .eq('offering_id', offeringId)
        .in('type', ['quiz', 'midterm', 'final_exam'])
        .eq('status', 'published')
        .order('created_at');

      const assessRows = (assessData ?? []) as any[];
      const assessIds  = assessRows.map((a: any) => a.id);

      // ── Student's attempts ───────────────────────────────────────────
      let attRows: any[] = [];
      if (assessIds.length > 0) {
        const { data: attData } = await supabase
          .from('assessment_attempts')
          .select('id, assessment_id, attempt_number, status, submitted_at, score, score_pct, text_response, enrollment_id')
          .eq('student_id', studentId)
          .in('assessment_id', assessIds)
          .not('status', 'eq', 'in_progress')
          .order('submitted_at', { ascending: false });
        attRows = (attData ?? []) as any[];
      }

      // ── Questions for all assessments ────────────────────────────────
      const qByAssessment: Record<string, QuestionRow[]> = {};
      if (assessIds.length > 0) {
        const { data: qsData } = await supabase
          .from('questions')
          .select('id, assessment_id, body, type, marks, sort_order')
          .in('assessment_id', assessIds)
          .order('sort_order');

        const qIds = ((qsData ?? []) as any[]).map((q: any) => q.id);

        let optsByQ: Record<string, QuestionOption[]> = {};
        if (qIds.length > 0) {
          const { data: optsData } = await supabase
            .from('question_options')
            .select('id, question_id, body, is_correct, sort_order')
            .in('question_id', qIds)
            .order('sort_order');
          ((optsData ?? []) as any[]).forEach((o: any) => {
            if (!optsByQ[o.question_id]) optsByQ[o.question_id] = [];
            optsByQ[o.question_id].push({ id: o.id, body: o.body, is_correct: o.is_correct, sort_order: o.sort_order });
          });
        }

        ((qsData ?? []) as any[]).forEach((q: any) => {
          if (!qByAssessment[q.assessment_id]) qByAssessment[q.assessment_id] = [];
          qByAssessment[q.assessment_id].push({
            id: q.id, body: q.body, type: q.type, marks: q.marks, sort_order: q.sort_order,
            options: (optsByQ[q.id] ?? []).sort((a, b) => a.sort_order - b.sort_order),
          });
        });
      }

      // ── Student answers ──────────────────────────────────────────────
      const attIds = attRows.map((a: any) => a.id);
      let saByAttempt: Record<string, AnswerRow[]> = {};
      if (attIds.length > 0) {
        const { data: saData } = await supabase
          .from('student_answers')
          .select('attempt_id, question_id, text_answer, selected_options, is_correct, marks_awarded')
          .in('attempt_id', attIds);
        ((saData ?? []) as any[]).forEach((sa: any) => {
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

      // ── Build assessment attempts ────────────────────────────────────
      const assessMap: Record<string, any> = {};
      assessRows.forEach((a: any) => { assessMap[a.id] = a; });

      const mappedAttempts: AssessmentAttempt[] = attRows.map((att: any) => {
        const am = assessMap[att.assessment_id] ?? {};
        const questions = (qByAssessment[att.assessment_id] ?? []).sort((a, b) => a.sort_order - b.sort_order);
        const answers   = saByAttempt[att.id] ?? [];
        const questionMarks: Record<string, string> = {};
        answers.forEach(a => {
          const q = questions.find(q => q.id === a.questionId);
          if (q && (q.type === 'essay' || q.type === 'short_answer')) {
            questionMarks[a.questionId] = a.marksAwarded > 0 ? String(a.marksAwarded) : '';
          }
        });
        const autoScore = calcAutoScore(answers, questions, questionMarks);
        return {
          id:            att.id,
          assessmentId:  att.assessment_id,
          assessTitle:   am.title ?? '—',
          assessType:    am.type  ?? '—',
          totalMarks:    am.total_marks ?? 100,
          attemptNumber: att.attempt_number,
          status:        att.status,
          submittedAt:   att.submitted_at ?? null,
          score:         att.score ?? null,
          scorePct:      att.score_pct ?? null,
          textResponse:  att.text_response ?? null,
          answers,
          questions,
          expanded:      false,
          scoreInput:    att.score != null ? String(att.score) : autoScore > 0 ? String(autoScore) : '',
          questionMarks,
          saving:        false,
        };
      });
      setAttempts(mappedAttempts);

      // ── Assignments ──────────────────────────────────────────────────
      const { data: assignData } = await supabase
        .from('assignments')
        .select('id, title, max_score')
        .eq('offering_id', offeringId)
        .order('created_at');

      const assignRows = (assignData ?? []) as any[];
      const assignIds  = assignRows.map((a: any) => a.id);

      // ── Student's submissions ────────────────────────────────────────
      let subRows: any[] = [];
      if (assignIds.length > 0) {
        const { data: subData } = await supabase
          .from('assignment_submissions')
          .select('id, assignment_id, text_body, file_urls, status, submitted_at, is_late, score, final_score, feedback, enrollment_id')
          .eq('student_id', studentId)
          .in('assignment_id', assignIds)
          .order('submitted_at', { ascending: false });
        subRows = (subData ?? []) as any[];
      }

      const subByAssign: Record<string, any> = {};
      subRows.forEach((s: any) => { if (!subByAssign[s.assignment_id]) subByAssign[s.assignment_id] = s; });

      const assignMap: Record<string, any> = {};
      assignRows.forEach((a: any) => { assignMap[a.id] = a; });

      const mappedSubs: AssignmentSubmission[] = assignRows.map((assign: any) => {
        const sub = subByAssign[assign.id];
        if (!sub) return null;
        const rawScore = sub.final_score ?? sub.score ?? null;
        return {
          id:           sub.id,
          assignmentId: assign.id,
          assignTitle:  assign.title ?? '—',
          maxScore:     assign.max_score ?? 100,
          textBody:     sub.text_body ?? null,
          fileUrls:     sub.file_urls ?? null,
          status:       sub.status,
          submittedAt:  sub.submitted_at ?? null,
          isLate:       sub.is_late ?? false,
          score:        rawScore,
          feedback:     sub.feedback ?? null,
          expanded:     false,
          scoreInput:   rawScore != null ? String(rawScore) : '',
          feedbackInput:sub.feedback ?? '',
          saving:       false,
        };
      }).filter(Boolean) as AssignmentSubmission[];
      setSubmissions(mappedSubs);

      // ── Grade summary from gradebook_items ───────────────────────────
      const { data: gbItems } = await supabase
        .from('gradebook_items')
        .select('assessment_id, assignment_id, raw_score, total_marks')
        .eq('enrollment_id', enroll.id);

      const gbRows = (gbItems ?? []) as any[];
      const summaryRows: GradeSummaryRow[] = gbRows.map((gb: any) => {
        if (gb.assessment_id) {
          const a = assessMap[gb.assessment_id];
          return {
            title:    a?.title ?? 'Assessment',
            type:     a?.type  ?? 'assessment',
            rawScore: gb.raw_score,
            maxScore: gb.total_marks ?? a?.total_marks ?? 100,
          };
        } else {
          const a = assignMap[gb.assignment_id];
          return {
            title:    a?.title ?? 'Assignment',
            type:     'assignment',
            rawScore: gb.raw_score,
            maxScore: gb.total_marks ?? a?.max_score ?? 100,
          };
        }
      });
      setGradeSummary(summaryRows);

      // Update student final from fresh data
      setStudent(prev => prev ? {
        ...prev,
        finalScore: enroll.final_score ?? null,
        finalGrade: enroll.final_grade ?? null,
      } : prev);

    } catch (err: any) {
      console.error('StudentDetailPage load error:', err);
      setError(`Failed to load: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [offeringId, studentId]);

  useEffect(() => { load(); }, [load]);

  // ── Assessment grading handlers ─────────────────────────────────────────

  const toggleAttempt = (id: string) =>
    setAttempts(prev => prev.map(a => a.id === id ? { ...a, expanded: !a.expanded } : a));

  const updateAttemptQMark = (attId: string, qId: string, val: string) =>
    setAttempts(prev => prev.map(att => {
      if (att.id !== attId) return att;
      const newQM = { ...att.questionMarks, [qId]: val };
      const total = calcAutoScore(att.answers, att.questions, newQM);
      return { ...att, questionMarks: newQM, scoreInput: String(Math.min(total, att.totalMarks)) };
    }));

  const updateAttemptScore = (attId: string, val: string) =>
    setAttempts(prev => prev.map(a => a.id === attId ? { ...a, scoreInput: val } : a));

  const saveAttemptGrade = async (att: AssessmentAttempt) => {
    const raw = parseFloat(att.scoreInput);
    if (isNaN(raw) || raw < 0 || raw > att.totalMarks) {
      toast.error(`Score must be 0–${att.totalMarks}.`);
      return;
    }
    setAttempts(prev => prev.map(a => a.id === att.id ? { ...a, saving: true } : a));
    const supabase  = createClient();
    const scorePct  = att.totalMarks > 0 ? Math.round((raw / att.totalMarks) * 10000) / 100 : 0;
    const { data: authData } = await supabase.auth.getUser();
    const { data: appUser  } = await supabase.from('users').select('id').eq('auth_user_id', authData.user!.id).maybeSingle();
    const instructorId = (appUser as any)?.id;

    await Promise.all(
      Object.entries(att.questionMarks).map(([qId, marksStr]) => {
        const m = parseFloat(marksStr);
        if (isNaN(m)) return Promise.resolve();
        return supabase.from('student_answers').update({ marks_awarded: m })
          .eq('attempt_id', att.id).eq('question_id', qId);
      })
    );

    const { error: updErr } = await supabase.from('assessment_attempts').update({
      score: raw, score_pct: scorePct, passed: scorePct >= 50,
      status: 'graded', graded_at: new Date().toISOString(), graded_by: instructorId,
    }).eq('id', att.id);

    if (updErr) {
      toast.error('Failed to save grade.');
      setAttempts(prev => prev.map(a => a.id === att.id ? { ...a, saving: false } : a));
      return;
    }

    if (student) {
      await upsertGradebookItem(student.enrollmentId, att.assessmentId, 'assessment', raw, att.totalMarks);
      const { data: freshEnroll } = await supabase.from('enrollments').select('final_score, final_grade').eq('id', student.enrollmentId).maybeSingle();
      if (freshEnroll) setStudent(prev => prev ? { ...prev, finalScore: (freshEnroll as any).final_score, finalGrade: (freshEnroll as any).final_grade } : prev);
    }

    // Notify student
    await supabase.from('notifications').insert({
      user_id: studentId,
      type:    'grade_released',
      title:   `${att.assessTitle} graded`,
      body:    `Score: ${raw}/${att.totalMarks}`,
      link:    `/dashboard/assessments`,
      is_read: false,
    });

    toast.success(`Grade saved: ${raw}/${att.totalMarks}`);
    setAttempts(prev => prev.map(a =>
      a.id === att.id ? { ...a, status: 'graded', score: raw, scorePct, saving: false } : a
    ));
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function buildGradeSummary(_items: any[], _prev: GradeSummaryRow[]) {
    // no-op: grade summary refreshed on full reload; not needed inline
  }

  // ── Assignment grading handlers ─────────────────────────────────────────

  const toggleSub = (id: string) =>
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, expanded: !s.expanded } : s));

  const updateSubScore    = (id: string, val: string) =>
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, scoreInput: val } : s));

  const updateSubFeedback = (id: string, val: string) =>
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, feedbackInput: val } : s));

  const saveSubGrade = async (sub: AssignmentSubmission) => {
    const raw = parseFloat(sub.scoreInput);
    if (isNaN(raw) || raw < 0 || raw > sub.maxScore) {
      toast.error(`Score must be 0–${sub.maxScore}.`);
      return;
    }
    setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, saving: true } : s));
    const supabase = createClient();

    const { error: updErr } = await supabase.from('assignment_submissions').update({
      score: raw, final_score: raw,
      feedback: sub.feedbackInput || null,
      status: 'graded',
      graded_at: new Date().toISOString(),
    }).eq('id', sub.id);

    if (updErr) {
      toast.error('Failed to save grade.');
      setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, saving: false } : s));
      return;
    }

    if (student) {
      await upsertGradebookItem(student.enrollmentId, sub.assignmentId, 'assignment', raw, sub.maxScore);
      const { data: freshEnroll } = await supabase.from('enrollments').select('final_score, final_grade').eq('id', student.enrollmentId).maybeSingle();
      if (freshEnroll) setStudent(prev => prev ? { ...prev, finalScore: (freshEnroll as any).final_score, finalGrade: (freshEnroll as any).final_grade } : prev);
    }

    // Notify student
    await supabase.from('notifications').insert({
      user_id: studentId,
      type:    'grade_released',
      title:   `${sub.assignTitle} graded`,
      body:    `Score: ${raw}/${sub.maxScore}`,
      link:    `/dashboard/assignments`,
      is_read: false,
    });

    toast.success(`Grade saved: ${raw}/${sub.maxScore}`);
    setSubmissions(prev => prev.map(s =>
      s.id === sub.id ? { ...s, score: raw, status: 'graded', saving: false, feedback: sub.feedbackInput } : s
    ));
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="p-6 space-y-4 animate-pulse max-w-4xl mx-auto">
      <div className="h-7 bg-gray-200 rounded w-56" />
      <div className="h-5 bg-gray-100 rounded w-40" />
      <div className="h-28 bg-gray-200 rounded-xl" />
      {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
    </div>
  );

  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center max-w-xl mx-auto">
        <p className="text-red-700 font-medium">{error}</p>
        <Link href={`/instructor/courses/${offeringId}/students`} className="text-sm text-[#4c1d95] hover:underline mt-3 inline-block">
          ← Back to Students
        </Link>
      </div>
    </div>
  );

  const pendingAttempts  = attempts.filter(a => a.status !== 'graded');
  const gradedAttempts   = attempts.filter(a => a.status === 'graded');
  const pendingSubs      = submissions.filter(s => s.status !== 'graded');

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">

      {/* ── Breadcrumb ──────────────────────────────────────────────────── */}
      <div>
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          <Link href="/instructor/dashboard" className="hover:text-gray-700">Dashboard</Link>
          <span>›</span>
          <Link href={`/instructor/courses/${offeringId}/students`} className="hover:text-gray-700">
            {courseInfo?.courseCode} Students
          </Link>
          <span>›</span>
          <span className="text-gray-800 font-medium">{student?.name}</span>
        </nav>
        <h1 className="text-2xl font-bold text-gray-900">{student?.name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {student?.studentNo !== '—' && <span>#{student?.studentNo} · </span>}
          {student?.email}
          {courseInfo && (
            <> · {courseInfo.courseCode} — {courseInfo.sectionName}</>
          )}
        </p>
      </div>

      {/* ── Student summary card ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-[#4c1d95] text-white text-lg font-bold flex items-center justify-center flex-shrink-0">
          {student?.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 text-lg">{student?.name}</p>
          <p className="text-sm text-gray-500">{courseInfo?.courseCode} — {courseInfo?.courseTitle} · {courseInfo?.termName}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Current Grade</p>
          {student?.finalGrade ? (
            <span className={`text-2xl font-bold px-4 py-1.5 rounded-xl ${getGradeColor(student.finalGrade)}`}>
              {student.finalGrade}
              {student.finalScore != null && (
                <span className="text-sm font-normal ml-1.5 opacity-75">({student.finalScore.toFixed(1)})</span>
              )}
            </span>
          ) : (
            <span className="text-xl font-bold text-gray-300 px-4 py-1.5">—</span>
          )}
        </div>
      </div>

      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Assessments',         value: attempts.length,    color: 'text-blue-600' },
          { label: 'Pending Grade',        value: pendingAttempts.length + pendingSubs.length, color: 'text-amber-600' },
          { label: 'Graded Assessments',   value: gradedAttempts.length, color: 'text-green-600' },
          { label: 'Assignments Submitted',value: submissions.length, color: 'text-[#4c1d95]' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Assessment Attempts ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <span className="text-lg">📋</span> Assessment Attempts
          {pendingAttempts.length > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
              {pendingAttempts.length} pending
            </span>
          )}
        </h2>

        {attempts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400 text-sm">No assessment attempts yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {attempts.map(att => (
              <AssessmentAttemptCard
                key={att.id}
                att={att}
                onToggle={() => toggleAttempt(att.id)}
                onUpdateScore={val => updateAttemptScore(att.id, val)}
                onUpdateQMark={(qId, val) => updateAttemptQMark(att.id, qId, val)}
                onSaveGrade={() => saveAttemptGrade(att)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Assignment Submissions ──────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <span className="text-lg">📝</span> Assignment Submissions
          {pendingSubs.length > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
              {pendingSubs.length} pending
            </span>
          )}
        </h2>

        {submissions.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400 text-sm">No assignment submissions yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map(sub => (
              <AssignmentSubmissionCard
                key={sub.id}
                sub={sub}
                onToggle={() => toggleSub(sub.id)}
                onUpdateScore={val => updateSubScore(sub.id, val)}
                onUpdateFeedback={val => updateSubFeedback(sub.id, val)}
                onSaveGrade={() => saveSubGrade(sub)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Grade Summary ───────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <span className="text-lg">📊</span> Grade Summary
        </h2>

        {gradeSummary.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400 text-sm">No grades recorded yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Item</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Scored</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Max</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {gradeSummary.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.title}</td>
                    <td className="px-4 py-3 text-gray-500">{TYPE_LABELS[row.type] ?? row.type}</td>
                    <td className="px-4 py-3 text-center font-semibold text-gray-900">
                      {row.rawScore != null ? row.rawScore : <span className="text-amber-500 text-xs font-medium">pending</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">{row.maxScore}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">Final Grade:</td>
                  <td className="px-4 py-3 text-center font-bold text-gray-900">
                    {student?.finalScore != null ? `${student.finalScore.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-gray-900">
                    {student?.finalGrade ?? '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Assessment Attempt Card ───────────────────────────────────────────────

function AssessmentAttemptCard({
  att, onToggle, onUpdateScore, onUpdateQMark, onSaveGrade,
}: {
  att: AssessmentAttempt;
  onToggle: () => void;
  onUpdateScore: (v: string) => void;
  onUpdateQMark: (qId: string, v: string) => void;
  onSaveGrade: () => void;
}) {
  const isGraded = att.status === 'graded';
  const statusStyles: Record<string, string> = {
    submitted: 'bg-amber-50 text-amber-700 border-amber-200',
    graded:    'bg-green-50 text-green-700 border-green-200',
    timed_out: 'bg-orange-50 text-orange-700 border-orange-200',
  };
  const statusLabels: Record<string, string> = {
    submitted: 'Pending Grade', graded: 'Graded', timed_out: 'Timed Out',
  };
  const typeColors: Record<string, string> = {
    quiz: 'bg-blue-100 text-blue-700', midterm: 'bg-purple-100 text-purple-700',
    final_exam: 'bg-red-100 text-red-700',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${typeColors[att.assessType] ?? 'bg-gray-100 text-gray-600'}`}>
              {TYPE_LABELS[att.assessType] ?? att.assessType}
            </span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusStyles[att.status] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
              {statusLabels[att.status] ?? att.status}
            </span>
          </div>
          <p className="font-semibold text-gray-900 text-sm">{att.assessTitle}</p>
          <p className="text-xs text-gray-400">
            Attempt #{att.attemptNumber} · Submitted {fmtDate(att.submittedAt)}
            {att.score != null && <> · Score: <span className="font-semibold text-gray-600">{att.score}/{att.totalMarks}</span></>}
          </p>
        </div>

        {/* Score input + grade button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative">
            <input
              type="number" min={0} max={att.totalMarks} step={0.5}
              value={att.scoreInput}
              onChange={e => onUpdateScore(e.target.value)}
              placeholder="Score"
              className="w-[72px] pl-2 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95]"
            />
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">
              /{att.totalMarks}
            </span>
          </div>
          <button
            type="button"
            onClick={onSaveGrade}
            disabled={att.saving || !att.scoreInput}
            className="px-3 py-1.5 rounded-lg bg-[#4c1d95] text-white text-xs font-semibold hover:bg-[#3b1677] disabled:opacity-50 min-w-[58px]"
          >
            {att.saving ? '…' : isGraded ? 'Update' : 'Grade'}
          </button>
        </div>

        {/* Expand toggle */}
        <button type="button" onClick={onToggle}
          className="text-gray-400 hover:text-gray-700 flex-shrink-0 p-1 rounded-md hover:bg-gray-100">
          <svg className={`w-4 h-4 transition-transform duration-200 ${att.expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Expanded answers */}
      {att.expanded && (
        <div className="border-t border-gray-100">
          {att.textResponse && att.questions.length === 0 && (
            <div className="px-5 py-4 bg-gray-50/60">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Student Response</p>
              <div className="prose prose-sm max-w-none bg-white border border-gray-200 rounded-lg p-4 text-gray-700"
                dangerouslySetInnerHTML={{ __html: att.textResponse }} />
            </div>
          )}

          {att.questions.length > 0 && (
            <div className="divide-y divide-gray-50">
              {att.questions.map((q, qi) => {
                const answer    = att.answers.find(a => a.questionId === q.id);
                const isMCQ     = q.type === 'multiple_choice' || q.type === 'true_false';
                const isOpen    = q.type === 'essay' || q.type === 'short_answer';

                return (
                  <div key={q.id} className="px-5 py-4 bg-gray-50/40">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <span className="mt-0.5 w-6 h-6 rounded-full bg-[#4c1d95]/10 text-[#4c1d95] text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                          {qi + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mr-2">{q.type.replace(/_/g, ' ')}</span>
                          <span className="text-sm text-gray-800 font-medium prose prose-sm inline"
                            dangerouslySetInnerHTML={{ __html: q.body }} />
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
                    </div>

                    {isMCQ && (
                      <div className="ml-8 space-y-2">
                        {q.options.map(opt => {
                          const isSelected = answer?.selectedOptions?.includes(opt.id) ?? false;
                          let style = 'bg-white border-gray-200 text-gray-700';
                          if (isSelected && opt.is_correct)  style = 'bg-green-50 border-green-400 text-green-800';
                          else if (isSelected && !opt.is_correct) style = 'bg-red-50 border-red-400 text-red-800';
                          else if (!isSelected && opt.is_correct) style = 'bg-green-50/60 border-green-200 text-green-700';
                          return (
                            <div key={opt.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm ${style}`}>
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                isSelected ? (opt.is_correct ? 'border-green-500 bg-green-500' : 'border-red-500 bg-red-500') : 'border-gray-300 bg-white'
                              }`}>
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                              <span className="flex-1" dangerouslySetInnerHTML={{ __html: opt.body }} />
                              {isSelected && (
                                <span className={`text-[11px] font-semibold flex-shrink-0 ${opt.is_correct ? 'text-green-700' : 'text-red-600'}`}>
                                  {opt.is_correct ? '✓ Correct' : '✗ Incorrect'}
                                </span>
                              )}
                              {!isSelected && opt.is_correct && (
                                <span className="text-[11px] font-semibold text-green-600 flex-shrink-0">Correct answer</span>
                              )}
                            </div>
                          );
                        })}
                        <p className="text-xs text-gray-400 mt-1">Auto-graded: <span className="font-semibold">{answer?.marksAwarded ?? 0}/{q.marks}</span></p>
                      </div>
                    )}

                    {isOpen && (
                      <div className="ml-8 space-y-2">
                        {answer?.textAnswer ? (
                          <div className="prose prose-sm max-w-none bg-white border border-gray-200 rounded-lg p-3.5 text-gray-700 text-sm"
                            dangerouslySetInnerHTML={{ __html: answer.textAnswer }} />
                        ) : (
                          <p className="text-sm text-gray-400 italic bg-white border border-dashed border-gray-200 rounded-lg px-3 py-2">No answer provided.</p>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                          <label className="text-xs text-gray-500 font-medium">Award marks:</label>
                          <input type="number" min={0} max={q.marks} step={0.5}
                            value={att.questionMarks[q.id] ?? ''}
                            onChange={e => onUpdateQMark(q.id, e.target.value)}
                            placeholder="0"
                            className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95]"
                          />
                          <span className="text-xs text-gray-400">/ {q.marks}</span>
                        </div>
                      </div>
                    )}

                    {!answer && <p className="ml-8 text-sm text-gray-400 italic">No answer recorded.</p>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Grade footer */}
          <div className="px-5 py-4 border-t border-gray-200 bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              <span className="font-medium">Total score:</span>
              <span className="ml-2 text-xs text-gray-400">(MCQ auto-graded · enter marks for open-ended above)</span>
            </p>
            <div className="flex items-center gap-2">
              <div className="relative">
                <input type="number" min={0} max={att.totalMarks} step={0.5}
                  value={att.scoreInput}
                  onChange={e => onUpdateScore(e.target.value)}
                  placeholder="Score"
                  className="w-28 pl-3 pr-10 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95]"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">/{att.totalMarks}</span>
              </div>
              <button type="button" onClick={onSaveGrade} disabled={att.saving || !att.scoreInput}
                className="px-4 py-2 rounded-lg bg-[#4c1d95] text-white text-sm font-semibold hover:bg-[#3b1677] disabled:opacity-50">
                {att.saving ? 'Saving…' : isGraded ? 'Update Grade' : 'Save Grade'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Assignment Submission Card ────────────────────────────────────────────

function AssignmentSubmissionCard({
  sub, onToggle, onUpdateScore, onUpdateFeedback, onSaveGrade,
}: {
  sub: AssignmentSubmission;
  onToggle: () => void;
  onUpdateScore: (v: string) => void;
  onUpdateFeedback: (v: string) => void;
  onSaveGrade: () => void;
}) {
  const isGraded = sub.status === 'graded';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">Assignment</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
              isGraded ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {isGraded ? 'Graded' : 'Pending Grade'}
            </span>
            {sub.isLate && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">Late</span>
            )}
          </div>
          <p className="font-semibold text-gray-900 text-sm">{sub.assignTitle}</p>
          <p className="text-xs text-gray-400">
            Submitted {fmtDate(sub.submittedAt)}
            {sub.score != null && <> · Score: <span className="font-semibold text-gray-600">{sub.score}/{sub.maxScore}</span></>}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative">
            <input type="number" min={0} max={sub.maxScore} step={0.5}
              value={sub.scoreInput}
              onChange={e => onUpdateScore(e.target.value)}
              placeholder="Score"
              className="w-[72px] pl-2 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95]"
            />
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">/{sub.maxScore}</span>
          </div>
          <button type="button" onClick={onSaveGrade} disabled={sub.saving || !sub.scoreInput}
            className="px-3 py-1.5 rounded-lg bg-[#4c1d95] text-white text-xs font-semibold hover:bg-[#3b1677] disabled:opacity-50 min-w-[58px]">
            {sub.saving ? '…' : isGraded ? 'Update' : 'Grade'}
          </button>
        </div>

        <button type="button" onClick={onToggle}
          className="text-gray-400 hover:text-gray-700 flex-shrink-0 p-1 rounded-md hover:bg-gray-100">
          <svg className={`w-4 h-4 transition-transform duration-200 ${sub.expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {sub.expanded && (
        <div className="border-t border-gray-100">
          {/* Text body */}
          {sub.textBody && (
            <div className="px-5 py-4 bg-gray-50/60">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Submission</p>
              <div className="prose prose-sm max-w-none bg-white border border-gray-200 rounded-lg p-4 text-gray-700"
                dangerouslySetInnerHTML={{ __html: sub.textBody }} />
            </div>
          )}

          {/* File attachments */}
          {sub.fileUrls && sub.fileUrls.length > 0 && (
            <div className="px-5 py-4 bg-gray-50/40 border-t border-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Attachments</p>
              <div className="flex flex-col gap-1.5">
                {sub.fileUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-[#4c1d95] hover:underline flex items-center gap-1.5">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    Attachment {i + 1}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Grading section */}
          <div className="px-5 py-4 border-t border-gray-200 bg-white space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-500 block mb-1">Feedback (optional)</label>
                <textarea
                  rows={3}
                  value={sub.feedbackInput}
                  onChange={e => onUpdateFeedback(e.target.value)}
                  placeholder="Write feedback for the student…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95] resize-none"
                />
              </div>
              <div className="flex flex-col items-start sm:items-end justify-end gap-2 flex-shrink-0">
                <div className="relative">
                  <input type="number" min={0} max={sub.maxScore} step={0.5}
                    value={sub.scoreInput}
                    onChange={e => onUpdateScore(e.target.value)}
                    placeholder="Score"
                    className="w-28 pl-3 pr-10 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95]"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">/{sub.maxScore}</span>
                </div>
                <button type="button" onClick={onSaveGrade} disabled={sub.saving || !sub.scoreInput}
                  className="w-full px-4 py-2 rounded-lg bg-[#4c1d95] text-white text-sm font-semibold hover:bg-[#3b1677] disabled:opacity-50">
                  {sub.saving ? 'Saving…' : isGraded ? 'Update Grade' : 'Save Grade'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
