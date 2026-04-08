'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

const PAGE_SIZE = 15;

const NOTIFICATION_TYPES = [
  'exam_published',
  'grade_released',
  'submission_graded',
  'assignment_due',
  'announcement',
  'live_session_reminder',
  'enrollment_confirmed',
  'grade_override',
] as const;
type NotificationType = typeof NOTIFICATION_TYPES[number];

type SentNotification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
  student_name?: string;
  offering_label?: string;
};

type OfferingOption = { id: string; label: string };

const blank = () => ({
  offering_id: '',
  type: 'announcement' as NotificationType,
  title: '',
  body: '',
  link: '',
});

export default function NotificationsPage() {
  const supabase = createClient();

  const [notifications, setNotifications] = useState<SentNotification[]>([]);
  const [offerings, setOfferings] = useState<OfferingOption[]>([]);
  const [filterOffering, setFilterOffering] = useState('');
  const [filterType, setFilterType] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [previewStudents, setPreviewStudents] = useState<{ id: string; name: string }[]>([]);

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

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setLoading(false); return; }
    const { data: userData } = await supabase.from('users').select('id').eq('auth_user_id', authData.user.id).single();
    if (!userData) { setLoading(false); return; }

    const { data: ciRows } = await supabase.from('course_instructors').select('offering_id').eq('instructor_id', userData.id);
    const offeringIds = (ciRows ?? []).map((r: any) => r.offering_id);
    if (!offeringIds.length) { setNotifications([]); setLoading(false); return; }

    // Get all student_ids enrolled in instructor's offerings
    const { data: enRows } = await supabase
      .from('enrollments')
      .select('student_id, offering_id')
      .in('offering_id', offeringIds)
      .eq('status', 'active');
    const studentIds = [...new Set((enRows ?? []).map((r: any) => r.student_id))];
    if (!studentIds.length) { setNotifications([]); setLoading(false); return; }

    const { data, error } = await supabase
      .from('notifications')
      .select(`id, user_id, type, title, body, link, is_read, created_at, users!fk_notifications_user(first_name, last_name)`)
      .in('user_id', studentIds)
      .order('created_at', { ascending: false });

    if (error) { toast.error(error.message); setLoading(false); return; }

    setNotifications((data ?? []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      type: r.type,
      title: r.title,
      body: r.body,
      link: r.link,
      is_read: r.is_read,
      created_at: r.created_at,
      student_name: r.users ? `${r.users.first_name} ${r.users.last_name}` : '—',
    })));
    setLoading(false);
  }, []);

  useEffect(() => { loadOfferings(); loadNotifications(); }, []);

  const loadPreviewStudents = async (offeringId: string) => {
    if (!offeringId) { setPreviewStudents([]); return; }
    const { data } = await supabase
      .from('enrollments')
      .select('student_id, users!fk_enrollments_student(first_name, last_name)')
      .eq('offering_id', offeringId)
      .eq('status', 'active');
    setPreviewStudents((data ?? []).map((r: any) => ({
      id: r.student_id,
      name: r.users ? `${r.users.first_name} ${r.users.last_name}` : r.student_id,
    })));
  };

  const openSend = () => {
    setForm({ ...blank(), offering_id: filterOffering });
    if (filterOffering) loadPreviewStudents(filterOffering);
    setShowModal(true);
  };

  const handleSend = async () => {
    if (!form.offering_id) { toast.error('Select an offering'); return; }
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!form.body.trim()) { toast.error('Body is required'); return; }
    if (previewStudents.length === 0) { toast.error('No active enrolled students in this offering'); return; }

    setSaving(true);
    const { error } = await supabase.from('notifications').insert(
      previewStudents.map(s => ({
        user_id: s.id,
        type: form.type,
        title: form.title.trim(),
        body: form.body.trim(),
        link: form.link.trim() || null,
      }))
    );
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(`Notification sent to ${previewStudents.length} student${previewStudents.length !== 1 ? 's' : ''}`);
    setSaving(false);
    setShowModal(false);
    loadNotifications();
  };

  const typeBadgeColor = (t: string) => {
    const map: Record<string, string> = {
      exam_published: 'bg-red-100 text-red-700',
      grade_released: 'bg-green-100 text-green-700',
      submission_graded: 'bg-green-100 text-green-700',
      assignment_due: 'bg-amber-100 text-amber-700',
      announcement: 'bg-blue-100 text-blue-700',
      live_session_reminder: 'bg-purple-100 text-purple-700',
      enrollment_confirmed: 'bg-gray-100 text-gray-700',
      grade_override: 'bg-orange-100 text-orange-700',
    };
    return map[t] ?? 'bg-gray-100 text-gray-600';
  };

  const filtered = notifications
    .filter(n => !filterType || n.type === filterType);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <button onClick={openSend} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
          + Send Notification
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filterOffering}
          onChange={e => { setFilterOffering(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Offerings</option>
          {offerings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select
          value={filterType}
          onChange={e => { setFilterType(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Types</option>
          {NOTIFICATION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
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
                  {['Student', 'Type', 'Title', 'Body', 'Read', 'Sent At'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No notifications found</td></tr>
                ) : paginated.map(n => (
                  <tr key={n.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900 text-xs">{n.student_name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeBadgeColor(n.type)}`}>
                        {n.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-800 font-medium max-w-[160px] truncate">{n.title}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px] truncate">{n.body}</td>
                    <td className="px-4 py-3 text-center">
                      {n.is_read
                        ? <span className="text-green-600 text-xs font-medium">Read</span>
                        : <span className="text-gray-400 text-xs">Unread</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(n.created_at).toLocaleString()}</td>
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

      {/* Send Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">Send Notification to Students</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Offering <span className="text-red-500">*</span></label>
                <select
                  value={form.offering_id}
                  onChange={e => { setForm(f => ({ ...f, offering_id: e.target.value })); loadPreviewStudents(e.target.value); }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select offering…</option>
                  {offerings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              {previewStudents.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                  Will notify <strong>{previewStudents.length}</strong> active student{previewStudents.length !== 1 ? 's' : ''}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type <span className="text-red-500">*</span></label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as NotificationType }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {NOTIFICATION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Notification title…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Body <span className="text-red-500">*</span></label>
                <textarea
                  rows={3}
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Notification message…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deep Link (optional)</label>
                <input
                  type="text"
                  value={form.link}
                  onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="/dashboard/assessments"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
              <button onClick={handleSend} disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Sending…' : `Send to ${previewStudents.length} Student${previewStudents.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
