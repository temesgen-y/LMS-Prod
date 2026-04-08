'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

const PAGE_SIZE = 10;

type ForumPost = {
  id: string;
  thread_id: string;
  parent_id: string | null;
  author_id: string;
  body: string;
  is_answer: boolean;
  upvotes: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  thread_title?: string;
  offering_label?: string;
  parent_preview?: string;
};

type OfferingOption = { id: string; label: string };
type ThreadOption = { id: string; title: string; offering_id: string };

const blank = () => ({
  thread_id: '',
  parent_id: null as string | null,
  body: '',
  is_answer: false,
});

export default function ForumPostsPage() {
  const supabase = createClient();

  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [offerings, setOfferings] = useState<OfferingOption[]>([]);
  const [threads, setThreads] = useState<ThreadOption[]>([]);
  const [filterOffering, setFilterOffering] = useState('');
  const [filterThread, setFilterThread] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ForumPost | null>(null);
  const [form, setForm] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ForumPost | null>(null);
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
    const opts = ciRows.map((r: any) => ({
      id: r.offering_id,
      label: `${r.course_offerings?.courses?.code ?? ''} – ${r.course_offerings?.section_name ?? r.offering_id}`,
    }));
    setOfferings(opts);

    // Load all threads for these offerings
    const offeringIds = ciRows.map((r: any) => r.offering_id);
    if (offeringIds.length) {
      const { data: threadRows } = await supabase.from('forum_threads').select('id, title, offering_id').in('offering_id', offeringIds);
      setThreads(threadRows ?? []);
    }
  }, []);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setLoading(false); return; }
    const { data: userData } = await supabase.from('users').select('id').eq('auth_user_id', authData.user.id).single();
    if (!userData) { setLoading(false); return; }

    const { data: ciRows } = await supabase.from('course_instructors').select('offering_id').eq('instructor_id', userData.id);
    const offeringIds = (ciRows ?? []).map((r: any) => r.offering_id);
    if (!offeringIds.length) { setPosts([]); setLoading(false); return; }

    const { data: threadRows } = await supabase.from('forum_threads').select('id').in('offering_id', offeringIds);
    const threadIds = (threadRows ?? []).map((r: any) => r.id);
    if (!threadIds.length) { setPosts([]); setLoading(false); return; }

    const { data, error } = await supabase
      .from('forum_posts')
      .select(`
        id, thread_id, parent_id, author_id, body, is_answer, upvotes, created_at, updated_at, deleted_at,
        forum_threads!fk_forum_posts_thread(
          title, offering_id,
          course_offerings!fk_forum_threads_offering(section_name, courses!fk_course_offerings_course(code))
        )
      `)
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false });

    if (error) { toast.error(error.message); setLoading(false); return; }

    setPosts((data ?? []).map((r: any) => ({
      id: r.id,
      thread_id: r.thread_id,
      parent_id: r.parent_id,
      author_id: r.author_id,
      body: r.body,
      is_answer: r.is_answer,
      upvotes: r.upvotes,
      created_at: r.created_at,
      updated_at: r.updated_at,
      deleted_at: r.deleted_at,
      thread_title: r.forum_threads?.title ?? '—',
      offering_label: r.forum_threads?.course_offerings
        ? `${r.forum_threads.course_offerings.courses?.code ?? ''} – ${r.forum_threads.course_offerings.section_name}`
        : '—',
    })));
    setLoading(false);
  }, []);

  useEffect(() => { loadOfferings(); loadPosts(); }, []);

  const visibleThreads = filterOffering
    ? threads.filter(t => t.offering_id === filterOffering)
    : threads;

  const openAdd = () => {
    setEditing(null);
    setForm({ ...blank(), thread_id: filterThread });
    setShowModal(true);
  };

  const openEdit = (p: ForumPost) => {
    setEditing(p);
    setForm({ thread_id: p.thread_id, parent_id: p.parent_id, body: p.body, is_answer: p.is_answer });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.thread_id) { toast.error('Select a thread'); return; }
    if (!form.body.trim()) { toast.error('Post body is required'); return; }
    setSaving(true);

    if (editing) {
      const { error } = await supabase.from('forum_posts').update({
        body: form.body.trim(),
        is_answer: form.is_answer,
      }).eq('id', editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Post updated');
    } else {
      const { error } = await supabase.from('forum_posts').insert({
        thread_id: form.thread_id,
        parent_id: form.parent_id || null,
        author_id: currentUserId,
        body: form.body.trim(),
        is_answer: form.is_answer,
      });
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Post added');
    }
    setSaving(false);
    setShowModal(false);
    loadPosts();
  };

  // Soft delete: set deleted_at
  const handleSoftDelete = async (post: ForumPost) => {
    const { error } = await supabase.from('forum_posts').update({ deleted_at: new Date().toISOString() }).eq('id', post.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Post removed');
    loadPosts();
    setDeleteTarget(null);
  };

  const filtered = posts
    .filter(p => !filterOffering || p.offering_label?.startsWith(offerings.find(o => o.id === filterOffering)?.label.split('–')[0].trim() ?? ''))
    .filter(p => !filterThread || p.thread_id === filterThread);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Forum Posts</h1>
        <button onClick={openAdd} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
          + New Post
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filterOffering}
          onChange={e => { setFilterOffering(e.target.value); setFilterThread(''); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Offerings</option>
          {offerings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select
          value={filterThread}
          onChange={e => { setFilterThread(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Threads</option>
          {visibleThreads.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : (
        <>
          <div className="space-y-3">
            {paginated.length === 0 ? (
              <div className="text-center py-16 text-gray-400 border border-gray-200 rounded-xl">No posts found</div>
            ) : paginated.map(p => (
              <div key={p.id} className={`rounded-xl border p-4 ${p.deleted_at ? 'opacity-50 bg-gray-50' : 'bg-white'} ${p.is_answer ? 'border-green-300' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{p.thread_title}</span>
                      <span className="text-xs text-gray-400">{p.offering_label}</span>
                      {p.is_answer && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-semibold">✓ Answer</span>}
                      {p.deleted_at && <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs">Deleted</span>}
                      {p.parent_id && <span className="text-xs text-gray-400">↩ Reply</span>}
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-3">{p.body}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span>{new Date(p.created_at).toLocaleString()}</span>
                      <span>👍 {p.upvotes}</span>
                    </div>
                  </div>
                  {!p.deleted_at && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => openEdit(p)} className="text-blue-600 hover:underline text-sm">Edit</button>
                      <button onClick={() => setDeleteTarget(p)} className="text-red-500 hover:underline text-sm">Delete</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold mb-4">{editing ? 'Edit Post' : 'New Post'}</h2>
            <div className="space-y-4">
              {!editing && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thread <span className="text-red-500">*</span></label>
                  <select
                    value={form.thread_id}
                    onChange={e => setForm(f => ({ ...f, thread_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Select thread…</option>
                    {threads.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              )}
              {editing && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                  <strong>Thread:</strong> {editing.thread_title}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Body <span className="text-red-500">*</span></label>
                <textarea
                  rows={5}
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Write your post…"
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_answer} onChange={e => setForm(f => ({ ...f, is_answer: e.target.checked }))} className="rounded" />
                Mark as answer
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Saving…' : editing ? 'Update' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-2">Remove Post?</h2>
            <p className="text-sm text-gray-600 mb-4">
              The post will be soft-deleted (content hidden but the row is retained for audit).
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
              <button onClick={() => deleteTarget && handleSoftDelete(deleteTarget)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
