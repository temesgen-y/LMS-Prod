'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
  prereqCount: number;
};

type DepartmentOption = { id: string; name: string };

type PrereqEntry = {
  id: string;
  prerequisiteId: string;
  prerequisiteCode: string;
  prerequisiteTitle: string;
  minGrade: string;
  isRequired: boolean;
};

const PAGE_SIZE = 10;
const LEVELS = ['100', '200', '300', '400', 'postgraduate'];
const GRADE_OPTIONS = ['A', 'B', 'C', 'D', 'F'] as const;

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

  // Prerequisites modal state
  const [prereqCourse, setPrereqCourse]     = useState<Course | null>(null);
  const [prereqs, setPrereqs]               = useState<PrereqEntry[]>([]);
  const [prereqLoading, setPrereqLoading]   = useState(false);
  const [prereqSearch, setPrereqSearch]     = useState('');
  const [prereqResults, setPrereqResults]   = useState<Course[]>([]);
  const [prereqSearching, setPrereqSearching] = useState(false);
  const [prereqMinGrade, setPrereqMinGrade] = useState<string>('D');
  const [prereqRequired, setPrereqRequired] = useState(true);
  const [prereqAdding, setPrereqAdding]     = useState(false);
  const [prereqRemoving, setPrereqRemoving] = useState<string | null>(null);
  const prereqTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    if (error) { toast.error('Failed to load courses.'); setLoading(false); return; }

    const courseIds = (data ?? []).map((r: any) => r.id);
    const prereqCounts: Record<string, number> = {};
    if (courseIds.length > 0) {
      const { data: prereqRows } = await supabase
        .from('course_prerequisites')
        .select('course_id')
        .in('course_id', courseIds);
      (prereqRows ?? []).forEach((p: any) => {
        prereqCounts[p.course_id] = (prereqCounts[p.course_id] ?? 0) + 1;
      });
    }

    setCourses(
      (data ?? []).map((row: any) => {
        const offerings: any[] = row.course_offerings ?? [];
        const totalEnrollments = offerings.reduce((s: number, o: any) => s + (o.enrolled_count ?? 0), 0);
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
          id: row.id, code: row.code ?? '—', title: row.title ?? '—',
          description: row.description ?? '', departmentName: row.departments?.name ?? '—',
          level: row.level ?? '—', creditHours: row.credit_hours ?? 0,
          isActive: row.is_active ?? false, createdAt: row.created_at ?? '',
          enrollments: totalEnrollments, instructorName,
          prereqCount: prereqCounts[row.id] ?? 0,
        };
      })
    );
    setLoading(false);
  }, []);

  // ── Prerequisites management ─────────────────────────────────────────────
  const openPrereqModal = useCallback(async (course: Course) => {
    setPrereqCourse(course);
    setPrereqSearch('');
    setPrereqResults([]);
    setPrereqMinGrade('D');
    setPrereqRequired(true);
    setPrereqLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('course_prerequisites')
      .select('id, prerequisite_id, min_grade, is_required, courses!course_prerequisites_prerequisite_id_fkey(code, title)')
      .eq('course_id', course.id)
      .order('created_at');
    setPrereqs((data ?? []).map((p: any) => ({
      id: p.id,
      prerequisiteId: p.prerequisite_id,
      prerequisiteCode: p.courses?.code ?? '—',
      prerequisiteTitle: p.courses?.title ?? '—',
      minGrade: p.min_grade ?? 'D',
      isRequired: p.is_required ?? true,
    })));
    setPrereqLoading(false);
  }, []);

  const searchPrereqCourses = useCallback(async (q: string) => {
    if (!prereqCourse || q.length < 2) { setPrereqResults([]); return; }
    setPrereqSearching(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('courses')
      .select('id, code, title, level')
      .or(`title.ilike.%${q}%,code.ilike.%${q}%`)
      .neq('id', prereqCourse.id)
      .eq('is_active', true)
      .limit(8);
    const existingIds = new Set(prereqs.map(p => p.prerequisiteId));
    setPrereqResults(
      (data ?? [])
        .filter((c: any) => !existingIds.has(c.id))
        .map((c: any) => ({ ...c, prereqCount: 0, enrollments: 0, description: '', departmentName: '', instructorName: '', creditHours: 0, isActive: true, createdAt: '' }))
    );
    setPrereqSearching(false);
  }, [prereqCourse, prereqs]);

  useEffect(() => {
    if (prereqTimerRef.current) clearTimeout(prereqTimerRef.current);
    prereqTimerRef.current = setTimeout(() => searchPrereqCourses(prereqSearch), 300);
    return () => { if (prereqTimerRef.current) clearTimeout(prereqTimerRef.current); };
  }, [prereqSearch, searchPrereqCourses]);

  const addPrereq = async (prereqCourseId: string, prereqCode: string, prereqTitle: string) => {
    if (!prereqCourse) return;
    setPrereqAdding(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('course_prerequisites')
      .insert({ course_id: prereqCourse.id, prerequisite_id: prereqCourseId, min_grade: prereqMinGrade, is_required: prereqRequired })
      .select('id')
      .single();
    if (error) { toast.error('Failed to add prerequisite.'); setPrereqAdding(false); return; }
    setPrereqs(prev => [...prev, { id: data.id, prerequisiteId: prereqCourseId, prerequisiteCode: prereqCode, prerequisiteTitle: prereqTitle, minGrade: prereqMinGrade, isRequired: prereqRequired }]);
    setPrereqSearch('');
    setPrereqResults([]);
    setCourses(prev => prev.map(c => c.id === prereqCourse.id ? { ...c, prereqCount: c.prereqCount + 1 } : c));
    toast.success(`Added ${prereqCode} as prerequisite`);
    setPrereqAdding(false);
  };

  const removePrereq = async (prereqId: string, prereqCode: string) => {
    if (!prereqCourse) return;
    setPrereqRemoving(prereqId);
    const supabase = createClient();
    const { error } = await supabase.from('course_prerequisites').delete().eq('id', prereqId);
    if (error) { toast.error('Failed to remove prerequisite.'); setPrereqRemoving(null); return; }
    setPrereqs(prev => prev.filter(p => p.id !== prereqId));
    setCourses(prev => prev.map(c => c.id === prereqCourse.id ? { ...c, prereqCount: Math.max(0, c.prereqCount - 1) } : c));
    toast.success(`Removed ${prereqCode}`);
    setPrereqRemoving(null);
  };

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
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openPrereqModal(c)}
                        title="Manage prerequisites"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-violet-50 text-violet-700 hover:bg-violet-100 transition border border-violet-200"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Prereqs
                        {c.prereqCount > 0 && (
                          <span className="ml-0.5 bg-violet-600 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                            {c.prereqCount}
                          </span>
                        )}
                      </button>
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

      {/* ── Prerequisites Modal ──────────────────────────────────────────── */}
      {prereqCourse && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={() => setPrereqCourse(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden" role="dialog" aria-modal>
            {/* Header */}
            <div className="bg-[#4c1d95] px-5 py-4 shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-purple-300 mb-0.5">Prerequisites</p>
                  <h2 className="text-base font-bold text-white leading-tight">{prereqCourse.title}</h2>
                  <p className="text-xs text-purple-300 mt-0.5">{(prereqCourse.code ?? '').toUpperCase()}</p>
                </div>
                <button type="button" onClick={() => setPrereqCourse(null)} className="p-1.5 rounded text-purple-300 hover:bg-white/10 mt-0.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="flex flex-col flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
              {/* Current prerequisites list */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Required Before Enrollment ({prereqs.length})
                </p>
                {prereqLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-gray-400 animate-pulse">
                    <div className="w-4 h-4 rounded-full border-2 border-[#4c1d95] border-t-transparent animate-spin" /> Loading…
                  </div>
                ) : prereqs.length === 0 ? (
                  <p className="text-sm text-gray-400 italic py-2">No prerequisites set. Students can enroll freely.</p>
                ) : (
                  <div className="space-y-2">
                    {prereqs.map(p => (
                      <div key={p.id} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold text-[#4c1d95] bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5 shrink-0">
                            {(p.prerequisiteCode ?? '').toUpperCase()}
                          </span>
                          <span className="text-sm text-gray-800 font-medium truncate">{p.prerequisiteTitle}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${p.isRequired ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'}`}>
                            {p.isRequired ? 'Required' : 'Recommended'}
                          </span>
                          <span className="text-[10px] font-semibold bg-gray-200 text-gray-600 rounded px-1.5 py-0.5">
                            Min {p.minGrade}
                          </span>
                          <button
                            type="button"
                            onClick={() => removePrereq(p.id, p.prerequisiteCode)}
                            disabled={prereqRemoving === p.id}
                            className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-50"
                          >
                            {prereqRemoving === p.id
                              ? <svg className="w-3.5 h-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4Z"/></svg>
                              : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            }
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add prerequisite */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add Prerequisite</p>

                {/* Search */}
                <div className="relative mb-3">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="search"
                    placeholder="Search course by code or title…"
                    value={prereqSearch}
                    onChange={e => setPrereqSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95]"
                  />
                </div>

                {/* Search results */}
                {prereqSearching && (
                  <p className="text-xs text-gray-400 animate-pulse mb-2">Searching…</p>
                )}
                {prereqResults.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden mb-3 divide-y divide-gray-100">
                    {prereqResults.map(r => (
                      <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-gray-50">
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-[#4c1d95]">{(r.code ?? '').toUpperCase()}</span>
                          <span className="text-xs text-gray-700 ml-1.5">{r.title}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => addPrereq(r.id, r.code, r.title)}
                          disabled={prereqAdding}
                          className="shrink-0 text-xs font-semibold px-2.5 py-1 bg-[#4c1d95] text-white rounded-lg hover:bg-[#3b0764] disabled:opacity-50 transition"
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Options row */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-medium text-gray-600">Min Grade:</label>
                    <select
                      value={prereqMinGrade}
                      onChange={e => setPrereqMinGrade(e.target.value)}
                      className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#4c1d95]/30"
                    >
                      {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={prereqRequired}
                      onChange={e => setPrereqRequired(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-gray-300 accent-[#4c1d95]"
                    />
                    <span className="text-xs font-medium text-gray-600">Required (blocks enrollment if unmet)</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex justify-end">
              <button type="button" onClick={() => setPrereqCourse(null)}
                className="px-4 py-2 rounded-lg bg-[#4c1d95] text-white text-sm font-medium hover:bg-[#3b0764] transition">
                Done
              </button>
            </div>
          </div>
        </>
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
