'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

type Course = {
  id: string;
  code: string;
  title: string;
  description: string;
  departmentName: string;
  level: string;
  creditHours: number;
  isActive: boolean;
  createdAt: string;
  enrollments: number;
  instructorName: string;
};

type DepartmentOption = { id: string; name: string };

const PAGE_SIZE = 10;
const LEVELS = ['100', '200', '300', '400', 'postgraduate'];

const initialForm = {
  code: '', title: '', description: '',
  departmentId: '', level: '100', creditHours: '3', isActive: true,
};

const statusBadge = (active: boolean) =>
  active
    ? 'border border-green-400 text-green-600 bg-green-50'
    : 'border border-amber-400 text-amber-600 bg-amber-50';

export default function AdminCoursesPage() {
  const [courses, setCourses]       = useState<Course[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [modalOpen, setModalOpen]   = useState(false);
  const [form, setForm]             = useState(initialForm);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('courses')
      .select(`
        id, code, title, description, credit_hours, level, is_active, created_at,
        departments!fk_courses_department(name),
        course_offerings!fk_course_offerings_course(
          enrolled_count,
          course_instructors!fk_course_instructors_offering(
            role,
            users!fk_course_instructors_instructor(first_name, last_name)
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load courses.');
    } else {
      setCourses(
        (data ?? []).map((row: any) => {
          const offerings: any[] = row.course_offerings ?? [];
          const totalEnrollments = offerings.reduce((s: number, o: any) => s + (o.enrolled_count ?? 0), 0);

          // Find primary instructor from any offering
          let instructorName = '—';
          for (const o of offerings) {
            const primary = (o.course_instructors ?? []).find((ci: any) => ci.role === 'primary');
            if (primary?.users) {
              const { first_name, last_name } = primary.users;
              instructorName = `${first_name ?? ''} ${last_name ?? ''}`.trim() || '—';
              break;
            }
          }

          return {
            id: row.id,
            code: row.code ?? '—',
            title: row.title ?? '—',
            description: row.description ?? '',
            departmentName: row.departments?.name ?? '—',
            level: row.level ?? '—',
            creditHours: row.credit_hours ?? 0,
            isActive: row.is_active ?? false,
            createdAt: row.created_at ?? '',
            enrollments: totalEnrollments,
            instructorName,
          };
        })
      );
    }
    setLoading(false);
  }, []);

  const fetchDepartments = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from('departments').select('id, name').eq('is_active', true).order('name');
    if (data) setDepartments(data.map((d: any) => ({ id: d.id, name: d.name })));
  }, []);

  useEffect(() => { fetchCourses(); fetchDepartments(); }, [fetchCourses, fetchDepartments]);

  const openModal  = () => { setForm(initialForm); setSubmitError(''); setModalOpen(true); };
  const closeModal = () => { if (!isSubmitting) setModalOpen(false); };

  useEffect(() => {
    if (!modalOpen) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [modalOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    const code = form.code.trim().toLowerCase();
    const title = form.title.trim();
    const creditHours = parseInt(form.creditHours, 10);
    if (!code)  { setSubmitError('Course code is required.'); return; }
    if (!title) { setSubmitError('Course title is required.'); return; }
    if (!form.departmentId) { setSubmitError('Department is required.'); return; }
    if (!creditHours || creditHours < 1 || creditHours > 6) { setSubmitError('Credit hours must be 1–6.'); return; }

    setIsSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: appUser } = await supabase.from('users').select('id').eq('auth_user_id', user?.id).single();
    if (!appUser) { setSubmitError('Could not identify current user.'); setIsSubmitting(false); return; }

    const { error } = await supabase.from('courses').insert({
      code, title,
      description: form.description.trim() || null,
      department_id: form.departmentId,
      level: form.level,
      credit_hours: creditHours,
      is_active: form.isActive,
      created_by: (appUser as any).id,
    });

    if (error) {
      setSubmitError(error.message.includes('uq_courses_code')
        ? 'A course with this code already exists.'
        : error.message || 'Failed to create course.');
      setIsSubmitting(false);
      return;
    }

    toast.success(`Course "${title}" created.`);
    setModalOpen(false);
    fetchCourses();
    setIsSubmitting(false);
  };

  const filtered = courses.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.departmentName.toLowerCase().includes(search.toLowerCase()) ||
    c.instructorName.toLowerCase().includes(search.toLowerCase())
  );

  const totalCount = filtered.length;
  const start      = (page - 1) * PAGE_SIZE;
  const end        = Math.min(start + PAGE_SIZE, totalCount);
  const paginated  = filtered.slice(start, end);

  return (
    <div>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="relative w-72">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder="Search courses..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <button
          type="button" onClick={openModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Course
        </button>
      </div>

      {/* ── Create Course Modal ───────────────────────────────────────────── */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={closeModal} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200" role="dialog" aria-modal>
            <div className="flex items-center justify-between p-6 pb-0">
              <h2 className="text-lg font-bold text-gray-900">Create Course</h2>
              <button type="button" onClick={closeModal} disabled={isSubmitting} className="p-1.5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-50">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 p-6">
              <div className="space-y-4 overflow-y-auto pr-1 max-h-[60vh]">
                {submitError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{submitError}</div>}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                  <input type="text" required value={form.code} placeholder="e.g. cs301"
                    onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input type="text" required value={form.title} placeholder="e.g. Introduction to Databases"
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
                  <select value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                    <option value="">— Select —</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Level *</label>
                    <select value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                      {LEVELS.map(l => <option key={l} value={l}>{l === 'postgraduate' ? 'Postgraduate' : `Level ${l}`}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Credit Hours *</label>
                    <input type="number" min={1} max={6} required value={form.creditHours}
                      onChange={e => setForm(f => ({ ...f, creditHours: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="active" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-primary" />
                  <label htmlFor="active" className="text-sm font-medium text-gray-700">Active</label>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-gray-100">
                <button type="button" onClick={closeModal} disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50 min-w-[110px]">
                  {isSubmitting ? 'Creating…' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Title', 'Department', 'Instructor', 'Status', 'Enrollments', 'Created', 'Credits', 'Level', 'Actions'].map(h => (
                  <th key={h} className={`px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider ${h === 'Actions' ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">{search ? 'No courses match your search.' : 'No courses found.'}</td></tr>
              ) : paginated.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3.5 font-semibold text-gray-900 whitespace-nowrap">{c.title}</td>
                  <td className="px-4 py-3.5 text-gray-500 text-xs">{c.departmentName}</td>
                  <td className="px-4 py-3.5 text-gray-500 text-xs whitespace-nowrap">{c.instructorName}</td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-block px-3 py-0.5 rounded-full text-xs font-medium ${statusBadge(c.isActive)}`}>
                      {c.isActive ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-gray-600">{c.enrollments}</td>
                  <td className="px-4 py-3.5 text-gray-500 text-xs whitespace-nowrap">
                    {c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-gray-600 text-center">{c.creditHours}</td>
                  <td className="px-4 py-3.5 text-gray-500 text-xs">
                    {c.level === 'postgraduate' ? 'Postgrad' : `Level ${c.level}`}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-3">
                      <button type="button" className="text-gray-400 hover:text-gray-600 transition" title="View">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                      <button type="button" className="text-gray-400 hover:text-indigo-600 transition" title="Edit">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button type="button" className="text-gray-400 hover:text-red-500 transition" title="Delete">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination footer */}
        {!loading && totalCount > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-400">Showing {start + 1}–{end} of {totalCount}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button onClick={() => setPage(p => Math.min(Math.ceil(totalCount / PAGE_SIZE), p + 1))} disabled={end >= totalCount}
                className="p-1.5 rounded border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
