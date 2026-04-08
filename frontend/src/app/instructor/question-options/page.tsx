'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

type QuestionOption = { id: string; questionId: string; questionBody: string; body: string; isCorrect: boolean; sortOrder: number; };
type QuestionRef = { id: string; label: string };
const PAGE_SIZE = 10;
const initialForm = { questionId: '', body: '', isCorrect: false, sortOrder: '0' };

export default function InstructorQuestionOptionsPage() {
  const [options, setOptions] = useState<QuestionOption[]>([]);
  const [questions, setQuestions] = useState<QuestionRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterQuestion, setFilterQuestion] = useState('');
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

  const fetchQuestions = useCallback(async () => {
    const userId = await getCurrentUserId(); if (!userId) return;
    const supabase = createClient();
    const { data: ciData } = await supabase.from('course_instructors').select('offering_id').eq('instructor_id', userId);
    const offeringIds = (ciData ?? []).map((r: any) => r.offering_id);
    if (!offeringIds.length) return;
    const { data: aIds } = await supabase.from('assessments').select('id').in('offering_id', offeringIds);
    const assessmentIds = (aIds ?? []).map((r: any) => r.id);
    if (!assessmentIds.length) return;
    const { data } = await supabase.from('questions').select('id, body, type').in('assessment_id', assessmentIds).in('type', ['mcq', 'true_false']).order('body');
    if (data) setQuestions(data.map((q: any) => ({ id: q.id, label: q.body.length > 80 ? q.body.slice(0, 80) + '…' : q.body })));
  }, [getCurrentUserId]);

  const fetchOptions = useCallback(async () => {
    setLoading(true);
    const userId = await getCurrentUserId(); if (!userId) { setLoading(false); return; }
    const supabase = createClient();
    const { data: ciData } = await supabase.from('course_instructors').select('offering_id').eq('instructor_id', userId);
    const offeringIds = (ciData ?? []).map((r: any) => r.offering_id);
    if (!offeringIds.length) { setOptions([]); setLoading(false); return; }
    const { data: aIds } = await supabase.from('assessments').select('id').in('offering_id', offeringIds);
    const assessmentIds = (aIds ?? []).map((r: any) => r.id);
    if (!assessmentIds.length) { setOptions([]); setLoading(false); return; }
    const { data: qIds } = await supabase.from('questions').select('id').in('assessment_id', assessmentIds);
    const questionIds = (qIds ?? []).map((r: any) => r.id);
    if (!questionIds.length) { setOptions([]); setLoading(false); return; }

    const { data, error } = await supabase.from('question_options').select('id, question_id, body, is_correct, sort_order, questions!fk_question_options_question(body)').in('question_id', questionIds).order('sort_order');
    if (error) toast.error('Failed to load options.');
    else setOptions((data ?? []).map((r: any) => ({ id: r.id, questionId: r.question_id, questionBody: r.questions?.body ?? '—', body: r.body ?? '', isCorrect: r.is_correct ?? false, sortOrder: r.sort_order ?? 0 })));
    setLoading(false);
  }, [getCurrentUserId]);

  useEffect(() => { fetchQuestions(); fetchOptions(); }, [fetchQuestions, fetchOptions]);

  const openAddModal = useCallback(() => { setEditingId(null); setForm({ ...initialForm, questionId: filterQuestion }); setSubmitError(''); setModalOpen(true); }, [filterQuestion]);
  const openEditModal = useCallback((o: QuestionOption) => { setEditingId(o.id); setForm({ questionId: o.questionId, body: o.body, isCorrect: o.isCorrect, sortOrder: String(o.sortOrder) }); setSubmitError(''); setModalOpen(true); }, []);
  const closeModal = useCallback(() => { if (!isSubmitting) setModalOpen(false); }, [isSubmitting]);
  useEffect(() => { if (!modalOpen) return; const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [modalOpen, closeModal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitError('');
    if (!form.questionId) { setSubmitError('Question is required.'); return; }
    if (!form.body.trim()) { setSubmitError('Option text is required.'); return; }
    setIsSubmitting(true);
    const supabase = createClient();
    const payload = { question_id: form.questionId, body: form.body.trim(), is_correct: form.isCorrect, sort_order: parseInt(form.sortOrder, 10) || 0 };
    let error;
    if (editingId) ({ error } = await supabase.from('question_options').update(payload).eq('id', editingId));
    else ({ error } = await supabase.from('question_options').insert(payload));
    if (error) { setSubmitError(error.message); setIsSubmitting(false); return; }
    toast.success(editingId ? 'Option updated.' : 'Option added.'); setModalOpen(false); setForm(initialForm); fetchOptions(); setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return; setIsDeleting(true);
    const { error } = await createClient().from('question_options').delete().eq('id', deleteId);
    if (error) toast.error('Failed to delete option.'); else { toast.success('Option deleted.'); fetchOptions(); }
    setDeleteId(null); setIsDeleting(false);
  };

  const filtered = options.filter(o => {
    const matchQ = !filterQuestion || o.questionId === filterQuestion;
    const matchS = !search || o.body.toLowerCase().includes(search.toLowerCase()) || o.questionBody.toLowerCase().includes(search.toLowerCase());
    return matchQ && matchS;
  });
  const totalCount = filtered.length; const start = (page - 1) * PAGE_SIZE; const end = Math.min(start + PAGE_SIZE, totalCount); const paginated = filtered.slice(start, end);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <div className="flex flex-wrap gap-3 flex-1">
          <select value={filterQuestion} onChange={e => { setFilterQuestion(e.target.value); setPage(1); }} className="flex-1 min-w-[200px] max-w-sm px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20">
            <option value="">All Questions (MCQ/T-F)</option>{questions.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}
          </select>
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <input type="search" placeholder="Search options..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
        <button type="button" onClick={openAddModal} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Add Option
        </button>
      </div>

      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={closeModal} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md flex flex-col bg-white rounded-xl shadow-xl border border-gray-200" role="dialog" aria-modal="true">
            <div className="flex items-center justify-between p-6 pb-0">
              <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Edit Option' : 'Add Answer Option'}</h2>
              <button type="button" onClick={closeModal} disabled={isSubmitting} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {submitError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{submitError}</div>}
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Question *</label>
                <select value={form.questionId} disabled={!!editingId} onChange={e => setForm(f => ({ ...f, questionId: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-gray-50"><option value="">— Select —</option>{questions.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Option Text *</label>
                <input type="text" value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                <input type="number" min={0} value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" /></div>
              <div className="flex items-center gap-2"><input type="checkbox" id="is-correct" checked={form.isCorrect} onChange={e => setForm(f => ({ ...f, isCorrect: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary" /><label htmlFor="is-correct" className="text-sm font-medium text-gray-700">Correct answer</label></div>
              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button type="button" onClick={closeModal} disabled={isSubmitting} className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 min-w-[100px]">{isSubmitting ? 'Saving...' : editingId ? 'Save' : 'Add'}</button>
              </div>
            </form>
          </div>
        </>
      )}

      {deleteId && (<><div className="fixed inset-0 bg-black/50 z-40" aria-hidden /><div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6" role="dialog"><h2 className="text-lg font-bold text-gray-900 mb-2">Delete Option?</h2><p className="text-sm text-gray-600 mb-6">This will permanently delete this answer option.</p><div className="flex justify-end gap-3"><button type="button" onClick={() => setDeleteId(null)} disabled={isDeleting} className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button><button type="button" onClick={handleDelete} disabled={isDeleting} className="px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 min-w-[100px]">{isDeleting ? 'Deleting...' : 'Delete'}</button></div></div></>)}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[580px]">
            <thead><tr className="border-b border-gray-200 bg-gray-50/80">
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Option</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Question</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Correct</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Order</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Actions</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-500">Loading...</td></tr>
                : paginated.length === 0 ? <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-500">No options found.</td></tr>
                : paginated.map(o => (
                  <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{o.body}</td>
                    <td className="px-5 py-3 text-sm text-gray-500 max-w-[200px]"><span className="line-clamp-2">{o.questionBody}</span></td>
                    <td className="px-5 py-3"><span className={`text-sm font-medium ${o.isCorrect ? 'text-green-600' : 'text-gray-400'}`}>{o.isCorrect ? '✓ Yes' : 'No'}</span></td>
                    <td className="px-5 py-3 text-sm text-gray-600">{o.sortOrder}</td>
                    <td className="px-5 py-3"><div className="flex items-center gap-2">
                      <button type="button" onClick={() => openEditModal(o)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                      <button type="button" onClick={() => setDeleteId(o.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-red-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
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
