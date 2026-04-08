'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { ForumPost } from '@/types/forum';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ForumPostProps {
  post: ForumPost;
  depth: number;
  threadId: string;
  threadAuthorId: string;
  isLocked: boolean;
  userId: string;
  userRole: 'student' | 'instructor';
  replyingToId: string | null;
  setReplyingToId: (id: string | null) => void;
  onPostChange: () => void;
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

function initials(first: string, last: string): string {
  return `${(first[0] ?? '').toUpperCase()}${(last[0] ?? '').toUpperCase()}`;
}

function withinEditWindow(createdAt: string): boolean {
  return (Date.now() - new Date(createdAt).getTime()) < 24 * 3_600_000;
}

// ─── Inline Reply Box ─────────────────────────────────────────────────────────

interface InlineReplyBoxProps {
  threadId: string;
  parentId: string;
  userId: string;
  onClose: () => void;
  onPostChange: () => void;
}

function InlineReplyBox({ threadId, parentId, userId, onClose, onPostChange }: InlineReplyBoxProps) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = body.trim();
    if (!trimmed) { toast.error('Reply cannot be empty.'); return; }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error: postError } = await supabase.from('forum_posts').insert({
        thread_id: threadId,
        parent_id: parentId,
        author_id: userId,
        body: trimmed,
        is_answer: false,
        upvotes: 0,
      });
      if (postError) throw postError;

      // Increment reply_count on thread
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
      setBody('');
      onClose();
      onPostChange();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to post reply.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
      <textarea
        className="w-full border border-gray-300 rounded-md p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500"
        rows={3}
        placeholder="Write your reply…"
        value={body}
        onChange={e => setBody(e.target.value)}
        disabled={submitting}
      />
      <div className="flex justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !body.trim()}
          className="px-4 py-1.5 text-sm rounded-md bg-cyan-600 text-white font-medium hover:bg-cyan-700 disabled:opacity-50"
        >
          {submitting ? 'Posting…' : 'Post Reply'}
        </button>
      </div>
    </div>
  );
}

// ─── ForumPostCard ────────────────────────────────────────────────────────────

