'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { ForumThread, ForumPostFlat, ForumPost } from '@/types/forum';
import { buildTree, insertIntoTree } from '@/lib/forum/buildTree';
import ForumPostCard from './ForumPost';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ThreadDetailPageProps {
  offeringId: string;
  threadId: string;
  role: 'student' | 'instructor';
  userId: string;
  onBack: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(ts: string): string {
  const d = new Date(ts);
  const diffH = (Date.now() - d.getTime()) / 3_600_000;
  if (diffH < 1) return `${Math.max(1, Math.floor(diffH * 60))}m ago`;
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  if (diffH < 48) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ThreadDetailPage({
  offeringId,
  threadId,
  role,
  userId,
  onBack,
}: ThreadDetailPageProps) {
  const [thread, setThread] = useState<ForumThread | null>(null);
  const [postTree, setPostTree] = useState<ForumPost[]>([]);
  const [flatPosts, setFlatPosts] = useState<ForumPostFlat[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [topReplyBody, setTopReplyBody] = useState('');
  const [submittingTopReply, setSubmittingTopReply] = useState(false);
const [showGearMenu, setShowGearMenu] = useState(false);
  const [togglingPin, setTogglingPin] = useState(false);
  const [togglingLock, setTogglingLock] = useState(false);
  const gearMenuRef = useRef<HTMLDivElement>(null);

  // ── Fetch thread ──────────────────────────────────────────────────────────
  const fetchThread = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('forum_threads')
      .select(`
        id, offering_id, author_id, title, is_pinned, is_locked,
        reply_count, created_at, last_reply_at,
        users!fk_forum_threads_author(id, first_name, last_name, avatar_url, role)
      `)
      .eq('id', threadId)
      .single();
    if (error) { toast.error('Failed to load thread.'); return; }
    setThread(data as any);
  }, [threadId]);

  // ── Fetch posts ───────────────────────────────────────────────────────────
  const fetchPosts = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('forum_posts')
      .select(`
        id, thread_id, parent_id, author_id, body, is_answer, upvotes,
        created_at, updated_at, deleted_at,
        users!fk_forum_posts_author(id, first_name, last_name, avatar_url, role)
      `)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false });
    if (error) { toast.error('Failed to load posts.'); return; }
    const flat = (data ?? []) as any[] as ForumPostFlat[];
    setFlatPosts(flat);
    setPostTree(buildTree(flat));
  }, [threadId]);

  const refreshAll = useCallback(async () => {
    await fetchPosts();
    await fetchThread();
  }, [fetchPosts, fetchThread]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchThread(), fetchPosts()]).finally(() => setLoading(false));
  }, [fetchThread, fetchPosts]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`forum-thread-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'forum_posts',
          filter: `thread_id=eq.${threadId}`,
        },
        async (payload) => {
          // Fetch the new post with full user data
          const { data: newPostData } = await supabase
            .from('forum_posts')
            .select(`
              id, thread_id, parent_id, author_id, body, is_answer, upvotes,
              created_at, updated_at, deleted_at,
              users!fk_forum_posts_author(id, first_name, last_name, avatar_url, role)
            `)
            .eq('id', payload.new.id)
            .single();

          if (newPostData) {
            const newPost = newPostData as any as ForumPostFlat;
            setPostTree(prev => insertIntoTree(prev, newPost));
            setFlatPosts(prev => [...prev, newPost]);
            // Update thread reply_count and last_reply_at locally
            setThread(prev => prev ? {
              ...prev,
              reply_count: prev.reply_count + 1,
              last_reply_at: newPost.created_at,
            } : prev);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [threadId]);

  // ── Close gear menu on outside click ────────────────────────────────────
  useEffect(() => {
    if (!showGearMenu) return;
    const handler = (e: MouseEvent) => {
      if (gearMenuRef.current && !gearMenuRef.current.contains(e.target as Node)) {
        setShowGearMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showGearMenu]);

// ── Pin / Unpin ───────────────────────────────────────────────────────────
  const togglePin = async () => {
    if (!thread || togglingPin) return;
    setTogglingPin(true);
    setShowGearMenu(false);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('forum_threads')
        .update({ is_pinned: !thread.is_pinned })
        .eq('id', threadId);
      if (error) throw error;
      toast.success(thread.is_pinned ? 'Thread unpinned.' : 'Thread pinned.');
      setThread(prev => prev ? { ...prev, is_pinned: !prev.is_pinned } : prev);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update thread.');
    } finally {
      setTogglingPin(false);
    }
  };

  // ── Lock / Unlock ─────────────────────────────────────────────────────────
  const toggleLock = async () => {
    if (!thread || togglingLock) return;
    setTogglingLock(true);
    setShowGearMenu(false);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('forum_threads')
        .update({ is_locked: !thread.is_locked })
        .eq('id', threadId);
      if (error) throw error;
      toast.success(thread.is_locked ? 'Thread unlocked.' : 'Thread locked.');
      setThread(prev => prev ? { ...prev, is_locked: !prev.is_locked } : prev);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update thread.');
    } finally {
      setTogglingLock(false);
    }
  };

  // ── Top-level reply ───────────────────────────────────────────────────────
  const submitTopReply = async () => {
    const trimmed = topReplyBody.trim();
    if (!trimmed) { toast.error('Reply cannot be empty.'); return; }
    setSubmittingTopReply(true);
    try {
      const supabase = createClient();
      const { error: postError } = await supabase.from('forum_posts').insert({
        thread_id: threadId,
        parent_id: null,
        author_id: userId,
        body: trimmed,
        is_answer: false,
        upvotes: 0,
      });
      if (postError) throw postError;

      const { data: threadRow } = await supabase
        .from('forum_threads')
        .select('reply_count')
        .eq('id', threadId)
        .single();
      await supabase.from('forum_threads').update({
        reply_count: ((threadRow as any)?.reply_count ?? 0) + 1,
        last_reply_at: new Date().toISOString(),
      }).eq('id', threadId);

      toast.success('Reply posted.');
      setTopReplyBody('');
      refreshAll();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to post reply.');
    } finally {
      setSubmittingTopReply(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="w-full min-w-0">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-2/3" />
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="border-t border-gray-200 my-4" />
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 bg-gray-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="w-full text-center py-16 text-gray-400">
        <p>Thread not found.</p>
        <button type="button" onClick={onBack} className="mt-3 text-sm text-cyan-600 hover:underline">
          ← Back to Discussions
        </button>
      </div>
    );
  }

  const authorName = `${thread.users.first_name} ${thread.users.last_name}`;

  return (
    <div className="w-full min-w-0">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-cyan-600 hover:text-cyan-800 hover:underline mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Discussions
      </button>

      {/* Thread header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {thread.is_pinned && (
            <span className="text-amber-500 mt-1 flex-shrink-0" title="Pinned">📌</span>
          )}
          {thread.is_locked && (
            <span className="text-gray-400 mt-1 flex-shrink-0" title="Locked">🔒</span>
          )}
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">{thread.title}</h1>
        </div>

        {/* Instructor gear menu */}
        {role === 'instructor' && (
          <div className="relative flex-shrink-0" ref={gearMenuRef}>
            <button
              type="button"
              onClick={() => setShowGearMenu(prev => !prev)}
              className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              title="Thread options"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {showGearMenu && (
              <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
                <button
                  type="button"
                  onClick={togglePin}
                  disabled={togglingPin}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
                >
                  <span>{thread.is_pinned ? '📌 Unpin Thread' : '📌 Pin Thread'}</span>
                </button>
                <button
                  type="button"
                  onClick={toggleLock}
                  disabled={togglingLock}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
                >
                  <span>{thread.is_locked ? '🔓 Unlock Thread' : '🔒 Lock Thread'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-sm text-gray-500 mt-1">
        Started by{' '}
        <span className="font-medium text-gray-700">{authorName}</span>
        {' · '}
        {timeAgo(thread.created_at)}
        {' · '}
        <span className="font-medium">{thread.reply_count}</span>{' '}
        {thread.reply_count === 1 ? 'reply' : 'replies'}
      </p>

      <div className="border-t border-gray-200 mt-4 mb-6" />

      {/* Locked banner */}
      {thread.is_locked && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-3 mb-6 text-sm">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          This thread is locked. No new replies can be posted.
        </div>
      )}

      {/* Posts */}
      {postTree.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">No posts yet</p>
          <p className="text-sm text-gray-400 mt-1">
            {thread.is_locked ? 'This thread is locked.' : 'Be the first to reply!'}
          </p>
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          {postTree.map(post => (
            <ForumPostCard
              key={post.id}
              post={post}
              depth={0}
              threadId={threadId}
              threadAuthorId={thread.author_id}
              isLocked={thread.is_locked}
              userId={userId}
              userRole={role}
              replyingToId={replyingToId}
              setReplyingToId={setReplyingToId}
              onPostChange={refreshAll}
            />
          ))}
        </div>
      )}

      {/* Top-level reply box — visible to all roles when thread is not locked */}
      {!thread.is_locked && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mt-2">
          <p className="text-sm font-semibold text-gray-700 mb-2">Write a Reply</p>
          <textarea
            className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500"
            rows={4}
            placeholder="Share your thoughts…"
            value={topReplyBody}
            onChange={e => setTopReplyBody(e.target.value)}
            disabled={submittingTopReply}
          />
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={submitTopReply}
              disabled={submittingTopReply || !topReplyBody.trim()}
              className="px-5 py-2 bg-cyan-600 text-white text-sm font-semibold rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition-colors"
            >
              {submittingTopReply ? 'Posting…' : 'Post Reply'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
