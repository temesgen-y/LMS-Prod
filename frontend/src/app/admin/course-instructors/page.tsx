'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

type CourseInstructor = {
  id: string;
  offeringId: string;
  offeringLabel: string;   // e.g. "CS301 — Databases · 2024/25 Sem 1 · Sec A"
  instructorId: string;
  instructorName: string;
  role: string;
  assignedAt: string;
};

type OfferingOption = { id: string; label: string };
type InstructorOption = { id: string; name: string };

const PAGE_SIZE = 10;
const ROLES = ['primary', 'co_instructor', 'assistant'] as const;
const ROLE_LABELS: Record<string, string> = {
  primary: 'Primary',
  co_instructor: 'Co-Instructor',
  assistant: 'Assistant',
};

const initialForm = {
  offeringId: '',
  instructorId: '',
  role: 'primary' as string,
};

export default function AdminCourseInstructorsPage() {
  const [rows, setRows] = useState<CourseInstructor[]>([]);
  const [offerings, setOfferings] = useState<OfferingOption[]>([]);
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ─── Fetch assignments ────────────────────────────────────────────
  const fetchRows = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('course_instructors')
      .select(`
        id,
        offering_id,
        instructor_id,
        role,
        assigned_at,
        course_offerings!fk_course_instructors_offering (
          section_name,
          courses!fk_course_offerings_course (
            code,
            title
          ),
          academic_terms!fk_course_offerings_term (
            academic_year_label,
            term_name,
            term_code
          )
        ),
        users!fk_course_instructors_instructor (
          first_name,
          last_name
        )
      `)
      .order('assigned_at', { ascending: false });

    if (error) {
      toast.error('Failed to load course instructors.');
    } else {
      setRows(
        (data ?? []).map((r: any) => {
          const offering = r.course_offerings ?? {};
          const course = offering.courses ?? {};
          const term = offering.academic_terms ?? {};
          const user = r.users ?? {};
          const termStr = [term.academic_year_label, term.term_name ?? term.term_code].filter(Boolean).join(' · ');
          return {
            id: r.id,
            offeringId: r.offering_id,
            offeringLabel: `${(course.code ?? '').toUpperCase()} — ${course.title ?? '—'} · ${termStr} · Sec ${offering.section_name ?? 'A'}`,
            instructorId: r.instructor_id,
            instructorName: [user.first_name, user.last_name].filter(Boolean).join(' ') || '—',
            role: r.role ?? 'primary',
            assignedAt: r.assigned_at ? new Date(r.assigned_at).toLocaleDateString() : '—',
          };
        })
      );
    }
    setLoading(false);
  }, []);

  // ─── Fetch dropdown options ───────────────────────────────────────
  const fetchOptions = useCallback(async () => {
    const supabase = createClient();
    const [{ data: offeringData }, { data: instructorData }] = await Promise.all([
      supabase
        .from('course_offerings')
        .select(`
          id,
          section_name,
          courses!fk_course_offerings_course ( code, title ),
          academic_terms!fk_course_offerings_term ( academic_year_label, term_name, term_code )
        `)
        .order('created_at', { ascending: false }),
      supabase
        .from('instructor_profiles')
        .select(`
          user_id,
          users!fk_instructor_profiles_user ( first_name, last_name )
        `)
        .order('created_at', { ascending: true }),
    ]);

    if (offeringData) {
      setOfferings(
        offeringData.map((o: any) => {
          const c = o.courses ?? {};
          const t = o.academic_terms ?? {};
          const termStr = [t.academic_year_label, t.term_name ?? t.term_code].filter(Boolean).join(' · ');
          return {
            id: o.id,
            label: `${(c.code ?? '').toUpperCase()} — ${c.title ?? '—'} · ${termStr} · Sec ${o.section_name ?? 'A'}`,
          };
        })
      );
    }
    if (instructorData) {
      setInstructors(
        instructorData.map((i: any) => {
          const u = i.users ?? {};
          return {
            id: i.user_id,
            name: [u.first_name, u.last_name].filter(Boolean).join(' ') || '(unnamed)',
          };
        })
      );
    }
  }, []);

  useEffect(() => {
    fetchRows();
    fetchOptions();
  }, [fetchRows, fetchOptions]);

  // ─── Modal helpers ────────────────────────────────────────────────
  const openAddModal = useCallback(() => {
    setEditingId(null);
    setForm(initialForm);
    setSubmitError('');
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback((r: CourseInstructor) => {
    setEditingId(r.id);
    setForm({ offeringId: r.offeringId, instructorId: r.instructorId, role: r.role });
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

    if (!form.offeringId) { setSubmitError('Course offering is required.'); return; }
    if (!form.instructorId) { setSubmitError('Instructor is required.'); return; }

    setIsSubmitting(true);
    const supabase = createClient();

    // Get assigned_by (current admin user)
    const { data: { user } } = await supabase.auth.getUser();
    const { data: appUser } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', user?.id)
      .single();

    let error;
    if (editingId) {
      // Only role is editable; offering + instructor are the composite key
      ({ error } = await supabase
        .from('course_instructors')
        .update({ role: form.role })
        .eq('id', editingId));
    } else {
      ({ error } = await supabase.from('course_instructors').insert({
        offering_id: form.offeringId,
        instructor_id: form.instructorId,
        role: form.role,
        assigned_by: appUser?.id ?? null,
      }));
    }

    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('uq_course_instructors')) {
        setSubmitError('This instructor is already assigned to that offering.');
      } else if (msg.includes('uix_one_primary_per_offering')) {
        setSubmitError('This offering already has a primary instructor. Change the existing one first.');
      } else {
        setSubmitError(msg || `Failed to ${editingId ? 'update' : 'assign'} instructor.`);
      }
      setIsSubmitting(false);
      return;
    }

    toast.success(editingId ? 'Assignment updated.' : 'Instructor assigned.');
    setModalOpen(false);
    setForm(initialForm);
    fetchRows();
    setIsSubmitting(false);
  };

  // ─── Delete ───────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('course_instructors').delete().eq('id', deleteId);
    if (error) {
      toast.error('Failed to remove instructor assignment.');
    } else {
      toast.success('Instructor unassigned.');
      fetchRows();
    }
    setDeleteId(null);
    setIsDeleting(false);
  };

  // ─── Filter & paginate ────────────────────────────────────────────
  const filtered = rows.filter(
    (r) =>
      r.offeringLabel.toLowerCase().includes(search.toLowerCase()) ||
      r.instructorName.toLowerCase().includes(search.toLowerCase()) ||
      ROLE_LABELS[r.role]?.toLowerCase().includes(search.toLowerCase())
  );
  const totalCount = filtered.length;
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, totalCount);
  const paginated = filtered.slice(start, end);

  const roleColor = (role: string) => {
    if (role === 'primary') return 'bg-purple-100 text-purple-700';
    if (role === 'co_instructor') return 'bg-blue-100 text-blue-700';
    return 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="space-y-6">
      {/* Search and action bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md">
          <input
            type="search"
            placeholder="Search by offering, instructor, or role..."
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
          Assign Instructor
        </button>
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={closeModal} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200"
            role="dialog" aria-modal="true" aria-labelledby="ci-modal-title"
          >
            <div className="flex items-center justify-between shrink-0 p-6 pb-0">
              <h2 id="ci-modal-title" className="text-lg font-bold text-gray-900">
                {editingId ? 'Edit Assignment' : 'Assign Instructor'}
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

                {/* Course Offering */}
                <div>
                  <label htmlFor="ci-offering" className="block text-sm font-medium text-gray-700 mb-1">Course Offering *</label>
                  <select id="ci-offering" value={form.offeringId} disabled={!!editingId}
                    onChange={(e) => setForm((f) => ({ ...f, offeringId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-50 disabled:text-gray-500"
                  >
                    <option value="">— Select Offering —</option>
                    {offerings.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Instructor */}
                <div>
                  <label htmlFor="ci-instructor" className="block text-sm font-medium text-gray-700 mb-1">Instructor *</label>
                  <select id="ci-instructor" value={form.instructorId} disabled={!!editingId}
                    onChange={(e) => setForm((f) => ({ ...f, instructorId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-50 disabled:text-gray-500"
                  >
                    <option value="">— Select Instructor —</option>
                    {instructors.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                  {editingId && (
                    <p className="text-xs text-gray-500 mt-1">Offering and instructor cannot be changed. To reassign, delete this record and create a new one.</p>
                  )}
                </div>

                {/* Role */}
                <div>
                  <label htmlFor="ci-role" className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                  <select id="ci-role" value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Only one <strong>Primary</strong> instructor is allowed per offering.</p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 mt-4 shrink-0 border-t border-gray-100">
                <button type="button" onClick={closeModal} disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition disabled:opacity-50"
                >Cancel</button>
                <button type="submit" disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition disabled:opacity-50 min-w-[130px]"
                >
                  {isSubmitting
                    ? (editingId ? 'Saving...' : 'Assigning...')
                    : (editingId ? 'Save Changes' : 'Assign')}
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
            <h2 className="text-lg font-bold text-gray-900 mb-2">Remove Instructor?</h2>
            <p className="text-sm text-gray-600 mb-6">
              This will remove the instructor's assignment from the course offering. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteId(null)} disabled={isDeleting}
                className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition disabled:opacity-50"
              >Cancel</button>
              <button type="button" onClick={handleDelete} disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition disabled:opacity-50 min-w-[100px]"
              >
                {isDeleting ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Course Offering</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Instructor</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Role</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Assigned</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-500">Loading instructor assignments...</td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-500">
                    {search ? 'No assignments match your search.' : 'No instructor assignments found.'}
                  </td>
                </tr>
              ) : (
                paginated.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-sm text-gray-800 max-w-xs">
                      <span className="line-clamp-2">{r.offeringLabel}</span>
                    </td>
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{r.instructorName}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${roleColor(r.role)}`}>
                        {ROLE_LABELS[r.role] ?? r.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">{r.assignedAt}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button" onClick={() => openEditModal(r)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900" title="Edit role"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          type="button" onClick={() => setDeleteId(r.id)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-red-600" title="Remove"
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
