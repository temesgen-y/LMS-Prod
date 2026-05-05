'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { getGradeColor } from '@/utils/gradeCalculator';

// ─── Types ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;
const STATUSES = ['active', 'completed', 'dropped', 'failed'] as const;
type EnrollmentStatus = typeof STATUSES[number];

interface StudentOption {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  student_profiles: { student_no: string; profile_status: string } | null;
}

interface OfferingOption {
  id: string;
  section_name: string;
  enrolled_count: number;
  max_students: number;
  status: string;
  courses: { code: string; title: string } | null;
  academic_terms: { term_name: string; year_start: number } | null;
}

interface EnrollFormState {
  studentId: string;
  offeringId: string;
  status: EnrollmentStatus;
}

type Enrollment = {
  id: string;
  student_id: string;
  offering_id: string;
  enrolled_by: string | null;
  status: EnrollmentStatus;
  final_grade: string | null;
  final_score: number | null;
  enrolled_at: string;
  completed_at: string | null;
  dropped_at: string | null;
  student_name: string;
  student_email: string;
  offering_label: string;
  course_title: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function offeringLabel(o: OfferingOption): string {
  const code = o.courses?.code ?? '?';
  const title = o.courses?.title ?? '?';
  const term = o.academic_terms?.term_name ?? '?';
  const year = o.academic_terms?.year_start ?? '';
  const isFull = o.enrolled_count >= o.max_students;
  return `${code} — ${title} | ${term} ${year} | Section ${o.section_name} (${o.enrolled_count}/${o.max_students}${isFull ? ' FULL' : ''})`;
}

function studentLabel(s: StudentOption): string {
  const no = s.student_profiles?.student_no ?? 'no ID';
  return `${s.first_name} ${s.last_name} (${no}) — ${s.email}`;
}

const blankForm = (): EnrollFormState => ({
  studentId: '',
  offeringId: '',
  status: 'active',
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function EnrollmentsPage() {
  const supabase = createClient();

  // Enrollment list state
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterOffering, setFilterOffering] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Enrollment | null>(null);

  // Dropdown data state
  const [allStudents, setAllStudents] = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const [availableStudents, setAvailableStudents] = useState<StudentOption[]>([]);

  const [offerings, setOfferings] = useState<OfferingOption[]>([]);
  const [offeringsLoading, setOfferingsLoading] = useState(false);
  const [offeringsError, setOfferingsError] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Enrollment | null>(null);
  const [form, setForm] = useState<EnrollFormState>(blankForm());
  const [formErrors, setFormErrors] = useState<{ student?: string; offering?: string }>({});
  const [saving, setSaving] = useState(false);

  // Actor identity (registrar user)
  const [actorUserId, setActorUserId] = useState('');

  // ── Load actor identity ──────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()
        .then(({ data }) => { if (data) setActorUserId((data as { id: string }).id); });
    });
  }, []);

  // ── Load enrollments list ────────────────────────────────────────────────

  const loadEnrollments = useCallback(async () => {
    setListLoading(true);
    const { data, error } = await supabase
      .from('enrollments')
      .select(`
        id, student_id, offering_id, enrolled_by, status,
        final_grade, final_score, enrolled_at, completed_at, dropped_at,
        users!fk_enrollments_student(first_name, last_name, email),
        course_offerings!fk_enrollments_offering(
          section_name, courses!fk_course_offerings_course(code, title)
        )
      `)
      .order('enrolled_at', { ascending: false });

    if (error) { toast.error(error.message); setListLoading(false); return; }

    setEnrollments((data ?? []).map((r: any) => ({
      id: r.id,
      student_id: r.student_id,
      offering_id: r.offering_id,
      enrolled_by: r.enrolled_by,
      status: r.status,
      final_grade: r.final_grade,
      final_score: r.final_score,
      enrolled_at: r.enrolled_at,
      completed_at: r.completed_at,
      dropped_at: r.dropped_at,
      student_name: r.users ? `${r.users.first_name} ${r.users.last_name}` : '—',
      student_email: r.users?.email ?? '',
      offering_label: r.course_offerings
        ? `${r.course_offerings.courses?.code ?? ''} – ${r.course_offerings.section_name}`
        : '—',
      course_title: r.course_offerings?.courses?.title ?? '—',
    })));
    setListLoading(false);
  }, []);

  // ── Load students dropdown data ──────────────────────────────────────────

  const loadStudents = useCallback(async () => {
    setStudentsLoading(true);
    setStudentsError('');
    const { data, error } = await supabase
      .from('users')
      .select(`
        id, email, first_name, last_name,
        student_profiles!user_id(student_no, profile_status)
      `)
      .in('role', ['STUDENT', 'student'])
      .in('status', ['ACTIVE', 'active'])
      .order('last_name', { ascending: true });

    if (error) {
      setStudentsError('Failed to load students');
      setStudentsLoading(false);
      return;
    }
    const mapped = (data ?? []).map((r: any) => ({
      id: r.id,
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name,
      student_profiles: r.student_profiles ?? null,
    })) as StudentOption[];

    setAllStudents(mapped);
    setAvailableStudents(mapped);
    setStudentsLoading(false);
  }, []);

  // ── Load offerings dropdown data ─────────────────────────────────────────

  const loadOfferings = useCallback(async () => {
    setOfferingsLoading(true);
    setOfferingsError('');
    const { data, error } = await supabase
      .from('course_offerings')
      .select(`
        id, section_name, enrolled_count, max_students, status,
        courses(code, title),
        academic_terms(term_name, year_start)
      `)
      .in('status', ['upcoming', 'active'])
      .order('section_name', { ascending: true });

    if (error) {
      setOfferingsError('Failed to load offerings');
      setOfferingsLoading(false);
      return;
    }
    setOfferings(
      (data ?? []).map((row) => ({
        ...row,
        courses: Array.isArray(row.courses) ? (row.courses[0] ?? null) : row.courses,
        academic_terms: Array.isArray(row.academic_terms) ? (row.academic_terms[0] ?? null) : row.academic_terms,
      })) as OfferingOption[]
    );
    setOfferingsLoading(false);
  }, []);

  useEffect(() => {
    loadEnrollments();
    loadStudents();
    loadOfferings();
  }, []);

  // ── Filter out already-enrolled students when offering changes ───────────

  const handleOfferingChange = useCallback(async (offeringId: string) => {
    setForm(f => ({ ...f, offeringId, studentId: '' }));
    setFormErrors(e => ({ ...e, offering: undefined }));

    if (!offeringId) {
      setAvailableStudents(allStudents);
      return;
    }

    const { data: enrolled } = await supabase
      .from('enrollments')
      .select('student_id')
      .eq('offering_id', offeringId)
      .neq('status', 'dropped');

    const enrolledIds = new Set((enrolled ?? []).map((e: any) => e.student_id));
    setAvailableStudents(allStudents.filter(s => !enrolledIds.has(s.id)));
  }, [allStudents]);

  // ── Modal open/close ─────────────────────────────────────────────────────

  const openAdd = () => {
    setEditing(null);
    setForm(blankForm());
    setFormErrors({});
    setAvailableStudents(allStudents);
    setShowModal(true);
  };

  const openEdit = (e: Enrollment) => {
    setEditing(e);
    setForm({ studentId: e.student_id, offeringId: e.offering_id, status: e.status });
    setFormErrors({});
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditing(null); };

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSave = async () => {
    // Validate
    const errors: { student?: string; offering?: string } = {};
    if (!form.studentId) errors.student = 'Please select a student';
    if (!form.offeringId) errors.offering = 'Please select a course offering';

    if (!editing && form.offeringId) {
      const selected = offerings.find(o => o.id === form.offeringId);
      if (selected && selected.enrolled_count >= selected.max_students) {
        errors.offering = 'This offering is at full capacity';
      }
    }

    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    setSaving(true);

    if (editing) {
      // Edit mode: only status can change
      const extras: any = {};
      if (form.status === 'completed' && !editing.completed_at) extras.completed_at = new Date().toISOString();
      if (form.status === 'dropped' && !editing.dropped_at) extras.dropped_at = new Date().toISOString();

      const { error } = await supabase
        .from('enrollments')
        .update({ status: form.status, ...extras })
        .eq('id', editing.id);

      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Enrollment updated');
      setSaving(false);
      closeModal();
      loadEnrollments();
      return;
    }

    // New enrollment — no final_grade / final_score
    const { data: newEnrollment, error } = await supabase
      .from('enrollments')
      .insert({
        student_id:  form.studentId,
        offering_id: form.offeringId,
        enrolled_by: actorUserId || null,
        status:      form.status,
      })
      .select()
      .single();

    if (error) {
      const msg = error.code === '23505'
        ? 'This student is already enrolled in the selected offering.'
        : 'Enrollment failed. Please try again.';
      toast.error(msg);
      setSaving(false);
      return;
    }

    // Audit log (non-blocking)
    if (actorUserId && newEnrollment) {
      await supabase.from('audit_logs').insert({
        actor_id:   actorUserId,
        action:     'enrollment.create',
        table_name: 'enrollments',
        record_id:  (newEnrollment as any).id,
        old_value:  null,
        new_value:  {
          student_id:  form.studentId,
          offering_id: form.offeringId,
          status:      form.status,
        },
      });
    }

    toast.success('Student has been successfully enrolled.');
    setSaving(false);
    closeModal();
    loadEnrollments();
    // Refresh offerings so enrolled_count updates
    loadOfferings();
  };

  // ── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('enrollments').delete().eq('id', deleteTarget.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Enrollment removed');
    setDeleteTarget(null);
    loadEnrollments();
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      completed: 'bg-blue-100 text-blue-700',
      dropped: 'bg-gray-100 text-gray-500',
      failed: 'bg-red-100 text-red-600',
    };
    return map[s] ?? 'bg-gray-100 text-gray-600';
  };

  const filtered = enrollments
    .filter(e => !filterOffering || e.offering_id === filterOffering)
    .filter(e => !filterStatus || e.status === filterStatus)
    .filter(e => !search || `${e.student_name} ${e.student_email}`.toLowerCase().includes(search.toLowerCase()));

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Enrollments</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manually enroll students and monitor all enrollments</p>
        </div>
        <button onClick={openAdd} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
          + Enroll Student
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {STATUSES.map(s => {
          const count = enrollments.filter(e => e.status === s).length;
          const colors: Record<string, string> = { active: 'text-green-600', completed: 'text-blue-600', dropped: 'text-gray-500', failed: 'text-red-600' };
          return (
            <button
              key={s}
              onClick={() => { setFilterStatus(filterStatus === s ? '' : s); setPage(1); }}
              className={`bg-white rounded-xl border p-4 text-left hover:shadow-sm transition ${filterStatus === s ? 'border-primary ring-1 ring-primary' : 'border-gray-200'}`}
            >
              <div className={`text-2xl font-bold ${colors[s]}`}>{count}</div>
              <div className="text-xs text-gray-500 mt-0.5 capitalize">{s}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="search"
          placeholder="Search student…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56"
        />
        <select value={filterOffering} onChange={e => { setFilterOffering(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All Offerings</option>
          {offerings.map(o => <option key={o.id} value={o.id}>{offeringLabel(o)}</option>)}
        </select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      {/* Table */}
      {listLoading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Student', 'Email', 'Course', 'Course Offering', 'Status', 'Grade', 'Score', 'Enrolled', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.length === 0 ? (
                  <tr><td colSpan={9} className="px-3 py-10 text-center text-gray-400">No enrollments found</td></tr>
                ) : paginated.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{e.student_name}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs">{e.student_email}</td>
                    <td className="px-3 py-3 text-indigo-600 text-xs font-medium">{e.course_title}</td>
                    <td className="px-3 py-3 text-gray-700 text-xs">{e.offering_label}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(e.status)}`}>
                        {e.status.charAt(0).toUpperCase() + e.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {e.final_grade ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getGradeColor(e.final_grade)}`}>{e.final_grade}</span>
                      ) : (
                        <span className="text-xs text-gray-400">Pending</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-600">{e.final_score !== null ? e.final_score : <span className="text-xs text-gray-400">—</span>}</td>
                    <td className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap">{new Date(e.enrolled_at).toLocaleDateString()}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(e)} className="text-blue-600 hover:underline text-xs">Edit</button>
                        <button onClick={() => setDeleteTarget(e)} className="text-red-500 hover:underline text-xs">Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded border text-sm disabled:opacity-40">Prev</button>
              <span className="px-3 py-1 text-sm text-gray-600">{page}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 rounded border text-sm disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}

      {/* ── Add / Edit Modal ──────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">{editing ? 'Edit Enrollment' : 'Enroll Student'}</h2>
            <div className="space-y-4">

              {/* Student */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Student <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.studentId}
                  onChange={e => {
                    setForm(f => ({ ...f, studentId: e.target.value }));
                    setFormErrors(fe => ({ ...fe, student: undefined }));
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  disabled={!!editing || studentsLoading}
                >
                  {studentsLoading ? (
                    <option value="" disabled>Loading students…</option>
                  ) : studentsError ? (
                    <option value="" disabled>{studentsError}</option>
                  ) : availableStudents.length === 0 ? (
                    <option value="" disabled>No eligible students available</option>
                  ) : (
                    <>
                      <option value="">Select student…</option>
                      {availableStudents.map(s => (
                        <option key={s.id} value={s.id}>{studentLabel(s)}</option>
                      ))}
                    </>
                  )}
                </select>
                {formErrors.student && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.student}</p>
                )}
                {editing && (
                  <p className="text-xs text-gray-400 mt-1">Student cannot be changed after enrollment.</p>
                )}
              </div>

              {/* Course Offering */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Course Offering <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.offeringId}
                  onChange={e => handleOfferingChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  disabled={!!editing || offeringsLoading}
                >
                  {offeringsLoading ? (
                    <option value="" disabled>Loading offerings…</option>
                  ) : offeringsError ? (
                    <option value="" disabled>{offeringsError}</option>
                  ) : offerings.length === 0 ? (
                    <option value="" disabled>No active offerings available</option>
                  ) : (
                    <>
                      <option value="">Select offering…</option>
                      {offerings.map(o => {
                        const isFull = o.enrolled_count >= o.max_students;
                        return (
                          <option key={o.id} value={o.id} disabled={isFull}>
                            {offeringLabel(o)}
                          </option>
                        );
                      })}
                    </>
                  )}
                </select>
                {formErrors.offering && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.offering}</p>
                )}
                {editing && (
                  <p className="text-xs text-gray-400 mt-1">Offering cannot be changed after enrollment.</p>
                )}
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as EnrollmentStatus }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="dropped">Dropped</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-2 rounded-lg border text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? 'Saving…' : editing ? 'Update' : 'Enroll'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-2">Remove Enrollment?</h2>
            <p className="text-sm text-gray-600 mb-4">
              Remove <strong>{deleteTarget.student_name}</strong> from{' '}
              <strong>{deleteTarget.offering_label}</strong>?
              This will delete associated grades and progress records.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
