'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getLetterGrade, getGradeColor } from '@/utils/gradeCalculator';
import { updateGradebookItem } from '@/utils/updateGradebook';
import RichTextEditor from '@/components/shared/RichTextEditor';

// ─── Types ────────────────────────────────────────────────────────────────────

type Assessment = {
  id: string;
  title: string;
  type: string;
  instructions: string | null;
  total_marks: number;
  time_limit_mins: number | null;
  max_attempts: number;
  available_from: string | null;
  available_until: string | null;
  show_result: boolean;
  show_answers: boolean;
};

type AttachmentRef = {
  id: string;
  sortOrder: number;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeKb: number;
};

type Option = { id: string; body: string; is_correct: boolean; sort_order: number };

type Question = {
  id: string;
  type: 'mcq' | 'true_false' | 'short_answer' | 'fill_blank' | 'essay' | 'matching';
  body: string;
  marks: number;
  sort_order: number;
  options: Option[];
};

type Answer = { selectedOptions: string[]; textAnswer: string };

type ResultAnswer = {
  questionId: string;
  isCorrect: boolean | null;
  marksAwarded: number;
  correctOptions: string[];
  selectedOptions: string[];
  textAnswer: string;
  instructorNote: string | null;
};

type AttemptResult = {
  score: number | null;
  scorePct: number | null;
  passed: boolean | null;
  status: string;
  answers: ResultAnswer[];
  textResponse: string | null;
};

type PageState = 'loading' | 'intro' | 'taking' | 'results' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/'))    return '🖼️';
  if (mimeType === 'application/pdf')   return '📄';
  if (mimeType.startsWith('text/'))     return '📝';
  if (mimeType.includes('zip'))         return '📦';
  if (mimeType.includes('word'))        return '📃';
  if (mimeType.includes('spreadsheet')) return '📊';
  return '📎';
}

