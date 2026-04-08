'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { ForumThread } from '@/types/forum';
import CreateThreadModal from './CreateThreadModal';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ForumIndexPageProps {
  offeringId: string;
  role: 'student' | 'instructor';
  userId: string;
  onOpenThread: (threadId: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isRecentlyCreated(dateStr: string): boolean {
  return (Date.now() - new Date(dateStr).getTime()) < 24 * 3_600_000;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ForumIndexPage({
  offeringId,
  role,
  userId,
  onOpenThread,
}: ForumIndexPageProps) {
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('forum_threads')
        .select(`
          id, offering_id, author_id, title, is_pinned, is_locked,
          reply_count, created_at, last_reply_at,
          users!fk_forum_threads_author(id, first_name, last_name, avatar_url, role)
        `)
        .eq('offering_id', offeringId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      const sorted = ((data ?? []) as any[]).sort((a: any, b: any) => {
        if (b.is_pinned !== a.is_pinned) return b.is_pinned ? 1 : -1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setThreads(sorted);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to load discussions.');
    } finally {
      setLoading(false);
    }
  }, [offeringId]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // ── Inline title edit ──────────────────────────────────────────────────────
  const startEditTitle = (thread: ForumThread, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingThreadId(thread.id);
    setEditTitle(thread.title);
  };

  const saveEditTitle = async (threadId: string) => {
    const trimmed = editTitle.trim();
    if (!trimmed) { toast.error('Title cannot be empty.'); return; }
    setSavingEdit(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('forum_threads')
        .update({ title: trimmed })
        .eq('id', threadId);
      if (error) throw error;
      toast.success('Title updated.');
      setEditingThreadId(null);
      fetchThreads();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update title.');
    } finally {
      setSavingEdit(false);
    }
  };

  const cancelEditTitle = () => {
    setEditingThreadId(null);
    setEditTitle('');
  };

  // ── Delete thread ─────────────────────────────────────────────────────────
  const handleDeleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this discussion thread? This will also delete all posts in it.')) return;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('forum_threads')
        .delete()
        .eq('id', threadId);
      if (error) throw error;
      toast.success('Thread deleted.');
      fetchThreads();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to delete thread.');
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="w-full min-w-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-cyan-50 border border-cyan-100 flex-shrink-0">
            <svg className="w-5 h-5 text-cyan-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">Discussions</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Class discussion forums — ask questions, share insights, and engage with peers.
            </p>
          </div>
        </div>

        {role === 'instructor' && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white text-sm font-semibold rounded-lg hover:bg-cyan-700 transition-colors flex-shrink-0 shadow-sm"
            style={{ backgroundColor: '#0891b2' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            ADD DISCUSSION
          </button>
        )}
      </div>

      <div className="border-t border-gray-200 mt-4 mb-6" />

      {/* Topics section */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold text-gray-700 uppercase tracking-widest">Topics</span>
        <span className="text-xs text-gray-400">({threads.length})</span>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="px-4 py-4 border-b border-gray-100 last:border-b-0">
              <div className="flex items-center gap-4">
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="h-4 bg-gray-200 rounded w-20 ml-auto" />
                <div className="h-4 bg-gray-200 rounded w-16" />
                <div className="h-4 bg-gray-200 rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && threads.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-16 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
          </div>
          <p className="text-gray-500 font-medium">No discussions yet</p>
          <p className="text-sm text-gray-400 mt-1">
            {role === 'instructor'
              ? 'Start the conversation by adding the first discussion topic.'
              : 'Your instructor has not posted any discussion topics yet.'}
          </p>
          {role === 'instructor' && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 bg-cyan-600 text-white text-sm font-semibold rounded-lg hover:bg-cyan-700 transition-colors"
            >
              + Add First Discussion
            </button>
          )}
        </div>
      )}

      {/* Thread table */}
      {!loading && threads.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/2">
                  Topic Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Start Date
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Unanswered Posts
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Total Posts
                </th>
                {role === 'instructor' && (
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {threads.map(thread => (
                <tr key={thread.id} className="hover:bg-gray-50 transition-colors">
                  {/* Topic Name */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-start gap-2 flex-wrap">
                      {thread.is_pinned && (
                        <span className="text-amber-500 text-xs mt-0.5 flex-shrink-0" title="Pinned">📌</span>
                      )}
                      {thread.is_locked && (
                        <span className="text-gray-400 text-xs mt-0.5 flex-shrink-0" title="Locked">🔒</span>
                      )}

                      {editingThreadId === thread.id ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                          <input
                            type="text"
                            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 min-w-0"
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveEditTitle(thread.id);
                              if (e.key === 'Escape') cancelEditTitle();
                            }}
                            disabled={savingEdit}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => saveEditTitle(thread.id)}
                            disabled={savingEdit || !editTitle.trim()}
                            className="px-2 py-1 text-xs bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:opacity-50 flex-shrink-0"
                          >
                            {savingEdit ? '…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditTitle}
                            disabled={savingEdit}
                            className="px-2 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-100 disabled:opacity-50 flex-shrink-0"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => onOpenThread(thread.id)}
                            className="text-blue-600 hover:text-blue-800 font-medium text-sm hover:underline text-left"
                          >
                            {thread.title}
                          </button>
                          {isRecentlyCreated(thread.created_at) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-700 border border-cyan-200 flex-shrink-0">
                              Instructor Added
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Start Date */}
                  <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                    {fmtDate(thread.created_at)}
                  </td>

                  {/* Unanswered Posts */}
                  <td className="px-4 py-3.5 text-center">
                    <span className={`text-sm font-medium ${thread.reply_count === 0 ? 'text-amber-600' : 'text-gray-700'}`}>
                      {thread.reply_count}
                    </span>
                  </td>

                  {/* Total Posts */}
                  <td className="px-4 py-3.5 text-center">
                    <span className="text-sm font-medium text-gray-700">
                      {thread.reply_count}
                    </span>
                  </td>

                  {/* Actions (instructor only) */}
                  {role === 'instructor' && (
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-3">
                        {/* Edit title */}
                        <button
                          type="button"
                          onClick={e => startEditTitle(thread, e)}
                          className="text-gray-400 hover:text-blue-600 transition-colors"
                          title="Edit title"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        {/* View thread */}
                        <button
                          type="button"
                          onClick={() => onOpenThread(thread.id)}
                          className="text-gray-400 hover:text-gray-700 transition-colors"
                          title="View thread"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        {/* Delete thread */}
                        <button
                          type="button"
                          onClick={e => handleDeleteThread(thread.id, e)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete thread"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create thread modal */}
      {showCreateModal && (
        <CreateThreadModal
          offeringId={offeringId}
          userId={userId}
          onCreated={fetchThreads}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
