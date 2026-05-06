'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type OfferingOption = { id: string; label: string };
type ModuleOption   = { id: string; label: string; offeringId: string };

type ItemRow = {
  id: string;
  sortOrder: number;
  itemType: string;
  isVisible: boolean;
  isMandatory: boolean;
  itemTitle: string | null;
  itemUrl: string | null;
  lessonId: string | null;
  assessmentId: string | null;
  assignmentId: string | null;
  liveSessionId: string | null;
  resolvedTitle: string;
};

type SelectOption = { id: string; label: string };

const TYPE_LABELS: Record<string, string> = {
  lesson:       'Lesson',
  link:         'Link',
  assessment:   'Assessment',
  assignment:   'Assignment',
  live_session: 'Live Session',
};

const TYPE_COLORS: Record<string, string> = {
  lesson:       'bg-blue-100 text-blue-700',
  link:         'bg-green-100 text-green-700',
  assessment:   'bg-amber-100 text-amber-700',
  assignment:   'bg-purple-100 text-purple-700',
  live_session: 'bg-pink-100 text-pink-700',
};

const ITEM_TYPES = ['lesson', 'link', 'assessment', 'assignment', 'live_session'] as const;

const initialForm = {
  itemType:     'lesson' as string,
  lessonId:     '',
  assessmentId: '',
  assignmentId: '',
  liveSessionId:'',
  itemTitle:    '',
  itemUrl:      '',
  isMandatory:  false,
  isVisible:    true,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function InstructorModuleItemsPage() {
  const [offerings, setOfferings]             = useState<OfferingOption[]>([]);
  const [modules, setModules]                 = useState<ModuleOption[]>([]);
  const [selectedOffering, setSelectedOffering] = useState('');
  const [selectedModule, setSelectedModule]   = useState('');

  const [items, setItems]     = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Options for "add item" dropdowns
  const [lessonOpts, setLessonOpts]           = useState<SelectOption[]>([]);
  const [assessmentOpts, setAssessmentOpts]   = useState<SelectOption[]>([]);
  const [assignmentOpts, setAssignmentOpts]   = useState<SelectOption[]>([]);
  const [liveSessionOpts, setLiveSessionOpts] = useState<SelectOption[]>([]);

  const [modalOpen, setModalOpen]   = useState(false);
  const [form, setForm]             = useState(initialForm);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ─── Auth / fetch helpers ──────────────────────────────────────────

  const getCurrentUserId = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
    return data?.id ?? null;
  }, []);

  // ─── Fetch offerings on mount ──────────────────────────────────────

  const fetchOfferings = useCallback(async () => {
    const userId = await getCurrentUserId();
    if (!userId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('course_instructors')
      .select(`
        course_offerings!fk_course_instructors_offering (
          id, section_name,
          courses!fk_course_offerings_course ( code, title ),
          academic_terms!fk_course_offerings_term ( academic_year_label, term_name, term_code )
        )
      `)
      .eq('instructor_id', userId);
    if (data) {
      const opts: OfferingOption[] = (data as any[]).map(r => {
        const o = r.course_offerings ?? {};
        const c = o.courses ?? {};
        const t = o.academic_terms ?? {};
        const term = [t.academic_year_label, t.term_name ?? t.term_code].filter(Boolean).join(' · ');
        return { id: o.id, label: `${(c.code ?? '').toUpperCase()} — ${c.title ?? '—'} · ${term} · Sec ${o.section_name ?? 'A'}` };
      }).filter(o => !!o.id);
      setOfferings(opts);
    }
  }, [getCurrentUserId]);

  useEffect(() => { fetchOfferings(); }, [fetchOfferings]);

  // ─── When offering changes: fetch modules + item options ───────────

  useEffect(() => {
    if (!selectedOffering) {
      setModules([]);
      setSelectedModule('');
      setLessonOpts([]);
      setAssessmentOpts([]);
      setAssignmentOpts([]);
      setLiveSessionOpts([]);
      setItems([]);
      return;
    }
    const supabase = createClient();
    // Fetch modules for this offering
    supabase
      .from('course_modules')
      .select('id, title, sort_order')
      .eq('offering_id', selectedOffering)
      .order('sort_order', { ascending: true })
      .then(({ data }: { data: any }) => {
        const mods: ModuleOption[] = (data ?? []).map((m: any) => ({
          id: m.id,
          label: m.title,
          offeringId: selectedOffering,
        }));
        setModules(mods);
        setSelectedModule('');
        setItems([]);
      });
    // Fetch all item options for this offering in parallel
    Promise.all([
      supabase.from('lessons').select('id, title, type').eq('offering_id', selectedOffering).order('title'),
      supabase.from('assessments').select('id, title, type').eq('offering_id', selectedOffering).order('title'),
      supabase.from('assignments').select('id, title').eq('offering_id', selectedOffering).order('title'),
      supabase.from('live_sessions').select('id, title, platform').eq('offering_id', selectedOffering).order('title'),
    ]).then(([lRes, aRes, asRes, lsRes]) => {
      setLessonOpts((lRes.data ?? []).map((r: any) => ({ id: r.id, label: `${r.title} [${r.type}]` })));
      setAssessmentOpts((aRes.data ?? []).map((r: any) => ({ id: r.id, label: `${r.title} [${r.type}]` })));
      setAssignmentOpts((asRes.data ?? []).map((r: any) => ({ id: r.id, label: r.title })));
      setLiveSessionOpts((lsRes.data ?? []).map((r: any) => ({ id: r.id, label: `${r.title} [${r.platform}]` })));
    });
  }, [selectedOffering]);

  // ─── When module changes: fetch items ─────────────────────────────

  const fetchItems = useCallback(async (moduleId: string) => {
    if (!moduleId) { setItems([]); return; }
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('course_module_items')
      .select('id, sort_order, item_type, is_visible, is_mandatory, item_title, item_url, lesson_id, assessment_id, assignment_id, live_session_id')
      .eq('module_id', moduleId)
      .order('sort_order', { ascending: true });

    const rawItems = (data ?? []) as any[];

    // Batch-fetch names for linked items
    const lessonIds    = rawItems.filter(i => i.lesson_id).map(i => i.lesson_id as string);
    const assessIds    = rawItems.filter(i => i.assessment_id).map(i => i.assessment_id as string);
    const assignIds    = rawItems.filter(i => i.assignment_id).map(i => i.assignment_id as string);
    const lsIds        = rawItems.filter(i => i.live_session_id).map(i => i.live_session_id as string);

    const [lRes, aRes, asRes, lsRes] = await Promise.all([
      lessonIds.length ? supabase.from('lessons').select('id, title, type').in('id', lessonIds) : Promise.resolve({ data: [] }),
      assessIds.length ? supabase.from('assessments').select('id, title').in('id', assessIds) : Promise.resolve({ data: [] }),
      assignIds.length ? supabase.from('assignments').select('id, title').in('id', assignIds) : Promise.resolve({ data: [] }),
      lsIds.length ? supabase.from('live_sessions').select('id, title').in('id', lsIds) : Promise.resolve({ data: [] }),
    ]);

    const lMap: Record<string, string>  = {};
    const aMap: Record<string, string>  = {};
    const asMap: Record<string, string> = {};
    const lsMap: Record<string, string> = {};
    ((lRes.data ?? []) as any[]).forEach(r => { lMap[r.id] = `${r.title} [${r.type}]`; });
    ((aRes.data ?? []) as any[]).forEach(r => { aMap[r.id] = r.title; });
    ((asRes.data ?? []) as any[]).forEach(r => { asMap[r.id] = r.title; });
    ((lsRes.data ?? []) as any[]).forEach(r => { lsMap[r.id] = r.title; });

    const resolved: ItemRow[] = rawItems.map(raw => {
      let resolvedTitle = raw.item_title ?? '';
      if (!resolvedTitle) {
        if (raw.lesson_id)       resolvedTitle = lMap[raw.lesson_id]  ?? '(lesson)';
        else if (raw.assessment_id)  resolvedTitle = aMap[raw.assessment_id]  ?? '(assessment)';
        else if (raw.assignment_id)  resolvedTitle = asMap[raw.assignment_id] ?? '(assignment)';
        else if (raw.live_session_id) resolvedTitle = lsMap[raw.live_session_id] ?? '(live session)';
        else if (raw.item_url)    resolvedTitle = raw.item_url;
      }
      return {
        id:            raw.id,
        sortOrder:     raw.sort_order,
        itemType:      raw.item_type,
        isVisible:     raw.is_visible,
        isMandatory:   raw.is_mandatory,
        itemTitle:     raw.item_title,
        itemUrl:       raw.item_url,
        lessonId:      raw.lesson_id,
        assessmentId:  raw.assessment_id,
        assignmentId:  raw.assignment_id,
        liveSessionId: raw.live_session_id,
        resolvedTitle,
      };
    });

    setItems(resolved);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems(selectedModule);
  }, [selectedModule, fetchItems]);

  // ─── Reorder helpers ───────────────────────────────────────────────

  const moveItem = async (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= items.length) return;

    const a = items[index];
    const b = items[swapIndex];
    const supabase = createClient();

    await Promise.all([
      supabase.from('course_module_items').update({ sort_order: b.sortOrder }).eq('id', a.id),
      supabase.from('course_module_items').update({ sort_order: a.sortOrder }).eq('id', b.id),
    ]);

    // Optimistic update
    const updated = [...items];
    updated[index]     = { ...a, sortOrder: b.sortOrder };
    updated[swapIndex] = { ...b, sortOrder: a.sortOrder };
    updated.sort((x, y) => x.sortOrder - y.sortOrder);
    setItems(updated);
    toast.success('Order updated.');
  };

  // ─── Add item ─────────────────────────────────────────────────────

  const openAddModal = () => {
    setForm({ ...initialForm });
    setSubmitError('');
    setModalOpen(true);
  };

  const closeModal = () => { if (!isSubmitting) setModalOpen(false); };

  useEffect(() => {
    if (!modalOpen) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!selectedModule) { setSubmitError('Select a module first.'); return; }

    // Validate based on type
    if (form.itemType === 'lesson' && !form.lessonId) { setSubmitError('Select a lesson.'); return; }
    if (form.itemType === 'assessment' && !form.assessmentId) { setSubmitError('Select an assessment.'); return; }
    if (form.itemType === 'assignment' && !form.assignmentId) { setSubmitError('Select an assignment.'); return; }
    if (form.itemType === 'live_session' && !form.liveSessionId) { setSubmitError('Select a live session.'); return; }
    if (form.itemType === 'link') {
      if (!form.itemUrl.trim()) { setSubmitError('URL is required for link type.'); return; }
      if (!form.itemTitle.trim()) { setSubmitError('Title is required for link type.'); return; }
    }

    setIsSubmitting(true);
    const supabase = createClient();

    const nextOrder = items.length > 0 ? Math.max(...items.map(i => i.sortOrder)) + 1 : 0;

    const payload: Record<string, any> = {
      module_id:   selectedModule,
      offering_id: selectedOffering,
      item_type:   form.itemType,
      sort_order:  nextOrder,
      is_visible:  form.isVisible,
      is_mandatory: form.isMandatory,
      item_title:  form.itemTitle.trim() || null,
    };

    if (form.itemType === 'lesson')       payload.lesson_id       = form.lessonId;
    if (form.itemType === 'assessment')   payload.assessment_id   = form.assessmentId;
    if (form.itemType === 'assignment')   payload.assignment_id   = form.assignmentId;
    if (form.itemType === 'live_session') payload.live_session_id = form.liveSessionId;
    if (form.itemType === 'link')         payload.item_url        = form.itemUrl.trim();

    const { error } = await supabase.from('course_module_items').insert(payload);
    if (error) {
      setSubmitError(error.message || 'Failed to add item.');
      setIsSubmitting(false);
      return;
    }

    toast.success('Item added to module.');
    setModalOpen(false);
    setForm(initialForm);
    fetchItems(selectedModule);
    setIsSubmitting(false);
  };

  // ─── Delete item ──────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('course_module_items').delete().eq('id', deleteId);
    if (error) {
      toast.error('Failed to remove item.');
    } else {
      toast.success('Item removed from module.');
      fetchItems(selectedModule);
    }
    setDeleteId(null);
    setIsDeleting(false);
  };

  // ─── Render ───────────────────────────────────────────────────────

  const filteredModules = modules.filter(m => !selectedOffering || m.offeringId === selectedOffering);

  return (
    <div className="p-6 space-y-6">
      {/* ── Step 1 + 2: Select offering then module ── */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1 flex-1 min-w-[220px] max-w-xs">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Course Offering</label>
          <select
            value={selectedOffering}
            onChange={(e) => { setSelectedOffering(e.target.value); setSelectedModule(''); }}
            className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="">— Select Offering —</option>
            {offerings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[200px] max-w-xs">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Module</label>
          <select
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
            disabled={!selectedOffering}
            className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
          >
            <option value="">— Select Module —</option>
            {filteredModules.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          disabled={!selectedModule}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Item
        </button>
      </div>

      {/* ── Info banner when no module selected ── */}
      {!selectedModule && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 text-sm text-blue-700">
          <p className="font-semibold mb-1">How to make content visible to students</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-600">
            <li>Select a <strong>Course Offering</strong> above</li>
            <li>Select a <strong>Module</strong> (T1, T2, T3, T4...)</li>
            <li>Click <strong>Add Item</strong> to link a lesson, link, assessment, assignment, or live session</li>
            <li>Students will then see these items in their T1/T2/T3/T4 topic pages</li>
          </ol>
        </div>
      )}

      {/* ── Items table ── */}
      {selectedModule && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/80 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">
              Module Items
              {!loading && <span className="ml-2 text-gray-400 font-normal">({items.length} item{items.length !== 1 ? 's' : ''})</span>}
            </span>
            <span className="text-xs text-gray-400">Use arrows to reorder</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 w-16">Order</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 w-28">Type</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">Title</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 w-20">Visible</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 w-24">Required</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">Loading items...</td></tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center">
                      <p className="text-sm text-gray-400 mb-1">No items in this module yet.</p>
                      <p className="text-xs text-gray-400">Click "Add Item" above to link content to this module.</p>
                    </td>
                  </tr>
                ) : items.map((item, idx) => (
                  <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">{item.sortOrder}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[item.itemType] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TYPE_LABELS[item.itemType] ?? item.itemType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{item.resolvedTitle}</div>
                      {item.itemUrl && item.itemType === 'link' && (
                        <a href={item.itemUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline truncate max-w-xs block mt-0.5">
                          {item.itemUrl}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${item.isVisible ? 'text-green-600' : 'text-gray-400'}`}>
                        {item.isVisible ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${item.isMandatory ? 'text-red-500' : 'text-gray-400'}`}>
                        {item.isMandatory ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveItem(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30 disabled:cursor-default"
                          title="Move up"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(idx, 'down')}
                          disabled={idx === items.length - 1}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30 disabled:cursor-default"
                          title="Move down"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(item.id)}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                          title="Remove from module"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add Item Modal ── */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={closeModal} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200"
            role="dialog" aria-modal="true"
          >
            <div className="flex items-center justify-between shrink-0 p-6 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Add Item to Module</h2>
              <button type="button" onClick={closeModal} disabled={isSubmitting}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 p-6">
              <div className="space-y-4 overflow-y-auto pr-1 max-h-[55vh]">
                {submitError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{submitError}</div>
                )}

                {/* Item Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item Type *</label>
                  <div className="flex flex-wrap gap-2">
                    {ITEM_TYPES.map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, itemType: t, lessonId: '', assessmentId: '', assignmentId: '', liveSessionId: '', itemTitle: '', itemUrl: '' }))}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          form.itemType === t
                            ? `${TYPE_COLORS[t]} border-current`
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lesson picker */}
                {form.itemType === 'lesson' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lesson *</label>
                    <select value={form.lessonId}
                      onChange={e => setForm(f => ({ ...f, lessonId: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="">— Select Lesson —</option>
                      {lessonOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    {lessonOpts.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">No lessons found for this offering. Create one in the Lessons page first.</p>
                    )}
                  </div>
                )}

                {/* Assessment picker */}
                {form.itemType === 'assessment' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assessment *</label>
                    <select value={form.assessmentId}
                      onChange={e => setForm(f => ({ ...f, assessmentId: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="">— Select Assessment —</option>
                      {assessmentOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    {assessmentOpts.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">No assessments found for this offering.</p>
                    )}
                  </div>
                )}

                {/* Assignment picker */}
                {form.itemType === 'assignment' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assignment *</label>
                    <select value={form.assignmentId}
                      onChange={e => setForm(f => ({ ...f, assignmentId: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="">— Select Assignment —</option>
                      {assignmentOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    {assignmentOpts.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">No assignments found for this offering.</p>
                    )}
                  </div>
                )}

                {/* Live Session picker */}
                {form.itemType === 'live_session' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Live Session *</label>
                    <select value={form.liveSessionId}
                      onChange={e => setForm(f => ({ ...f, liveSessionId: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="">— Select Live Session —</option>
                      {liveSessionOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    {liveSessionOpts.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">No live sessions found for this offering.</p>
                    )}
                  </div>
                )}

                {/* Link fields */}
                {form.itemType === 'link' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                      <input type="text" value={form.itemTitle}
                        placeholder="e.g. Advanced Database - YouTube Video"
                        onChange={e => setForm(f => ({ ...f, itemTitle: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">URL * <span className="font-normal text-gray-400">(YouTube, PDF, website...)</span></label>
                      <input type="url" value={form.itemUrl}
                        placeholder="https://www.youtube.com/watch?v=..."
                        onChange={e => setForm(f => ({ ...f, itemUrl: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                  </>
                )}

                {/* Optional title override (for non-link types) */}
                {form.itemType !== 'link' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Display Title Override <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <input type="text" value={form.itemTitle}
                      placeholder="Leave blank to use the item's own title"
                      onChange={e => setForm(f => ({ ...f, itemTitle: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                )}

                {/* Flags */}
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.isVisible}
                      onChange={e => setForm(f => ({ ...f, isVisible: e.target.checked }))}
                      className="w-4 h-4 rounded border-gray-300 text-primary"
                    />
                    <span className="text-sm text-gray-700">Visible to students</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.isMandatory}
                      onChange={e => setForm(f => ({ ...f, isMandatory: e.target.checked }))}
                      className="w-4 h-4 rounded border-gray-300 text-primary"
                    />
                    <span className="text-sm text-gray-700">Required</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 mt-4 shrink-0 border-t border-gray-100">
                <button type="button" onClick={closeModal} disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50"
                >Cancel</button>
                <button type="submit" disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition disabled:opacity-50 min-w-[120px]"
                >
                  {isSubmitting ? 'Adding...' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ── Delete confirm ── */}
      {deleteId && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6"
            role="dialog" aria-modal="true"
          >
            <h2 className="text-lg font-bold text-gray-900 mb-2">Remove Item?</h2>
            <p className="text-sm text-gray-600 mb-6">
              This removes the item from the module. The lesson/assessment/assignment itself is not deleted.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteId(null)} disabled={isDeleting}
                className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50"
              >Cancel</button>
              <button type="button" onClick={handleDelete} disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition disabled:opacity-50 min-w-[100px]"
              >
                {isDeleting ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
