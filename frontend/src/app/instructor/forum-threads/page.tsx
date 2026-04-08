'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

const PAGE_SIZE = 10;

type ForumThread = {
  id: string;
  offering_id: string;
  author_id: string;
  title: string;
  is_pinned: boolean;
  is_locked: boolean;
  reply_count: number;
  created_at: string;
  last_reply_at: string | null;
  offering_label?: string;
};

type OfferingOption = { id: string; label: string };

const blank = () => ({
  offering_id: '',
  title: '',
  is_pinned: false,
  is_locked: false,
});

export default function ForumThreadsPage() {
  const supabase = createClient();

  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [offerings, setOfferings] = useState<OfferingOption[]>([]);
  const [filterOffering, setFilterOffering] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ForumThread | null>(null);
  const [form, setForm] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ForumThread | null>(null);
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

  const loadThreads = useCallback(async () => {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setLoading(false); return; }
    const { data: userData } = await supabase.from('users').select('id').eq('auth_user_id', authData.user.id).single();
    if (!userData) { setLoading(false); return; }

    const { data: ciRows } = await supabase.from('course_instructors').select('offering_id').eq('instructor_id', userData.id);
    const offeringIds = (ciRows ?? []).map((r: any) => r.offering_id);
    if (!offeringIds.length) { setThreads([]); setLoading(false); return; }

    const { data, error } = await supabase
      .from('forum_threads')
      .select(`
        id, offering_id, author_id, title, is_pinned, is_locked, reply_count, created_at, last_reply_at,
        course_offerings!fk_forum_threads_offering(section_name, courses!fk_course_offerings_course(code))
      `)
      .in('offering_id', offeringIds)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) { toast.error(error.message); setLoading(false); return; }

    setThreads((data ?? []).map((r: any) => ({
      id: r.id,
      offering_id: r.offering_id,
      author_id: r.author_id,
      title: r.title,
      is_pinned: r.is_pinned,
      is_locked: r.is_locked,
      reply_count: r.reply_count,
      created_at: r.created_at,
      last_reply_at: r.last_reply_at,
      offering_label: r.course_offerings
        ? `${r.course_offerings.courses?.code ?? ''} – ${r.course_offerings.section_name}`
        : '—',
    })));
    setLoading(false);
  }, []);

  useEffect(() => { loadOfferings(); loadThreads(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...blank(), offering_id: filterOffering });
    setShowModal(true);
  };

  const openEdit = (t: ForumThread) => {
    setEditing(t);
    setForm({ offering_id: t.offering_id, title: t.title, is_pinned: t.is_pinned, is_locked: t.is_locked });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.offering_id) { toast.error('Select an offering'); return; }
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);

    if (editing) {
      const { error } = await supabase.from('forum_threads').update({
        title: form.title.trim(),
        is_pinned: form.is_pinned,
        is_locked: form.is_locked,
      }).eq('id', editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Thread updated');
    } else {
      const { error } = await supabase.from('forum_threads').insert({
        offering_id: form.offering_id,
        author_id: currentUserId,
        title: form.title.trim(),
        is_pinned: form.is_pinned,
        is_locked: form.is_locked,
      });
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Forum thread created');
    }
    setSaving(false);
    setShowModal(false);
    loadThreads();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('forum_threads').delete().eq('id', deleteTarget.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Thread deleted');
    setDeleteTarget(null);
    loadThreads();
  };

  const filtered = threads.filter(t => !filterOffering || t.offering_id === filterOffering);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Forum Threads</h1>
        <button onClick={openAdd} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
          + New Thread
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <select
          value={filterOffering}
          onChange={e => { setFilterOffering(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Offerings</option>
          {offerings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
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
                  {['Title', 'Offering', 'Replies', 'Last Reply', 'Flags', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No threads found</td></tr>
                ) : paginated.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[240px]">
                      <span className="block truncate">{t.title}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{t.offering_label}</td>
                    <td className="px-4 py-3 text-center">{t.reply_count}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {t.last_reply_at ? new Date(t.last_reply_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {t.is_pinned && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">Pinned</span>}
                        {t.is_locked && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">Locked</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(t)} className="text-blue-600 hover:underline text-xs">Edit</button>
                        <button onClick={() => setDeleteTarget(t)} className="text-red-500 hover:underline text-xs">Delete</button>
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

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">{editing ? 'Edit Thread' : 'New Forum Thread'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Offering <span className="text-red-500">*</span></label>
                <select
                  value={form.offering_id}
                  onChange={e => setForm(f => ({ ...f, offering_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  disabled={!!editing}
                >
                  <option value="">Select offering…</option>
                  {offerings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Thread title…"
                />
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.is_pinned} onChange={e => setForm(f => ({ ...f, is_pinned: e.target.checked }))} className="rounded" />
                  Pin thread
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.is_locked} onChange={e => setForm(f => ({ ...f, is_locked: e.target.checked }))} className="rounded" />
                  Lock thread
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-2">Delete Thread?</h2>
            <p className="text-sm text-gray-600 mb-4">
              Delete <strong>"{deleteTarget.title}"</strong> and all its posts? This cannot be undone.
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
