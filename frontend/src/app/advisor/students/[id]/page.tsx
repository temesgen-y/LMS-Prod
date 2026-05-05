'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import Link from 'next/link';

type Tab = 'degree_audit' | 'advising_notes' | 'appointments' | 'holds';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentInfo {
  userId: string;
  name: string;
  email: string;
  studentNo: string;
  program: string;
  programId: string | null;
  profileStatus: string;
}

interface DegreeRequirement {
  id: string;
  course_id: string;
  courseCode: string;
  courseTitle: string;
  creditHours: number;
  requirementType: string;
  minGrade: string;
  semesterRecommended: number | null;
  completed: boolean;
  earnedGrade: string | null;
}

interface AdvisingNote {
  id: string;
  note_body: string;
  session_date: string;
  created_at: string;
}

interface Appointment {
  id: string;
  scheduled_at: string;
  duration_mins: number;
  purpose: string;
  status: string;
  notes: string | null;
  meeting_url: string | null;
}

interface Hold {
  id: string;
  hold_type: string;
  reason: string;
  placed_at: string;
  is_active: boolean;
  lifted_at: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StudentDetailPage() {
  const { id: studentId } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [advisorId, setAdvisorId] = useState('');
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('degree_audit');

  // Degree audit
  const [requirements, setRequirements] = useState<DegreeRequirement[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Advising notes
  const [notes, setNotes] = useState<AdvisingNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingNote, setSavingNote] = useState(false);
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<string | null>(null);

  // Appointments
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [aptsLoading, setAptsLoading] = useState(false);
  const [showAptModal, setShowAptModal] = useState(false);
  const [aptForm, setAptForm] = useState({ scheduled_at: '', duration_mins: 30, purpose: '', meeting_url: '' });
  const [savingApt, setSavingApt] = useState(false);
  const [updatingAptId, setUpdatingAptId] = useState<string | null>(null);

  // Holds
  const [holds, setHolds] = useState<Hold[]>([]);
  const [holdsLoading, setHoldsLoading] = useState(false);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [holdForm, setHoldForm] = useState({ hold_type: 'registration', reason: '' });
  const [savingHold, setSavingHold] = useState(false);
  const [liftingHoldId, setLiftingHoldId] = useState<string | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
      if (!me) return;
      const aid = (me as { id: string }).id;
      setAdvisorId(aid);

      const { data: u } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, student_profiles!user_id(student_no, profile_status, program, program_id)')
        .eq('id', studentId)
        .single();

      if (!u) { toast.error('Student not found'); router.push('/advisor/students'); return; }
      const profile = Array.isArray((u as any).student_profiles) ? (u as any).student_profiles[0] : (u as any).student_profiles;
      setStudent({
        userId: (u as any).id,
        name: `${(u as any).first_name} ${(u as any).last_name}`.trim(),
        email: (u as any).email,
        studentNo: profile?.student_no ?? '—',
        program: profile?.program ?? '—',
        programId: profile?.program_id ?? null,
        profileStatus: profile?.profile_status ?? 'active',
      });
    };
    init();
  }, [studentId]);

  // ── Degree Audit ──────────────────────────────────────────────────────────

  const loadAudit = useCallback(async (programId: string | null) => {
    setAuditLoading(true);
    if (!programId) { setRequirements([]); setAuditLoading(false); return; }

    const [reqRes, enrollRes] = await Promise.all([
      supabase
        .from('degree_requirements')
        .select('id, course_id, requirement_type, min_grade, semester_recommended, courses(code, title, credit_hours)')
        .eq('program_id', programId)
        .order('semester_recommended', { ascending: true }),
      supabase
        .from('enrollments')
        .select('offering_id, status, final_grade, course_offerings!fk_enrollments_offering(course_id)')
        .eq('student_id', studentId)
        .in('status', ['completed', 'active']),
    ]);

    const completedCourseIds: Record<string, { grade: string | null; status: string }> = {};
    for (const e of (enrollRes.data ?? []) as any[]) {
      const offering = Array.isArray(e.course_offerings) ? e.course_offerings[0] : e.course_offerings;
      if (offering?.course_id) {
        completedCourseIds[offering.course_id] = { grade: e.final_grade, status: e.status };
      }
    }

    setRequirements(
      ((reqRes.data ?? []) as any[]).map(r => {
        const course = Array.isArray(r.courses) ? r.courses[0] : r.courses;
        const enrollment = completedCourseIds[r.course_id];
        return {
          id: r.id,
          course_id: r.course_id,
          courseCode: course?.code ?? '—',
          courseTitle: course?.title ?? '—',
          creditHours: course?.credit_hours ?? 3,
          requirementType: r.requirement_type,
          minGrade: r.min_grade,
          semesterRecommended: r.semester_recommended,
          completed: enrollment?.status === 'completed',
          earnedGrade: enrollment?.grade ?? null,
        };
      })
    );
    setAuditLoading(false);
  }, [studentId]);

  // ── Advising Notes ────────────────────────────────────────────────────────

  const loadNotes = useCallback(async () => {
    setNotesLoading(true);
    const { data } = await supabase
      .from('advising_notes')
      .select('id, note_body, session_date, created_at')
      .eq('advisor_id', advisorId)
      .eq('student_id', studentId)
      .order('session_date', { ascending: false });
    setNotes((data ?? []) as AdvisingNote[]);
    setNotesLoading(false);
  }, [advisorId, studentId]);

  const saveNote = async () => {
    if (!noteBody.trim()) { toast.error('Note cannot be empty'); return; }
    setSavingNote(true);
    const { error } = await supabase.from('advising_notes').insert({
      advisor_id: advisorId,
      student_id: studentId,
      note_body: noteBody.trim(),
      session_date: noteDate,
    });
    if (error) { toast.error(error.message); setSavingNote(false); return; }
    toast.success('Note saved');
    setNoteBody('');
    setNoteDate(new Date().toISOString().slice(0, 10));
    setSavingNote(false);
    loadNotes();
  };

  const deleteNote = async (id: string) => {
    const { error } = await supabase.from('advising_notes').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Note deleted');
    setDeleteNoteTarget(null);
    loadNotes();
  };

  // ── Appointments ──────────────────────────────────────────────────────────

  const loadAppointments = useCallback(async () => {
    setAptsLoading(true);
    const { data } = await supabase
      .from('advisor_appointments')
      .select('id, scheduled_at, duration_mins, purpose, status, notes, meeting_url')
      .eq('advisor_id', advisorId)
      .eq('student_id', studentId)
      .order('scheduled_at', { ascending: false });
    setAppointments((data ?? []) as Appointment[]);
    setAptsLoading(false);
  }, [advisorId, studentId]);

  const scheduleAppointment = async () => {
    if (!aptForm.scheduled_at || !aptForm.purpose.trim()) { toast.error('Date/time and purpose are required'); return; }
    setSavingApt(true);
    const { error } = await supabase.from('advisor_appointments').insert({
      advisor_id: advisorId,
      student_id: studentId,
      scheduled_at: aptForm.scheduled_at,
      duration_mins: aptForm.duration_mins,
      purpose: aptForm.purpose.trim(),
      meeting_url: aptForm.meeting_url.trim() || null,
      status: 'scheduled',
    });
    if (error) { toast.error(error.message); setSavingApt(false); return; }
    toast.success('Appointment scheduled');
    setShowAptModal(false);
    setAptForm({ scheduled_at: '', duration_mins: 30, purpose: '', meeting_url: '' });
    setSavingApt(false);
    loadAppointments();
  };

  const updateAptStatus = async (id: string, status: string) => {
    setUpdatingAptId(id);
    const { error } = await supabase.from('advisor_appointments').update({ status }).eq('id', id);
    if (error) { toast.error(error.message); } else { toast.success('Status updated'); loadAppointments(); }
    setUpdatingAptId(null);
  };

  // ── Holds ─────────────────────────────────────────────────────────────────

  const loadHolds = useCallback(async () => {
    setHoldsLoading(true);
    const { data } = await supabase
      .from('student_holds')
      .select('id, hold_type, reason, placed_at, is_active, lifted_at')
      .eq('student_id', studentId)
      .order('placed_at', { ascending: false });
    setHolds((data ?? []) as Hold[]);
    setHoldsLoading(false);
  }, [studentId]);

  const placeHold = async () => {
    if (!holdForm.reason.trim()) { toast.error('Reason is required'); return; }
    setSavingHold(true);
    const { error } = await supabase.from('student_holds').insert({
      student_id: studentId,
      placed_by: advisorId,
      hold_type: holdForm.hold_type,
      reason: holdForm.reason.trim(),
    });
    if (error) { toast.error(error.message); setSavingHold(false); return; }
    toast.success('Hold placed');
    setShowHoldModal(false);
    setHoldForm({ hold_type: 'registration', reason: '' });
    setSavingHold(false);
    loadHolds();
  };

  const liftHold = async (id: string) => {
    setLiftingHoldId(id);
    const { error } = await supabase.from('student_holds').update({ is_active: false, lifted_at: new Date().toISOString(), lifted_by: advisorId }).eq('id', id);
    if (error) { toast.error(error.message); } else { toast.success('Hold lifted'); loadHolds(); }
    setLiftingHoldId(null);
  };

  // ── Tab switching ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!advisorId || !student) return;
    if (activeTab === 'degree_audit') loadAudit(student.programId);
    if (activeTab === 'advising_notes') loadNotes();
    if (activeTab === 'appointments') loadAppointments();
    if (activeTab === 'holds') loadHolds();
  }, [activeTab, advisorId, student]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const aptStatusBadge = (s: string) => {
    const map: Record<string, string> = { scheduled: 'bg-blue-100 text-blue-700', completed: 'bg-green-100 text-green-700', cancelled: 'bg-gray-100 text-gray-500', no_show: 'bg-red-100 text-red-600' };
    return map[s] ?? 'bg-gray-100 text-gray-600';
  };
  const holdTypeBadge = (t: string) => {
    const map: Record<string, string> = { registration: 'bg-orange-100 text-orange-700', financial: 'bg-yellow-100 text-yellow-700', academic: 'bg-blue-100 text-blue-700', disciplinary: 'bg-red-100 text-red-700', administrative: 'bg-purple-100 text-purple-700' };
    return map[t] ?? 'bg-gray-100 text-gray-600';
  };

  const completedCount = requirements.filter(r => r.completed).length;
  const totalCredits = requirements.reduce((s, r) => s + r.creditHours, 0);
  const completedCredits = requirements.filter(r => r.completed).reduce((s, r) => s + r.creditHours, 0);
  const progressPct = requirements.length > 0 ? Math.round((completedCount / requirements.length) * 100) : 0;

  const TABS: { key: Tab; label: string }[] = [
    { key: 'degree_audit', label: 'Degree Audit' },
    { key: 'advising_notes', label: 'Advising Notes' },
    { key: 'appointments', label: 'Appointments' },
    { key: 'holds', label: 'Holds' },
  ];

  if (!student) return <div className="p-8 text-center text-gray-500">Loading…</div>;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Link href="/advisor/students" className="text-sm text-teal-600 hover:underline">← Back to Students</Link>
        <div className="flex items-start justify-between mt-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              <span>{student.studentNo}</span>
              <span>{student.email}</span>
              <span>{student.program}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${student.profileStatus === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {student.profileStatus}
              </span>
            </div>
          </div>
          {holds.filter(h => h.is_active).length > 0 && (
            <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
              {holds.filter(h => h.is_active).length} Active Hold{holds.filter(h => h.is_active).length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── DEGREE AUDIT ──────────────────────────────────────────────────── */}
      {activeTab === 'degree_audit' && (
        <div>
          {auditLoading ? (
            <div className="text-center py-12 text-gray-500">Loading…</div>
          ) : !student.programId || requirements.length === 0 ? (
            <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
              <p className="font-medium">No degree requirements configured</p>
              <p className="text-sm mt-1">Add requirements via degree_requirements table for this program.</p>
            </div>
          ) : (
            <>
              {/* Progress summary */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { label: 'Completed', value: `${completedCount} / ${requirements.length}`, color: 'text-green-600' },
                  { label: 'Credits Earned', value: `${completedCredits} / ${totalCredits}`, color: 'text-blue-600' },
                  { label: 'Progress', value: `${progressPct}%`, color: 'text-teal-600' },
                ].map(c => (
                  <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                    <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
                  </div>
                ))}
              </div>
              {/* Progress bar */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Overall Progress</span><span>{progressPct}%</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
              {/* Requirements table */}
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Code', 'Course', 'Credits', 'Type', 'Sem.', 'Status', 'Grade'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {requirements.map(r => (
                      <tr key={r.id} className={r.completed ? 'bg-green-50/40' : 'hover:bg-gray-50'}>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">{r.courseCode}</td>
                        <td className="px-4 py-3 text-gray-900">{r.courseTitle}</td>
                        <td className="px-4 py-3 text-gray-600 text-center">{r.creditHours}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 capitalize">{r.requirementType}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-center">{r.semesterRecommended ?? '—'}</td>
                        <td className="px-4 py-3">
                          {r.completed ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Completed</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">Pending</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-sm">
                          {r.earnedGrade ?? <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ADVISING NOTES ────────────────────────────────────────────────── */}
      {activeTab === 'advising_notes' && (
        <div>
          {/* New note form */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Add Session Note</h3>
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-600 block mb-1">Session Date</label>
                <input type="date" value={noteDate} onChange={e => setNoteDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full" />
              </div>
            </div>
            <textarea
              rows={4}
              placeholder="Enter session notes, recommendations, follow-ups…"
              value={noteBody}
              onChange={e => setNoteBody(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
            />
            <div className="flex justify-end mt-3">
              <button onClick={saveNote} disabled={savingNote || !noteBody.trim()}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                {savingNote ? 'Saving…' : 'Save Note'}
              </button>
            </div>
          </div>

          {/* Notes list */}
          {notesLoading ? (
            <div className="text-center py-8 text-gray-500">Loading…</div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8 text-gray-400 bg-white rounded-xl border border-gray-200">No advising notes yet</div>
          ) : (
            <div className="space-y-3">
              {notes.map(n => (
                <div key={n.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-700">
                      {new Date(n.session_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                    <button onClick={() => setDeleteNoteTarget(n.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{n.note_body}</p>
                  <p className="text-xs text-gray-400 mt-2">Recorded {new Date(n.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}

          {/* Delete note confirm */}
          {deleteNoteTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
                <h2 className="text-lg font-bold mb-2">Delete Note?</h2>
                <p className="text-sm text-gray-600 mb-4">This cannot be undone.</p>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setDeleteNoteTarget(null)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
                  <button onClick={() => deleteNote(deleteNoteTarget)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Delete</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── APPOINTMENTS ──────────────────────────────────────────────────── */}
      {activeTab === 'appointments' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowAptModal(true)} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
              + Schedule Appointment
            </button>
          </div>

          {aptsLoading ? (
            <div className="text-center py-8 text-gray-500">Loading…</div>
          ) : appointments.length === 0 ? (
            <div className="text-center py-8 text-gray-400 bg-white rounded-xl border border-gray-200">No appointments yet</div>
          ) : (
            <div className="space-y-3">
              {appointments.map(a => (
                <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${aptStatusBadge(a.status)}`}>
                          {a.status.replace('_', ' ')}
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                          {new Date(a.scheduled_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                        <span className="text-xs text-gray-400">{a.duration_mins} min</span>
                      </div>
                      <p className="text-sm text-gray-700">{a.purpose}</p>
                      {a.meeting_url && <a href={a.meeting_url} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-600 hover:underline mt-1 block">{a.meeting_url}</a>}
                      {a.notes && <p className="text-xs text-gray-500 mt-2 italic">{a.notes}</p>}
                    </div>
                    {a.status === 'scheduled' && (
                      <div className="flex gap-2 shrink-0 ml-4">
                        <button onClick={() => updateAptStatus(a.id, 'completed')} disabled={updatingAptId === a.id}
                          className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium hover:bg-green-200 disabled:opacity-50">
                          Complete
                        </button>
                        <button onClick={() => updateAptStatus(a.id, 'cancelled')} disabled={updatingAptId === a.id}
                          className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 disabled:opacity-50">
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Schedule appointment modal */}
          {showAptModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                <h2 className="text-lg font-bold mb-4">Schedule Appointment</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time <span className="text-red-500">*</span></label>
                    <input type="datetime-local" value={aptForm.scheduled_at} onChange={e => setAptForm(f => ({ ...f, scheduled_at: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                    <select value={aptForm.duration_mins} onChange={e => setAptForm(f => ({ ...f, duration_mins: Number(e.target.value) }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      {[15, 30, 45, 60, 90].map(d => <option key={d} value={d}>{d} min</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Purpose <span className="text-red-500">*</span></label>
                    <input type="text" placeholder="e.g. Degree planning, Academic concern…" value={aptForm.purpose}
                      onChange={e => setAptForm(f => ({ ...f, purpose: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Meeting URL (optional)</label>
                    <input type="url" placeholder="https://meet.google.com/…" value={aptForm.meeting_url}
                      onChange={e => setAptForm(f => ({ ...f, meeting_url: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button onClick={() => setShowAptModal(false)} disabled={savingApt} className="px-4 py-2 rounded-lg border text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                  <button onClick={scheduleAppointment} disabled={savingApt} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-60">
                    {savingApt ? 'Scheduling…' : 'Schedule'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── HOLDS ─────────────────────────────────────────────────────────── */}
      {activeTab === 'holds' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowHoldModal(true)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
              + Place Hold
            </button>
          </div>

          {holdsLoading ? (
            <div className="text-center py-8 text-gray-500">Loading…</div>
          ) : holds.length === 0 ? (
            <div className="text-center py-8 text-gray-400 bg-white rounded-xl border border-gray-200">No holds on record</div>
          ) : (
            <div className="space-y-3">
              {holds.map(h => (
                <div key={h.id} className={`bg-white rounded-xl border p-5 ${h.is_active ? 'border-red-200' : 'border-gray-200 opacity-70'}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${holdTypeBadge(h.hold_type)}`}>
                          {h.hold_type.charAt(0).toUpperCase() + h.hold_type.slice(1)}
                        </span>
                        {h.is_active ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Active</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">Lifted</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700">{h.reason}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Placed {new Date(h.placed_at).toLocaleDateString()}
                        {h.lifted_at && ` · Lifted ${new Date(h.lifted_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    {h.is_active && (
                      <button onClick={() => liftHold(h.id)} disabled={liftingHoldId === h.id}
                        className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 disabled:opacity-50 shrink-0 ml-4">
                        {liftingHoldId === h.id ? 'Lifting…' : 'Lift Hold'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Place hold modal */}
          {showHoldModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                <h2 className="text-lg font-bold mb-4">Place Hold</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hold Type</label>
                    <select value={holdForm.hold_type} onChange={e => setHoldForm(f => ({ ...f, hold_type: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      {['registration', 'financial', 'academic', 'disciplinary', 'administrative'].map(t => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
                    <textarea rows={3} placeholder="Describe the reason for this hold…" value={holdForm.reason}
                      onChange={e => setHoldForm(f => ({ ...f, reason: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button onClick={() => setShowHoldModal(false)} disabled={savingHold} className="px-4 py-2 rounded-lg border text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                  <button onClick={placeHold} disabled={savingHold} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60">
                    {savingHold ? 'Placing…' : 'Place Hold'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
