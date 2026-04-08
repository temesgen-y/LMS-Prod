'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useGroupMessages } from '@/hooks/useGroupMessages';
import InviteMemberModal from '@/components/study-groups/InviteMemberModal';
import type { StudyGroup, StudyGroupMessage, StudyGroupMember } from '@/types/study-groups';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function getInitials(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

function fileSizeLabel(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

// ─── File attachment renderer ────────────────────────────────────────────────

function AttachmentDisplay({ att }: { att: { file_name: string; file_url: string; mime_type: string; size_kb: number } }) {
  const isImage = att.mime_type.startsWith('image/');
  const isPdf = att.mime_type === 'application/pdf';

  if (isImage) {
    return (
      <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="block mt-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={att.file_url}
          alt={att.file_name}
          className="max-w-[200px] rounded-lg border border-gray-200 hover:opacity-90 transition-opacity"
        />
      </a>
    );
  }

  const icon = isPdf ? '📄' : '📎';
  return (
    <a
      href={att.file_url}
      download={att.file_name}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 flex items-center gap-2 px-3 py-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors text-sm"
    >
      <span>{icon}</span>
      <span className="truncate max-w-[160px]">{att.file_name}</span>
      <span className="text-xs opacity-70 flex-shrink-0">{fileSizeLabel(att.size_kb)}</span>
      <span className="text-xs underline flex-shrink-0">Download</span>
    </a>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  isMe,
  isOwner,
  onDelete,
  onPin,
  onUnpin,
}: {
  msg: StudyGroupMessage;
  isMe: boolean;
  isOwner: boolean;
  onDelete: (id: string) => void;
  onPin: (id: string, pin: boolean) => void;
  onUnpin: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const senderName = msg.users ? `${msg.users.first_name} ${msg.users.last_name}` : 'Unknown';

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-end gap-2 group`}>
      {/* Avatar for others */}
      {!isMe && (
        <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center text-xs font-semibold text-gray-600 flex-shrink-0 mb-0.5">
          {msg.users ? getInitials(msg.users.first_name, msg.users.last_name) : '?'}
        </div>
      )}

      <div className={`flex flex-col max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
        {/* Sender name for others */}
        {!isMe && (
          <p className="text-xs text-gray-500 mb-0.5 px-1">{msg.users?.first_name ?? 'Unknown'}</p>
        )}

        <div className="relative">
          {/* Hover menu */}
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            className={`absolute top-1 ${isMe ? '-left-7' : '-right-7'} opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200`}
            aria-label="Message options"
          >
            <svg className="w-3.5 h-3.5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
            </svg>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" aria-hidden onClick={() => setMenuOpen(false)} />
              <div className={`absolute z-20 top-0 ${isMe ? 'right-full mr-1' : 'left-full ml-1'} bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[130px]`}>
                {isOwner && !msg.is_pinned && (
                  <button
                    type="button"
                    onClick={() => { onPin(msg.id, true); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <span>📌</span> Pin message
                  </button>
                )}
                {isOwner && msg.is_pinned && (
                  <button
                    type="button"
                    onClick={() => { onUnpin(msg.id); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <span>📌</span> Unpin
                  </button>
                )}
                {isMe && (
                  <button
                    type="button"
                    onClick={() => { onDelete(msg.id); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <span>🗑</span> Delete
                  </button>
                )}
              </div>
            </>
          )}

          {/* Bubble */}
          <div
            className={`px-3 py-2 rounded-2xl relative ${
              isMe
                ? 'bg-[#4c1d95] text-white rounded-br-sm'
                : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'
            }`}
          >
            {msg.is_pinned && (
              <span className="absolute -top-1 -right-1 text-xs">📌</span>
            )}
            {msg.body && (
              <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
            )}
            {(msg.study_group_attachments ?? []).map(sga => (
              <AttachmentDisplay key={sga.id} att={sga.attachments} />
            ))}
          </div>
        </div>

        <p className={`text-[10px] text-gray-400 mt-0.5 px-1 ${isMe ? 'text-right' : 'text-left'}`}>
          {formatTime(msg.created_at)}
        </p>
      </div>

      {/* Spacer for my messages (no avatar) */}
      {isMe && <div className="w-7 flex-shrink-0" />}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StudyGroupChatPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [group, setGroup] = useState<StudyGroup | null>(null);
  const [loadingGroup, setLoadingGroup] = useState(true);
  const [membership, setMembership] = useState<StudyGroupMember | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, loading: msgsLoading, sending, error: msgError, bottomRef, sendMessage, deleteMessage, pinMessage } =
    useGroupMessages(groupId ?? null, userId);

  // Load current user and group
  useEffect(() => {
    if (!groupId) return;
    const init = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace('/login'); return; }

      const { data: u } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', auth.user.id)
        .single();
      if (!u) return;
      const uid = (u as { id: string }).id;
      setUserId(uid);

      const { data: g } = await supabase
        .from('study_groups')
        .select(`
          id, name, description, is_active, offering_id, created_by,
          created_at, updated_at,
          course_offerings (
            courses ( code, title )
          ),
          study_group_members (
            id, student_id, role, status, invited_by, joined_at,
            users!student_id ( id, first_name, last_name, avatar_url )
          )
        `)
        .eq('id', groupId)
        .single();

      if (!g) { router.replace('/dashboard/study-groups'); return; }
      setGroup(g as unknown as StudyGroup);

      const myMembership = (g as any).study_group_members?.find(
        (m: StudyGroupMember) => m.student_id === uid && m.status === 'active'
      ) ?? null;
      setMembership(myMembership);
      setLoadingGroup(false);
    };
    init();
  }, [groupId, router]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim() && selectedFiles.length === 0) return;
    setFileError(null);
    setActionError(null);
    try {
      await sendMessage(inputText, selectedFiles);
      setInputText('');
      setSelectedFiles([]);
    } catch (e) {
      setActionError((e as Error).message);
    }
  }, [inputText, selectedFiles, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const files = Array.from(e.target.files ?? []);
    if (selectedFiles.length + files.length > 5) {
      setFileError('Maximum 5 files per message.');
      return;
    }
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) {
        setFileError(`"${f.name}" exceeds the 10 MB limit.`);
        return;
      }
    }
    setSelectedFiles(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleDelete = async (msgId: string) => {
    try { await deleteMessage(msgId); } catch (e) { setActionError((e as Error).message); }
  };

  const handlePin = async (msgId: string, pin: boolean) => {
    try { await pinMessage(msgId, pin); } catch (e) { setActionError((e as Error).message); }
  };

  const isOwner = membership?.role === 'owner';
  const activeMembers = group?.study_group_members?.filter(m => m.status === 'active') ?? [];
  const allMembers = group?.study_group_members ?? [];
  const course = group?.course_offerings?.courses;
  const pinnedMessages = messages.filter(m => m.is_pinned);

  // Loading / access guard
  if (loadingGroup) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <svg className="w-6 h-6 animate-spin text-[#4c1d95]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    );
  }

  if (!group || !membership) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-4xl">🔒</div>
        <p className="text-gray-600 text-sm">You don't have access to this group.</p>
        <Link href="/dashboard/study-groups" className="text-[#4c1d95] text-sm underline">
          Back to Study Groups
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden h-full">

      {/* ── Left panel: members ─────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col hidden md:flex">
        {/* Group header */}
        <div className="p-4 border-b border-gray-100">
          <p className="font-semibold text-gray-900 text-sm truncate">{group.name}</p>
          {course && (
            <span className="mt-1 inline-block px-1.5 py-0.5 bg-[#4c1d95]/10 text-[#4c1d95] text-[10px] font-semibold rounded">
              {course.code}
            </span>
          )}
        </div>

        {/* Members section */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-3 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Members ({activeMembers.length})
            </p>
            {isOwner && (
              <button
                type="button"
                onClick={() => setShowInvite(true)}
                className="text-xs text-[#4c1d95] hover:underline font-medium flex items-center gap-0.5"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Invite
              </button>
            )}
          </div>

          <ul className="px-2 space-y-0.5 pb-4">
            {allMembers.map(m => {
              const isLeft = m.status === 'left';
              const isInvited = m.status === 'invited';
              return (
                <li
                  key={m.id}
                  className={`flex items-center gap-2.5 px-2 py-2 rounded-lg ${isLeft ? 'opacity-40' : ''}`}
                >
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 flex-shrink-0">
                    {m.users ? getInitials(m.users.first_name, m.users.last_name) : '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">
                      {m.users ? `${m.users.first_name} ${m.users.last_name}` : 'Unknown'}
                    </p>
                  </div>
                  {m.role === 'owner' && !isLeft && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-[#4c1d95]/10 text-[#4c1d95] rounded flex-shrink-0">
                      owner
                    </span>
                  )}
                  {isInvited && (
                    <span className="text-[9px] text-amber-600 flex-shrink-0">invited</span>
                  )}
                  {isLeft && (
                    <span className="text-[9px] text-gray-400 flex-shrink-0">(left)</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* ── Right panel: chat ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3 flex items-center gap-3">
          <Link
            href="/dashboard/study-groups"
            className="text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0"
            aria-label="Back to Study Groups"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">{group.name}</p>
            {course && (
              <p className="text-xs text-gray-500 truncate">
                {course.code} — {course.title} · {activeMembers.length} {activeMembers.length === 1 ? 'member' : 'members'}
              </p>
            )}
          </div>
          {/* Mobile invite button */}
          {isOwner && (
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className="md:hidden text-xs font-medium text-[#4c1d95] border border-[#4c1d95] px-2 py-1 rounded-lg"
            >
              + Invite
            </button>
          )}
        </div>

        {/* Pinned messages bar */}
        {pinnedMessages.length > 0 && (
          <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2">
            <span className="text-sm flex-shrink-0">📌</span>
            <p className="text-xs text-amber-800 truncate">
              <span className="font-medium">Pinned:</span> {pinnedMessages[pinnedMessages.length - 1].body ?? 'Attachment'}
            </p>
          </div>
        )}

        {/* Error bar */}
        {(actionError || msgError) && (
          <div className="flex-shrink-0 bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between">
            <p className="text-xs text-red-700">{actionError ?? msgError}</p>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-xs text-red-600 underline ml-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Message area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-gray-50">
          {msgsLoading ? (
            <div className="flex justify-center py-12">
              <svg className="w-5 h-5 animate-spin text-[#4c1d95]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <div className="text-4xl">💬</div>
              <p className="text-sm font-medium text-gray-600">No messages yet</p>
              <p className="text-xs text-gray-400">Be the first to say something!</p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const showDate = idx === 0 || !sameDay(messages[idx - 1].created_at, msg.created_at);
              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="flex items-center gap-2 my-4">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatDateLabel(msg.created_at)}
                      </span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                  )}
                  <MessageBubble
                    msg={msg}
                    isMe={msg.sender_id === userId}
                    isOwner={isOwner}
                    onDelete={handleDelete}
                    onPin={handlePin}
                    onUnpin={(id) => handlePin(id, false)}
                  />
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Compose area */}
        <div className="flex-shrink-0 border-t border-gray-200 bg-white">
          {/* File preview chips */}
          {selectedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-3">
              {selectedFiles.map((f, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1 text-xs text-gray-700"
                >
                  <span>{f.type.startsWith('image/') ? '🖼' : '📄'}</span>
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="text-gray-400 hover:text-gray-600 leading-none"
                    aria-label={`Remove ${f.name}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          {fileError && (
            <p className="px-4 pt-2 text-xs text-red-600">{fileError}</p>
          )}

          <div className="flex items-end gap-2 px-4 py-3">
            {/* File attach button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 p-2 text-gray-500 hover:text-[#4c1d95] hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Attach files"
              title="Attach files (max 5, 10 MB each)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Text input */}
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
              rows={1}
              className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent max-h-32 overflow-y-auto"
              style={{ lineHeight: '1.5' }}
            />

            {/* Send button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || (!inputText.trim() && selectedFiles.length === 0)}
              className="flex-shrink-0 p-2 text-white bg-[#4c1d95] rounded-xl hover:bg-[#5b21b6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Send message"
            >
              {sending ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Invite modal */}
      {showInvite && group && userId && (
        <InviteMemberModal
          groupId={group.id}
          offeringId={group.offering_id}
          currentUserId={userId}
          courseCode={course?.code ?? ''}
          onClose={() => setShowInvite(false)}
        />
      )}
    </div>
  );
}
