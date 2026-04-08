'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

type LiveSession = {
  id: string; offeringId: string; offeringLabel: string;
  title: string; platform: string; joinUrl: string; meetingId: string;
  passcode: string; scheduledAt: string; durationMins: number;
  recordingUrl: string; status: string;
};
type OfferingOption = { id: string; label: string };

const PLATFORMS = ['zoom', 'google_meet', 'teams', 'other'] as const;
const PLATFORM_LABELS: Record<string, string> = { zoom: 'Zoom', google_meet: 'Google Meet', teams: 'Microsoft Teams', other: 'Other' };
const STATUSES = ['scheduled', 'live', 'completed', 'cancelled'] as const;
const STATUS_COLORS: Record<string, string> = { scheduled: 'text-blue-600', live: 'text-green-600', completed: 'text-gray-500', cancelled: 'text-red-500' };
const PAGE_SIZE = 10;
const initialForm = { offeringId: '', title: '', platform: 'zoom', joinUrl: '', meetingId: '', passcode: '', scheduledAt: '', durationMins: '60', recordingUrl: '', status: 'scheduled' };

export default function InstructorLiveSessionsPage() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [offerings, setOfferings] = useState<OfferingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOffering, setFilterOffering] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const getCurrentUserId = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
    return data?.id ?? null;
  }, []);

  const fetchOfferings = useCallback(async () => {
    const userId = await getCurrentUserId();
    if (!userId) return;
    const supabase = createClient();
    const { data } = await supabase.from('course_instructors').select(`course_offerings!fk_course_instructors_offering(id,section_name,courses!fk_course_offerings_course(code,title),academic_terms!fk_course_offerings_term(academic_year_label,term_name,term_code))`).eq('instructor_id', userId);
    if (data) setOfferings((data ?? []).map((r: any) => {
      const o = r.course_offerings ?? {}; const c = o.courses ?? {}; const t = o.academic_terms ?? {};
      return { id: o.id, label: `${(c.code ?? '').toUpperCase()} — ${c.title ?? '—'} · ${[t.academic_year_label, t.term_name ?? t.term_code].filter(Boolean).join(' · ')} · Sec ${o.section_name ?? 'A'}` };
    }).filter((o: OfferingOption) => !!o.id));
  }, [getCurrentUserId]);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    const userId = await getCurrentUserId();
    if (!userId) { setLoading(false); return; }
    const supabase = createClient();
    const { data: ciData } = await supabase.from('course_instructors').select('offering_id').eq('instructor_id', userId);
    const offeringIds = (ciData ?? []).map((r: any) => r.offering_id);
    if (offeringIds.length === 0) { setSessions([]); setLoading(false); return; }

    const { data, error } = await supabase.from('live_sessions').select(`id,offering_id,title,platform,join_url,meeting_id,passcode,scheduled_at,duration_mins,recording_url,status,course_offerings!fk_live_sessions_offering(section_name,courses!fk_course_offerings_course(code,title),academic_terms!fk_course_offerings_term(academic_year_label,term_name,term_code))`).in('offering_id', offeringIds).order('scheduled_at', { ascending: false });
    if (error) toast.error('Failed to load sessions.');
    else setSessions((data ?? []).map((r: any) => {
      const o = r.course_offerings ?? {}; const c = o.courses ?? {}; const t = o.academic_terms ?? {};
      return { id: r.id, offeringId: r.offering_id, offeringLabel: `${(c.code ?? '').toUpperCase()} — ${c.title ?? '—'} · ${[t.academic_year_label, t.term_name ?? t.term_code].filter(Boolean).join(' · ')} · Sec ${o.section_name ?? 'A'}`, title: r.title ?? '', platform: r.platform ?? 'zoom', joinUrl: r.join_url ?? '', meetingId: r.meeting_id ?? '', passcode: r.passcode ?? '', scheduledAt: r.scheduled_at ?? '', durationMins: r.duration_mins ?? 60, recordingUrl: r.recording_url ?? '', status: r.status ?? 'scheduled' };
    }));
    setLoading(false);
  }, [getCurrentUserId]);

  useEffect(() => { fetchOfferings(); fetchSessions(); }, [fetchOfferings, fetchSessions]);

  const openAddModal = useCallback(() => { setEditingId(null); setForm({ ...initialForm, offeringId: filterOffering }); setSubmitError(''); setModalOpen(true); }, [filterOffering]);
  const openEditModal = useCallback((s: LiveSession) => {
    setEditingId(s.id);
    const localDt = s.scheduledAt ? new Date(s.scheduledAt).toISOString().slice(0, 16) : '';
    setForm({ offeringId: s.offeringId, title: s.title, platform: s.platform, joinUrl: s.joinUrl, meetingId: s.meetingId, passcode: s.passcode, scheduledAt: localDt, durationMins: String(s.durationMins), recordingUrl: s.recordingUrl, status: s.status });
    setSubmitError(''); setModalOpen(true);
  }, []);
  const closeModal = useCallback(() => { if (!isSubmitting) setModalOpen(false); }, [isSubmitting]);
  useEffect(() => {
    if (!modalOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [modalOpen, closeModal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitError('');
    if (!form.offeringId) { setSubmitError('Offering is required.'); return; }
    if (!form.title.trim()) { setSubmitError('Title is required.'); return; }
    if (!form.joinUrl.trim()) { setSubmitError('Join URL is required.'); return; }
    if (!form.scheduledAt) { setSubmitError('Scheduled date/time is required.'); return; }
    const durationMins = parseInt(form.durationMins, 10);
    if (!durationMins || durationMins < 1) { setSubmitError('Duration must be at least 1 minute.'); return; }
    setIsSubmitting(true);
    const userId = await getCurrentUserId();
    const supabase = createClient();
    const payload: any = { offering_id: form.offeringId, instructor_id: userId, title: form.title.trim(), platform: form.platform, join_url: form.joinUrl.trim(), meeting_id: form.meetingId.trim() || null, passcode: form.passcode.trim() || null, scheduled_at: new Date(form.scheduledAt).toISOString(), duration_mins: durationMins, recording_url: form.recordingUrl.trim() || null, status: form.status };
    let error;
    if (editingId) { ({ error } = await supabase.from('live_sessions').update(payload).eq('id', editingId)); }
    else { ({ error } = await supabase.from('live_sessions').insert(payload)); }
    if (error) { setSubmitError(error.message); setIsSubmitting(false); return; }
    toast.success(editingId ? 'Session updated.' : 'Session created.'); setModalOpen(false); setForm(initialForm); fetchSessions(); setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return; setIsDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('live_sessions').delete().eq('id', deleteId);
    if (error) toast.error('Failed to delete session.'); else { toast.success('Session deleted.'); fetchSessions(); }
    setDeleteId(null); setIsDeleting(false);
  };

  const filtered = sessions.filter(s => {
    const matchO = !filterOffering || s.offeringId === filterOffering;
    const matchS = !search || s.title.toLowerCase().includes(search.toLowerCase()) || s.offeringLabel.toLowerCase().includes(search.toLowerCase());
    return matchO && matchS;
  });
  const totalCount = filtered.length; const start = (page - 1) * PAGE_SIZE; const end = Math.min(start + PAGE_SIZE, totalCount); const paginated = filtered.slice(start, end);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <div className="flex flex-wrap gap-3 flex-1">
          <select value={filterOffering} onChange={e => { setFilterOffering(e.target.value); setPage(1); }} className="flex-1 min-w-[200px] max-w-xs px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20">
            <option value="">All Offerings</option>
            {offerings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <input type="search" placeholder="Search sessions..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
        <button type="button" onClick={openAddModal} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Schedule Session
        </button>
      </div>

      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={closeModal} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200" role="dialog" aria-modal="true">
            <div className="flex items-center justify-between shrink-0 p-6 pb-0">
              <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Edit Session' : 'Schedule Live Session'}</h2>
              <button type="button" onClick={closeModal} disabled={isSubmitting} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 p-6">
              <div className="space-y-4 overflow-y-auto pr-1 max-h-[60vh]">
                {submitError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{submitError}</div>}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Offering *</label>
                  <select value={form.offeringId} onChange={e => setForm(f => ({ ...f, offeringId: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20">
                    <option value="">— Select —</option>
                    {offerings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input type="text" value={form.title} placeholder="e.g. Week 3 Live Q&A" onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Platform *</label>
                    <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20">
                      {PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20">
                      {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Join URL *</label>
                  <input type="url" value={form.joinUrl} placeholder="https://..." onChange={e => setForm(f => ({ ...f, joinUrl: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Meeting ID</label>
                    <input type="text" value={form.meetingId} onChange={e => setForm(f => ({ ...f, meetingId: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Passcode</label>
                    <input type="text" value={form.passcode} onChange={e => setForm(f => ({ ...f, passcode: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled At *</label>
                    <input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Duration (mins) *</label>
                    <input type="number" min={1} value={form.durationMins} onChange={e => setForm(f => ({ ...f, durationMins: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recording URL</label>
                  <input type="url" value={form.recordingUrl} placeholder="https://..." onChange={e => setForm(f => ({ ...f, recordingUrl: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 mt-4 shrink-0 border-t border-gray-100">
                <button type="button" onClick={closeModal} disabled={isSubmitting} className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 min-w-[120px]">{isSubmitting ? 'Saving...' : editingId ? 'Save Changes' : 'Schedule'}</button>
              </div>
            </form>
          </div>
        </>
      )}

      {deleteId && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6" role="dialog" aria-modal="true">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete Session?</h2>
            <p className="text-sm text-gray-600 mb-6">This will permanently delete this live session.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteId(null)} disabled={isDeleting} className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={isDeleting} className="px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 min-w-[100px]">{isDeleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead><tr className="border-b border-gray-200 bg-gray-50/80">
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Title</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Platform</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Scheduled</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Duration</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Status</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Actions</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500">Loading...</td></tr>
                : paginated.length === 0 ? <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500">No sessions found.</td></tr>
                : paginated.map(s => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-5 py-3"><div className="text-sm font-medium text-gray-900">{s.title}</div><div className="text-xs text-gray-500 line-clamp-1">{s.offeringLabel}</div></td>
                    <td className="px-5 py-3 text-sm text-gray-600">{PLATFORM_LABELS[s.platform] ?? s.platform}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{s.scheduledAt ? new Date(s.scheduledAt).toLocaleString() : '—'}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{s.durationMins} min</td>
                    <td className="px-5 py-3"><span className={`text-sm font-medium capitalize ${STATUS_COLORS[s.status] ?? 'text-gray-500'}`}>{s.status}</span></td>
                    <td className="px-5 py-3"><div className="flex items-center gap-2">
                      {s.joinUrl && <a href={s.joinUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900" title="Join"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg></a>}
                      <button type="button" onClick={() => openEditModal(s)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900" title="Edit"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                      <button type="button" onClick={() => setDeleteId(s.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-red-600" title="Delete"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                    </div></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center px-5 py-3 border-t border-gray-200 bg-gray-50/50">
          <p className="text-sm text-gray-600">{totalCount === 0 ? 'No results' : `Showing ${start + 1}–${end} of ${totalCount}`}</p>
          <div className="flex gap-1">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
            <button type="button" onClick={() => setPage(p => p + 1)} disabled={end >= totalCount} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
          </div>
        </div>
      </div>
    </div>
  );
}
