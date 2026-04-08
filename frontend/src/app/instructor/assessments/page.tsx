'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import RichTextEditor from '@/components/shared/RichTextEditor';

type PendingFile = { file: File; name: string; sizeKb: number };

type SubRow = {
  studentId:   string;
  studentName: string;
  studentNo:   string | null;
  attemptId:   string | null;
  status:      'not_submitted' | 'pending' | 'graded';
  score:       number | null;
};

type Assessment = {
  id: string; offeringId: string; offeringLabel: string; title: string; type: string;
  instructions: string; totalMarks: number; passMark: number; timeLimitMins: number | null;
  maxAttempts: number; status: string; availableFrom: string; availableUntil: string;
  pendingCount: number; gradedCount: number;
};
type OfferingOption = { id: string; label: string };
type MarksItem      = { title: string; marks: number };

const TYPES       = ['quiz', 'midterm', 'final_exam', 'practice'];
const TYPE_LABELS : Record<string, string> = { quiz: 'Quiz', midterm: 'Midterm', final_exam: 'Final Exam', practice: 'Practice' };
const STATUSES    = ['draft', 'published', 'closed', 'archived'];
const STATUS_COLORS: Record<string, string> = { draft: 'text-gray-500', published: 'text-green-600', closed: 'text-amber-600', archived: 'text-gray-400' };
const LIMITS: Record<string, number> = { quiz: 2, midterm: 1, final_exam: 1, practice: 999 };
const PAGE_SIZE   = 10;

const initialForm = {
  offeringId: '', title: '', type: 'quiz', instructions: '',
  totalMarks: '100', timeLimitMins: '', maxAttempts: '1',
  shuffleQuestions: false, shuffleOptions: false, showResult: true, showAnswers: false,
  availableFrom: '', availableUntil: '', status: 'draft',
};

async function notifyEnrolledStudents(supabase: any, offeringId: string, type: string, title: string, body: string, link?: string) {
  const { data: enrollments } = await supabase.from('enrollments').select('student_id').eq('offering_id', offeringId).eq('status', 'active');
  if (!enrollments?.length) return;
  await supabase.from('notifications').insert(enrollments.map((e: any) => ({ user_id: e.student_id, type, title, body, link: link ?? null })));
}