function formatFileSize(sizeKb: number): string {
  if (sizeKb < 1024) return `${sizeKb} KB`;
  return `${(sizeKb / 1024).toFixed(1)} MB`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssessmentTakingPage() {
  const params       = useParams();
  const router       = useRouter();
  const offeringId   = params?.id as string;
  const assessmentId = params?.assessmentId as string;

  const [pageState, setPageState]   = useState<PageState>('loading');
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRef[]>([]);
  const [questions, setQuestions]   = useState<Question[]>([]);
  const [answers, setAnswers]       = useState<Map<string, Answer>>(new Map());
  const [attemptId, setAttemptId]   = useState<string | null>(null);
  const [existingAttempts, setExistingAttempts] = useState(0);
  const [timeLeft, setTimeLeft]     = useState<number | null>(null);
  const [result, setResult]         = useState<AttemptResult | null>(null);
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [userId, setUserId]         = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);

  // open-ended (assessment with no structured questions)
  const [openResponse, setOpenResponse] = useState('');
  const [openFiles, setOpenFiles]       = useState<File[]>([]);
  const openFileRef = useRef<HTMLInputElement>(null);

  // per-question file attachments
  const [questionFiles, setQuestionFiles] = useState<Map<string, File[]>>(new Map());
  const qFileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const startedAtRef  = useRef<Date | null>(null);
  const submitRef     = useRef<((timedOut?: boolean) => void) | null>(null);

  // ── Load assessment on mount ───────────────────────────────────────────────

  useEffect(() => {
    if (!offeringId || !assessmentId) return;
    (async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setErrorMsg('Not authenticated.'); setPageState('error'); return; }

      const { data: appUser } = await supabase
        .from('users').select('id').eq('auth_user_id', authData.user.id).maybeSingle();
      if (!appUser) { setErrorMsg('User not found.'); setPageState('error'); return; }
      const uid = (appUser as any).id;
      setUserId(uid);

      const { data: enr } = await supabase
        .from('enrollments').select('id')
        .eq('student_id', uid).eq('offering_id', offeringId)
        .in('status', ['active', 'completed']).maybeSingle();
      if (!enr) { setErrorMsg('You are not enrolled in this course.'); setPageState('error'); return; }
      const eid = (enr as any).id;
      setEnrollmentId(eid);

      const { data: assess } = await supabase
        .from('assessments')
        .select('id, title, type, instructions, total_marks, time_limit_mins, max_attempts, available_from, available_until, show_result, show_answers')
        .eq('id', assessmentId)
        .maybeSingle();
      if (!assess) { setErrorMsg('Assessment not found.'); setPageState('error'); return; }
      const a = assess as any;
      setAssessment({
        ...a,
        show_result:  a.show_result  ?? true,
        show_answers: a.show_answers ?? false,
      });

      // ── Reference file attachments ──────────────────────────────────────
      const { data: attLinks } = await supabase
        .from('assessment_attachments')
        .select('id, sort_order, attachment_id')
        .eq('assessment_id', assessmentId)
        .order('sort_order');

      if (attLinks && (attLinks as any[]).length > 0) {
        const attIds = (attLinks as any[]).map((x: any) => x.attachment_id);
        const { data: fileRows } = await supabase
          .from('attachments')
          .select('id, file_name, file_url, mime_type, size_kb')
          .in('id', attIds);
        const fileMap: Record<string, any> = {};
        ((fileRows ?? []) as any[]).forEach((f: any) => { fileMap[f.id] = f; });
        const mapped: AttachmentRef[] = (attLinks as any[]).map((al: any) => {
          const f = fileMap[al.attachment_id] ?? {};
          return { id: al.id, sortOrder: al.sort_order, fileName: f.file_name ?? '', fileUrl: f.file_url ?? '', mimeType: f.mime_type ?? '', sizeKb: f.size_kb ?? 0 };
        }).sort((a: AttachmentRef, b: AttachmentRef) => a.sortOrder - b.sortOrder);
        setAttachments(mapped);
      }

      // ── Existing attempts ───────────────────────────────────────────────
      const { data: attempts } = await supabase
        .from('assessment_attempts')
        .select('id, status, attempt_number, score, score_pct, passed')
        .eq('assessment_id', assessmentId)
        .eq('student_id', uid)
        .order('attempt_number', { ascending: false });

      const attList = (attempts ?? []) as any[];
      setExistingAttempts(attList.length);

      // Resume in-progress attempt
      const inProgress = attList.find((x: any) => x.status === 'in_progress');
      if (inProgress) {
        const qs = await fetchQuestions(supabase, assessmentId);
        setQuestions(qs);
        initAnswers(qs);
        setAttemptId(inProgress.id);
        startedAtRef.current = new Date();
        setPageState('taking');
        return;
      }

      // Show result for latest finished attempt
      const latest = attList[0];
      if (latest && (latest.status === 'graded' || latest.status === 'submitted' || latest.status === 'timed_out')) {
        const qs = await fetchQuestions(supabase, assessmentId);
        setQuestions(qs);
        const res = await fetchResult(supabase, latest.id, qs);
        setResult(res);
        setPageState('results');
        return;
      }

      setPageState('intro');
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offeringId, assessmentId]);

  // ── Timer ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (pageState !== 'taking' || !assessment?.time_limit_mins) return;
    setTimeLeft(assessment.time_limit_mins * 60);
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          submitRef.current?.(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageState]);

  useEffect(() => { submitRef.current = handleSubmit; });

  // ── Data helpers ───────────────────────────────────────────────────────────

  async function fetchQuestions(supabase: any, aId: string): Promise<Question[]> {
    const { data: qs } = await supabase
      .from('questions')
      .select('id, type, body, marks, sort_order, question_options(id, body, is_correct, sort_order)')
      .eq('assessment_id', aId)
      .order('sort_order', { ascending: true });
    return ((qs ?? []) as any[]).map((q: any) => ({
      ...q,
      options: ((q.question_options ?? []) as any[]).sort((a: any, b: any) => a.sort_order - b.sort_order),
    }));
  }

  function initAnswers(qs: Question[]) {
    const m = new Map<string, Answer>();
    qs.forEach(q => m.set(q.id, { selectedOptions: [], textAnswer: '' }));
    setAnswers(m);
  }

  async function fetchResult(supabase: any, aId: string, qs: Question[]): Promise<AttemptResult> {
    const { data: attempt } = await supabase
      .from('assessment_attempts')
      .select('score, score_pct, passed, status, text_response')
      .eq('id', aId)
      .maybeSingle();

    const { data: saRows } = await supabase
      .from('student_answers')
      .select('question_id, selected_options, text_answer, is_correct, marks_awarded, instructor_note')
      .eq('attempt_id', aId);

    const saMap: Record<string, any> = {};
    ((saRows ?? []) as any[]).forEach((sa: any) => { saMap[sa.question_id] = sa; });

    return {
      score:        (attempt as any)?.score ?? null,
      scorePct:     (attempt as any)?.score_pct ?? null,
      passed:       (attempt as any)?.passed ?? null,
      status:       (attempt as any)?.status ?? 'submitted',
      textResponse: (attempt as any)?.text_response ?? null,
      answers:      qs.map(q => {
        const sa = saMap[q.id] ?? {};
        return {
          questionId:      q.id,
          isCorrect:       sa.is_correct ?? null,
          marksAwarded:    sa.marks_awarded ?? 0,
          correctOptions:  q.options.filter(o => o.is_correct).map(o => o.id),
          selectedOptions: sa.selected_options ?? [],
          textAnswer:      sa.text_answer ?? '',
          instructorNote:  sa.instructor_note ?? null,
        };
      }),
    };
  }

  // ── Answer helpers ─────────────────────────────────────────────────────────

  function setAnswer(qId: string, patch: Partial<Answer>) {
    setAnswers(prev => {
      const next = new Map(prev);
      next.set(qId, { ...(prev.get(qId) ?? { selectedOptions: [], textAnswer: '' }), ...patch });
      return next;
    });
  }

  // ── Start attempt ──────────────────────────────────────────────────────────

  async function startAttempt() {
    if (!userId || !enrollmentId || !assessment) return;
    const supabase = createClient();
    const { data: att, error: err } = await supabase
      .from('assessment_attempts')
      .insert({
        assessment_id:  assessmentId,
        student_id:     userId,
        enrollment_id:  enrollmentId,
        attempt_number: existingAttempts + 1,
        status:         'in_progress',
        started_at:     new Date().toISOString(),
      })
      .select('id')
      .single();
    if (err || !att) { setErrorMsg('Failed to start attempt. Try again.'); return; }
    const qs = await fetchQuestions(supabase, assessmentId);
    setQuestions(qs);
    initAnswers(qs);
    setAttemptId((att as any).id);
    startedAtRef.current = new Date();
    setPageState('taking');
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(timedOut = false) {
    if (!attemptId || !userId || !enrollmentId || !assessment || submitting) return;
    setSubmitting(true);

    const supabase = createClient();
    const timeTaken = startedAtRef.current
      ? Math.floor((Date.now() - startedAtRef.current.getTime()) / 1000)
      : null;

    // ── Open-ended (assessment with no structured questions) ────────────────
    if (questions.length === 0) {
      let finalText = openResponse;
      for (const f of openFiles) {
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `assessment-answers/${attemptId}/open/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from('lms-uploads').upload(path, f, { contentType: f.type });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('lms-uploads').getPublicUrl(path);
          finalText += `<div style="margin-top:8px"><a href="${urlData.publicUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563eb">📎 ${f.name}</a></div>`;
        }
      }
      await supabase.from('assessment_attempts').update({
        status: 'submitted', score: null, score_pct: null, passed: null,
        submitted_at: new Date().toISOString(), time_taken_s: timeTaken,
        text_response: finalText || null,
      }).eq('id', attemptId);
      const res = await fetchResult(supabase, attemptId, []);
      setResult(res);
      setSubmitting(false);
      setPageState('results');
      return;
    }

    // ── Upload files first (build URL map by questionId) ───────────────────
    const uploadedByQuestion: Record<string, Array<{ url: string; name: string; mimeType: string; sizeKb: number }>> = {};
    for (const [qId, files] of questionFiles.entries()) {
      if (!files.length) continue;
      uploadedByQuestion[qId] = [];
      for (const f of files) {
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `assessment-answers/${attemptId}/${qId}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage.from('lms-uploads').upload(path, f, { contentType: f.type });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('lms-uploads').getPublicUrl(path);
          uploadedByQuestion[qId].push({ url: urlData.publicUrl, name: f.name, mimeType: f.type, sizeKb: Math.ceil(f.size / 1024) });
        }
      }
    }

    // ── Insert answers + auto-grade MCQ/true_false ─────────────────────────
    const hasManual = questions.some(q => q.type === 'short_answer' || q.type === 'essay' || q.type === 'fill_blank');
    let autoScore = 0;

    for (const q of questions) {
      const ans = answers.get(q.id) ?? { selectedOptions: [], textAnswer: '' };
      let isCorrect: boolean | null = null;
      let marksAwarded = 0;
      let textAnswer = ans.textAnswer;

      if (q.type === 'mcq' || q.type === 'true_false') {
        const correctIds = q.options.filter(o => o.is_correct).map(o => o.id);
        isCorrect = ans.selectedOptions.length > 0 &&
          ans.selectedOptions.length === correctIds.length &&
          ans.selectedOptions.every(id => correctIds.includes(id));
        marksAwarded = isCorrect ? q.marks : 0;
        autoScore += marksAwarded;
      }

      // Append uploaded file links to text_answer for display
      const uploads = uploadedByQuestion[q.id] ?? [];
      if (uploads.length > 0) {
        const links = uploads.map(u =>
          `<a href="${u.url}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;display:inline-flex;align-items:center;gap:4px;margin-right:8px">📎 ${u.name}</a>`
        ).join('');
        textAnswer += `<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb"><small style="color:#6b7280;font-size:11px">Attachments: </small>${links}</div>`;
      }

      // Upsert answer (returns ID for linking attachments)
      const { data: savedAns } = await supabase
        .from('student_answers')
        .upsert({
          attempt_id:       attemptId,
          question_id:      q.id,
          selected_options: ans.selectedOptions.length > 0 ? ans.selectedOptions : null,
          text_answer:      textAnswer || null,
          is_correct:       isCorrect,
          marks_awarded:    marksAwarded,
        }, { onConflict: 'attempt_id,question_id' })
        .select('id')
        .single();

      // Create proper attachment records and link them
      if (savedAns && uploads.length > 0) {
        for (const u of uploads) {
          const { data: attRow } = await supabase
            .from('attachments')
            .insert({
              file_name:   u.name,
              file_url:    u.url,
              mime_type:   u.mimeType,
              size_kb:     u.sizeKb,
              uploaded_by: userId,
            })
            .select('id')
            .single();
          if (attRow) {
            await supabase.from('student_answer_attachments').insert({
              answer_id:     (savedAns as any).id,
              attachment_id: (attRow as any).id,
            });
          }
        }
      }
    }

    // ── Determine final status ─────────────────────────────────────────────
    const newStatus = timedOut ? 'timed_out' : (hasManual ? 'submitted' : 'graded');
    const finalScore    = hasManual ? null : autoScore;
    const finalScorePct = (finalScore != null && assessment.total_marks > 0)
      ? Math.round((autoScore / assessment.total_marks) * 10000) / 100
      : null;
    const passed = finalScorePct != null ? finalScorePct >= 50 : null;

    await supabase.from('assessment_attempts').update({
      status:       newStatus,
      score:        finalScore,
      score_pct:    finalScorePct,
      passed,
      submitted_at: new Date().toISOString(),
      time_taken_s: timeTaken,
    }).eq('id', attemptId);

    // ── Update gradebook if fully auto-graded ──────────────────────────────
    if (!hasManual && !timedOut && finalScore != null) {
      await updateGradebookItem(
        supabase, enrollmentId, userId, assessmentId, 'assessment',
        finalScore, assessment.total_marks, 0,
      );
    }

    const res = await fetchResult(supabase, attemptId, questions);
    setResult(res);
    setSubmitting(false);
    setPageState('results');
  }

  // ── Availability ───────────────────────────────────────────────────────────

  function availabilityMsg(): string | null {
    if (!assessment) return null;
    const now = Date.now();
    if (assessment.available_from && now < new Date(assessment.available_from).getTime())
      return `This assessment opens on ${fmt(assessment.available_from)}.`;
    if (assessment.available_until && now > new Date(assessment.available_until).getTime())
      return 'The submission window has closed.';
    return null;
  }

  const attemptsExhausted = assessment ? existingAttempts >= assessment.max_attempts : false;
  const unavailableMsg    = availabilityMsg();
  const canStart          = !attemptsExhausted && !unavailableMsg;
  const backUrl           = `/dashboard/class/${offeringId}/t1`;

  // ── Loading ────────────────────────────────────────────────────────────────

  if (pageState === 'loading') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex items-center gap-2 text-gray-400 text-sm animate-pulse">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading assessment…
      </div>
    </div>
  );

  if (pageState === 'error') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl border border-gray-200 p-10 max-w-md w-full text-center shadow-sm">
        <span className="text-4xl block mb-3">⚠️</span>
        <p className="text-gray-700 font-medium mb-4">{errorMsg}</p>
        <button onClick={() => router.push(backUrl)}
          className="px-5 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium">
          Back to Class
        </button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // INTRO / PREVIEW
  // ─────────────────────────────────────────────────────────────────────────

  if (pageState === 'intro' && assessment) {
    const typeColors: Record<string, string> = {
      quiz: 'bg-blue-100 text-blue-700', midterm: 'bg-purple-100 text-purple-700',
      final_exam: 'bg-red-100 text-red-700', practice: 'bg-green-100 text-green-700',
    };

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <button onClick={() => router.push(backUrl)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
            ← Back to Class
          </button>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="h-2 bg-[#4c1d95]" />
            <div className="px-8 py-8">

              {/* Type badge + title */}
              <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full mb-3 ${typeColors[assessment.type] ?? 'bg-gray-100 text-gray-600'}`}>
                {assessment.type.replace(/_/g, ' ').toUpperCase()}
              </span>
              <h1 className="text-2xl font-bold text-gray-900 mb-6">{assessment.title}</h1>

              {/* Info grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                {[
                  ['⏱ Time', assessment.time_limit_mins ? `${assessment.time_limit_mins} min` : 'No limit'],
                  ['📝 Marks', `${assessment.total_marks}`],
                  ['🔄 Attempts', `${existingAttempts} of ${assessment.max_attempts} used`],
                ].map(([label, val]) => (
                  <div key={label} className="bg-gray-50 rounded-xl px-4 py-3 text-center border border-gray-100">
                    <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                    <p className="text-sm font-bold text-gray-800">{val}</p>
                  </div>
                ))}
              </div>

              {/* Availability window */}
              {(assessment.available_from || assessment.available_until) && (
                <div className="flex flex-wrap gap-6 text-sm text-gray-500 mb-6 px-1">
                  {assessment.available_from && (
                    <span>🟢 Opens: <strong className="text-gray-700">{fmt(assessment.available_from)}</strong></span>
                  )}
                  {assessment.available_until && (
                    <span>🔴 Closes: <strong className="text-gray-700">{fmt(assessment.available_until)}</strong></span>
                  )}
                </div>
              )}

              {/* Instructions — WYSIWYG */}
              {assessment.instructions && (
                <div className="mb-8">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Instructions</p>
                  <div
                    className="
                      tiptap-content prose prose-sm max-w-none
                      prose-headings:font-semibold prose-headings:text-gray-800
                      prose-h2:text-lg prose-h3:text-base
                      prose-ul:list-disc prose-ul:pl-4
                      prose-ol:list-decimal prose-ol:pl-4
                      prose-li:my-0.5
                      prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-code:text-sm
                      prose-pre:bg-gray-900 prose-pre:text-white prose-pre:p-3 prose-pre:rounded-lg
                      prose-strong:font-semibold
                      prose-blockquote:border-l-4 prose-blockquote:border-purple-400 prose-blockquote:pl-4 prose-blockquote:italic
                      text-gray-700 border border-gray-100 rounded-xl px-5 py-4 bg-gray-50/60
                    "
                    dangerouslySetInnerHTML={{ __html: assessment.instructions }}
                  />
                </div>
              )}

              {/* Reference files */}
              {attachments.length > 0 && (
                <div className="mb-8">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Reference Files</p>
                  <div className="space-y-2">
                    {attachments.map(att => (
                      <div key={att.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                        <span className="text-xl flex-shrink-0">{getFileIcon(att.mimeType)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{att.fileName}</p>
                          <p className="text-xs text-gray-400">{formatFileSize(att.sizeKb)}</p>
                        </div>
                        <a
                          href={att.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[#4c1d95] font-medium hover:underline flex-shrink-0 px-3 py-1 border border-[#4c1d95]/30 rounded-lg hover:bg-purple-50"
                        >
                          Download
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Alerts */}
              {unavailableMsg && (
                <div className="mb-5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
                  🕐 {unavailableMsg}
                </div>
              )}
              {attemptsExhausted && !unavailableMsg && (
                <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  You have used all {assessment.max_attempts} attempt{assessment.max_attempts !== 1 ? 's' : ''}.
                </div>
              )}

              {/* Timer warning */}
              {canStart && assessment.time_limit_mins && (
                <div className="mb-5 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
                  ⚠️ Once you start, the timer begins and <strong>cannot be paused</strong>.
                  You have <strong>{assessment.time_limit_mins} minutes</strong>.
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                {canStart && (
                  <button
                    onClick={startAttempt}
                    className="px-8 py-3 rounded-xl bg-[#4c1d95] hover:bg-[#5b21b6] text-white font-semibold text-sm uppercase tracking-wide transition-colors"
                  >
                    {existingAttempts > 0 ? `Retake Assessment →` : `Start Assessment →`}
                  </button>
                )}
                <button onClick={() => router.push(backUrl)}
                  className="px-5 py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium">
                  Back
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TAKING
  // ─────────────────────────────────────────────────────────────────────────

  if (pageState === 'taking' && assessment) {
    const answered = questions.filter(q => {
      const a = answers.get(q.id);
      return (a?.selectedOptions.length ?? 0) > 0 || (a?.textAnswer ?? '').trim().length > 0;
    }).length;

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Sticky header */}
        <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">{assessment.type.replace(/_/g, ' ')}</p>
              <h1 className="text-sm font-bold text-gray-900 truncate">{assessment.title}</h1>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-xs text-gray-500 hidden sm:block">{answered}/{questions.length} answered</span>
              {timeLeft !== null && (
                <span className={`font-mono text-sm font-bold px-3 py-1.5 rounded-lg ${timeLeft < 300 ? 'bg-red-100 text-red-600 animate-pulse' : timeLeft < 600 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-700'}`}>
                  ⏱ {formatTime(timeLeft)}
                </span>
              )}
              <button
                onClick={() => handleSubmit(false)}
                disabled={submitting}
                className="px-5 py-2 rounded-lg bg-[#4c1d95] hover:bg-[#5b21b6] text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>

        {/* Questions */}
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

          {/* Open-ended (no structured questions) */}
          {questions.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <p className="text-sm font-semibold text-gray-700">Your Answer</p>
                <p className="text-xs text-gray-400 mt-0.5">Write your response to the instructions above.</p>
              </div>
              <div className="p-6 space-y-4">
                <RichTextEditor value={openResponse} onChange={html => setOpenResponse(html)} minHeight="280px" />
                <AttachFileZone
                  files={openFiles}
                  onAdd={fs => setOpenFiles(p => [...p, ...fs])}
                  onRemove={i => setOpenFiles(p => p.filter((_, idx) => idx !== i))}
                  inputRef={openFileRef}
                />
              </div>
            </div>
          )}

          {/* Structured questions */}
          {questions.map((q, idx) => {
            const ans = answers.get(q.id) ?? { selectedOptions: [], textAnswer: '' };
            return (
              <div key={q.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="flex items-start gap-3 px-6 py-4 border-b border-gray-100">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#4c1d95] text-white text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <div className="prose prose-sm max-w-none text-gray-900 font-medium"
                      dangerouslySetInnerHTML={{ __html: q.body }} />
                    <span className="text-xs text-gray-400 mt-1 block capitalize">
                      {q.type.replace(/_/g, ' ')} · {q.marks} mark{q.marks !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Answer area */}
                <div className="px-6 py-4 space-y-3">
                  {/* MCQ / True-False */}
                  {(q.type === 'mcq' || q.type === 'true_false') && (
                    <div className="space-y-2">
                      {q.options.map(opt => {
                        const sel = ans.selectedOptions.includes(opt.id);
                        return (
                          <label key={opt.id}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${sel ? 'border-[#4c1d95] bg-purple-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
                            <input type="radio" name={`q-${q.id}`} value={opt.id} checked={sel}
                              onChange={() => setAnswer(q.id, { selectedOptions: [opt.id] })}
                              className="accent-[#4c1d95]" />
                            <span className="text-sm text-gray-800" dangerouslySetInnerHTML={{ __html: opt.body }} />
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Short answer / fill blank */}
                  {(q.type === 'short_answer' || q.type === 'fill_blank') && (
                    <>
                      <RichTextEditor value={ans.textAnswer} onChange={html => setAnswer(q.id, { textAnswer: html })} minHeight="100px" />
                      <AttachFileZone
                        files={questionFiles.get(q.id) ?? []}
                        onAdd={fs => setQuestionFiles(prev => { const n = new Map(prev); n.set(q.id, [...(prev.get(q.id) ?? []), ...fs]); return n; })}
                        onRemove={i => setQuestionFiles(prev => { const n = new Map(prev); n.set(q.id, (prev.get(q.id) ?? []).filter((_, idx) => idx !== i)); return n; })}
                        inputRef={{ current: qFileRefs.current[q.id] ?? null }}
                        onRefSet={el => { qFileRefs.current[q.id] = el; }}
                      />
                    </>
                  )}

                  {/* Essay */}
                  {q.type === 'essay' && (
                    <>
                      <RichTextEditor value={ans.textAnswer} onChange={html => setAnswer(q.id, { textAnswer: html })} minHeight="200px" />
                      <AttachFileZone
                        files={questionFiles.get(q.id) ?? []}
                        onAdd={fs => setQuestionFiles(prev => { const n = new Map(prev); n.set(q.id, [...(prev.get(q.id) ?? []), ...fs]); return n; })}
                        onRemove={i => setQuestionFiles(prev => { const n = new Map(prev); n.set(q.id, (prev.get(q.id) ?? []).filter((_, idx) => idx !== i)); return n; })}
                        inputRef={{ current: qFileRefs.current[q.id] ?? null }}
                        onRefSet={el => { qFileRefs.current[q.id] = el; }}
                      />
                    </>
                  )}

                  {q.type === 'matching' && (
                    <p className="text-sm text-gray-400 italic">Matching questions — please answer in the text field below if applicable.</p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Bottom submit */}
          <div className="flex justify-center pt-4 pb-8">
            <button
              onClick={() => handleSubmit(false)}
              disabled={submitting}
              className="px-10 py-3 rounded-xl bg-[#4c1d95] hover:bg-[#5b21b6] text-white font-semibold text-sm uppercase tracking-wide disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit Assessment'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RESULTS
  // ─────────────────────────────────────────────────────────────────────────

  if (pageState === 'results' && assessment && result) {
    const isGraded   = result.status === 'graded' && result.score != null;
    const isTimedOut = result.status === 'timed_out';
    const isPending  = !isGraded;
    const showScore  = isGraded && assessment.show_result;
    const letterGrade = showScore && result.scorePct != null ? getLetterGrade(result.scorePct) : null;
    const gradeBadge  = letterGrade ? getGradeColor(letterGrade) : '';

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <button onClick={() => router.push(backUrl)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
            ← Back to Class
          </button>

          {/* Score summary */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
            <div className={`h-2 ${isPending ? 'bg-amber-400' : result.passed ? 'bg-green-500' : 'bg-red-400'}`} />
            <div className="px-8 py-8">
              <h1 className="text-xl font-bold text-gray-900 mb-1">{assessment.title}</h1>
              <p className="text-sm text-gray-400 mb-6 capitalize">{assessment.type.replace(/_/g, ' ')}</p>

              {isPending ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center text-2xl flex-shrink-0">⏳</div>
                    <div>
                      <p className="text-xl font-bold text-amber-600">Awaiting Instructor Grade</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Your submission has been received. Your instructor will review and assign marks.
                      </p>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                    <span className="font-medium">Total marks:</span> {assessment.total_marks}
                    {isTimedOut && <span className="ml-3 text-amber-600 font-medium">· ⏰ Auto-submitted (time expired)</span>}
                  </div>
                </div>
              ) : showScore ? (
                <div className="flex flex-wrap gap-6 items-center">
                  <div className="text-center">
                    <p className="text-4xl font-bold text-gray-900">
                      {result.score}<span className="text-xl text-gray-400">/{assessment.total_marks}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Score</p>
                  </div>
                  <div className="text-center">
                    <p className="text-4xl font-bold text-[#4c1d95]">{result.scorePct?.toFixed(1)}%</p>
                    <p className="text-xs text-gray-400 mt-1">Percentage</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-2xl">✅</div>
                  <div>
                    <p className="text-xl font-bold text-green-600">Completed</p>
                    <p className="text-sm text-gray-500">Your assessment has been graded.</p>
                  </div>
                </div>
              )}

              {/* Retake button */}
              {!attemptsExhausted && !unavailableMsg && (
                <div className="mt-6">
                  <button
                    onClick={() => { setPageState('intro'); setResult(null); }}
                    className="px-6 py-2 rounded-xl border border-[#4c1d95] text-[#4c1d95] hover:bg-purple-50 text-sm font-medium transition-colors"
                  >
                    Retake ({existingAttempts}/{assessment.max_attempts} attempts used)
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Open-ended response */}
          {result.textResponse && questions.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <p className="text-sm font-semibold text-gray-700">Your Submitted Response</p>
              </div>
              <div className="p-6 prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: result.textResponse }} />
            </div>
          )}

          {/* Question review */}
          {questions.length > 0 && (
            <>
              <h2 className="text-base font-bold text-gray-800 mb-4">Question Review</h2>
              <div className="space-y-4">
                {questions.map((q, idx) => {
                  const ra     = result.answers.find(a => a.questionId === q.id);
                  const isAuto = q.type === 'mcq' || q.type === 'true_false';
                  const correct = ra?.isCorrect;
                  const borderColor = !isAuto ? 'border-gray-200' : correct ? 'border-green-300' : 'border-red-300';
                  const bgColor     = !isAuto ? 'bg-white' : correct ? 'bg-green-50' : 'bg-red-50';

                  return (
                    <div key={q.id} className={`rounded-xl border ${borderColor} ${bgColor} overflow-hidden shadow-sm`}>
                      <div className="flex items-start gap-3 px-5 py-4">
                        <span className={`flex-shrink-0 w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${!isAuto ? 'bg-gray-200 text-gray-600' : correct ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="prose prose-sm max-w-none text-gray-900" dangerouslySetInnerHTML={{ __html: q.body }} />
                          <p className="text-xs text-gray-400 mt-1">
                            {ra?.marksAwarded ?? 0} / {q.marks} mark{q.marks !== 1 ? 's' : ''}
                            {isAuto && (correct ? ' · ✓ Correct' : ' · ✗ Incorrect')}
                            {!isAuto && isPending && ' · Awaiting manual grading'}
                            {!isAuto && !isPending && showScore && ` · ${ra?.marksAwarded ?? 0}/${q.marks} marks awarded`}
                          </p>
                        </div>
                      </div>

                      {/* MCQ option review — always show student's selection; reveal correct answer only if show_answers=true */}
                      {isAuto && q.options.length > 0 && (
                        <div className="px-5 pb-4 space-y-1.5">
                          {q.options.map(opt => {
                            const wasSel = (ra?.selectedOptions ?? []).includes(opt.id);
                            const isCorr = opt.is_correct;
                            const showCorrect = assessment.show_answers;

                            let cls = 'bg-white text-gray-600 border border-gray-100';
                            if (showCorrect && isCorr)             cls = 'bg-green-100 text-green-800 border border-green-200';
                            else if (showCorrect && wasSel)        cls = 'bg-red-100 text-red-700 border border-red-200';
                            else if (!showCorrect && wasSel)       cls = 'bg-purple-50 text-purple-800 border border-[#4c1d95]/30';

                            const icon = showCorrect
                              ? (isCorr ? '✓' : wasSel ? '✗' : '·')
                              : (wasSel ? '●' : '○');

                            return (
                              <div key={opt.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${cls}`}>
                                <span className="w-4 flex-shrink-0">{icon}</span>
                                <span dangerouslySetInnerHTML={{ __html: opt.body }} />
                                {wasSel && !showCorrect && <span className="ml-auto text-xs text-[#4c1d95] font-medium flex-shrink-0">Your answer</span>}
                                {wasSel && showCorrect && !isCorr && <span className="ml-auto text-xs text-red-500 flex-shrink-0">Your answer</span>}
                                {wasSel && showCorrect && isCorr  && <span className="ml-auto text-xs text-green-600 flex-shrink-0">Your answer ✓</span>}
                                {!wasSel && showCorrect && isCorr  && <span className="ml-auto text-xs text-green-600 flex-shrink-0">Correct answer</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Open-ended answer review */}
                      {!isAuto && ra?.textAnswer && (
                        <div className="px-5 pb-4">
                          <p className="text-xs text-gray-500 mb-1.5">Your answer:</p>
                          <div className="prose prose-sm max-w-none text-sm text-gray-700 bg-white rounded-xl border border-gray-200 px-4 py-3"
                            dangerouslySetInnerHTML={{ __html: ra.textAnswer }} />
                          {ra.instructorNote && (
                            <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl">
                              <p className="text-xs text-blue-600 font-medium">Instructor feedback:</p>
                              <p className="text-sm text-blue-800 mt-0.5">{ra.instructorNote}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ─── File Attach Zone (reusable) ──────────────────────────────────────────────

function AttachFileZone({
  files, onAdd, onRemove, inputRef, onRefSet,
}: {
  files: File[];
  onAdd: (fs: File[]) => void;
  onRemove: (i: number) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onRefSet?: (el: HTMLInputElement | null) => void;
}) {
  return (
    <div className="border border-dashed border-gray-200 rounded-xl p-3 bg-gray-50/60">
      {files.length > 0 && (
        <ul className="space-y-1.5 mb-3">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <span className="truncate text-gray-700">📎 {f.name}
                <span className="text-gray-400 text-xs ml-1.5">({Math.ceil(f.size / 1024)} KB)</span>
              </span>
              <button type="button" onClick={() => onRemove(i)} className="text-gray-400 hover:text-red-500 text-xs flex-shrink-0">✕</button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => (inputRef.current ?? null)?.click()}
        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
        {files.length > 0 ? 'Add more files' : 'Attach supporting files'}
      </button>
      <input
        ref={onRefSet ? (el => { (inputRef as any).current = el; onRefSet(el); }) : inputRef}
        type="file"
        multiple
        accept="*/*"
        className="hidden"
        onChange={e => {
          const fs = Array.from(e.target.files ?? []);
          if (fs.length) onAdd(fs);
          if (e.target) e.target.value = '';
        }}
      />
    </div>
  );
}
