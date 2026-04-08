'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import RichTextEditor from '@/components/shared/RichTextEditor';

type Lesson = {
  id: string;
  offeringId: string;
  offeringLabel: string;
  title: string;
  type: string;
  contentUrl: string;
  contentBody: string;
  durationMins: number | null;
  isVisible: boolean;
};

type OfferingOption = { id: string; label: string };
type ModuleOption = { id: string; label: string };

const PAGE_SIZE = 10;
const LESSON_TYPES = ['video', 'document', 'link', 'scorm'] as const;
const TYPE_LABELS: Record<string, string> = {
  video: 'Video',
  document: 'Document',
  link: 'Link',
  scorm: 'SCORM',
};
const TYPE_COLORS: Record<string, string> = {
  video: 'bg-blue-100 text-blue-700',
  document: 'bg-amber-100 text-amber-700',
  link: 'bg-green-100 text-green-700',
  scorm: 'bg-purple-100 text-purple-700',
};
const URL_LABELS: Record<string, string> = {
  video: 'Video URL',
  document: 'PDF URL',
  link: 'Link URL',
  scorm: 'SCORM URL',
};

const initialForm = {
  offeringId: '',
  title: '',
  type: 'video' as string,
  contentUrl: '',
  contentBody: '',
  durationMins: '',
  isVisible: true,
  moduleId: '',
  isMandatory: true,
};

