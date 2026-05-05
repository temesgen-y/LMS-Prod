'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import Link from 'next/link';

type AptStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

interface Appointment {
  id: string;
  student_id: string;
  student_name: string;
  scheduled_at: string;
  duration_mins: number;
  purpose: string;
  status: AptStatus;
  notes: string | null;
  meeting_url: string | null;
}

interface AssignedStudent {
  id: string;
  name: string;
}

const STATUSES: AptStatus[] = ['scheduled', 'completed', 'cancelled', 'no_show'];

export default function AppointmentsPage() {
  const supabase = createClient();
  const [advisorId, setAdvisorId] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [students, setStudents] = useState<AssignedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ student_id: '', scheduled_at: '', duration_mins: 30, purpose: '', meeting_url: '' });
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notesModal, setNotesModal] = useState<{ id: string; current: string } | null>(null);
  const [notesText, setNotesText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
      if (!me) return;
      const aid = (me as { id: string }).id;
      setAdvisorId(aid);

      const { data: assignments } = await supabase
        .from('advisor_assignments')
        .select('student_id, users!fk_aa_student(id, first_name, last_name)')
        .eq('advisor_id', aid)
        .eq('is_active', true);

      setStudents(
        ((assignments ?? []) as any[]).map(a => ({
          id: a.student_id,
          name: a.users ? `${a.users.first_name} ${a.users.last_name}` : '—',
        }))
      );
    };
    init();
  }, []);

  const loadAppointments = useCallback(async () => {
    if (!advisorId) return;
    setLoading(true);
    const q = supabase
      .from('advisor_appointments')
      .select('id, student_id, scheduled_at, duration_mins, purpose, status, notes, meeting_url, users!fk_apt_student(first_name, last_name)')
      .eq('advisor_id', advisorId)
      .order('scheduled_at', { ascending: false });

    const { data } = await q;
    setAppointments(
      ((data ?? []) as any[]).map(r => ({
        id: r.id,
        student_id: r.student_id,
        student_name: r.users ? `${r.users.first_name} ${r.users.last_name}` : '—',
        scheduled_at: r.scheduled_at,
        duration_mins: r.duration_mins,
        purpose: r.purpose,
        status: r.status,
        notes: r.notes,
        meeting_url: r.meeting_url,
      }))
    );
    setLoading(false);
  }, [advisorId]);

  useEffect(() => { if (advisorId) loadAppointments(); }, [advisorId, loadAppointments]);

  const schedule = async () => {
    if (!form.student_id || !form.scheduled_at || !form.purpose.trim()) {
      toast.error('Student, date/time, and purpose are required');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('advisor_appointments').insert({
      advisor_id: advisorId,
      student_id: form.student_id,
      scheduled_at: form.scheduled_at,
      duration_mins: form.duration_mins,
      purpose: form.purpose.trim(),
      meeting_url: form.meeting_url.trim() || null,
      status: 'scheduled',
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Appointment scheduled');
    setShowModal(false);
    setForm({ student_id: '', scheduled_at: '', duration_mins: 30, purpose: '', meeting_url: '' });
    setSaving(false);
    loadAppointments();
  };

  const updateStatus = async (id: string, status: AptStatus) => {
    setUpdatingId(id);
    const { error } = await supabase.from('advisor_appointments').update({ status }).eq('id', id);
    if (error) { toast.error(error.message); } else { toast.success('Status updated'); loadAppointments(); }
    setUpdatingId(null);
  };

  const saveNotes = async () => {
    if (!notesModal) return;
    setSavingNotes(true);
    const { error } = await supabase.from('advisor_appointments').update({ notes: notesText }).eq('id', notesModal.id);
    if (error) { toast.error(error.message); } else { toast.success('Notes saved'); loadAppointments(); setNotesModal(null); }
    setSavingNotes(false);
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { scheduled: 'bg-blue-100 text-blue-700', completed: 'bg-green-100 text-green-700', cancelled: 'bg-gray-100 text-gray-500', no_show: 'bg-red-100 text-red-600' };
    return map[s] ?? 'bg-gray-100 text-gray-600';
  };

  const statusCounts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: appointments.filter(a => a.status === s).length }), {} as Record<string, number>);

  const filtered = filterStatus ? appointments.filter(a => a.status === filterStatus) : appointments;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage advising sessions with your students</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
          + Schedule Appointment
        </button>
      </div>

      {/* Status filter cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {STATUSES.map(s => {
          const colors: Record<string, string> = { scheduled: 'text-blue-600', completed: 'text-green-600', cancelled: 'text-gray-500', no_show: 'text-red-600' };
          return (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
              className={`bg-white rounded-xl border p-4 text-left hover:shadow-sm transition ${filterStatus === s ? 'border-teal-500 ring-1 ring-teal-500' : 'border-gray-200'}`}>
              <div className={`text-2xl font-bold ${colors[s]}`}>{statusCounts[s] ?? 0}</div>
              <div className="text-xs text-gray-500 mt-0.5 capitalize">{s.replace('_', ' ')}</div>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">No appointments found</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(a.status)}`}>
                      {a.status.replace('_', ' ')}
                    </span>
                    <Link href={`/advisor/students/${a.student_id}`} className="font-semibold text-gray-900 hover:text-teal-700 text-sm">
                      {a.student_name}
                    </Link>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-sm text-gray-700">
                      {new Date(a.scheduled_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                    <span className="text-xs text-gray-400">{a.duration_mins} min</span>
                  </div>
                  <p className="text-sm text-gray-600">{a.purpose}</p>
                  {a.meeting_url && (
                    <a href={a.meeting_url} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-600 hover:underline mt-0.5 block truncate">{a.meeting_url}</a>
                  )}
                  {a.notes && <p className="text-xs text-gray-500 mt-2 italic border-l-2 border-gray-200 pl-2">{a.notes}</p>}
                </div>
                <div className="flex gap-2 ml-4 shrink-0 flex-wrap justify-end">
                  {a.status === 'scheduled' && (
                    <>
                      <button onClick={() => updateStatus(a.id, 'completed')} disabled={updatingId === a.id}
                        className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium hover:bg-green-200 disabled:opacity-50">
                        Complete
                      </button>
                      <button onClick={() => updateStatus(a.id, 'no_show')} disabled={updatingId === a.id}
                        className="px-3 py-1 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium hover:bg-orange-200 disabled:opacity-50">
                        No-show
                      </button>
                      <button onClick={() => updateStatus(a.id, 'cancelled')} disabled={updatingId === a.id}
                        className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 disabled:opacity-50">
                        Cancel
                      </button>
                    </>
                  )}
                  <button onClick={() => { setNotesModal({ id: a.id, current: a.notes ?? '' }); setNotesText(a.notes ?? ''); }}
                    className="px-3 py-1 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50">
                    Notes
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Schedule modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Schedule Appointment</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Student <span className="text-red-500">*</span></label>
                <select value={form.student_id} onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select student…</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time <span className="text-red-500">*</span></label>
                <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                <select value={form.duration_mins} onChange={e => setForm(f => ({ ...f, duration_mins: Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {[15, 30, 45, 60, 90].map(d => <option key={d} value={d}>{d} min</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purpose <span className="text-red-500">*</span></label>
                <input type="text" placeholder="e.g. Degree planning…" value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meeting URL (optional)</label>
                <input type="url" value={form.meeting_url} onChange={e => setForm(f => ({ ...f, meeting_url: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} disabled={saving} className="px-4 py-2 rounded-lg border text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button onClick={schedule} disabled={saving} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-60">
                {saving ? 'Scheduling…' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes modal */}
      {notesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Session Notes</h2>
            <textarea rows={6} value={notesText} onChange={e => setNotesText(e.target.value)} placeholder="Add session notes…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setNotesModal(null)} disabled={savingNotes} className="px-4 py-2 rounded-lg border text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button onClick={saveNotes} disabled={savingNotes} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-60">
                {savingNotes ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
