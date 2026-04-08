'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

type Question = { id: string; assessmentId: string; assessmentTitle: string; type: string; body: string; marks: number; sortOrder: number; mediaUrl: string; explanation: string; };
type AssessmentOption = { id: string; label: string };
const TYPES = ['mcq', 'true_false', 'short_answer', 'fill_blank', 'essay', 'matching'];
const TYPE_LABELS: Record<string, string> = { mcq: 'MCQ', true_false: 'True/False', short_answer: 'Short Answer', fill_blank: 'Fill Blank', essay: 'Essay', matching: 'Matching' };
const PAGE_SIZE = 10;
const initialForm = { assessmentId: '', type: 'mcq', body: '', marks: '1', sortOrder: '0', mediaUrl: '', explanation: '' };

export default function InstructorQuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [assessments, setAssessments] = useState<AssessmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAssessment, setFilterAssessment] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const getCurrentUserId = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
    return data?.id ?? null;
  }, []);

  const fetchAssessments = useCallback(async () => {
    const userId = await getCurrentUserId(); if (!userId) return;
    const supabase = createClient();
    const { data: ciData } = await supabase.from('course_instructors').select('offering_id').eq('instructor_id', userId);
    const offeringIds = (ciData ?? []).map((r: any) => r.offering_id);
    if (!offeringIds.length) return;
    const { data } = await supabase.from('assessments').select('id, title').in('offering_id', offeringIds).order('title');
    if (data) setAssessments(data.map((a: any) => ({ id: a.id, label: a.title })));
  }, [getCurrentUserId]);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    const userId = await getCurrentUserId(); if (!userId) { setLoading(false); return; }
    const supabase = createClient();
    const { data: ciData } = await supabase.from('course_instructors').select('offering_id').eq('instructor_id', userId);
    const offeringIds = (ciData ?? []).map((r: any) => r.offering_id);
    if (!offeringIds.length) { setQuestions([]); setLoading(false); return; }
    const { data: aIds } = await supabase.from('assessments').select('id').in('offering_id', offeringIds);
    const assessmentIds = (aIds ?? []).map((r: any) => r.id);
    if (!assessmentIds.length) { setQuestions([]); setLoading(false); return; }

    const { data, error } = await supabase.from('questions').select('id, assessment_id, type, body, marks, sort_order, media_url, explanation, assessments!fk_questions_assessment(title)').in('assessment_id', assessmentIds).order('sort_order');
    if (error) toast.error('Failed to load questions.');
    else setQuestions((data ?? []).map((r: any) => ({ id: r.id, assessmentId: r.assessment_id, assessmentTitle: r.assessments?.title ?? '—', type: r.type ?? 'mcq', body: r.body ?? '', marks: r.marks ?? 1, sortOrder: r.sort_order ?? 0, mediaUrl: r.media_url ?? '', explanation: r.explanation ?? '' })));
    setLoading(false);
  }, [getCurrentUserId]);

  useEffect(() => { fetchAssessments(); fetchQuestions(); }, [fetchAssessments, fetchQuestions]);

  const openAddModal = useCallback(() => { setEditingId(null); setForm({ ...initialForm, assessmentId: filterAssessment }); setSubmitError(''); setModalOpen(true); }, [filterAssessment]);
  const openEditModal = useCallback((q: Question) => { setEditingId(q.id); setForm({ assessmentId: q.assessmentId, type: q.type, body: q.body, marks: String(q.marks), sortOrder: String(q.sortOrder), mediaUrl: q.mediaUrl, explanation: q.explanation }); setSubmitError(''); setModalOpen(true); }, []);
  const closeModal = useCallback(() => { if (!isSubmitting) setModalOpen(false); }, [isSubmitting]);
  useEffect(() => { if (!modalOpen) return; const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [modalOpen, closeModal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitError('');
    if (!form.assessmentId) { setSubmitError('Assessment is required.'); return; }
    if (!form.body.trim()) { setSubmitError('Question body is required.'); return; }
    const marks = parseInt(form.marks, 10); if (!marks || marks < 1) { setSubmitError('Marks must be at least 1.'); return; }
    setIsSubmitting(true);
    const supabase = createClient();
    const payload = { assessment_id: form.assessmentId, type: form.type, body: form.body.trim(), marks, sort_order: parseInt(form.sortOrder, 10) || 0, media_url: form.mediaUrl.trim() || null, explanation: form.explanation.trim() || null };
    let error;
    if (editingId) ({ error } = await supabase.from('questions').update(payload).eq('id', editingId));
    else ({ error } = await supabase.from('questions').insert(payload));
    if (error) { setSubmitError(error.message); setIsSubmitting(false); return; }
    toast.success(editingId ? 'Question updated.' : 'Question added.'); setModalOpen(false); setForm(initialForm); fetchQuestions(); setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return; setIsDeleting(true);
    const { error } = await createClient().from('questions').delete().eq('id', deleteId);
    if (error) toast.error('Failed to delete question.'); else { toast.success('Question deleted.'); fetchQuestions(); }
    setDeleteId(null); setIsDeleting(false);
  };

  const filtered = questions.filter(q => {
    const matchA = !filterAssessment || q.assessmentId === filterAssessment;
    const matchS = !search || q.body.toLowerCase().includes(search.toLowerCase()) || q.assessmentTitle.toLowerCase().includes(search.toLowerCase());
    return matchA && matchS;
  });
  const totalCount = filtered.length; const start = (page - 1) * PAGE_SIZE; const end = Math.min(start + PAGE_SIZE, totalCount); const paginated = filtered.slice(start, end);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <div className="flex flex-wrap gap-3 flex-1">
          <select value={filterAssessment} onChange={e => { setFilterAssessment(e.target.value); setPage(1); }} className="flex-1 min-w-[200px] max-w-xs px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20">
            <option value="">All Assessments</option>{assessments.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <input type="search" placeholder="Search questions..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
        <button type="button" onClick={openAddModal} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Add Question
        </button>
      </div>

      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={closeModal} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200" role="dialog" aria-modal="true">
            <div className="flex items-center justify-between shrink-0 p-6 pb-0">
              <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Edit Question' : 'Add Question'}</h2>
              <button type="button" onClick={closeModal} disabled={isSubmitting} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 p-6">
              <div className="space-y-4 overflow-y-auto pr-1 max-h-[60vh]">
                {submitError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{submitError}</div>}
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Assessment *</label>
                  <select value={form.assessmentId} disabled={!!editingId} onChange={e => setForm(f => ({ ...f, assessmentId: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-gray-50"><option value="">— Select —</option>{assessments.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                    <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20">{TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Marks</label>
                    <input type="number" min={1} value={form.marks} onChange={e => setForm(f => ({ ...f, marks: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" /></div>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Question Body *</label>
                  <textarea rows={4} value={form.body} placeholder="Enter the question text..." onChange={e => setForm(f => ({ ...f, body: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Media URL</label>
                  <input type="url" value={form.mediaUrl} placeholder="https://..." onChange={e => setForm(f => ({ ...f, mediaUrl: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Explanation</label>
                  <textarea rows={2} value={form.explanation} placeholder="Shown to students after attempt..." onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                  <input type="number" min={0} value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" /></div>
              </div>
              <div className="flex justify-end gap-3 pt-4 mt-4 shrink-0 border-t border-gray-100">
                <button type="button" onClick={closeModal} disabled={isSubmitting} className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 min-w-[120px]">{isSubmitting ? 'Saving...' : editingId ? 'Save Changes' : 'Add'}</button>
              </div>
            </form>
          </div>
        </>
      )}

      {deleteId && (<><div className="fixed inset-0 bg-black/50 z-40" aria-hidden /><div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6" role="dialog"><h2 className="text-lg font-bold text-gray-900 mb-2">Delete Question?</h2><p className="text-sm text-gray-600 mb-6">This will delete the question and all its answer options.</p><div className="flex justify-end gap-3"><button type="button" onClick={() => setDeleteId(null)} disabled={isDeleting} className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button><button type="button" onClick={handleDelete} disabled={isDeleting} className="px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 min-w-[100px]">{isDeleting ? 'Deleting...' : 'Delete'}</button></div></div></>)}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px]">
            <thead><tr className="border-b border-gray-200 bg-gray-50/80">
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Question</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Assessment</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Type</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Marks</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Actions</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-500">Loading...</td></tr>
                : paginated.length === 0 ? <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-500">No questions found.</td></tr>
                : paginated.map(q => (
                  <tr key={q.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-sm text-gray-900 max-w-xs"><span className="line-clamp-2">{q.body}</span></td>
                    <td className="px-5 py-3 text-sm text-gray-600">{q.assessmentTitle}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{TYPE_LABELS[q.type] ?? q.type}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{q.marks}</td>
                    <td className="px-5 py-3"><div className="flex items-center gap-2">
                      <button type="button" onClick={() => openEditModal(q)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                      <button type="button" onClick={() => setDeleteId(q.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-red-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                    </div></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center px-5 py-3 border-t border-gray-200 bg-gray-50/50">
          <p className="text-sm text-gray-600">{totalCount === 0 ? 'No results' : `Showing ${start + 1}–${end} of ${totalCount}`}</p>
          <div className="flex gap-1">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
            <button type="button" onClick={() => setPage(p => p + 1)} disabled={end >= totalCount} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
          </div>
        </div>
      </div>
    </div>
  );
}