export default function InstructorLessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [offerings, setOfferings] = useState<OfferingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterOffering, setFilterOffering] = useState('');
  const [filterType, setFilterType] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [linkedLessonIds, setLinkedLessonIds] = useState<Set<string>>(new Set());

  // ─── Get current instructor's user id ────────────────────────────
  const getCurrentUserId = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();
    return data?.id ?? null;
  }, []);

  // ─── Fetch offerings this instructor is assigned to ───────────────
  const fetchOfferings = useCallback(async () => {
    const userId = await getCurrentUserId();
    if (!userId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('course_instructors')
      .select(`
        course_offerings!fk_course_instructors_offering (
          id,
          section_name,
          courses!fk_course_offerings_course ( code, title ),
          academic_terms!fk_course_offerings_term ( academic_year_label, term_name, term_code )
        )
      `)
      .eq('instructor_id', userId);

    if (data) {
      const opts: OfferingOption[] = (data ?? []).map((r: any) => {
        const o = r.course_offerings ?? {};
        const c = o.courses ?? {};
        const t = o.academic_terms ?? {};
        const termStr = [t.academic_year_label, t.term_name ?? t.term_code].filter(Boolean).join(' · ');
        return {
          id: o.id,
          label: `${(c.code ?? '').toUpperCase()} — ${c.title ?? '—'} · ${termStr} · Sec ${o.section_name ?? 'A'}`,
        };
      }).filter((o: OfferingOption) => !!o.id);
      setOfferings(opts);
    }
  }, [getCurrentUserId]);

  // ─── Fetch lessons ────────────────────────────────────────────────
  const fetchLessons = useCallback(async () => {
    setLoading(true);
    const userId = await getCurrentUserId();
    if (!userId) { setLoading(false); return; }

    const supabase = createClient();
    const { data: ciData } = await supabase
      .from('course_instructors')
      .select('offering_id')
      .eq('instructor_id', userId);

    const offeringIds = (ciData ?? []).map((r: any) => r.offering_id);
    if (offeringIds.length === 0) { setLessons([]); setLoading(false); return; }

    const { data, error } = await supabase
      .from('lessons')
      .select(`
        id,
        offering_id,
        title,
        type,
        content_url,
        content_body,
        duration_mins,
        is_visible,
        course_offerings!fk_lessons_offering (
          section_name,
          courses!fk_course_offerings_course ( code, title ),
          academic_terms!fk_course_offerings_term ( academic_year_label, term_name, term_code )
        )
      `)
      .in('offering_id', offeringIds)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load lessons.');
    } else {
      const allLessonIds = (data ?? []).map((r: any) => r.id as string);
      if (allLessonIds.length > 0) {
        const { data: linkedData } = await supabase
          .from('course_module_items')
          .select('lesson_id')
          .in('lesson_id', allLessonIds)
          .not('lesson_id', 'is', null);
        setLinkedLessonIds(new Set((linkedData ?? []).map((r: any) => r.lesson_id as string)));
      } else {
        setLinkedLessonIds(new Set());
      }

      setLessons(
        (data ?? []).map((r: any) => {
          const o = r.course_offerings ?? {};
          const c = o.courses ?? {};
          const t = o.academic_terms ?? {};
          const termStr = [t.academic_year_label, t.term_name ?? t.term_code].filter(Boolean).join(' · ');
          return {
            id: r.id,
            offeringId: r.offering_id,
            offeringLabel: `${(c.code ?? '').toUpperCase()} — ${c.title ?? '—'} · ${termStr} · Sec ${o.section_name ?? 'A'}`,
            title: r.title ?? '',
            type: r.type ?? 'video',
            contentUrl: r.content_url ?? '',
            contentBody: r.content_body ?? '',
            durationMins: r.duration_mins ?? null,
            isVisible: r.is_visible ?? true,
          };
        })
      );
    }
    setLoading(false);
  }, [getCurrentUserId]);

  useEffect(() => {
    fetchOfferings();
    fetchLessons();
  }, [fetchOfferings, fetchLessons]);

  // Fetch modules when form offering changes and auto-select first module
  useEffect(() => {
    if (!form.offeringId) { setModules([]); return; }
    const supabase = createClient();
    supabase
      .from('course_modules')
      .select('id, title, sort_order')
      .eq('offering_id', form.offeringId)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        const opts = (data ?? []).map((m: any) => ({ id: m.id, label: m.title }));
        setModules(opts);
        // Auto-select first module if none selected
        if (opts.length > 0) {
          setForm((f) => ({ ...f, moduleId: f.moduleId || opts[0].id }));
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.offeringId]);

  // ─── Modal helpers ────────────────────────────────────────────────
  const openAddModal = useCallback(() => {
    setEditingId(null);
    setForm({ ...initialForm, offeringId: filterOffering || offerings[0]?.id || '' });
    setSubmitError('');
    setModalOpen(true);
  }, [filterOffering, offerings]);

  const openEditModal = useCallback((l: Lesson) => {
    setEditingId(l.id);
    setForm({
      offeringId: l.offeringId,
      title: l.title,
      type: l.type,
      contentUrl: l.contentUrl,
      contentBody: l.contentBody,
      durationMins: l.durationMins !== null ? String(l.durationMins) : '',
      isVisible: l.isVisible,
      moduleId: '',
      isMandatory: true,
    });
    setSubmitError('');
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (!isSubmitting) setModalOpen(false);
  }, [isSubmitting]);

  useEffect(() => {
    if (!modalOpen) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [modalOpen, closeModal]);

  // ─── Submit ───────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    const title = form.title.trim();
    const durationMins = form.durationMins ? parseInt(form.durationMins, 10) : null;

    if (!form.offeringId) { setSubmitError('Course offering is required.'); return; }
    if (!title) { setSubmitError('Title is required.'); return; }
    if (!editingId && !form.moduleId) { setSubmitError('Module is required. Create a module first.'); return; }
    if (durationMins !== null && (isNaN(durationMins) || durationMins < 1)) {
      setSubmitError('Duration must be at least 1 minute.'); return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    const payload = {
      offering_id: form.offeringId,
      title,
      type: form.type,
      content_url: form.contentUrl.trim() || null,
      content_body: form.contentBody.trim() || null,
      duration_mins: durationMins,
      is_visible: form.isVisible,
    };

    let error;
    let newLessonId: string | null = null;
    if (editingId) {
      ({ error } = await supabase.from('lessons').update(payload).eq('id', editingId));
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('lessons')
        .insert(payload)
        .select('id')
        .single();
      error = insertError;
      newLessonId = inserted?.id ?? null;
    }

    if (error) {
      setSubmitError(error.message || `Failed to ${editingId ? 'update' : 'create'} lesson.`);
      setIsSubmitting(false);
      return;
    }

    // Add lesson to module on create
    if (!editingId && newLessonId && form.moduleId) {
      // Auto-calculate sort_order as MAX + 1
      let itemSortOrder = 1;
      const { data: maxItemData } = await supabase
        .from('course_module_items')
        .select('sort_order')
        .eq('module_id', form.moduleId)
        .order('sort_order', { ascending: false })
        .limit(1);
      if (maxItemData && maxItemData.length > 0) {
        itemSortOrder = ((maxItemData[0] as any).sort_order ?? 0) + 1;
      }

      const { error: itemError } = await supabase.from('course_module_items').insert({
        module_id: form.moduleId,
        offering_id: form.offeringId,
        item_type: 'lesson',
        lesson_id: newLessonId,
        sort_order: itemSortOrder,
        is_visible: true,
        is_mandatory: form.isMandatory,
      });
      if (itemError) {
        toast.warning('Lesson created, but failed to add to module: ' + itemError.message);
      } else {
        toast.success('Lesson created and added to module.');
        setModalOpen(false);
        setForm(initialForm);
        fetchLessons();
        setIsSubmitting(false);
        return;
      }
    }

    toast.success(editingId ? 'Lesson updated.' : 'Lesson created.');
    setModalOpen(false);
    setForm(initialForm);
    fetchLessons();
    setIsSubmitting(false);
  };

  // ─── Delete ───────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('lessons').delete().eq('id', deleteId);
    if (error) {
      toast.error('Failed to delete lesson.');
    } else {
      toast.success('Lesson deleted.');
      fetchLessons();
    }
    setDeleteId(null);
    setIsDeleting(false);
  };

  // ─── Filter & paginate ────────────────────────────────────────────
  const filtered = lessons.filter((l) => {
    const matchesOffering = !filterOffering || l.offeringId === filterOffering;
    const matchesType = !filterType || l.type === filterType;
    const matchesSearch =
      !search ||
      l.title.toLowerCase().includes(search.toLowerCase()) ||
      l.offeringLabel.toLowerCase().includes(search.toLowerCase());
    return matchesOffering && matchesType && matchesSearch;
  });

  const totalCount = filtered.length;
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, totalCount);
  const paginated = filtered.slice(start, end);

  return (
    <div className="p-6 space-y-6">
      {/* Filters & action bar */}
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <div className="flex flex-wrap gap-3 flex-1">
          {/* Offering filter */}
          <select
            value={filterOffering}
            onChange={(e) => { setFilterOffering(e.target.value); setPage(1); }}
            className="flex-1 min-w-[200px] max-w-xs px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="">All My Offerings</option>
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>

          {/* Type filter */}
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
            className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="">All Types</option>
            {LESSON_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>

          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <input
              type="search"
              placeholder="Search lessons..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <button
          type="button" onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Lesson
        </button>
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={closeModal} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200"
            role="dialog" aria-modal="true" aria-labelledby="lesson-modal-title"
          >
            <div className="flex items-center justify-between shrink-0 p-6 pb-0">
              <h2 id="lesson-modal-title" className="text-lg font-bold text-gray-900">
                {editingId ? 'Edit Lesson' : 'Add Lesson'}
              </h2>
              <button type="button" onClick={closeModal} disabled={isSubmitting}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50" aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 p-6">
              <div className="space-y-4 overflow-y-auto pr-1 max-h-[60vh]">
                {submitError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{submitError}</div>
                )}

                {/* Offering */}
                <div>
                  <label htmlFor="ls-offering" className="block text-sm font-medium text-gray-700 mb-1">Course Offering *</label>
                  <select id="ls-offering" value={form.offeringId}
                    onChange={(e) => setForm((f) => ({ ...f, offeringId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">— Select Offering —</option>
                    {offerings.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Title */}
                <div>
                  <label htmlFor="ls-title" className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input id="ls-title" type="text" value={form.title}
                    placeholder="e.g. Introduction to Variables"
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                {/* Type & Duration */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="ls-type" className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                    <select id="ls-type" value={form.type}
                      onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      {LESSON_TYPES.map((t) => (
                        <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ls-duration" className="block text-sm font-medium text-gray-700 mb-1">Duration (mins)</label>
                    <input id="ls-duration" type="number" min={1} value={form.durationMins}
                      placeholder="e.g. 30"
                      onChange={(e) => setForm((f) => ({ ...f, durationMins: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>

                {/* Content URL */}
                <div>
                  <label htmlFor="ls-url" className="block text-sm font-medium text-gray-700 mb-1">
                    {URL_LABELS[form.type] ?? 'Content URL'}
                  </label>
                  <input id="ls-url" type="url" value={form.contentUrl}
                    placeholder="https://..."
                    onChange={(e) => setForm((f) => ({ ...f, contentUrl: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                {/* Content Body */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Content Body</label>
                  <RichTextEditor
                    value={form.contentBody}
                    onChange={(html) => setForm((f) => ({ ...f, contentBody: html }))}
                    placeholder="Optional inline content or description..."
                    minHeight="120px"
                  />
                </div>

                {/* Add to module (create only) */}
                {!editingId && (
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="ls-module" className="block text-sm font-medium text-gray-700 mb-1">
                        Module *
                      </label>
                      {form.offeringId && modules.length === 0 ? (
                        <p className="text-sm text-red-500">No modules yet. Create a module first.</p>
                      ) : (
                        <select id="ls-module" value={form.moduleId}
                          onChange={(e) => setForm((f) => ({ ...f, moduleId: e.target.value }))}
                          disabled={!form.offeringId}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
                        >
                          <option value="">— Select Module —</option>
                          {modules.map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <input id="ls-mandatory" type="checkbox" checked={form.isMandatory}
                        onChange={(e) => setForm((f) => ({ ...f, isMandatory: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <label htmlFor="ls-mandatory" className="text-sm font-medium text-gray-700">Mandatory for students</label>
                    </div>
                  </div>
                )}

                {/* Visible */}
                <div className="flex items-center gap-3">
                  <input id="ls-visible" type="checkbox" checked={form.isVisible}
                    onChange={(e) => setForm((f) => ({ ...f, isVisible: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor="ls-visible" className="text-sm font-medium text-gray-700">Visible to students</label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 mt-4 shrink-0 border-t border-gray-100">
                <button type="button" onClick={closeModal} disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50"
                >Cancel</button>
                <button type="submit" disabled={isSubmitting || (!editingId && form.offeringId !== '' && modules.length === 0)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition disabled:opacity-50 min-w-[120px]"
                >
                  {isSubmitting ? (editingId ? 'Saving...' : 'Creating...') : (editingId ? 'Save Changes' : 'Add Lesson')}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6"
            role="dialog" aria-modal="true"
          >
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete Lesson?</h2>
            <p className="text-sm text-gray-600 mb-6">
              This will permanently delete the lesson and its materials. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteId(null)} disabled={isDeleting}
                className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50"
              >Cancel</button>
              <button type="button" onClick={handleDelete} disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition disabled:opacity-50 min-w-[100px]"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Title</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Type</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Course Offering</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Duration</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Visible</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500">Loading lessons...</td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500">
                    {search || filterOffering || filterType
                      ? 'No lessons match your filter.'
                      : 'No lessons yet. Add one to get started.'}
                  </td>
                </tr>
              ) : (
                paginated.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <div className="text-sm font-medium text-gray-900">{l.title}</div>
                      {l.contentUrl && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{l.contentUrl}</div>
                      )}
                      {!linkedLessonIds.has(l.id) && (
                        <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                          Not in any module — students cannot see this
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[l.type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TYPE_LABELS[l.type] ?? l.type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600 max-w-xs">
                      <span className="line-clamp-2">{l.offeringLabel}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">
                      {l.durationMins !== null ? `${l.durationMins} min` : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-sm font-medium ${l.isVisible ? 'text-green-600' : 'text-gray-400'}`}>
                        {l.isVisible ? 'Visible' : 'Hidden'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button" onClick={() => openEditModal(l)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900" title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          type="button" onClick={() => setDeleteId(l.id)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-red-600" title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-5 py-3 border-t border-gray-200 bg-gray-50/50">
          <p className="text-sm text-gray-600">
            {totalCount === 0 ? 'No results' : `Showing ${start + 1}–${end} of ${totalCount}`}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none" aria-label="Previous page"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button" onClick={() => setPage((p) => p + 1)} disabled={end >= totalCount}
              className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none" aria-label="Next page"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
