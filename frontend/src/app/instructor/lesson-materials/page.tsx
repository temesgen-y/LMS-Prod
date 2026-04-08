'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

type LessonMaterial = {
  id: string;
  lessonId: string;
  lessonTitle: string;
  attachmentId: string;
  fileName: string;
  mimeType: string;
  sortOrder: number;
};

type LessonOption = { id: string; label: string };
type AttachmentOption = { id: string; fileName: string; mimeType: string };

const PAGE_SIZE = 10;
const initialForm = { lessonId: '', attachmentId: '', sortOrder: '0' };

export default function InstructorLessonMaterialsPage() {
  const [materials, setMaterials] = useState<LessonMaterial[]>([]);
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [attachments, setAttachments] = useState<AttachmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLesson, setFilterLesson] = useState('');
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

  const fetchOptions = useCallback(async () => {
    const userId = await getCurrentUserId();
    if (!userId) return;
    const supabase = createClient();
    const { data: ciData } = await supabase.from('course_instructors').select('offering_id').eq('instructor_id', userId);
    const offeringIds = (ciData ?? []).map((r: any) => r.offering_id);
    if (offeringIds.length === 0) return;

    const [{ data: lessonData }, { data: attData }] = await Promise.all([
      supabase.from('lessons').select('id, title, course_offerings!fk_lessons_offering(courses!fk_course_offerings_course(code))').in('offering_id', offeringIds).order('title'),
      supabase.from('attachments').select('id, file_name, mime_type').eq('uploaded_by', userId).order('file_name'),
    ]);

    if (lessonData) setLessons(lessonData.map((l: any) => ({ id: l.id, label: `${(l.course_offerings?.courses?.code ?? '').toUpperCase()} — ${l.title}` })));
    if (attData) setAttachments(attData.map((a: any) => ({ id: a.id, fileName: a.file_name, mimeType: a.mime_type })));
  }, [getCurrentUserId]);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    const userId = await getCurrentUserId();
    if (!userId) { setLoading(false); return; }
    const supabase = createClient();
    const { data: ciData } = await supabase.from('course_instructors').select('offering_id').eq('instructor_id', userId);
    const offeringIds = (ciData ?? []).map((r: any) => r.offering_id);
    if (offeringIds.length === 0) { setMaterials([]); setLoading(false); return; }

    const { data: lessonIds } = await supabase.from('lessons').select('id').in('offering_id', offeringIds);
    const lids = (lessonIds ?? []).map((r: any) => r.id);
    if (lids.length === 0) { setMaterials([]); setLoading(false); return; }

    const { data, error } = await supabase
      .from('lesson_materials')
      .select(`id, lesson_id, attachment_id, sort_order, lessons!fk_lesson_materials_lesson(title), attachments!fk_lesson_materials_attachment(file_name, mime_type)`)
      .in('lesson_id', lids)
      .order('sort_order');

    if (error) { toast.error('Failed to load lesson materials.'); }
    else {
      setMaterials((data ?? []).map((r: any) => ({
        id: r.id, lessonId: r.lesson_id,
        lessonTitle: r.lessons?.title ?? '—',
        attachmentId: r.attachment_id,
        fileName: r.attachments?.file_name ?? '—',
        mimeType: r.attachments?.mime_type ?? '—',
        sortOrder: r.sort_order ?? 0,
      })));
    }
    setLoading(false);
  }, [getCurrentUserId]);

  useEffect(() => { fetchOptions(); fetchMaterials(); }, [fetchOptions, fetchMaterials]);

  const openAddModal = useCallback(() => { setEditingId(null); setForm({ ...initialForm, lessonId: filterLesson }); setSubmitError(''); setModalOpen(true); }, [filterLesson]);
  const openEditModal = useCallback((m: LessonMaterial) => { setEditingId(m.id); setForm({ lessonId: m.lessonId, attachmentId: m.attachmentId, sortOrder: String(m.sortOrder) }); setSubmitError(''); setModalOpen(true); }, []);
  const closeModal = useCallback(() => { if (!isSubmitting) setModalOpen(false); }, [isSubmitting]);

  useEffect(() => {
    if (!modalOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [modalOpen, closeModal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitError('');
    if (!form.lessonId) { setSubmitError('Lesson is required.'); return; }
    if (!form.attachmentId) { setSubmitError('Attachment is required.'); return; }
    const sortOrder = parseInt(form.sortOrder, 10) || 0;
    setIsSubmitting(true);
    const supabase = createClient();
    let error;
    if (editingId) {
      ({ error } = await supabase.from('lesson_materials').update({ sort_order: sortOrder }).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('lesson_materials').insert({ lesson_id: form.lessonId, attachment_id: form.attachmentId, sort_order: sortOrder }));
    }
    if (error) {
      setSubmitError(error.message.includes('uq_lesson_materials') ? 'This attachment is already linked to that lesson.' : error.message);
      setIsSubmitting(false); return;
    }
    toast.success(editingId ? 'Updated.' : 'Linked.'); setModalOpen(false); setForm(initialForm); fetchMaterials(); setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return; setIsDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('lesson_materials').delete().eq('id', deleteId);
    if (error) toast.error('Failed to unlink.'); else { toast.success('Unlinked.'); fetchMaterials(); }
    setDeleteId(null); setIsDeleting(false);
  };

  const filtered = materials.filter(m => {
    const matchL = !filterLesson || m.lessonId === filterLesson;
    const matchS = !search || m.lessonTitle.toLowerCase().includes(search.toLowerCase()) || m.fileName.toLowerCase().includes(search.toLowerCase());
    return matchL && matchS;
  });
  const totalCount = filtered.length; const start = (page - 1) * PAGE_SIZE; const end = Math.min(start + PAGE_SIZE, totalCount); const paginated = filtered.slice(start, end);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <div className="flex flex-wrap gap-3 flex-1">
          <select value={filterLesson} onChange={e => { setFilterLesson(e.target.value); setPage(1); }} className="flex-1 min-w-[200px] max-w-xs px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
            <option value="">All Lessons</option>
            {lessons.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <input type="search" placeholder="Search..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
        <button type="button" onClick={openAddModal} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Link Attachment
        </button>
      </div>

      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={closeModal} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md flex flex-col bg-white rounded-xl shadow-xl border border-gray-200" role="dialog" aria-modal="true">
            <div className="flex items-center justify-between p-6 pb-0">
              <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Edit Link' : 'Link Attachment to Lesson'}</h2>
              <button type="button" onClick={closeModal} disabled={isSubmitting} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {submitError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{submitError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lesson *</label>
                <select value={form.lessonId} disabled={!!editingId} onChange={e => setForm(f => ({ ...f, lessonId: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-50">
                  <option value="">— Select Lesson —</option>
                  {lessons.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Attachment *</label>
                <select value={form.attachmentId} disabled={!!editingId} onChange={e => setForm(f => ({ ...f, attachmentId: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-50">
                  <option value="">— Select Attachment —</option>
                  {attachments.map(a => <option key={a.id} value={a.id}>{a.fileName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                <input type="number" min={0} value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button type="button" onClick={closeModal} disabled={isSubmitting} className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 min-w-[100px]">{isSubmitting ? 'Saving...' : editingId ? 'Save' : 'Link'}</button>
              </div>
            </form>
          </div>
        </>
      )}

      {deleteId && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6" role="dialog" aria-modal="true">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Unlink Attachment?</h2>
            <p className="text-sm text-gray-600 mb-6">This removes the attachment from the lesson. The attachment file itself is not deleted.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteId(null)} disabled={isDeleting} className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={isDeleting} className="px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 min-w-[100px]">{isDeleting ? 'Removing...' : 'Unlink'}</button>
            </div>
          </div>
        </>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[580px]">
            <thead><tr className="border-b border-gray-200 bg-gray-50/80">
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Lesson</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Attachment</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Order</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Actions</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-500">Loading...</td></tr>
                : paginated.length === 0 ? <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-500">{search || filterLesson ? 'No matches.' : 'No lesson materials yet.'}</td></tr>
                : paginated.map(m => (
                  <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{m.lessonTitle}</td>
                    <td className="px-5 py-3 text-sm text-gray-700">{m.fileName}<div className="text-xs text-gray-400">{m.mimeType}</div></td>
                    <td className="px-5 py-3 text-sm text-gray-600">{m.sortOrder}</td>
                    <td className="px-5 py-3"><div className="flex items-center gap-2">
                      <button type="button" onClick={() => openEditModal(m)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900" title="Edit"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                      <button type="button" onClick={() => setDeleteId(m.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-red-600" title="Unlink"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                    </div></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center px-5 py-3 border-t border-gray-200 bg-gray-50/50">
          <p className="text-sm text-gray-600">{totalCount === 0 ? 'No results' : `Showing ${start + 1}–${end} of ${totalCount}`}</p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
            <button type="button" onClick={() => setPage(p => p + 1)} disabled={end >= totalCount} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
          </div>
        </div>
      </div>
    </div>
  );
}