export default function InstructorAssessmentsPage() {
  const [assessments, setAssessments]   = useState<Assessment[]>([]);
  const [offerings, setOfferings]       = useState<OfferingOption[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filterOffering, setFilterOffering] = useState('');
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);
  const [modalOpen, setModalOpen]       = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [form, setForm]                 = useState<any>(initialForm);
  const [submitError, setSubmitError]   = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteId, setDeleteId]         = useState<string | null>(null);
  const [isDeleting, setIsDeleting]     = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Inline submissions panel state ──────────────────────────────────────
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [subData, setSubData]           = useState<Record<string, SubRow[]>>({});
  const [subLoading, setSubLoading]     = useState<Set<string>>(new Set());

  const fetchSubmissions = useCallback(async (assessmentId: string, offeringId: string) => {
    setSubLoading(prev => new Set(prev).add(assessmentId));
    const supabase = createClient();
    try {
      const { data: enrollData } = await supabase
        .from('enrollments').select('student_id')
        .eq('offering_id', offeringId).in('status', ['active', 'completed']);
      const studentIds = ((enrollData ?? []) as any[]).map(e => e.student_id);

      const nameMap: Record<string, { name: string; studentNo: string | null }> = {};
      if (studentIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users').select('id, first_name, last_name').in('id', studentIds);
        ((usersData ?? []) as any[]).forEach((u: any) => {
          nameMap[u.id] = { name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || '—', studentNo: null };
        });
        const { data: spData } = await supabase
          .from('student_profiles').select('user_id, student_no').in('user_id', studentIds);
        ((spData ?? []) as any[]).forEach((sp: any) => {
          if (nameMap[sp.user_id]) nameMap[sp.user_id].studentNo = sp.student_no ?? null;
        });
      }

      const { data: attData } = await supabase
        .from('assessment_attempts').select('id, student_id, status, score')
        .eq('assessment_id', assessmentId).not('status', 'eq', 'in_progress');

      const attemptByStudent: Record<string, any> = {};
      ((attData ?? []) as any[]).forEach((att: any) => {
        if (!attemptByStudent[att.student_id]) attemptByStudent[att.student_id] = att;
      });

      const rows: SubRow[] = studentIds.map(sid => {
        const att = attemptByStudent[sid];
        const si  = nameMap[sid] ?? { name: '—', studentNo: null };
        if (!att) return { studentId: sid, studentName: si.name, studentNo: si.studentNo, attemptId: null, status: 'not_submitted' as const, score: null };
        return { studentId: sid, studentName: si.name, studentNo: si.studentNo, attemptId: att.id, status: (att.status === 'graded' ? 'graded' : 'pending') as SubRow['status'], score: att.score ?? null };
      }).sort((a, b) => a.studentName.localeCompare(b.studentName));

      setSubData(prev => ({ ...prev, [assessmentId]: rows }));
    } catch (e) {
      console.error('fetchSubmissions error:', e);
    } finally {
      setSubLoading(prev => { const s = new Set(prev); s.delete(assessmentId); return s; });
    }
  }, []);

  const toggleExpand = useCallback((assessmentId: string, offeringId: string) => {
    setExpandedId(prev => {
      if (prev === assessmentId) return null;
      if (!subData[assessmentId]) fetchSubmissions(assessmentId, offeringId);
      return assessmentId;
    });
  }, [subData, fetchSubmissions]);

  // ── Slot / marks state ──────────────────────────────────────────────────
  const [slotCounts, setSlotCounts]   = useState<Record<string, number>>({});
  const [marksItems, setMarksItems]   = useState<MarksItem[]>([]);
  const [marksBase, setMarksBase]     = useState(0); // total_marks excluding current item

  const getCurrentUserId = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
    return data?.id ?? null;
  }, []);

  const fetchOfferings = useCallback(async () => {
    const userId = await getCurrentUserId(); if (!userId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('course_instructors')
      .select(`course_offerings!fk_course_instructors_offering(id,section_name,courses!fk_course_offerings_course(code,title),academic_terms!fk_course_offerings_term(academic_year_label,term_name,term_code))`)
      .eq('instructor_id', userId);
    if (data) setOfferings((data ?? []).map((r: any) => {
      const o = r.course_offerings ?? {}; const c = o.courses ?? {}; const t = o.academic_terms ?? {};
      return { id: o.id, label: `${(c.code ?? '').toUpperCase()} — ${c.title ?? '—'} · ${[t.academic_year_label, t.term_name ?? t.term_code].filter(Boolean).join(' · ')} · Sec ${o.section_name ?? 'A'}` };
    }).filter((o: OfferingOption) => !!o.id));
  }, [getCurrentUserId]);

  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    const userId = await getCurrentUserId(); if (!userId) { setLoading(false); return; }
    const supabase = createClient();
    const { data: ciData } = await supabase.from('course_instructors').select('offering_id').eq('instructor_id', userId);
    const offeringIds = (ciData ?? []).map((r: any) => r.offering_id);
    if (!offeringIds.length) { setAssessments([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from('assessments')
      .select(`id,offering_id,title,type,total_marks,pass_mark,time_limit_mins,max_attempts,status,available_from,available_until,course_offerings!fk_assessments_offering(section_name,courses!fk_course_offerings_course(code,title),academic_terms!fk_course_offerings_term(academic_year_label,term_name,term_code))`)
      .in('offering_id', offeringIds)
      .order('created_at', { ascending: false });
    if (error) { toast.error('Failed to load assessments.'); setLoading(false); return; }

    const assessmentIds = (data ?? []).map((r: any) => r.id);
    // Fetch submission counts (pending + graded) for all assessments at once
    const pendingByAssessment: Record<string, number> = {};
    const gradedByAssessment:  Record<string, number> = {};
    if (assessmentIds.length > 0) {
      const { data: subData } = await supabase
        .from('assessment_attempts')
        .select('assessment_id, status')
        .in('assessment_id', assessmentIds)
        .in('status', ['submitted', 'graded', 'timed_out']);
      (subData ?? []).forEach((s: any) => {
        if (s.status === 'graded') {
          gradedByAssessment[s.assessment_id] = (gradedByAssessment[s.assessment_id] ?? 0) + 1;
        } else {
          pendingByAssessment[s.assessment_id] = (pendingByAssessment[s.assessment_id] ?? 0) + 1;
        }
      });
    }

    setAssessments((data ?? []).map((r: any) => {
      const o = r.course_offerings ?? {}; const c = o.courses ?? {}; const t = o.academic_terms ?? {};
      return { id: r.id, offeringId: r.offering_id, offeringLabel: `${(c.code ?? '').toUpperCase()} — ${c.title ?? '—'} · ${[t.academic_year_label, t.term_name ?? t.term_code].filter(Boolean).join(' · ')} · Sec ${o.section_name ?? 'A'}`, title: r.title ?? '', type: r.type ?? 'quiz', instructions: r.instructions ?? '', totalMarks: r.total_marks ?? 100, passMark: r.pass_mark ?? 50, timeLimitMins: r.time_limit_mins ?? null, maxAttempts: r.max_attempts ?? 1, status: r.status ?? 'draft', availableFrom: r.available_from ?? '', availableUntil: r.available_until ?? '', pendingCount: pendingByAssessment[r.id] ?? 0, gradedCount: gradedByAssessment[r.id] ?? 0 };
    }));
    setLoading(false);
  }, [getCurrentUserId]);

  useEffect(() => { fetchOfferings(); fetchAssessments(); }, [fetchOfferings, fetchAssessments]);

  // ── Fetch slot counts + weight summary for chosen offering ──────────────
  const fetchOfferingInfo = useCallback(async (offeringId: string, excludeAssessmentId?: string) => {
    if (!offeringId) { setSlotCounts({}); setMarksItems([]); setMarksBase(0); return; }
    const supabase = createClient();
    const [{ data: assessRes }, { data: assignRes }] = await Promise.all([
      supabase.from('assessments').select('id, title, type, total_marks').eq('offering_id', offeringId).neq('status', 'archived'),
      supabase.from('assignments').select('id, title, max_score').eq('offering_id', offeringId).neq('status', 'archived'),
    ]);
    const allAssess = (assessRes ?? []) as any[];
    const filtered  = excludeAssessmentId ? allAssess.filter(a => a.id !== excludeAssessmentId) : allAssess;
    const counts: Record<string, number> = { quiz: 0, midterm: 0, final_exam: 0 };
    filtered.forEach((a: any) => { if (counts[a.type] !== undefined) counts[a.type]++; });
    setSlotCounts(counts);

    const items: MarksItem[] = [
      ...filtered.map((a: any) => ({ title: a.title || TYPE_LABELS[a.type] || a.type, marks: a.total_marks ?? 0 })),
      ...(assignRes ?? []).map((a: any) => ({ title: a.title || 'Assignment', marks: a.max_score ?? 0 })),
    ];
    setMarksItems(items);
    setMarksBase(items.reduce((s, i) => s + i.marks, 0));
  }, []);

  // Re-fetch offering info whenever the form's offeringId or editingId changes
  useEffect(() => {
    fetchOfferingInfo(form.offeringId, editingId ?? undefined);
  }, [form.offeringId, editingId, fetchOfferingInfo]);

  // Auto-suggest title when type changes (only for new assessments)
  useEffect(() => {
    if (editingId || !form.offeringId) return;
    const SUGGESTIONS: Record<string, string[]> = {
      quiz: ['Quiz 1', 'Quiz 2'],
      midterm: ['Midterm Exam'],
      final_exam: ['Final Exam'],
      practice: ['Practice Quiz'],
    };
    const count = slotCounts[form.type] ?? 0;
    const suggestion = SUGGESTIONS[form.type]?.[count];
    if (suggestion) setForm((f: any) => ({ ...f, title: suggestion }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.type, slotCounts, editingId]);

  // ── Modal helpers ───────────────────────────────────────────────────────
  const openAddModal = useCallback(() => {
    setEditingId(null);
    setForm({ ...initialForm, offeringId: filterOffering });
    setPendingFiles([]);
    setSubmitError('');
    setModalOpen(true);
  }, [filterOffering]);

  const openEditModal = useCallback((a: Assessment) => {
    setEditingId(a.id);
    setForm({
      offeringId: a.offeringId, title: a.title, type: a.type,
      instructions: a.instructions ?? '', totalMarks: String(a.totalMarks),
      timeLimitMins: a.timeLimitMins !== null ? String(a.timeLimitMins) : '',
      maxAttempts: String(a.maxAttempts), shuffleQuestions: false, shuffleOptions: false,
      showResult: true, showAnswers: false,
      availableFrom: a.availableFrom ? new Date(a.availableFrom).toISOString().slice(0, 16) : '',
      availableUntil: a.availableUntil ? new Date(a.availableUntil).toISOString().slice(0, 16) : '',
      status: a.status,
    });
    setPendingFiles([]);
    setSubmitError('');
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => { if (!isSubmitting) { setModalOpen(false); setPendingFiles([]); } }, [isSubmitting]);
  useEffect(() => {
    if (!modalOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [modalOpen, closeModal]);

  // ── File handling ────────────────────────────────────────────────────────
  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setPendingFiles(prev => [...prev, ...files.map(f => ({ file: f, name: f.name, sizeKb: Math.ceil(f.size / 1024) }))]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const removePendingFile = (idx: number) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));

  const uploadAssessmentFiles = async (assessmentId: string, userId: string) => {
    if (!pendingFiles.length) return;
    setUploadingFiles(true);
    const supabase = createClient();
    for (const pf of pendingFiles) {
      try {
        const path = `assessments/${userId}/${Date.now()}-${pf.name}`;
        const { error: upErr } = await supabase.storage.from('lms-uploads').upload(path, pf.file, { contentType: pf.file.type });
        if (upErr) { toast.error(`Failed to upload ${pf.name}: ${upErr.message}`); continue; }
        const { data: urlData } = supabase.storage.from('lms-uploads').getPublicUrl(path);
        const ext = pf.name.split('.').pop() ?? '';
        const { data: attData } = await supabase.from('attachments').insert({
          file_name: pf.name, file_url: urlData.publicUrl,
          mime_type: pf.file.type || `application/${ext}`,
          size_kb: pf.sizeKb, uploaded_by: userId,
        }).select('id').single();
        if (attData?.id) {
          await supabase.from('assessment_attachments').insert({ assessment_id: assessmentId, attachment_id: attData.id });
        }
      } catch { toast.error(`Skipped ${pf.name} due to an error.`); }
    }
    setUploadingFiles(false);
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (!form.offeringId)     { setSubmitError('Offering is required.'); return; }
    if (!form.title.trim())   { setSubmitError('Title is required.'); return; }
    const totalMarks = parseInt(form.totalMarks, 10);
    if (!totalMarks || totalMarks < 1) { setSubmitError('Total marks must be at least 1.'); return; }

    // ── Count enforcement (new items only) ─────────────────────────────
    if (!editingId) {
      const limit = LIMITS[form.type] ?? 999;
      if ((slotCounts[form.type] ?? 0) >= limit) {
        setSubmitError(
          form.type === 'quiz'
            ? 'Maximum 2 quizzes allowed per course.'
            : `Only 1 ${TYPE_LABELS[form.type]} allowed per course.`
        );
        return;
      }
    }

    const timeLimitMins = form.timeLimitMins ? parseInt(form.timeLimitMins, 10) : null;
    const maxAttempts   = parseInt(form.maxAttempts, 10) || 1;
    setIsSubmitting(true);
    const userId  = await getCurrentUserId();
    const supabase = createClient();
    const payload: any = {
      offering_id: form.offeringId, created_by: userId, title: form.title.trim(), type: form.type,
      instructions: form.instructions || null, total_marks: totalMarks,
      pass_mark: Math.round(totalMarks * 0.5), time_limit_mins: timeLimitMins,
      max_attempts: maxAttempts, shuffle_questions: form.shuffleQuestions,
      shuffle_options: form.shuffleOptions, show_result: form.showResult, show_answers: form.showAnswers,
      available_from: form.availableFrom ? new Date(form.availableFrom).toISOString() : null,
      available_until: form.availableUntil ? new Date(form.availableUntil).toISOString() : null,
      weight_pct: 0, status: form.status,
    };
    let error; let prevStatus = ''; let assessmentId: string | null = editingId;
    if (editingId) {
      const existing = assessments.find(a => a.id === editingId); prevStatus = existing?.status ?? '';
      ({ error } = await supabase.from('assessments').update(payload).eq('id', editingId));
    } else {
      const { data: ins, error: insErr } = await supabase.from('assessments').insert(payload).select('id').single();
      error = insErr; assessmentId = ins?.id ?? null;
    }
    if (error) { setSubmitError(error.message); setIsSubmitting(false); return; }
    if (assessmentId && pendingFiles.length) {
      await uploadAssessmentFiles(assessmentId, userId as string);
    }
    if (form.status === 'published' && prevStatus !== 'published' && assessmentId) {
      await notifyEnrolledStudents(supabase, form.offeringId, 'exam_published',
        `New ${TYPE_LABELS[form.type] ?? form.type}: ${form.title.trim()}`,
        `A new ${TYPE_LABELS[form.type] ?? form.type} has been published in your course.`,
        `/dashboard/class/${form.offeringId}/assessment/${assessmentId}`
      );
    }
    toast.success(editingId ? 'Assessment updated.' : 'Assessment created.');
    setModalOpen(false); setPendingFiles([]); setForm(initialForm); fetchAssessments(); setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return; setIsDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('assessments').delete().eq('id', deleteId);
    if (error) toast.error('Failed to delete.'); else { toast.success('Assessment deleted.'); fetchAssessments(); }
    setDeleteId(null); setIsDeleting(false);
  };

  const filtered     = assessments.filter(a => {
    const matchO = !filterOffering || a.offeringId === filterOffering;
    const matchS = !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.offeringLabel.toLowerCase().includes(search.toLowerCase());
    return matchO && matchS;
  });
  const totalCount   = filtered.length;
  const start        = (page - 1) * PAGE_SIZE;
  const end          = Math.min(start + PAGE_SIZE, totalCount);
  const paginated    = filtered.slice(start, end);

  // Live marks preview
  const proposedMarks = parseInt(form.totalMarks, 10) || 0;
  const proposedTotal = marksBase + proposedMarks;

  return (
    <div className="p-6 space-y-6">
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <div className="flex flex-wrap gap-3 flex-1">
          <select value={filterOffering} onChange={e => { setFilterOffering(e.target.value); setPage(1); }}
            className="flex-1 min-w-[200px] max-w-xs px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20">
            <option value="">All Offerings</option>
            {offerings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <input type="search" placeholder="Search assessments..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
        <button type="button" onClick={openAddModal}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New Assessment
        </button>
      </div>

      {/* ── Modal ───────────────────────────────────────────────────── */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={closeModal} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-xl max-h-[92vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200" role="dialog" aria-modal="true">
            <div className="flex items-center justify-between shrink-0 p-6 pb-0">
              <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Edit Assessment' : 'New Assessment'}</h2>
              <button type="button" onClick={closeModal} disabled={isSubmitting} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 p-6">
              <div className="space-y-4 overflow-y-auto pr-1" style={{ maxHeight: 'calc(90vh - 130px)' }}>
                {submitError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{submitError}</div>
                )}

                {/* Offering */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Offering *</label>
                  <select value={form.offeringId} onChange={e => setForm((f: any) => ({ ...f, offeringId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20">
                    <option value="">— Select offering —</option>
                    {offerings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>

                {/* Type selector with slot indicators */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                    <select value={form.type} onChange={e => setForm((f: any) => ({ ...f, type: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20">
                      <option value="quiz" disabled={!editingId && (slotCounts.quiz ?? 0) >= 2}>
                        Quiz{!editingId && form.offeringId ? ` (${slotCounts.quiz ?? 0}/2)` : ''}
                        {!editingId && (slotCounts.quiz ?? 0) >= 2 ? ' — Full' : ''}
                      </option>
                      <option value="midterm" disabled={!editingId && (slotCounts.midterm ?? 0) >= 1}>
                        Midterm{!editingId && (slotCounts.midterm ?? 0) >= 1 ? ' ✓ Added' : ''}
                      </option>
                      <option value="final_exam" disabled={!editingId && (slotCounts.final_exam ?? 0) >= 1}>
                        Final Exam{!editingId && (slotCounts.final_exam ?? 0) >= 1 ? ' ✓ Added' : ''}
                      </option>
                      <option value="practice">Practice</option>
                    </select>
                    {/* Slot availability badges */}
                    {form.offeringId && !editingId && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {[
                          { type: 'quiz',       used: slotCounts.quiz ?? 0,       max: 2 },
                          { type: 'midterm',    used: slotCounts.midterm ?? 0,    max: 1 },
                          { type: 'final_exam', used: slotCounts.final_exam ?? 0, max: 1 },
                        ].map(({ type, used, max }) => (
                          <span key={type} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${used >= max ? 'bg-red-100 text-red-600' : used > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                            {TYPE_LABELS[type]} {used}/{max}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select value={form.status} onChange={e => setForm((f: any) => ({ ...f, status: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20">
                      {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input type="text" value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>

                {/* Marks / Time / Attempts */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Total Marks</label>
                    <input type="number" min={1} value={form.totalMarks} onChange={e => setForm((f: any) => ({ ...f, totalMarks: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Time Limit (min)</label>
                    <input type="number" min={1} value={form.timeLimitMins} placeholder="No limit" onChange={e => setForm((f: any) => ({ ...f, timeLimitMins: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Attempts</label>
                    <input type="number" min={1} value={form.maxAttempts} onChange={e => setForm((f: any) => ({ ...f, maxAttempts: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                </div>

                {/* Live marks summary */}
                {form.offeringId && (marksItems.length > 0 || proposedMarks > 0) && (
                  <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs">
                    <p className="font-semibold text-gray-700 mb-2">Course Marks Summary <span className="text-gray-400 font-normal">(all items must total 100)</span></p>
                    <div className="space-y-1 mb-2">
                      {marksItems.map((item, i) => (
                        <div key={i} className="flex justify-between text-gray-600">
                          <span className="truncate pr-2">{item.title}</span>
                          <span className="flex-shrink-0 font-medium">{item.marks}</span>
                        </div>
                      ))}
                      {proposedMarks > 0 && (
                        <div className="flex justify-between text-[#4c1d95] font-semibold">
                          <span className="truncate pr-2">{form.title || '(this item)'}</span>
                          <span className="flex-shrink-0">{proposedMarks}</span>
                        </div>
                      )}
                    </div>
                    <div className="border-t border-gray-200 pt-2 space-y-1">
                      <div className="flex justify-between text-gray-500">
                        <span>Existing</span>
                        <span>{marksBase}</span>
                      </div>
                      <div className={`flex justify-between font-semibold ${proposedTotal > 100 ? 'text-red-600' : proposedTotal === 100 ? 'text-green-600' : 'text-amber-600'}`}>
                        <span>Total</span>
                        <span>{proposedTotal}</span>
                      </div>
                      {proposedTotal < 100  && <p className="text-amber-600">⚠ {100 - proposedTotal} marks unassigned — all items must sum to 100.</p>}
                      {proposedTotal > 100  && <p className="text-red-600">✗ Exceeds 100 by {proposedTotal - 100} marks</p>}
                      {proposedTotal === 100 && <p className="text-green-600">✓ Course marks total exactly 100</p>}
                    </div>
                  </div>
                )}

                {/* Availability */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Available From</label>
                    <input type="datetime-local" value={form.availableFrom} onChange={e => setForm((f: any) => ({ ...f, availableFrom: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Available Until</label>
                    <input type="datetime-local" value={form.availableUntil} onChange={e => setForm((f: any) => ({ ...f, availableUntil: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                </div>

                {/* Instructions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Instructions</label>
                  <RichTextEditor value={form.instructions} onChange={(html: string) => setForm((f: any) => ({ ...f, instructions: html }))} minHeight="160px" />
                </div>

                {/* Attachments */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Attachments <span className="text-gray-400 font-normal">(optional — reference files for students)</span>
                  </label>
                  <div className="border border-dashed border-gray-300 rounded-lg p-3 bg-gray-50">
                    {pendingFiles.length > 0 && (
                      <ul className="space-y-1.5 mb-3">
                        {pendingFiles.map((pf, idx) => (
                          <li key={idx} className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded px-3 py-1.5 text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                              <span className="truncate text-gray-700">{pf.name}</span>
                              <span className="text-xs text-gray-400 shrink-0">{pf.sizeKb} KB</span>
                            </div>
                            <button type="button" onClick={() => removePendingFile(idx)} className="text-gray-400 hover:text-red-500 shrink-0">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2}/><line x1="12" y1="8" x2="12" y2="16" strokeWidth={2}/><line x1="8" y1="12" x2="16" y2="12" strokeWidth={2}/></svg>
                      Add Attachment
                    </button>
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilePick} />
                  </div>
                </div>


                {form.status === 'published' && !editingId && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2">
                    Students will be notified when this assessment is published.
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 mt-4 shrink-0 border-t border-gray-100">
                <button type="button" onClick={closeModal} disabled={isSubmitting} className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 min-w-[130px]">
                  {uploadingFiles ? 'Uploading...' : isSubmitting ? 'Saving...' : editingId ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ── Delete confirm ───────────────────────────────────────────── */}
      {deleteId && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6" role="dialog">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete Assessment?</h2>
            <p className="text-sm text-gray-600 mb-6">This will delete the assessment and all its questions.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteId(null)} disabled={isDeleting} className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={isDeleting} className="px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 min-w-[100px]">
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Table ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Title</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Type</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Marks</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Submissions</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Status</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500">Loading...</td></tr>
                : paginated.length === 0
                  ? <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500">No assessments found.</td></tr>
                  : paginated.flatMap(a => {
                    const isOpen = expandedId === a.id;
                    return [
                      <tr key={a.id} className={`border-b border-gray-100 hover:bg-gray-50/50 ${isOpen ? 'bg-purple-50/30' : ''}`}>
                        <td className="px-5 py-3">
                          <div className="text-sm font-medium text-gray-900">{a.title}</div>
                          <div className="text-xs text-gray-500 line-clamp-1">{a.offeringLabel}</div>
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600">{TYPE_LABELS[a.type] ?? a.type}</td>
                        <td className="px-5 py-3 text-sm text-gray-600">{a.totalMarks}</td>
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
                        <td className="px-5 py-3"><span className={`text-sm font-medium capitalize ${STATUS_COLORS[a.status] ?? 'text-gray-500'}`}>{a.status}</span></td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleExpand(a.id, a.offeringId)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                isOpen ? 'bg-[#4c1d95] text-white' : 'bg-purple-50 text-[#4c1d95] hover:bg-purple-100'
                              }`}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              {isOpen ? 'Hide' : 'Students'}
                            </button>
                            <Link href={`/instructor/assessments/${a.id}/submissions`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200"
                              title="Full grading view">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                              Grade
                            </Link>
                            <button type="button" onClick={() => openEditModal(a)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900" title="Edit">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                            <button type="button" onClick={() => setDeleteId(a.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-red-600" title="Delete">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>,
                      isOpen ? (
                        <tr key={`${a.id}-panel`} className="border-b border-purple-100">
                          <td colSpan={6} className="px-5 py-4 bg-purple-50/20">
                            <InlineSubmissionsPanel
                              rows={subData[a.id]}
                              loading={subLoading.has(a.id)}
                              totalMarks={a.totalMarks}
                              assessmentId={a.id}
                            />
                          </td>
                        </tr>
                      ) : null,
                    ].filter(Boolean);
                  })
              }
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center px-5 py-3 border-t border-gray-200 bg-gray-50/50">
          <p className="text-sm text-gray-600">{totalCount === 0 ? 'No results' : `Showing ${start + 1}–${end} of ${totalCount}`}</p>
          <div className="flex gap-1">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button type="button" onClick={() => setPage(p => p + 1)} disabled={end >= totalCount} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Inline Submissions Panel ─────────────────────────────────────────────────

function InlineSubmissionsPanel({
  rows, loading, totalMarks, assessmentId,
}: {
  rows:         SubRow[] | undefined;
  loading:      boolean;
  totalMarks:   number;
  assessmentId: string;
}) {
  if (loading || !rows) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-gray-500 animate-pulse">
        <div className="w-4 h-4 rounded-full border-2 border-[#4c1d95] border-t-transparent animate-spin" />
        Loading students…
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 py-2">No enrolled students found.</p>;
  }

  const submitted    = rows.filter(r => r.status !== 'not_submitted');
  const notSubmitted = rows.filter(r => r.status === 'not_submitted');

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-500 font-medium">{rows.length} enrolled</span>
          <span className="text-amber-600 font-semibold">{rows.filter(r => r.status === 'pending').length} pending</span>
          <span className="text-green-600 font-semibold">{rows.filter(r => r.status === 'graded').length} graded</span>
          <span className="text-gray-400">{notSubmitted.length} not submitted</span>
        </div>
        <Link
          href={`/instructor/assessments/${assessmentId}/submissions`}
          className="text-xs text-[#4c1d95] hover:underline font-medium"
        >
          Open full grading view →
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Student</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Status</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Score</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {submitted.map(r => (
              <tr key={r.studentId} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#4c1d95] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {r.studentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm leading-tight">{r.studentName}</p>
                      {r.studentNo && <p className="text-xs text-gray-400">#{r.studentNo}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {r.status === 'graded' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">
                      Graded
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">
                      Pending Grade
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-sm text-gray-700 font-medium">
                  {r.score != null ? `${r.score} / ${totalMarks}` : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/instructor/assessments/${assessmentId}/submissions?search=${encodeURIComponent(r.studentName)}&tab=${r.status === 'graded' ? 'graded' : 'pending'}`}
                      title="View answers"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#4c1d95]/10 text-[#4c1d95] hover:bg-[#4c1d95]/20 text-xs font-medium transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      View
                    </Link>
                    <Link
                      href={`/instructor/assessments/${assessmentId}/submissions?search=${encodeURIComponent(r.studentName)}&tab=${r.status === 'graded' ? 'graded' : 'pending'}`}
                      className="text-xs text-[#4c1d95] hover:underline font-medium"
                    >
                      Grade →
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {notSubmitted.map(r => (
              <tr key={r.studentId} className="hover:bg-gray-50/50 opacity-60">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {r.studentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-700 text-sm leading-tight">{r.studentName}</p>
                      {r.studentNo && <p className="text-xs text-gray-400">#{r.studentNo}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500">
                    Not Submitted
                  </span>
                </td>
                <td className="px-4 py-2.5 text-sm text-gray-400">—</td>
                <td className="px-4 py-2.5" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
