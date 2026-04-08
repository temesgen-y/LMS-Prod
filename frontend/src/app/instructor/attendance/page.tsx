'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

const PAGE_SIZE = 15;
const STATUSES = ['present', 'absent', 'late', 'excused'] as const;
type AttendanceStatus = typeof STATUSES[number];

type AttendanceRow = {
  id: string;
  enrollment_id: string;
  student_id: string;
  offering_id: string;
  live_session_id: string | null;
  lesson_id: string | null;
  type: 'live_session' | 'lesson';
  status: AttendanceStatus;
  attendance_date: string;
  note: string | null;
  marked_at: string | null;
  student_name?: string;
  session_title?: string;
};

type OfferingOption = { id: string; label: string };
type EnrollmentOption = { id: string; student_id: string; student_name: string };
type LiveSessionOption = { id: string; title: string };
type LessonOption = { id: string; title: string };

const blank = () => ({
  enrollment_id: '',
  student_id: '',
  offering_id: '',
  type: 'live_session' as 'live_session' | 'lesson',
  live_session_id: null as string | null,
  lesson_id: null as string | null,
  status: 'present' as AttendanceStatus,
  attendance_date: new Date().toISOString().split('T')[0],
  note: '',
});

export default function AttendancePage() {
  const supabase = createClient();

  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [offerings, setOfferings] = useState<OfferingOption[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentOption[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSessionOption[]>([]);
  const [lessons, setLessons] = useState<LessonOption[]>([]);

  const [filterOffering, setFilterOffering] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AttendanceRow | null>(null);
  const [form, setForm] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AttendanceRow | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');

  const loadOfferings = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    const { data: userData } = await supabase.from('users').select('id').eq('auth_user_id', authData.user.id).single();
    if (!userData) return;
    setCurrentUserId(userData.id);
    const { data: ciRows } = await supabase
      .from('course_instructors')
      .select('offering_id, course_offerings!fk_course_instructors_offering(id, section_name, courses!fk_course_offerings_course(code, title))')
      .eq('instructor_id', userData.id);
    if (!ciRows) return;
    setOfferings(ciRows.map((r: any) => ({
      id: r.offering_id,
      label: `${r.course_offerings?.courses?.code ?? ''} – ${r.course_offerings?.section_name ?? r.offering_id}`,
    })));
  }, []);

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setLoading(false); return; }
    const { data: userData } = await supabase.from('users').select('id').eq('auth_user_id', authData.user.id).single();
    if (!userData) { setLoading(false); return; }

    const { data: ciRows } = await supabase.from('course_instructors').select('offering_id').eq('instructor_id', userData.id);
    const offeringIds = (ciRows ?? []).map((r: any) => r.offering_id);
    if (!offeringIds.length) { setRows([]); setLoading(false); return; }

    const { data, error } = await supabase
      .from('attendance')
      .select(`
        id, enrollment_id, student_id, offering_id, live_session_id, lesson_id,
        type, status, attendance_date, note, marked_at,
        users!fk_attendance_student(first_name, last_name),
        live_sessions!fk_attendance_live_session(title),
        lessons!fk_attendance_lesson(title)
      `)
      .in('offering_id', offeringIds)
      .order('attendance_date', { ascending: false });

    if (error) { toast.error(error.message); setLoading(false); return; }

    setRows((data ?? []).map((r: any) => ({
      id: r.id,
      enrollment_id: r.enrollment_id,
      student_id: r.student_id,
      offering_id: r.offering_id,
      live_session_id: r.live_session_id,
      lesson_id: r.lesson_id,
      type: r.type,
      status: r.status,
      attendance_date: r.attendance_date,
      note: r.note,
      marked_at: r.marked_at,
      student_name: r.users ? `${r.users.first_name} ${r.users.last_name}` : '—',
      session_title: r.live_sessions?.title ?? r.lessons?.title ?? '—',
    })));
    setLoading(false);
  }, []);

  useEffect(() => { loadOfferings(); loadAttendance(); }, []);

  const loadFormData = async (offeringId: string) => {
    const { data: enRows } = await supabase
      .from('enrollments')
      .select('id, student_id, users!fk_enrollments_student(first_name, last_name)')
      .eq('offering_id', offeringId).eq('status', 'active');
    setEnrollments((enRows ?? []).map((r: any) => ({
      id: r.id,
      student_id: r.student_id,
      student_name: r.users ? `${r.users.first_name} ${r.users.last_name}` : r.student_id,
    })));
    const { data: lsRows } = await supabase.from('live_sessions').select('id, title').eq('offering_id', offeringId);
    setLiveSessions(lsRows ?? []);
    const { data: lessonRows } = await supabase.from('lessons').select('id, title').eq('offering_id', offeringId);
    setLessons(lessonRows ?? []);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(blank());
    setEnrollments([]); setLiveSessions([]); setLessons([]);
    if (filterOffering) {
      setForm(f => ({ ...f, offering_id: filterOffering }));
      loadFormData(filterOffering);
    }
    setShowModal(true);
  };

  const openEdit = (row: AttendanceRow) => {
    setEditing(row);
    setForm({
      enrollment_id: row.enrollment_id,
      student_id: row.student_id,
      offering_id: row.offering_id,
      type: row.type,
      live_session_id: row.live_session_id,
      lesson_id: row.lesson_id,
      status: row.status,
      attendance_date: row.attendance_date,
      note: row.note ?? '',
    });
    setShowModal(true);
  };

  const handleOfferingChange = (id: string) => {
    setForm(f => ({ ...f, offering_id: id, enrollment_id: '', student_id: '', live_session_id: null, lesson_id: null }));
    if (id) loadFormData(id);
  };

  const handleSave = async () => {
    if (!form.offering_id) { toast.error('Select an offering'); return; }
    if (!form.enrollment_id) { toast.error('Select a student'); return; }
    if (form.type === 'live_session' && !form.live_session_id) { toast.error('Select a live session'); return; }
    if (form.type === 'lesson' && !form.lesson_id) { toast.error('Select a lesson'); return; }

    setSaving(true);
    const payload = {
      enrollment_id: form.enrollment_id,
      student_id: form.student_id,
      offering_id: form.offering_id,
      live_session_id: form.type === 'live_session' ? form.live_session_id : null,
      lesson_id: form.type === 'lesson' ? form.lesson_id : null,
      type: form.type,
      status: form.status,
      attendance_date: form.attendance_date,
      note: form.note || null,
      marked_by: currentUserId,
      marked_at: new Date().toISOString(),
    };

    if (editing) {
      const { error } = await supabase.from('attendance').update(payload).eq('id', editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Attendance updated');
    } else {
      const { error } = await supabase.from('attendance').insert(payload);
      if (error) {
        if (error.message.includes('uq_attendance')) {
          toast.error('Attendance already recorded for this student and session/lesson.');
        } else {
          toast.error(error.message);
        }
        setSaving(false);
        return;
      }
      toast.success('Attendance marked');
    }
    setSaving(false);
    setShowModal(false);
    loadAttendance();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('attendance').delete().eq('id', deleteTarget.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Attendance record deleted');
    setDeleteTarget(null);
    loadAttendance();
  };

  const statusBadge = (s: AttendanceStatus) => {
    const map = { present: 'bg-green-100 text-green-700', absent: 'bg-red-100 text-red-700', late: 'bg-amber-100 text-amber-700', excused: 'bg-blue-100 text-blue-700' };
    return map[s] ?? 'bg-gray-100 text-gray-700';
  };

  const filtered = rows
    .filter(r => !filterOffering || r.offering_id === filterOffering)
    .filter(r => !filterType || r.type === filterType)
    .filter(r => !filterStatus || r.status === filterStatus);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
        <button onClick={openAdd} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
          + Mark Attendance
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select value={filterOffering} onChange={e => { setFilterOffering(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All Offerings</option>
          {offerings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All Types</option>
          <option value="live_session">Live Session</option>
          <option value="lesson">Lesson</option>
        </select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Student', 'Session / Lesson', 'Type', 'Status', 'Date', 'Note', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No attendance records found</td></tr>
                ) : paginated.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.student_name}</td>
                    <td className="px-4 py-3 text-gray-700">{row.session_title}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.type === 'live_session' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {row.type === 'live_session' ? 'Live' : 'Lesson'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(row.status)}`}>
                        {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{row.attendance_date}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[160px] truncate">{row.note || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(row)} className="text-blue-600 hover:underline text-xs">Edit</button>
                        <button onClick={() => setDeleteTarget(row)} className="text-red-500 hover:underline text-xs">Delete</button>
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

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">{editing ? 'Edit Attendance' : 'Mark Attendance'}</h2>
            <div className="space-y-4">
              {editing ? (
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                  <strong>Student:</strong> {editing.student_name} &nbsp;|&nbsp;
                  <strong>Session:</strong> {editing.session_title}
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Offering</label>
                    <select
                      value={form.offering_id}
                      onChange={e => handleOfferingChange(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Select offering…</option>
                      {offerings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Student</label>
                    <select
                      value={form.enrollment_id}
                      onChange={e => {
                        const en = enrollments.find(x => x.id === e.target.value);
                        setForm(f => ({ ...f, enrollment_id: e.target.value, student_id: en?.student_id ?? '' }));
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      disabled={!form.offering_id}
                    >
                      <option value="">Select student…</option>
                      {enrollments.map(e => <option key={e.id} value={e.id}>{e.student_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <div className="flex gap-4">
                      {(['live_session', 'lesson'] as const).map(t => (
                        <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="radio" checked={form.type === t} onChange={() => setForm(f => ({ ...f, type: t, live_session_id: null, lesson_id: null }))} />
                          {t === 'live_session' ? 'Live Session' : 'Lesson'}
                        </label>
                      ))}
                    </div>
                  </div>
                  {form.type === 'live_session' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Live Session</label>
                      <select
                        value={form.live_session_id ?? ''}
                        onChange={e => setForm(f => ({ ...f, live_session_id: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        disabled={!form.offering_id}
                      >
                        <option value="">Select session…</option>
                        {liveSessions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Lesson</label>
                      <select
                        value={form.lesson_id ?? ''}
                        onChange={e => setForm(f => ({ ...f, lesson_id: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        disabled={!form.offering_id}
                      >
                        <option value="">Select lesson…</option>
                        {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as AttendanceStatus }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={form.attendance_date}
                    onChange={e => setForm(f => ({ ...f, attendance_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                <textarea
                  rows={2}
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Any remarks…"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Saving…' : editing ? 'Update' : 'Mark'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-2">Delete Record?</h2>
            <p className="text-sm text-gray-600 mb-4">
              Remove attendance for <strong>{deleteTarget.student_name}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