export default function ForumPostCard({
  post,
  depth,
  threadId,
  threadAuthorId,
  isLocked,
  userId,
  userRole,
  replyingToId,
  setReplyingToId,
  onPostChange,
}: ForumPostProps) {
  const [editMode, setEditMode] = useState(false);
  const [editBody, setEditBody] = useState(post.body);
  const [savingEdit, setSavingEdit] = useState(false);
  const [upvoting, setUpvoting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const visualIndent = Math.min(depth, 4) * 24;
  const isDeleted = post.deleted_at !== null;
  const isOwn = post.author_id === userId;
  const canEdit = isOwn && !isDeleted && withinEditWindow(post.created_at);
  const canDelete = (isOwn || userRole === 'instructor') && !isDeleted;
  const canUpvote = !isOwn && !isDeleted;
  const canReply = !isLocked && !isDeleted;
  const canMarkAnswer =
    userRole === 'instructor' &&
    threadAuthorId === userId &&
    !post.is_answer &&
    !isDeleted;

  const authorName = `${post.users.first_name} ${post.users.last_name}`;
  const authorInitials = initials(post.users.first_name, post.users.last_name);
  const roleLabel = post.users.role === 'instructor' ? 'Instructor' : 'Student';
  const roleBadgeClass =
    post.users.role === 'instructor'
      ? 'bg-purple-100 text-purple-700'
      : 'bg-gray-100 text-gray-500';

  // Collapse logic: show first 3 replies directly, rest behind "Show X more"
  const COLLAPSE_THRESHOLD = 3;
  const visibleReplies =
    depth >= 1 && post.replies.length > COLLAPSE_THRESHOLD && !expanded
      ? post.replies.slice(0, COLLAPSE_THRESHOLD)
      : post.replies;
  const hiddenCount = post.replies.length - COLLAPSE_THRESHOLD;

  // ── Upvote ────────────────────────────────────────────────────────────────
  const handleUpvote = async () => {
    if (upvoting) return;
    setUpvoting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('forum_posts')
        .update({ upvotes: post.upvotes + 1 })
        .eq('id', post.id);
      if (error) throw error;
      onPostChange();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to upvote.');
    } finally {
      setUpvoting(false);
    }
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    const trimmed = editBody.trim();
    if (!trimmed) { toast.error('Post cannot be empty.'); return; }
    setSavingEdit(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('forum_posts')
        .update({ body: trimmed, updated_at: new Date().toISOString() })
        .eq('id', post.id);
      if (error) throw error;
      toast.success('Post updated.');
      setEditMode(false);
      onPostChange();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update post.');
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Delete (soft) ─────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this post?')) return;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('forum_posts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', post.id);
      if (error) throw error;
      toast.success('Post deleted.');
      onPostChange();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to delete post.');
    }
  };

  // ── Mark as Answer ────────────────────────────────────────────────────────
  const handleMarkAnswer = async () => {
    try {
      const supabase = createClient();
      // Unmark any existing answer in this thread
      await supabase
        .from('forum_posts')
        .update({ is_answer: false })
        .eq('thread_id', threadId)
        .eq('is_answer', true);
      // Mark this post
      const { error } = await supabase
        .from('forum_posts')
        .update({ is_answer: true })
        .eq('id', post.id);
      if (error) throw error;
      toast.success('Marked as best answer.');
      onPostChange();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to mark as answer.');
    }
  };

  return (
    <div style={{ marginLeft: `${visualIndent}px` }} className="relative">
      {/* Vertical connector line for nested replies */}
      {depth > 0 && (
        <div
          className="absolute left-0 top-0 bottom-0 w-px bg-gray-200"
          style={{ left: '-12px' }}
        />
      )}

      {/* Post card */}
      <div
        className={`bg-white rounded-xl border overflow-hidden ${
          post.is_answer ? 'border-green-300' : 'border-gray-200'
        }`}
      >
        {post.is_answer && <div className="h-1 bg-green-400" />}

        <div className="p-4">
          {isDeleted ? (
            <p className="text-sm text-gray-400 italic">[This reply was deleted]</p>
          ) : (
            <>
              {/* Author row */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-[#4c1d95] text-white text-sm font-bold flex items-center justify-center flex-shrink-0 select-none">
                  {authorInitials}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-sm text-gray-900">{authorName}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${roleBadgeClass}`}>
                      {roleLabel}
                    </span>
                    {post.is_answer && (
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                        ✅ Best Answer
                      </span>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">{timeAgo(post.created_at)}</span>
                  </div>

                  {/* Body or edit textarea */}
                  {editMode ? (
                    <div className="mt-1">
                      <textarea
                        className="w-full border border-gray-300 rounded-md p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        rows={4}
                        value={editBody}
                        onChange={e => setEditBody(e.target.value)}
                        disabled={savingEdit}
                      />
                      <div className="flex gap-2 mt-1.5">
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          disabled={savingEdit || !editBody.trim()}
                          className="px-3 py-1 text-xs rounded bg-cyan-600 text-white font-medium hover:bg-cyan-700 disabled:opacity-50"
                        >
                          {savingEdit ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditMode(false); setEditBody(post.body); }}
                          disabled={savingEdit}
                          className="px-3 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="text-sm text-gray-700 leading-relaxed mt-0.5 prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: post.body }}
                    />
                  )}

                  {/* Action buttons */}
                  {!editMode && (
                    <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
                      {/* Left: upvote, edit, delete, mark-answer */}
                      <div className="flex items-center gap-3 flex-wrap">
                        {canUpvote && (
                          <button
                            type="button"
                            onClick={handleUpvote}
                            disabled={upvoting}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-cyan-600 transition-colors disabled:opacity-50"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                            </svg>
                            {post.upvotes > 0 ? post.upvotes : ''} Upvote
                          </button>
                        )}
                        {!canUpvote && post.upvotes > 0 && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                            </svg>
                            {post.upvotes}
                          </span>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => { setEditMode(true); setEditBody(post.body); }}
                            className="text-xs text-gray-500 hover:text-blue-600 transition-colors"
                          >
                            Edit
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={handleDelete}
                            className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                        {canMarkAnswer && (
                          <button
                            type="button"
                            onClick={handleMarkAnswer}
                            className="text-xs text-gray-500 hover:text-green-600 transition-colors"
                          >
                            ✅ Mark as Answer
                          </button>
                        )}
                      </div>

                      {/* Right: eye + REPLY buttons */}
                      <div className="flex items-center gap-2 ml-auto">
                        {/* Eye / read indicator */}
                        <button
                          type="button"
                          title="Mark as read"
                          className="flex items-center justify-center w-8 h-8 rounded border border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>

                        {/* REPLY button */}
                        {canReply && (
                          <button
                            type="button"
                            onClick={() => setReplyingToId(replyingToId === post.id ? null : post.id)}
                            className="flex items-center gap-1.5 px-3 h-8 rounded border border-gray-300 text-xs font-semibold text-gray-600 hover:border-cyan-500 hover:text-cyan-600 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                            REPLY
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Inline reply box */}
          {replyingToId === post.id && (
            <div className="mt-3">
              <InlineReplyBox
                threadId={threadId}
                parentId={post.id}
                userId={userId}
                onClose={() => setReplyingToId(null)}
                onPostChange={onPostChange}
              />
            </div>
          )}
        </div>
      </div>

      {/* Nested replies */}
      {post.replies.length > 0 && (
        <div className="mt-2 space-y-2 pl-3 border-l border-gray-200">
          {visibleReplies.map(reply => (
            <ForumPostCard
              key={reply.id}
              post={reply}
              depth={depth + 1}
              threadId={threadId}
              threadAuthorId={threadAuthorId}
              isLocked={isLocked}
              userId={userId}
              userRole={userRole}
              replyingToId={replyingToId}
              setReplyingToId={setReplyingToId}
              onPostChange={onPostChange}
            />
          ))}
          {depth >= 1 && hiddenCount > 0 && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-xs text-cyan-600 hover:underline ml-1"
            >
              Show {hiddenCount} more {hiddenCount === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
