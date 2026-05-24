'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

type QuestionType =
  | 'mcq' | 'true_false' | 'short_answer' | 'fill_blank'
  | 'essay' | 'matching' | 'multiple_select' | 'numerical';

type OptionRow = {
  id: string;
  body: string;
  isCorrect: boolean;
  sortOrder: number;
  matchTarget: string | null;
};

type Question = {
  id: string;
  type: QuestionType;
  body: string;
  marks: number;
  sortOrder: number;
  explanation: string | null;
  mediaUrl: string | null;
  sectionLabel: string | null;
  options: OptionRow[];
  correctValue: number | null;
  tolerance: number;
  toleranceType: 'absolute' | 'percentage';
  unit: string | null;
};

type Assessment = {
  id: string;
  title: string;
  type: string;
  totalMarks: number;
  timeLimitMins: number | null;
  status: string;
  offeringLabel: string;
};

type SectionDef = {
  label: string;       // "A", "B", "C", …
  type: QuestionType;  // primary question type for this section
};

type DraftOption = { tempId: string; savedId?: string; body: string; isCorrect: boolean; };
type DraftPair   = { tempId: string; savedId?: string; left: string; right: string; };

type DraftForm = {
  body: string;
  type: QuestionType;
  marks: string;
  sortOrder: string;
  explanation: string;
  mediaUrl: string;
  sectionLabel: string;
  options: DraftOption[];
  pairs: DraftPair[];
  correctValue: string;
  tolerance: string;
  toleranceType: 'absolute' | 'percentage';
  unit: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  mcq:             'Multiple Choice',
  true_false:      'True / False',
  short_answer:    'Short Answer',
  fill_blank:      'Fill in the Blank',
  essay:           'Essay',
  matching:        'Matching',
  multiple_select: 'Multiple Select',
  numerical:       'Numerical',
};

const SECTION_TITLES: Record<string, string> = {
  mcq:             'Multiple Choice Questions',
  true_false:      'True / False',
  short_answer:    'Short Answer Questions',
  fill_blank:      'Fill in the Blank',
  essay:           'Essay Questions',
  matching:        'Matching Questions',
  multiple_select: 'Multiple Select Questions',
  numerical:       'Numerical / Calculation Questions',
};

const TYPE_COLORS: Record<string, string> = {
  mcq:             'bg-blue-100 text-blue-700 border-blue-200',
  true_false:      'bg-teal-100 text-teal-700 border-teal-200',
  short_answer:    'bg-orange-100 text-orange-700 border-orange-200',
  fill_blank:      'bg-yellow-100 text-yellow-700 border-yellow-200',
  essay:           'bg-purple-100 text-purple-700 border-purple-200',
  matching:        'bg-pink-100 text-pink-700 border-pink-200',
  multiple_select: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  numerical:       'bg-cyan-100 text-cyan-700 border-cyan-200',
};

const SECTION_BORDER: Record<string, string> = {
  mcq:             'border-l-blue-400',
  true_false:      'border-l-teal-400',
  short_answer:    'border-l-orange-400',
  fill_blank:      'border-l-yellow-400',
  essay:           'border-l-purple-400',
  matching:        'border-l-pink-400',
  multiple_select: 'border-l-indigo-400',
  numerical:       'border-l-cyan-400',
};

const SECTION_BG: Record<string, string> = {
  mcq:             'bg-blue-50/60',
  true_false:      'bg-teal-50/60',
  short_answer:    'bg-orange-50/60',
  fill_blank:      'bg-yellow-50/60',
  essay:           'bg-purple-50/60',
  matching:        'bg-pink-50/60',
  multiple_select: 'bg-indigo-50/60',
  numerical:       'bg-cyan-50/60',
};

const TYPE_ICONS: Record<string, string> = {
  mcq:             '◉',
  true_false:      '◑',
  short_answer:    '✏️',
  fill_blank:      '▭',
  essay:           '📝',
  matching:        '⇄',
  multiple_select: '☑',
  numerical:       '🔢',
};

const TYPE_DESC: Record<string, string> = {
  mcq:             'One correct answer — student picks the best option',
  true_false:      'Student marks the statement True or False',
  short_answer:    'Brief written response — manually graded',
  fill_blank:      'Complete a sentence — manually graded',
  essay:           'Long written response — manually graded',
  matching:        'Match items from left column to right column',
  multiple_select: 'Select ALL correct answers — partial credit not awarded',
  numerical:       'Student enters a number — auto-graded with tolerance range',
};

const ASSESSMENT_TYPE_LABELS: Record<string, string> = {
  quiz: 'Quiz', midterm: 'Midterm', final_exam: 'Final Exam', practice: 'Practice',
};

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genId() { return Math.random().toString(36).slice(2); }

function defaultOptions(type: QuestionType): DraftOption[] {
  if (type === 'true_false') return [
    { tempId: genId(), body: 'True',  isCorrect: false },
    { tempId: genId(), body: 'False', isCorrect: false },
  ];
  if (type === 'mcq' || type === 'multiple_select') return [
    { tempId: genId(), body: '', isCorrect: false },
    { tempId: genId(), body: '', isCorrect: false },
    { tempId: genId(), body: '', isCorrect: false },
    { tempId: genId(), body: '', isCorrect: false },
  ];
  return [];
}

function defaultPairs(type: QuestionType): DraftPair[] {
  if (type === 'matching') return [
    { tempId: genId(), left: '', right: '' },
    { tempId: genId(), left: '', right: '' },
  ];
  return [];
}

