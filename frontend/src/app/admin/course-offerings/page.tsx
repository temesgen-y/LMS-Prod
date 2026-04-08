'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

type CourseOffering = {
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  termId: string;
  termLabel: string;
  termName: string;
  sectionName: string;
  maxStudents: number;
  enrolledCount: number;
  schedule: string;
  room: string;
  status: string;
};

type CourseOption = { id: string; code: string; title: string };
type TermOption = { id: string; label: string; name: string };

const PAGE_SIZE = 10;
const STATUSES = ['upcoming', 'active', 'completed', 'cancelled'] as const;

const initialForm = {
  courseId: '',
  termId: '',
  sectionName: 'A',
  maxStudents: '50',
  schedule: '',
  room: '',
  status: 'upcoming' as string,
};

export default function AdminCourseOfferingsPage() {
  const [offerings, setOfferings] = useState<CourseOffering[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Add / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchOfferings = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('course_offerings')
      .select(`
        id,
        course_id,
        term_id,
        section_name,
        max_students,
        enrolled_count,
        schedule,
        room,
        status,
        courses!fk_course_offerings_course (
          code,
          title
        ),
        academic_terms!fk_course_offerings_term (
          academic_year_label,
          term_name,
          term_code
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load course offerings.');
    } else {
      setOfferings(
        (data ?? []).map((row: any) => {
          const course = row.courses ?? {};
          const term = row.academic_terms ?? {};
          return {
            id: row.id,
            courseId: row.course_id,
            courseCode: course.code ?? '—',
            courseTitle: course.title ?? '—',
            termId: row.term_id,
            termLabel: term.academic_year_label ?? '—',
            termName: term.term_name ?? term.term_code ?? '—',
            sectionName: row.section_name ?? 'A',
            maxStudents: row.max_students ?? 0,
            enrolledCount: row.enrolled_count ?? 0,
            schedule: row.schedule ?? '',
            room: row.room ?? '',
            status: row.status ?? 'upcoming',
          };
        })
      );
    }
    setLoading(false);
  }, []);

  const fetchOptions = useCallback(async () => {
    const supabase = createClient();
    const [{ data: courseData }, { data: termData }] = await Promise.all([
      supabase
        .from('courses')
        .select('id, code, title')
        .eq('is_active', true)
        .order('title', { ascending: true }),
      supabase
        .from('academic_terms')
        .select('id, academic_year_label, term_name, term_code')
        .order('start_date', { ascending: false }),
    ]);
    if (courseData) {
      setCourses(courseData.map((c: any) => ({ id: c.id, code: c.code, title: c.title })));
    }
    if (termData) {
      setTerms(
        termData.map((t: any) => ({
          id: t.id,
          label: t.academic_year_label ?? '',
          name: t.term_name ?? t.term_code ?? '',
        }))
      );
    }
  }, []);

  useEffect(() => {
    fetchOfferings();
    fetchOptions();
  }, [fetchOfferings, fetchOptions]);

  // ─── Modal helpers ───────────────────────────────────────────────
  const openAddModal = useCallback(() => {
    setEditingId(null);
    setForm(initialForm);
    setSubmitError('');
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback((o: CourseOffering) => {
    setEditingId(o.id);
    setForm({
      courseId: o.courseId,
      termId: o.termId,
      sectionName: o.sectionName,
      maxStudents: String(o.maxStudents),
      schedule: o.schedule,
      room: o.room,
      status: o.status,
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

  // ─── Submit ──────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    const sectionName = form.sectionName.trim() || 'A';
    const maxStudents = parseInt(form.maxStudents, 10);

    if (!form.courseId) { setSubmitError('Course is required.'); return; }
    if (!form.termId) { setSubmitError('Term is required.'); return; }
    if (!maxStudents || maxStudents < 1) { setSubmitError('Max students must be at least 1.'); return; }

    setIsSubmitting(true);
    const supabase = createClient();

    const payload = {
      course_id: form.courseId,
      term_id: form.termId,
      section_name: sectionName,
      max_students: maxStudents,
      schedule: form.schedule.trim() || null,
      room: form.room.trim() || null,
      status: form.status,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from('course_offerings').update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('course_offerings').insert(payload));
    }

    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('uq_course_offerings')) {
        setSubmitError('A course offering for this course, term, and section already exists.');
      } else if (msg.includes('chk_course_offerings_enrolled')) {
        setSubmitError('Max students cannot be less than the current enrolled count.');
      } else {
        setSubmitError(msg || `Failed to ${editingId ? 'update' : 'create'} course offering.`);
      }
      setIsSubmitting(false);
      return;
    }

    toast.success(editingId ? 'Course offering updated.' : 'Course offering created.');
    setModalOpen(false);
    setForm(initialForm);
    fetchOfferings();
    setIsSubmitting(false);
  };

  // ─── Delete ──────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('course_offerings').delete().eq('id', deleteId);
    if (error) {
      toast.error('Failed to delete course offering. It may have related records.');
    } else {
      toast.success('Course offering deleted.');
      fetchOfferings();
    }
    setDeleteId(null);
    setIsDeleting(false);
  };

  // ─── Filter & paginate ────────────────────────────────────────────
  const filtered = offerings.filter(
    (o) =>
      o.courseCode.toLowerCase().includes(search.toLowerCase()) ||
      o.courseTitle.toLowerCase().includes(search.toLowerCase()) ||
      o.termLabel.toLowerCase().includes(search.toLowerCase()) ||
      o.termName.toLowerCase().includes(search.toLowerCase()) ||
      o.sectionName.toLowerCase().includes(search.toLowerCase()) ||
      o.status.toLowerCase().includes(search.toLowerCase())
  );
  const totalCount = filtered.length;
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, totalCount);
  const paginated = filtered.slice(start, end);

  const statusColor = (s: string) => {
    if (s === 'active') return 'text-green-600';
    if (s === 'upcoming') return 'text-blue-600';
    if (s === 'completed') return 'text-gray-500';
    if (s === 'cancelled') return 'text-red-500';
    return 'text-gray-400';
  };

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="space-y-6">
      {/* Search and action bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md">
          <input
            type="search"
            placeholder="Search course offerings..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button
          type="button" onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Offering
        </button>
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={closeModal} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200"
            role="dialog" aria-modal="true" aria-labelledby="offering-modal-title"
          >
            <div className="flex items-center justify-between shrink-0 p-6 pb-0">
              <h2 id="offering-modal-title" className="text-lg font-bold text-gray-900">
                {editingId ? 'Edit Course Offering' : 'Add Course Offering'}
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

                {/* Course */}
                <div>
                  <label htmlFor="of-course" className="block text-sm font-medium text-gray-700 mb-1">Course *</label>
                  <select id="of-course" value={form.courseId}
                    onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">— Select Course —</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.code.toUpperCase()} — {c.title}</option>
                    ))}
                  </select>
                </div>

                {/* Term */}
                <div>
                  <label htmlFor="of-term" className="block text-sm font-medium text-gray-700 mb-1">Term *</label>
                  <select id="of-term" value={form.termId}
                    onChange={(e) => setForm((f) => ({ ...f, termId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">— Select Term —</option>
                    {terms.map((t) => (
                      <option key={t.id} value={t.id}>{t.label} — {t.name}</option>
                    ))}
                  </select>
                </div>

                {/* Section & Max Students */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="of-section" className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                    <input id="of-section" type="text" value={form.sectionName}
                      placeholder="e.g. A"
                      onChange={(e) => setForm((f) => ({ ...f, sectionName: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="of-max" className="block text-sm font-medium text-gray-700 mb-1">Max Students *</label>
                    <input id="of-max" type="number" min={1} max={500} value={form.maxStudents}
                      onChange={(e) => setForm((f) => ({ ...f, maxStudents: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>

                {/* Schedule & Room */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="of-schedule" className="block text-sm font-medium text-gray-700 mb-1">Schedule</label>
                    <input id="of-schedule" type="text" value={form.schedule}
                      placeholder="e.g. Mon/Wed 10:00–11:30"
                      onChange={(e) => setForm((f) => ({ ...f, schedule: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="of-room" className="block text-sm font-medium text-gray-700 mb-1">Room</label>
                    <input id="of-room" type="text" value={form.room}
                      placeholder="e.g. Room 201"
                      onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label htmlFor="of-status" className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                  <select id="of-status" value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{capitalize(s)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 mt-4 shrink-0 border-t border-gray-100">
                <button type="button" onClick={closeModal} disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition disabled:opacity-50"
                >Cancel</button>
                <button type="submit" disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition disabled:opacity-50 min-w-[130px]"
                >
                  {isSubmitting ? (editingId ? 'Saving...' : 'Creating...') : (editingId ? 'Save Changes' : 'Add Offering')}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Delete confirm dialog */}
      {deleteId && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6"
            role="dialog" aria-modal="true"
          >
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete Course Offering?</h2>
            <p className="text-sm text-gray-600 mb-6">
              This will permanently delete this course offering. This cannot be undone if there are no related records.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteId(null)} disabled={isDeleting}
                className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition disabled:opacity-50"
              >Cancel</button>
              <button type="button" onClick={handleDelete} disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition disabled:opacity-50 min-w-[100px]"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Table card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Course</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Term</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Section</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Enrolled</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Schedule</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Room</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Status</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-500">Loading course offerings...</td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-500">
                    {search ? 'No course offerings match your search.' : 'No course offerings found.'}
                  </td>
                </tr>
              ) : (
                paginated.map((o) => (
                  <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <div>
                        <span className="text-sm font-medium text-gray-900 uppercase">{o.courseCode}</span>
                        <div className="text-sm text-gray-600">{o.courseTitle}</div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div>
                        <span className="text-sm font-medium text-gray-900">{o.termLabel}</span>
                        <div className="text-xs text-gray-500">{o.termName}</div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">{o.sectionName}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">
                      {o.enrolledCount} / {o.maxStudents}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">{o.schedule || '—'}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{o.room || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-sm font-medium ${statusColor(o.status)}`}>
                        {capitalize(o.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(o)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(o.id)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-red-600"
                          title="Delete"
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
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button" onClick={() => setPage((p) => p + 1)} disabled={end >= totalCount}
              className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none" aria-label="Next page"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
