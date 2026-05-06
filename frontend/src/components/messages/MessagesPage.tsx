'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Conversation, Message, MessageAttachmentData } from '@/types/messaging';

// ── Section colors cycling per course ────────────────────────────────────────

const SECTION_COLORS = ['#e53935', '#1e88e5', '#43a047', '#8e24aa', '#fb8c00', '#00897b', '#d81b60', '#546e7a'];

function courseColor(code: string, allCodes: string[]): string {
  const idx = allCodes.indexOf(code);
  return SECTION_COLORS[idx % SECTION_COLORS.length];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(first: string, last: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

function fmtConvTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / 3600000;
  if (diffH < 24 && d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMsgTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtDateLabel(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function formatFileSize(kb: number) {
  return kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({
  user, size = 38, color = '#4c1d95',
}: {
  user: { first_name: string; last_name: string; avatar_url: string | null };
  size?: number;
  color?: string;
}) {
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt=""
        style={{ width: size, height: size }}
        className="rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.37 }}
      className="rounded-full text-white font-bold flex items-center justify-center flex-shrink-0 select-none"
    >
      {getInitials(user.first_name, user.last_name)}
    </div>
  );
}

// ── Graduation cap icon ───────────────────────────────────────────────────────

function GradCapIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" />
    </svg>
  );
}

// ── Attachment inside message card ────────────────────────────────────────────

function CardAttachment({ att }: { att: MessageAttachmentData }) {
  const a = att.attachments;
  if (a.mime_type.startsWith('image/')) {
    return (
      <a href={a.file_url} target="_blank" rel="noopener noreferrer" className="block mt-2">
        <img src={a.file_url} alt={a.file_name} className="max-w-xs max-h-48 rounded border border-gray-200 object-cover" />
      </a>
    );
  }
  const icon = a.mime_type === 'application/pdf' ? '📄' : '📎';
  return (
    <div className="mt-2 inline-flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm">
      <span>{icon}</span>
      <div>
        <p className="font-medium text-gray-800 text-xs">{a.file_name}</p>
        <p className="text-gray-400 text-[10px]">{formatFileSize(a.size_kb)}</p>
      </div>
      <a href={a.file_url} download={a.file_name} target="_blank" rel="noopener noreferrer"
        className="ml-2 text-xs px-2 py-0.5 bg-[#4c1d95] text-white rounded hover:bg-[#5b21b6]">
        Download
      </a>
    </div>
  );
}

// ── Conversation list item ────────────────────────────────────────────────────

function ConversationItem({
  conv, userId, selected, sectionColor, onClick,
}: {
  conv: Conversation; userId: string; selected: boolean; sectionColor: string; onClick: () => void;
}) {
  const other = conv.student_id === userId ? conv.instructor : conv.student;
  const msgs = conv.messages ?? [];
  const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
  const unread = msgs.filter(m => m.sender_id !== userId && !m.is_read).length;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-3 py-3 transition-colors border-b border-gray-100 last:border-0 ${
        selected ? 'bg-blue-50' : 'hover:bg-gray-50'
      }`}
    >
      {/* Avatar with colored left accent */}
      <div className="relative flex-shrink-0">
        <div
          className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full"
          style={{ backgroundColor: sectionColor }}
        />
        <div className="pl-2">
          <Avatar user={other} size={38} color={sectionColor} />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 min-w-0">
            <GradCapIcon className="w-3.5 h-3.5 text-[#4c1d95] flex-shrink-0" />
            <span className={`text-sm truncate ${unread > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
              {other.first_name} {other.last_name}
            </span>
          </div>
          <span className="text-[10px] text-gray-400 flex-shrink-0">{lastMsg ? fmtConvTime(lastMsg.created_at) : ''}</span>
        </div>
        <div className="flex items-center justify-between mt-0.5 gap-1">
          <p className={`text-xs truncate flex-1 ${unread > 0 ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
            {lastMsg
              ? `${lastMsg.sender_id === userId ? 'You: ' : ''}${lastMsg.body ?? '[Attachment]'}`
              : 'No messages yet'}
          </p>
          {unread > 0 && (
            <span className="flex-shrink-0 w-5 h-5 rounded bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Contact picker (New Message modal) ───────────────────────────────────────

interface Contact {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  offeringId: string;
  courseCode: string;
  courseTitle: string;
}

function NewMessageModal({
  role, currentUserId, onSelect, onClose,
}: {
  role: 'student' | 'instructor';
  currentUserId: string;
  onSelect: (contact: Contact) => void;
  onClose: () => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();

      if (role === 'student') {
        // Get all instructors from the student's active enrollments
        const { data: enrData } = await supabase
          .from('enrollments')
          .select('offering_id')
          .eq('student_id', currentUserId)
          .eq('status', 'active');

        const offeringIds = (enrData ?? []).map((e: { offering_id: string }) => e.offering_id);
        if (offeringIds.length === 0) { setLoading(false); return; }

        const { data: ciData } = await supabase
          .from('course_instructors')
          .select(`
            instructor_id, offering_id,
            users!fk_course_instructors_instructor(id, first_name, last_name, avatar_url),
            course_offerings!fk_course_instructors_offering(
              id,
              courses!fk_course_offerings_course(code, title)
            )
          `)
          .in('offering_id', offeringIds);

        const seen = new Set<string>();
        const result: Contact[] = [];
        for (const row of (ciData ?? []) as any[]) {
          const key = `${row.instructor_id}-${row.offering_id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const u = row.users;
          const co = row.course_offerings;
          if (!u || !co) continue;
          result.push({
            userId: u.id,
            firstName: u.first_name,
            lastName: u.last_name,
            avatarUrl: u.avatar_url,
            offeringId: row.offering_id,
            courseCode: co.courses?.code ?? '',
            courseTitle: co.courses?.title ?? '',
          });
        }
        setContacts(result);
      } else {
        // Instructor: get students enrolled in their courses
        const { data: ciData } = await supabase
          .from('course_instructors')
          .select('offering_id')
          .eq('instructor_id', currentUserId);

        const offeringIds = (ciData ?? []).map((c: { offering_id: string }) => c.offering_id);
        if (offeringIds.length === 0) { setLoading(false); return; }

        const { data: enrData } = await supabase
          .from('enrollments')
          .select(`
            student_id, offering_id,
            users!fk_enrollments_student(id, first_name, last_name, avatar_url),
            course_offerings!fk_enrollments_offering(
              id,
              courses!fk_course_offerings_course(code, title)
            )
          `)
          .in('offering_id', offeringIds)
          .eq('status', 'active');

        const seen = new Set<string>();
        const result: Contact[] = [];
        for (const row of (enrData ?? []) as any[]) {
          const key = `${row.student_id}-${row.offering_id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const u = row.users;
          const co = row.course_offerings;
          if (!u || !co) continue;
          result.push({
            userId: u.id,
            firstName: u.first_name,
            lastName: u.last_name,
            avatarUrl: u.avatar_url,
            offeringId: row.offering_id,
            courseCode: co.courses?.code ?? '',
            courseTitle: co.courses?.title ?? '',
          });
        }
        setContacts(result);
      }
      setLoading(false);
    };
    load();
  }, [role, currentUserId]);

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    return (
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      c.courseCode.toLowerCase().includes(q) ||
      c.courseTitle.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[420px] max-h-[560px] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-base">New Message</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              autoFocus
              type="text"
              placeholder={role === 'student' ? 'Search instructors…' : 'Search students…'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95]"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-8">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">
              {contacts.length === 0
                ? role === 'student' ? 'No instructors found from your enrolled courses.' : 'No students found in your courses.'
                : 'No results found.'}
            </p>
          ) : (
            filtered.map((c, i) => (
              <button
                key={`${c.userId}-${c.offeringId}`}
                type="button"
                onClick={() => onSelect(c)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left"
              >
                <Avatar user={{ first_name: c.firstName, last_name: c.lastName, avatar_url: c.avatarUrl }} size={36} color={SECTION_COLORS[i % SECTION_COLORS.length]} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-1">
                    <GradCapIcon className="w-3.5 h-3.5 text-[#4c1d95]" />
                    {c.firstName} {c.lastName}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{c.courseCode} — {c.courseTitle}</p>
                </div>
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main MessagesPage ─────────────────────────────────────────────────────────

export default function MessagesPage({ role }: { role: 'student' | 'instructor' }) {
  const searchParams = useSearchParams();
  const initialConvId = searchParams.get('conv');

  const [userId, setUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(initialConvId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [startingConv, setStartingConv] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedConv = conversations.find(c => c.id === selectedConvId) ?? null;
  const otherUser = selectedConv
    ? (selectedConv.student_id === userId ? selectedConv.instructor : selectedConv.student)
    : null;
  const courseInfo = selectedConv?.course_offerings?.courses ?? null;

  // All unique course codes for color assignment
  const allCodes = Array.from(
    new Set(conversations.map(c => c.course_offerings?.courses?.code ?? '').filter(Boolean))
  );

  // Group conversations by course code
  const grouped = allCodes.reduce<Record<string, Conversation[]>>((acc, code) => {
    acc[code] = conversations.filter(c => c.course_offerings?.courses?.code === code);
    return acc;
  }, {});
  // Conversations without a course code
  const ungrouped = conversations.filter(c => !c.course_offerings?.courses?.code);

  // ── Load user ────────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;
      const { data: appUser } = await supabase
        .from('users').select('id').eq('auth_user_id', authData.user.id).single();
      if (appUser) setUserId((appUser as { id: string }).id);
    };
    init();
  }, []);

  // ── Load conversations ────────────────────────────────────────────────────

  const loadConversations = useCallback(async (uid: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from('conversations')
      .select(`
        id, created_at, updated_at, offering_id, student_id, instructor_id,
        student:student_id(id, first_name, last_name, avatar_url),
        instructor:instructor_id(id, first_name, last_name, avatar_url),
        course_offerings(courses(code, title)),
        messages(id, body, sender_id, is_read, created_at)
      `)
      .or(`student_id.eq.${uid},instructor_id.eq.${uid}`)
      .order('updated_at', { ascending: false });

    if (data) {
      const convs = data as unknown as Conversation[];
      convs.forEach(c => {
        c.messages = (c.messages ?? []).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });
      setConversations(convs);
    }
    setLoadingConvs(false);
  }, []);

  useEffect(() => {
    if (userId) loadConversations(userId);
  }, [userId, loadConversations]);

  // ── Load messages ─────────────────────────────────────────────────────────

  const loadMessages = useCallback(async (convId: string) => {
    setLoadingMsgs(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('messages')
      .select(`
        id, conversation_id, sender_id, body, is_read, read_at, created_at,
        message_attachments(
          id, attachment_id,
          attachments(file_name, file_url, mime_type, size_kb)
        )
      `)
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data as unknown as Message[]);
    setLoadingMsgs(false);
  }, []);

  // ── Mark as read ──────────────────────────────────────────────────────────

  const markAsRead = useCallback(async (convId: string, uid: string) => {
    const supabase = createClient();
    await supabase
      .from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('conversation_id', convId)
      .neq('sender_id', uid)
      .eq('is_read', false);
    setConversations(prev =>
      prev.map(c =>
        c.id !== convId ? c : {
          ...c,
          messages: c.messages.map(m =>
            m.sender_id !== uid && !m.is_read ? { ...m, is_read: true } : m
          ),
        }
      )
    );
    setMessages(prev =>
      prev.map(m => m.sender_id !== uid && !m.is_read ? { ...m, is_read: true } : m)
    );
  }, []);

  useEffect(() => {
    if (!selectedConvId || !userId) return;
    loadMessages(selectedConvId);
    markAsRead(selectedConvId, userId);
  }, [selectedConvId, userId, loadMessages, markAsRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Realtime ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedConvId || !userId) return;
    const supabase = createClient();
    const ch = supabase
      .channel(`msgs-${selectedConvId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${selectedConvId}`,
      }, async (payload: { new: Record<string, unknown> }) => {
        await loadMessages(selectedConvId);
        if ((payload.new as { sender_id: string }).sender_id !== userId) {
          markAsRead(selectedConvId, userId);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedConvId, userId, loadMessages, markAsRead]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const ch = supabase
      .channel(`convs-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        loadConversations(userId);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, loadConversations]);

  // ── Start a new conversation from contact picker ──────────────────────────

  const handleContactSelect = async (contact: Contact) => {
    if (!userId) return;
    setComposeOpen(false);
    setStartingConv(true);

    const studentId = role === 'student' ? userId : contact.userId;
    const instructorId = role === 'instructor' ? userId : contact.userId;

    const supabase = createClient();
    const { data: conv } = await supabase
      .from('conversations')
      .upsert(
        { offering_id: contact.offeringId, student_id: studentId, instructor_id: instructorId },
        { onConflict: 'offering_id,student_id,instructor_id' }
      )
      .select('id')
      .single();

    if (conv) {
      await loadConversations(userId);
      setSelectedConvId((conv as { id: string }).id);
      setMobileShowThread(true);
    }
    setStartingConv(false);
  };

  // ── Send message ──────────────────────────────────────────────────────────

  const handleDiscard = () => {
    setTextInput('');
    setSelectedFiles([]);
    setSendError('');
  };

  const sendMessage = async () => {
    if (!selectedConvId || !userId) return;
    const body = textInput.trim();
    if (!body && selectedFiles.length === 0) return;

    setSending(true);
    setSendError('');
    const supabase = createClient();

    try {
      const attachmentIds: string[] = [];
      for (const file of selectedFiles) {
        const path = `messages/${selectedConvId}/${Date.now()}_${file.name}`;
        const { error: stErr } = await supabase.storage.from('lms-uploads').upload(path, file);
        if (stErr) { setSendError(`Upload failed: ${stErr.message}`); setSending(false); return; }
        const { data: urlData } = supabase.storage.from('lms-uploads').getPublicUrl(path);
        const { data: att } = await supabase
          .from('attachments')
          .insert({ file_name: file.name, file_url: urlData.publicUrl, mime_type: file.type, size_kb: Math.ceil(file.size / 1024), uploaded_by: userId })
          .select('id').single();
        if (att) attachmentIds.push((att as { id: string }).id);
      }

      const { data: msg } = await supabase
        .from('messages')
        .insert({ conversation_id: selectedConvId, sender_id: userId, body: body || null })
        .select('id').single();

      if (!msg) { setSendError('Failed to send.'); setSending(false); return; }

      if (attachmentIds.length > 0) {
        await supabase.from('message_attachments').insert(
          attachmentIds.map(aid => ({ message_id: (msg as { id: string }).id, attachment_id: aid }))
        );
      }

      setTextInput('');
      setSelectedFiles([]);
      await loadMessages(selectedConvId);
    } catch { setSendError('Something went wrong.'); }
    setSending(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const big = files.find(f => f.size > 10 * 1024 * 1024);
    if (big) { setSendError(`"${big.name}" exceeds the 10 MB limit.`); return; }
    setSelectedFiles(prev => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-white">

      {/* ══ LEFT PANEL ══════════════════════════════════════════════════════ */}
      <div className={`w-72 flex-shrink-0 border-r border-gray-200 flex flex-col bg-white min-h-0 ${
        mobileShowThread ? 'hidden md:flex' : 'flex'
      }`}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-lg font-bold text-gray-900">Messages</span>
          </div>
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            title={role === 'student' ? 'Message an instructor' : 'Message a student'}
            className="p-1.5 rounded-lg text-gray-400 hover:text-[#4c1d95] hover:bg-[#4c1d95]/5 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <p className="text-center text-sm text-gray-400 py-8">Loading…</p>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-sm text-gray-500 font-medium">No conversations yet</p>
              <button
                type="button"
                onClick={() => setComposeOpen(true)}
                className="mt-3 text-xs text-[#4c1d95] hover:underline font-medium"
              >
                {role === 'student' ? 'Message an instructor →' : 'Message a student →'}
              </button>
            </div>
          ) : (
            <>
              {Object.entries(grouped).map(([code, convs]) => (
                <div key={code}>
                  {/* Course section header */}
                  <div
                    className="flex items-center gap-2 px-4 py-1.5 bg-gray-50 border-b border-gray-100"
                    style={{ borderLeft: `3px solid ${courseColor(code, allCodes)}` }}
                  >
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{code}</span>
                  </div>
                  {convs.map(conv => (
                    <ConversationItem
                      key={conv.id}
                      conv={conv}
                      userId={userId ?? ''}
                      selected={selectedConvId === conv.id}
                      sectionColor={courseColor(code, allCodes)}
                      onClick={() => { setSelectedConvId(conv.id); setMobileShowThread(true); setSendError(''); }}
                    />
                  ))}
                </div>
              ))}
              {ungrouped.map(conv => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  userId={userId ?? ''}
                  selected={selectedConvId === conv.id}
                  sectionColor="#6b7280"
                  onClick={() => { setSelectedConvId(conv.id); setMobileShowThread(true); setSendError(''); }}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* ══ RIGHT PANEL ═════════════════════════════════════════════════════ */}
      <div className={`flex-1 flex flex-col min-h-0 min-w-0 bg-gray-50 ${
        !mobileShowThread ? 'hidden md:flex' : 'flex'
      }`}>

        {startingConv ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">
            Opening conversation…
          </div>
        ) : !selectedConv || !otherUser ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full py-16 text-center">
            <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-gray-500 font-medium">Select a conversation to start messaging</p>
          </div>
        ) : (
          <>
            {/* ── Thread header ─────────────────────────────────────────── */}
            <div className="bg-white border-b border-gray-200 px-5 py-3 flex-shrink-0">
              {/* Mobile back */}
              <button
                type="button"
                onClick={() => setMobileShowThread(false)}
                className="md:hidden flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <div className="flex items-center gap-2">
                <GradCapIcon className="w-4 h-4 text-[#4c1d95]" />
                <span className="font-semibold text-gray-900 text-base">
                  {otherUser.first_name} {otherUser.last_name}
                </span>
              </div>
              {courseInfo && (
                <div className="flex items-center gap-2 mt-0.5 text-sm">
                  <span className="text-[#4c1d95] font-medium cursor-pointer hover:underline">{courseInfo.code}</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-500 truncate">{courseInfo.title}</span>
                </div>
              )}
            </div>

            {/* ── Message thread ────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loadingMsgs ? (
                <p className="text-center text-sm text-gray-400 py-8">Loading messages…</p>
              ) : messages.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">No messages yet. Say hello! 👋</p>
              ) : (
                <div className="space-y-4 max-w-3xl">
                  {messages.map((msg, idx) => {
                    const mine = msg.sender_id === userId;
                    const showDate = idx === 0 || !isSameDay(messages[idx - 1].created_at, msg.created_at);
                    const sender = mine ? null : otherUser;
                    const senderName = mine
                      ? 'You'
                      : `${otherUser.first_name} ${otherUser.last_name}`;

                    return (
                      <div key={msg.id}>
                        {/* Date separator */}
                        {showDate && (
                          <div className="text-center my-4">
                            <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                              {fmtDateLabel(msg.created_at)}
                            </span>
                          </div>
                        )}

                        {/* Message card — email style */}
                        <div className="rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                          {/* Card header */}
                          <div className="flex items-center justify-between px-4 py-2 bg-[#fdfaf4] border-b border-gray-100">
                            <div className="flex items-center gap-2">
                              {!mine && sender && (
                                <Avatar user={sender} size={24} color={courseColor(courseInfo?.code ?? '', allCodes)} />
                              )}
                              <span className="text-sm font-semibold text-gray-700">{senderName}</span>
                              <span className="text-xs text-gray-400">{fmtMsgTime(msg.created_at)}</span>
                            </div>
                            {/* Read receipt eye icon */}
                            <svg
                              className={`w-4 h-4 ${msg.is_read ? 'text-[#4c1d95]' : 'text-gray-300'}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              aria-label={msg.is_read ? 'Read' : 'Unread'}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </div>

                          {/* Card body */}
                          <div className="px-4 py-3 bg-white text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
                            {msg.body && <p>{msg.body}</p>}
                            {(msg.message_attachments ?? []).map(att => (
                              <CardAttachment key={att.id} att={att} />
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* ── Compose area ──────────────────────────────────────────── */}
            <div className="bg-white border-t border-gray-200 px-5 pt-3 pb-4 flex-shrink-0">
              {sendError && <p className="text-xs text-red-600 mb-2">{sendError}</p>}

              {/* File chips */}
              {selectedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedFiles.map((f, i) => (
                    <div key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-200 rounded text-xs text-indigo-700">
                      <span>{f.type.startsWith('image/') ? '🖼' : f.type === 'application/pdf' ? '📄' : '📎'}</span>
                      <span className="max-w-[100px] truncate font-medium">{f.name}</span>
                      <button type="button" onClick={() => setSelectedFiles(p => p.filter((_, j) => j !== i))} className="text-indigo-400 hover:text-indigo-700">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message…"
                rows={3}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95] resize-none"
              />

              {/* Toolbar row */}
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-3">
                  {/* Aa — formatting placeholder */}
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-semibold"
                    title="Text formatting"
                  >
                    <span className="text-sm font-bold">Aa</span>
                  </button>

                  {/* Add Attachment */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#4c1d95] transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Attachment
                  </button>
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
                </div>

                <div className="flex items-center gap-2">
                  {/* DISCARD */}
                  <button
                    type="button"
                    onClick={handleDiscard}
                    className="px-4 py-1.5 text-sm font-semibold text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                  >
                    DISCARD
                  </button>

                  {/* SEND */}
                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={sending || (!textInput.trim() && selectedFiles.length === 0)}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {sending ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
                      </svg>
                    )}
                    SEND
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ══ New Message Modal ════════════════════════════════════════════════ */}
      {composeOpen && userId && (
        <NewMessageModal
          role={role}
          currentUserId={userId}
          onSelect={handleContactSelect}
          onClose={() => setComposeOpen(false)}
        />
      )}
    </div>
  );
}