function emptyForm(nextOrder = 0, type: QuestionType = 'mcq', sectionLabel = ''): DraftForm {
  return {
    body: '', type, marks: '1', sortOrder: String(nextOrder),
    explanation: '', mediaUrl: '', sectionLabel,
    options: defaultOptions(type),
    pairs:   defaultPairs(type),
    correctValue: '', tolerance: '0', toleranceType: 'absolute', unit: '',
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssessmentBuildPage() {
  const params       = useParams();
  const assessmentId = params?.assessmentId as string;

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions]   = useState<Question[]>([]);
  const [sections, setSections]     = useState<SectionDef[]>([]);
  const [loading, setLoading]       = useState(true);
  const [notFound, setNotFound]     = useState(false);

  const [formOpen, setFormOpen]     = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState<DraftForm>(emptyForm());
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState('');
  const formRef = useRef<HTMLDivElement>(null);

  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionType, setNewSectionType] = useState<QuestionType>('mcq');

  // ── Fetch assessment ───────────────────────────────────────────────────────

  const fetchAssessment = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('assessments')
      .select(`id, title, type, total_marks, time_limit_mins, status,
        course_offerings!fk_assessments_offering(
          section_name,
          courses!fk_course_offerings_course(code, title),
          academic_terms!fk_course_offerings_term(academic_year_label, term_name, term_code)
        )`)
      .eq('id', assessmentId)
      .single();
    if (error || !data) { setNotFound(true); return; }
    const o = (data as any).course_offerings ?? {};
    const c = o.courses ?? {};
    const t = o.academic_terms ?? {};
    setAssessment({
      id:            (data as any).id,
      title:         (data as any).title ?? '',
      type:          (data as any).type ?? 'quiz',
      totalMarks:    (data as any).total_marks ?? 0,
      timeLimitMins: (data as any).time_limit_mins ?? null,
      status:        (data as any).status ?? 'draft',
      offeringLabel: `${(c.code ?? '').toUpperCase()} — ${c.title ?? '—'} · ${[t.academic_year_label, t.term_name ?? t.term_code].filter(Boolean).join(' · ')} · Sec ${o.section_name ?? 'A'}`,
    });
  }, [assessmentId]);

  // ── Fetch questions + derive sections ─────────────────────────────────────

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: qs } = await supabase
      .from('questions')
      .select('id, type, body, marks, sort_order, explanation, media_url, section_label, correct_value, tolerance, tolerance_type, unit, question_options(id, body, is_correct, sort_order, match_target)')
      .eq('assessment_id', assessmentId)
      .order('sort_order', { ascending: true });

    const mapped: Question[] = ((qs ?? []) as any[]).map((q: any) => ({
      id:            q.id,
      type:          q.type as QuestionType,
      body:          q.body ?? '',
      marks:         q.marks ?? 1,
      sortOrder:     q.sort_order ?? 0,
      explanation:   q.explanation ?? null,
      mediaUrl:      q.media_url ?? null,
      sectionLabel:  q.section_label ?? null,
      correctValue:  q.correct_value ?? null,
      tolerance:     q.tolerance ?? 0,
      toleranceType: (q.tolerance_type ?? 'absolute') as 'absolute' | 'percentage',
      unit:          q.unit ?? null,
      options:       ((q.question_options ?? []) as any[])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((o: any) => ({
          id:          o.id,
          body:        o.body ?? '',
          isCorrect:   o.is_correct ?? false,
          sortOrder:   o.sort_order ?? 0,
          matchTarget: o.match_target ?? null,
        })),
    }));
    setQuestions(mapped);

    // Derive sections from questions (stable order A–Z)
    const seen = new Map<string, QuestionType>();
    for (const q of mapped) {
      if (q.sectionLabel && !seen.has(q.sectionLabel)) {
        seen.set(q.sectionLabel, q.type);
      }
    }
    setSections(
      [...seen.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, type]) => ({ label, type }))
    );
    setLoading(false);
  }, [assessmentId]);

  useEffect(() => {
    fetchAssessment();
    fetchQuestions();
  }, [fetchAssessment, fetchQuestions]);

  // ── Type change ────────────────────────────────────────────────────────────

  function handleTypeChange(newType: QuestionType) {
    setForm(f => ({
      ...f, type: newType,
      options: defaultOptions(newType),
      pairs:   defaultPairs(newType),
    }));
  }

  // ── Next available section letter ──────────────────────────────────────────

  function nextSectionLabel(currentSections: SectionDef[]): string {
    const used = new Set(currentSections.map(s => s.label));
    for (const c of ALPHA) {
      if (!used.has(c)) return c;
    }
    return 'Z';
  }

  // ── Open add form ──────────────────────────────────────────────────────────

  function openAddForm(sectionLabel = '', type?: QuestionType) {
    const maxOrder = questions.reduce((m, q) => Math.max(m, q.sortOrder), -1);
    const secType  = type ?? (sectionLabel ? sections.find(s => s.label === sectionLabel)?.type ?? 'mcq' : 'mcq');
    setEditingId(null);
    setForm(emptyForm(maxOrder + 1, secType, sectionLabel));
    setFormError('');
    setFormOpen(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  // ── Open edit form ─────────────────────────────────────────────────────────

  function openEditForm(q: Question) {
    setEditingId(q.id);
    const options: DraftOption[] = q.type === 'matching'
      ? []
      : q.options.map(o => ({ tempId: o.id, savedId: o.id, body: o.body, isCorrect: o.isCorrect }));
    const pairs: DraftPair[] = q.type === 'matching'
      ? q.options.map(o => ({ tempId: o.id, savedId: o.id, left: o.body, right: o.matchTarget ?? '' }))
      : [];
    setForm({
      body:          q.body,
      type:          q.type,
      marks:         String(q.marks),
      sortOrder:     String(q.sortOrder),
      explanation:   q.explanation ?? '',
      mediaUrl:      q.mediaUrl ?? '',
      sectionLabel:  q.sectionLabel ?? '',
      options,
      pairs,
      correctValue:  q.correctValue != null ? String(q.correctValue) : '',
      tolerance:     String(q.tolerance ?? 0),
      toleranceType: q.toleranceType ?? 'absolute',
      unit:          q.unit ?? '',
    });
    setFormError('');
    setFormOpen(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  // ── Add section ────────────────────────────────────────────────────────────

  function handleAddSection() {
    const label = nextSectionLabel(sections);
    const newSec: SectionDef = { label, type: newSectionType };
    setSections(prev => [...prev, newSec]);
    setAddSectionOpen(false);
    setNewSectionType('mcq');
    openAddForm(label, newSectionType);
  }

  // ── Cancel form ────────────────────────────────────────────────────────────

  function handleCancelForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormError('');
    // Remove sections that have no questions (created via Add Section but cancelled)
    setSections(prev => prev.filter(s => questions.some(q => q.sectionLabel === s.label)));
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  function validateForm(): string | null {
    if (sections.length > 0 && !form.sectionLabel.trim())
      return 'This assessment uses sections — please select a section for this question.';
    if (!form.body.trim()) return 'Question text is required.';
    const marks = parseInt(form.marks, 10);
    if (!marks || marks < 1) return 'Marks must be at least 1.';
    if (form.type === 'mcq') {
      if (form.options.length < 2) return 'Multiple Choice needs at least 2 options.';
      if (form.options.some(o => !o.body.trim())) return 'All option texts are required.';
      const cc = form.options.filter(o => o.isCorrect).length;
      if (cc === 0) return 'Please mark one option as correct.';
      if (cc > 1) return 'MCQ allows only 1 correct answer. Use Multiple Select for multiple correct answers.';
    }
    if (form.type === 'true_false') {
      if (!form.options.some(o => o.isCorrect)) return 'Please select the correct answer (True or False).';
    }
    if (form.type === 'multiple_select') {
      if (form.options.length < 2) return 'Multiple Select needs at least 2 options.';
      if (form.options.some(o => !o.body.trim())) return 'All option texts are required.';
      if (!form.options.some(o => o.isCorrect)) return 'Please mark at least one correct answer.';
    }
    if (form.type === 'matching') {
      if (form.pairs.length < 2) return 'Matching needs at least 2 pairs.';
      if (form.pairs.some(p => !p.left.trim() || !p.right.trim())) return 'All matching pairs must have both sides filled.';
    }
    if (form.type === 'numerical') {
      if (form.correctValue.trim() === '') return 'Correct value is required for numerical questions.';
      if (isNaN(parseFloat(form.correctValue))) return 'Correct value must be a valid number.';
      if (isNaN(parseFloat(form.tolerance)) || parseFloat(form.tolerance) < 0)
        return 'Tolerance must be a non-negative number.';
    }
    return null;
  }

  // ── Save question ──────────────────────────────────────────────────────────

  async function handleSave() {
    const err = validateForm();
    if (err) { setFormError(err); return; }

    // Marks budget guard
    if (assessment) {
      const newMarks      = parseInt(form.marks, 10) || 0;
      const existingMarks = editingId ? (questions.find(q => q.id === editingId)?.marks ?? 0) : 0;
      const projected     = questionTotal - existingMarks + newMarks;
      if (projected > assessment.totalMarks) {
        const left = assessment.totalMarks - (questionTotal - existingMarks);
        setFormError(
          `This question would exceed the total marks budget (${assessment.totalMarks}). ` +
          `Only ${left} mark${left !== 1 ? 's' : ''} remaining — reduce the marks to ${Math.max(1, left)} or less.`
        );
        return;
      }
    }

    setSaving(true);
    setFormError('');

    const supabase = createClient();
    const marks    = parseInt(form.marks, 10);

    const qPayload: any = {
      assessment_id:  assessmentId,
      type:           form.type,
      body:           form.body.trim(),
      marks,
      sort_order:     parseInt(form.sortOrder, 10) || 0,
      explanation:    form.explanation.trim() || null,
      media_url:      form.mediaUrl.trim() || null,
      section_label:  form.sectionLabel.trim() || null,
      correct_value:  form.type === 'numerical' ? parseFloat(form.correctValue) : null,
      tolerance:      form.type === 'numerical' ? parseFloat(form.tolerance) || 0 : 0,
      tolerance_type: form.type === 'numerical' ? form.toleranceType : 'absolute',
      unit:           form.type === 'numerical' && form.unit.trim() ? form.unit.trim() : null,
    };

    let qId = editingId;
    if (editingId) {
      const { error } = await supabase.from('questions').update(qPayload).eq('id', editingId);
      if (error) { setFormError(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('questions').insert(qPayload).select('id').single();
      if (error) { setFormError(error.message); setSaving(false); return; }
      qId = (data as any).id;
    }

    if (form.type === 'mcq' || form.type === 'true_false' || form.type === 'multiple_select') {
      if (editingId) {
        const keptIds   = form.options.filter(o => o.savedId).map(o => o.savedId!);
        const existingQ = questions.find(q => q.id === editingId);
        const toDelete  = existingQ?.options.filter(o => !keptIds.includes(o.id)).map(o => o.id) ?? [];
        if (toDelete.length > 0) await supabase.from('question_options').delete().in('id', toDelete);
      }
      for (let i = 0; i < form.options.length; i++) {
        const o = form.options[i];
        const payload: any = { question_id: qId, body: o.body.trim(), is_correct: o.isCorrect, sort_order: i, match_target: null };
        if (o.savedId) await supabase.from('question_options').update(payload).eq('id', o.savedId);
        else await supabase.from('question_options').insert(payload);
      }
    } else if (form.type === 'matching') {
      if (editingId) {
        const keptIds   = form.pairs.filter(p => p.savedId).map(p => p.savedId!);
        const existingQ = questions.find(q => q.id === editingId);
        const toDelete  = existingQ?.options.filter(o => !keptIds.includes(o.id)).map(o => o.id) ?? [];
        if (toDelete.length > 0) await supabase.from('question_options').delete().in('id', toDelete);
      }
      for (let i = 0; i < form.pairs.length; i++) {
        const p = form.pairs[i];
        const payload: any = { question_id: qId, body: p.left.trim(), is_correct: true, sort_order: i, match_target: p.right.trim() };
        if (p.savedId) await supabase.from('question_options').update(payload).eq('id', p.savedId);
        else await supabase.from('question_options').insert(payload);
      }
    } else {
      if (editingId) await supabase.from('question_options').delete().eq('question_id', editingId);
    }

    // If this question introduces a new section, ensure it's in sections state
    if (form.sectionLabel && !sections.find(s => s.label === form.sectionLabel)) {
      setSections(prev =>
        [...prev, { label: form.sectionLabel, type: form.type }]
          .sort((a, b) => a.label.localeCompare(b.label))
      );
    }

    toast.success(editingId ? 'Question updated.' : 'Question added.');
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    fetchQuestions();
    setSaving(false);
  }

  // ── Delete question ────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteId) return;
    setIsDeleting(true);
    const { error } = await createClient().from('questions').delete().eq('id', deleteId);
    if (error) toast.error('Failed to delete question.');
    else { toast.success('Question deleted.'); fetchQuestions(); }
    setDeleteId(null);
    setIsDeleting(false);
  }

  // ── Totals ─────────────────────────────────────────────────────────────────

  const questionTotal  = questions.reduce((s, q) => s + q.marks, 0);
  const remaining      = assessment ? assessment.totalMarks - questionTotal : 0;
  const budgetExhausted = assessment != null && remaining <= 0;

  if (notFound) return (
    <div className="p-8 text-center text-gray-500">Assessment not found.</div>
  );

  // ── Grouped display ────────────────────────────────────────────────────────

  const unsectioned = questions.filter(q => !q.sectionLabel);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">

      {/* ── Back + Assessment Header ───────────────────────────────────── */}
      <div>
        <Link href="/instructor/assessments"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
          ← Back to Assessments
        </Link>

        {assessment && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="h-1.5 bg-[#4c1d95]" />
            <div className="px-6 py-4 flex flex-wrap gap-4 items-start justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    assessment.type === 'quiz'       ? 'bg-blue-100 text-blue-700'     :
                    assessment.type === 'midterm'    ? 'bg-purple-100 text-purple-700' :
                    assessment.type === 'final_exam' ? 'bg-red-100 text-red-700'       :
                    'bg-green-100 text-green-700'
                  }`}>{ASSESSMENT_TYPE_LABELS[assessment.type] ?? assessment.type}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                    assessment.status === 'published' ? 'bg-green-100 text-green-700' :
                    assessment.status === 'draft'     ? 'bg-gray-100 text-gray-500'   :
                    assessment.status === 'closed'    ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-400'
                  }`}>{assessment.status}</span>
                </div>
                <h1 className="text-xl font-bold text-gray-900">{assessment.title}</h1>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{assessment.offeringLabel}</p>
              </div>
              <div className="flex flex-wrap gap-4 text-sm flex-shrink-0">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">{assessment.totalMarks}</p>
                  <p className="text-xs text-gray-400">Total Marks</p>
                </div>
                {assessment.timeLimitMins && (
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900">{assessment.timeLimitMins} min</p>
                    <p className="text-xs text-gray-400">Time Limit</p>
                  </div>
                )}
                <div className="text-center">
                  <p className={`text-lg font-bold ${questionTotal > assessment.totalMarks ? 'text-red-600' : questionTotal === assessment.totalMarks ? 'text-green-600' : 'text-amber-600'}`}>
                    {questionTotal}/{assessment.totalMarks}
                  </p>
                  <p className="text-xs text-gray-400">Marks Used</p>
                </div>
              </div>
            </div>
            {assessment.totalMarks > 0 && (
              <div className="px-6 pb-4">
                <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all ${questionTotal > assessment.totalMarks ? 'bg-red-500' : 'bg-[#4c1d95]'}`}
                    style={{ width: `${Math.min(100, (questionTotal / assessment.totalMarks) * 100)}%` }}
                  />
                </div>
                <p className={`text-xs mt-1 ${questionTotal > assessment.totalMarks ? 'text-red-600' : questionTotal === assessment.totalMarks ? 'text-green-600' : 'text-amber-600'}`}>
                  {questionTotal > assessment.totalMarks
                    ? `⚠ Over by ${questionTotal - assessment.totalMarks} marks`
                    : questionTotal === assessment.totalMarks
                    ? '✓ Marks fully allocated'
                    : `${remaining} mark${remaining !== 1 ? 's' : ''} remaining`}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      {!formOpen && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-gray-800">
            Questions <span className="text-gray-400 font-normal">({questions.length})</span>
            {sections.length > 0 && (
              <span className="ml-2 text-xs font-medium text-gray-400">
                · {sections.length} section{sections.length !== 1 ? 's' : ''}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setNewSectionType('mcq'); setAddSectionOpen(true); }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#4c1d95] text-[#4c1d95] text-sm font-medium hover:bg-purple-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Add Section
            </button>
            {sections.length === 0 && (
              <button
                type="button"
                onClick={() => openAddForm()}
                disabled={budgetExhausted}
                title={budgetExhausted ? 'All marks are allocated — cannot add more questions' : undefined}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#4c1d95] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Question
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Loading ────────────────────────────────────────────────────── */}
      {loading && (
        <div className="bg-white rounded-xl border border-gray-100 px-6 py-10 text-center text-sm text-gray-400 animate-pulse">
          Loading questions…
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!loading && questions.length === 0 && sections.length === 0 && !formOpen && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 px-6 py-14 text-center">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-sm font-semibold text-gray-700 mb-1">No questions yet</p>
          <p className="text-xs text-gray-400 mb-6 max-w-xs mx-auto">
            Use <strong>Add Section</strong> to organise questions by type (like Section A: True/False,
            Section B: MCQ, etc.) — or <strong>Add Question</strong> to create questions directly.
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => { setNewSectionType('mcq'); setAddSectionOpen(true); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#4c1d95] text-[#4c1d95] text-sm font-medium hover:bg-purple-50"
            >
              + Add Section
            </button>
            <button
              type="button"
              onClick={() => openAddForm()}
              disabled={budgetExhausted}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4c1d95] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Add Question
            </button>
          </div>
        </div>
      )}

      {/* ── Sections ──────────────────────────────────────────────────── */}
      {!loading && sections.map(sec => {
        const secQs    = questions.filter(q => q.sectionLabel === sec.label);
        const secMarks = secQs.reduce((s, q) => s + q.marks, 0);
        return (
          <div key={sec.label} className="space-y-2">
            {/* Section header */}
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 border-l-4 ${SECTION_BORDER[sec.type] ?? 'border-l-gray-400'} ${SECTION_BG[sec.type] ?? 'bg-gray-50'}`}>
              <span className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-sm font-extrabold border ${TYPE_COLORS[sec.type] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {sec.label}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Section {sec.label}</p>
                <p className="text-sm font-bold text-gray-800 leading-tight">
                  {SECTION_TITLES[sec.type] ?? TYPE_LABELS[sec.type]}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 text-xs text-gray-500">
                <span>{secQs.length} Q · {secMarks} mark{secMarks !== 1 ? 's' : ''}</span>
                {!formOpen && (
                  <button
                    type="button"
                    onClick={() => openAddForm(sec.label)}
                    disabled={budgetExhausted}
                    title={budgetExhausted ? 'All marks are allocated' : undefined}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${TYPE_COLORS[sec.type] ?? 'bg-gray-100 text-gray-600 border-gray-200'} hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    + Add Question
                  </button>
                )}
              </div>
            </div>

            {/* Questions inside section */}
            {secQs.length === 0 ? (
              <div className="ml-5 border border-dashed border-gray-200 rounded-xl px-4 py-5 text-center">
                <p className="text-xs text-gray-400">No questions in Section {sec.label} yet. Click "+ Add Question" above.</p>
              </div>
            ) : (
              <div className="ml-5 space-y-2">
                {secQs.map(q => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    index={questions.indexOf(q)}
                    isEditing={editingId === q.id && formOpen}
                    onEdit={() => openEditForm(q)}
                    onDelete={() => setDeleteId(q.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Unsectioned questions ─────────────────────────────────────── */}
      {!loading && unsectioned.length > 0 && (
        <div className="space-y-2">
          {sections.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 border-l-4 border-l-gray-300">
              <span className="w-8 h-8 rounded-lg bg-gray-200 text-gray-500 flex items-center justify-center text-xs font-bold flex-shrink-0">—</span>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">No Section</p>
                <p className="text-sm font-bold text-gray-600">Unsectioned Questions</p>
              </div>
              <span className="text-xs text-gray-400">{unsectioned.length} Q</span>
            </div>
          )}
          <div className={sections.length > 0 ? 'ml-5 space-y-2' : 'space-y-2'}>
            {unsectioned.map(q => (
              <QuestionCard
                key={q.id}
                question={q}
                index={questions.indexOf(q)}
                isEditing={editingId === q.id && formOpen}
                onEdit={() => openEditForm(q)}
                onDelete={() => setDeleteId(q.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Bottom add row ────────────────────────────────────────────── */}
      {!formOpen && questions.length > 0 && (
        <div className="flex justify-center gap-3 pt-2 pb-4 flex-wrap">
          <button
            type="button"
            onClick={() => { setNewSectionType('mcq'); setAddSectionOpen(true); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 border-dashed border-[#4c1d95]/40 text-[#4c1d95] text-sm font-medium hover:border-[#4c1d95] hover:bg-purple-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Add Section
          </button>
          {sections.length === 0 && (
            <button
              type="button"
              onClick={() => openAddForm()}
              disabled={budgetExhausted}
              title={budgetExhausted ? 'All marks are allocated — cannot add more questions' : undefined}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 text-sm font-medium hover:border-gray-400 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-gray-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Question
            </button>
          )}
        </div>
      )}

      {/* ── Question Form ─────────────────────────────────────────────── */}
      {formOpen && (
        <div ref={formRef}>
          <QuestionForm
            form={form}
            setForm={setForm}
            editingId={editingId}
            sections={sections}
            error={formError}
            saving={saving}
            onTypeChange={handleTypeChange}
            onSave={handleSave}
            onCancel={handleCancelForm}
          />
        </div>
      )}

      {/* ── Add Section Modal ─────────────────────────────────────────── */}
      {addSectionOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={() => setAddSectionOpen(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
            <div className="h-1 bg-[#4c1d95]" />
            <div className="p-6">
              <h2 className="text-base font-bold text-gray-900 mb-1">Add New Section</h2>
              <p className="text-xs text-gray-400 mb-5">
                Sections group questions by type — e.g. Section A: True/False, Section B: MCQ.
                Section <strong className="text-[#4c1d95]">{nextSectionLabel(sections)}</strong> will be created next.
              </p>

              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">
                Question Type for Section {nextSectionLabel(sections)}
              </label>
              <div className="grid grid-cols-2 gap-2 mb-6">
                {(['true_false','mcq','fill_blank','short_answer','matching','multiple_select','essay','numerical'] as QuestionType[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setNewSectionType(t)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-xs font-semibold text-left transition-all ${
                      newSectionType === t
                        ? `${TYPE_COLORS[t]} border-current shadow-sm`
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-base flex-shrink-0">{TYPE_ICONS[t]}</span>
                    <span>{TYPE_LABELS[t]}</span>
                  </button>
                ))}
              </div>

              <div className={`rounded-xl p-3 text-xs mb-5 ${SECTION_BG[newSectionType] ?? 'bg-gray-50'} border ${TYPE_COLORS[newSectionType]?.includes('blue') ? 'border-blue-200' : 'border-gray-200'}`}>
                <span className="font-semibold">Section {nextSectionLabel(sections)}: </span>
                {SECTION_TITLES[newSectionType]}
                <span className="text-gray-400 ml-1">— {TYPE_DESC[newSectionType]}</span>
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setAddSectionOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">
                  Cancel
                </button>
                <button type="button" onClick={handleAddSection}
                  className="px-4 py-2 rounded-lg bg-[#4c1d95] text-white text-sm font-semibold hover:opacity-90">
                  Create Section &amp; Add First Question
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Delete Confirm ────────────────────────────────────────────── */}
      {deleteId && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={() => setDeleteId(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete Question?</h2>
            <p className="text-sm text-gray-600 mb-6">This will permanently delete the question and all its answer options.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteId(null)} disabled={isDeleting}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={handleDelete} disabled={isDeleting}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 min-w-[90px]">
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Question Card (read-only preview) ───────────────────────────────────────

function QuestionCard({
  question, index, isEditing, onEdit, onDelete,
}: {
  question:  Question;
  index:     number;
  isEditing: boolean;
  onEdit:    () => void;
  onDelete:  () => void;
}) {
  const rightPool = question.type === 'matching'
    ? [...new Set(question.options.map(o => o.matchTarget).filter(Boolean))]
    : [];

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden border-l-4 ${SECTION_BORDER[question.type] ?? 'border-l-gray-300'} ${isEditing ? 'ring-2 ring-[#4c1d95]/40' : ''}`}>
      <div className="flex items-start gap-3 px-5 py-4">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#4c1d95] text-white text-xs font-bold flex items-center justify-center">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${TYPE_COLORS[question.type] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
              <span>{TYPE_ICONS[question.type]}</span>
              {TYPE_LABELS[question.type] ?? question.type}
            </span>
            <span className="text-xs text-gray-400">{question.marks} mark{question.marks !== 1 ? 's' : ''}</span>
          </div>
          <p className="text-sm text-gray-800 font-medium leading-snug line-clamp-3">{question.body}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button type="button" onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-[#4c1d95]" title="Edit">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button type="button" onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-red-600" title="Delete">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {(question.type === 'mcq' || question.type === 'true_false') && question.options.length > 0 && (
        <div className="px-5 pb-4 space-y-1">
          {question.options.map((opt, i) => (
            <div key={opt.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${opt.isCorrect ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-gray-50 text-gray-600 border border-gray-100'}`}>
              <span className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center text-[9px] font-bold"
                style={{ borderColor: opt.isCorrect ? '#16a34a' : '#d1d5db', backgroundColor: opt.isCorrect ? '#16a34a' : 'transparent', color: 'white' }}>
                {opt.isCorrect ? '✓' : ''}
              </span>
              <span>{question.type === 'mcq' ? `${String.fromCharCode(65 + i)}. ` : ''}{opt.body}</span>
              {opt.isCorrect && <span className="ml-auto text-xs text-green-600 font-semibold flex-shrink-0">Correct</span>}
            </div>
          ))}
        </div>
      )}

      {question.type === 'multiple_select' && question.options.length > 0 && (
        <div className="px-5 pb-4 space-y-1">
          <p className="text-xs text-indigo-600 font-medium mb-1.5">Select ALL correct answers:</p>
          {question.options.map((opt, i) => (
            <div key={opt.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${opt.isCorrect ? 'bg-indigo-50 text-indigo-800 border border-indigo-200' : 'bg-gray-50 text-gray-600 border border-gray-100'}`}>
              <span className="w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center text-[9px] font-bold"
                style={{ borderColor: opt.isCorrect ? '#4338ca' : '#d1d5db', backgroundColor: opt.isCorrect ? '#4338ca' : 'transparent', color: 'white' }}>
                {opt.isCorrect ? '✓' : ''}
              </span>
              <span>{String.fromCharCode(65 + i)}. {opt.body}</span>
              {opt.isCorrect && <span className="ml-auto text-xs text-indigo-600 font-semibold flex-shrink-0">Correct</span>}
            </div>
          ))}
        </div>
      )}

      {question.type === 'matching' && question.options.length > 0 && (
        <div className="px-5 pb-4">
          <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-gray-500 mb-2">
            <span>Item</span><span>Correct Match</span>
          </div>
          <div className="space-y-1.5">
            {question.options.map(opt => (
              <div key={opt.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 px-3 py-1.5 bg-pink-50 border border-pink-200 rounded-lg text-pink-800">{opt.body}</span>
                <span className="text-gray-400 flex-shrink-0">→</span>
                <span className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">{opt.matchTarget ?? '—'}</span>
              </div>
            ))}
          </div>
          {rightPool.length > 0 && (
            <p className="text-xs text-gray-400 mt-2">Answer pool: {(rightPool as string[]).join(', ')}</p>
          )}
        </div>
      )}

      {(question.type === 'short_answer' || question.type === 'fill_blank' || question.type === 'essay') && (
        <div className="px-5 pb-4">
          <span className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-lg">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Manually graded by instructor
          </span>
        </div>
      )}

      {question.type === 'numerical' && question.correctValue != null && (
        <div className="px-5 pb-4">
          <div className="inline-flex items-center gap-2 text-xs text-cyan-700 bg-cyan-50 border border-cyan-200 px-3 py-1.5 rounded-lg">
            <span className="font-semibold">Correct: {question.correctValue}{question.unit ? ` ${question.unit}` : ''}</span>
            {question.tolerance > 0 && (
              <span className="text-cyan-500">
                ± {question.tolerance}{question.toleranceType === 'percentage' ? '%' : question.unit ? ` ${question.unit}` : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {question.explanation && (
        <div className="px-5 pb-3">
          <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
            <span className="font-semibold">Explanation:</span> {question.explanation}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Question Form ────────────────────────────────────────────────────────────

function QuestionForm({
  form, setForm, editingId, sections, error, saving, onTypeChange, onSave, onCancel,
}: {
  form:         DraftForm;
  setForm:      React.Dispatch<React.SetStateAction<DraftForm>>;
  editingId:    string | null;
  sections:     SectionDef[];
  error:        string;
  saving:       boolean;
  onTypeChange: (t: QuestionType) => void;
  onSave:       () => void;
  onCancel:     () => void;
}) {
  const ALL_TYPES: QuestionType[] = [
    'mcq', 'true_false', 'multiple_select', 'fill_blank',
    'short_answer', 'matching', 'essay', 'numerical',
  ];

  const setOpt  = (i: number, patch: Partial<DraftOption>) =>
    setForm(f => ({ ...f, options: f.options.map((o, j) => j === i ? { ...o, ...patch } : o) }));
  const setPair = (i: number, patch: Partial<DraftPair>) =>
    setForm(f => ({ ...f, pairs: f.pairs.map((p, j) => j === i ? { ...p, ...patch } : p) }));
  const addOption  = () =>
    setForm(f => ({ ...f, options: [...f.options, { tempId: genId(), body: '', isCorrect: false }] }));
  const removeOption = (i: number) =>
    setForm(f => ({ ...f, options: f.options.filter((_, j) => j !== i) }));
  const addPair  = () =>
    setForm(f => ({ ...f, pairs: [...f.pairs, { tempId: genId(), left: '', right: '' }] }));
  const removePair = (i: number) =>
    setForm(f => ({ ...f, pairs: f.pairs.filter((_, j) => j !== i) }));

  function handleSectionChange(label: string) {
    const secType = sections.find(s => s.label === label)?.type;
    setForm(f => ({ ...f, sectionLabel: label }));
    if (secType) onTypeChange(secType);
  }

  return (
    <div className="bg-white rounded-xl border-2 border-[#4c1d95]/30 shadow-sm overflow-hidden">
      {/* Form Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#4c1d95]/5">
        <div>
          <h3 className="text-base font-bold text-gray-900">{editingId ? 'Edit Question' : 'New Question'}</h3>
          {form.sectionLabel && (
            <p className="text-xs text-[#4c1d95] font-medium mt-0.5">
              Section {form.sectionLabel} — {SECTION_TITLES[sections.find(s => s.label === form.sectionLabel)?.type ?? ''] ?? ''}
            </p>
          )}
        </div>
        <button type="button" onClick={onCancel} disabled={saving}
          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-6 space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">{error}</div>
        )}

        {/* ── Section selector (required when sections exist) ─────────── */}
        {sections.length > 0 && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Section <span className="text-red-500">*</span>
            </label>
            <select
              value={form.sectionLabel}
              onChange={e => handleSectionChange(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 ${
                !form.sectionLabel ? 'border-red-300 bg-red-50/40' : 'border-gray-200 bg-white'
              }`}
            >
              <option value="">— Select a section (required) —</option>
              {sections.map(s => (
                <option key={s.label} value={s.label}>
                  Section {s.label} — {SECTION_TITLES[s.type] ?? TYPE_LABELS[s.type]}
                </option>
              ))}
            </select>
            {!form.sectionLabel && (
              <p className="text-xs text-red-500 mt-1">All questions must belong to a section.</p>
            )}
          </div>
        )}

        {/* ── Question Type ───────────────────────────────────────────── */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">Question Type</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ALL_TYPES.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => onTypeChange(t)}
                className={`flex flex-col items-start gap-1 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                  form.type === t
                    ? 'border-[#4c1d95] bg-[#4c1d95]/5'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className="text-base">{TYPE_ICONS[t]}</span>
                <span className={`text-xs font-semibold ${form.type === t ? 'text-[#4c1d95]' : 'text-gray-700'}`}>
                  {TYPE_LABELS[t]}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">{TYPE_DESC[form.type]}</p>
        </div>

        {/* ── Question Text ────────────────────────────────────────────── */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Question Text <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={3}
            value={form.body}
            placeholder="Enter the question text here…"
            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 resize-none"
          />
        </div>

        {/* ── Marks + Sort Order ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Marks <span className="text-red-500">*</span>
            </label>
            <input
              type="number" min={1} value={form.marks}
              onChange={e => setForm(f => ({ ...f, marks: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Sort Order</label>
            <input
              type="number" min={0} value={form.sortOrder}
              onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20"
            />
          </div>
        </div>

        {/* ── TRUE / FALSE ─────────────────────────────────────────────── */}
        {form.type === 'true_false' && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Correct Answer <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              {form.options.map((opt, i) => (
                <label key={opt.tempId}
                  className={`flex-1 flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all ${
                    opt.isCorrect ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <input
                    type="radio" name="tf-correct" checked={opt.isCorrect}
                    onChange={() => setForm(f => ({ ...f, options: f.options.map((o, j) => ({ ...o, isCorrect: j === i })) }))}
                    className="accent-green-600"
                  />
                  <span className={`text-sm font-semibold ${opt.isCorrect ? 'text-green-700' : 'text-gray-600'}`}>{opt.body}</span>
                  {opt.isCorrect && <span className="ml-auto text-green-600 text-xs">✓ Correct</span>}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ── MCQ ──────────────────────────────────────────────────────── */}
        {form.type === 'mcq' && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Answer Options <span className="text-red-500">*</span>
              <span className="text-gray-400 font-normal ml-1">(mark one as correct)</span>
            </label>
            <div className="space-y-2">
              {form.options.map((opt, i) => (
                <div key={opt.tempId} className="flex items-center gap-2">
                  <span className="w-6 text-xs font-bold text-gray-400 flex-shrink-0 text-center">{String.fromCharCode(65 + i)}.</span>
                  <input
                    type="text" value={opt.body}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    onChange={e => setOpt(i, { body: e.target.value })}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20"
                  />
                  <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer text-xs font-medium flex-shrink-0 transition-colors ${
                    opt.isCorrect ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500 hover:border-green-300'
                  }`}>
                    <input
                      type="radio" name="mcq-correct" checked={opt.isCorrect}
                      onChange={() => setForm(f => ({ ...f, options: f.options.map((o, j) => ({ ...o, isCorrect: j === i })) }))}
                      className="accent-green-600"
                    />
                    {opt.isCorrect ? '✓ Correct' : 'Correct'}
                  </label>
                  <button type="button" onClick={() => removeOption(i)}
                    className="p-1.5 text-gray-300 hover:text-red-500 flex-shrink-0 rounded-lg hover:bg-red-50">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button type="button" onClick={addOption}
                className="mt-1 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium px-1">
                + Add Option
              </button>
            </div>
          </div>
        )}

        {/* ── MULTIPLE SELECT ──────────────────────────────────────────── */}
        {form.type === 'multiple_select' && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Answer Options <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-indigo-600 mb-3 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg">
              Check ALL options that are correct — students must select every correct one.
            </p>
            <div className="space-y-2">
              {form.options.map((opt, i) => (
                <div key={opt.tempId} className="flex items-center gap-2">
                  <span className="w-6 text-xs font-bold text-gray-400 flex-shrink-0 text-center">{String.fromCharCode(65 + i)}.</span>
                  <input
                    type="text" value={opt.body}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    onChange={e => setOpt(i, { body: e.target.value })}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20"
                  />
                  <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer text-xs font-medium flex-shrink-0 transition-colors ${
                    opt.isCorrect ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-indigo-300'
                  }`}>
                    <input
                      type="checkbox" checked={opt.isCorrect}
                      onChange={e => setOpt(i, { isCorrect: e.target.checked })}
                      className="accent-indigo-600"
                    />
                    {opt.isCorrect ? '✓ Correct' : 'Correct'}
                  </label>
                  <button type="button" onClick={() => removeOption(i)}
                    className="p-1.5 text-gray-300 hover:text-red-500 flex-shrink-0 rounded-lg hover:bg-red-50">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button type="button" onClick={addOption}
                className="mt-1 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium px-1">
                + Add Option
              </button>
            </div>
          </div>
        )}

        {/* ── MATCHING ─────────────────────────────────────────────────── */}
        {form.type === 'matching' && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Matching Pairs <span className="text-red-500">*</span>
            </label>

            {/* Column header labels */}
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="w-8 flex-shrink-0" />
              <div className="flex-1 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-pink-500 text-white text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">A</span>
                <span className="text-xs font-bold text-pink-700">Item — shown to students</span>
              </div>
              <div className="w-8 flex-shrink-0" />
              <div className="flex-1 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">B</span>
                <span className="text-xs font-bold text-green-700">Correct answer — added to dropdown pool</span>
              </div>
              <div className="w-8 flex-shrink-0" />
            </div>

            {/* Pair rows */}
            <div className="space-y-2">
              {form.pairs.map((pair, i) => (
                <div key={pair.tempId} className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center flex-shrink-0 border border-gray-200">
                    {i + 1}
                  </span>
                  <input
                    type="text" value={pair.left}
                    placeholder={`e.g. "Keyboard"`}
                    onChange={e => setPair(i, { left: e.target.value })}
                    className="flex-1 px-3 py-2 rounded-lg border-2 border-pink-200 bg-pink-50/60 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-pink-400 placeholder:text-pink-300"
                  />
                  <span className="text-gray-300 font-bold text-lg flex-shrink-0">↔</span>
                  <input
                    type="text" value={pair.right}
                    placeholder={`e.g. "Input Device"`}
                    onChange={e => setPair(i, { right: e.target.value })}
                    className="flex-1 px-3 py-2 rounded-lg border-2 border-green-200 bg-green-50/60 text-sm focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400 placeholder:text-green-300"
                  />
                  <button type="button" onClick={() => removePair(i)}
                    className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-red-500 flex-shrink-0 rounded-lg hover:bg-red-50">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button type="button" onClick={addPair}
                className="inline-flex items-center gap-1.5 text-sm text-pink-600 hover:text-pink-800 font-semibold">
                + Add Pair
              </button>
              <p className="text-xs text-gray-400">
                Students pick from the <span className="text-green-600 font-medium">B</span> pool to match each <span className="text-pink-600 font-medium">A</span> item
              </p>
            </div>
          </div>
        )}

        {/* ── NUMERICAL ────────────────────────────────────────────────── */}
        {form.type === 'numerical' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-cyan-50 border border-cyan-200 px-4 py-3 text-sm text-cyan-700">
              <p className="font-semibold mb-0.5">Auto-graded numerical answer</p>
              <p className="text-xs">The student enters a number. The answer is marked correct if it falls within the tolerance range.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Correct Value <span className="text-red-500">*</span>
                </label>
                <input
                  type="number" step="any" value={form.correctValue}
                  placeholder="e.g. 9.81"
                  onChange={e => setForm(f => ({ ...f, correctValue: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Unit (optional)</label>
                <input
                  type="text" value={form.unit}
                  placeholder="e.g. m/s², kg, N"
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tolerance</label>
                <input
                  type="number" min="0" step="any" value={form.tolerance}
                  placeholder="0"
                  onChange={e => setForm(f => ({ ...f, tolerance: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tolerance Type</label>
                <select
                  value={form.toleranceType}
                  onChange={e => setForm(f => ({ ...f, toleranceType: e.target.value as 'absolute' | 'percentage' }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                >
                  <option value="absolute">Absolute (±value)</option>
                  <option value="percentage">Percentage (±%)</option>
                </select>
              </div>
            </div>
            {form.correctValue && (
              <p className="text-xs text-cyan-600 bg-cyan-50 border border-cyan-100 px-3 py-2 rounded-lg">
                Accepted range:{' '}
                {form.toleranceType === 'absolute'
                  ? `${parseFloat(form.correctValue) - parseFloat(form.tolerance || '0')} to ${parseFloat(form.correctValue) + parseFloat(form.tolerance || '0')}`
                  : `${(parseFloat(form.correctValue) * (1 - parseFloat(form.tolerance || '0') / 100)).toFixed(4)} to ${(parseFloat(form.correctValue) * (1 + parseFloat(form.tolerance || '0') / 100)).toFixed(4)}`
                }
                {form.unit ? ` ${form.unit}` : ''}
              </p>
            )}
          </div>
        )}

        {/* ── SHORT ANSWER / FILL BLANK / ESSAY ──────────────────────── */}
        {(form.type === 'short_answer' || form.type === 'fill_blank' || form.type === 'essay') && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
            <p className="font-semibold mb-0.5">Manually graded</p>
            <p className="text-xs">Students will type their answer. You will review and assign marks after submission.</p>
          </div>
        )}

        {/* ── Optional fields ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
              Explanation <span className="font-normal text-gray-400">(shown after attempt)</span>
            </label>
            <textarea
              rows={2} value={form.explanation}
              placeholder="Explain the correct answer…"
              onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
              Media URL <span className="font-normal text-gray-400">(image or diagram)</span>
            </label>
            <input
              type="url" value={form.mediaUrl}
              placeholder="https://…"
              onChange={e => setForm(f => ({ ...f, mediaUrl: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20"
            />
          </div>
        </div>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onCancel} disabled={saving}
            className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={saving}
            className="px-6 py-2.5 rounded-lg bg-[#4c1d95] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 min-w-[140px]">
            {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Question'}
          </button>
        </div>
      </div>
    </div>
  );
}
