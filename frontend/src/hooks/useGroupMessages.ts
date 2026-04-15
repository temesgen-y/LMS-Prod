'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { StudyGroupMessage } from '@/types/study-groups';

export function useGroupMessages(groupId: string | null, userId: string | null) {
  const [messages, setMessages] = useState<StudyGroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  }, []);

  const markSeen = useCallback((gId: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`sg_seen_${gId}`, new Date().toISOString());
    }
  }, []);

  const fetchFullMessage = useCallback(async (msgId: string): Promise<StudyGroupMessage | null> => {
    const supabase = createClient();
    const { data } = await supabase
      .from('study_group_messages')
      .select(`
        id, group_id, sender_id, body, is_pinned, created_at,
        users ( id, first_name, last_name, avatar_url ),
        study_group_attachments (
          id, attachment_id,
          attachments ( file_name, file_url, mime_type, size_kb )
        )
      `)
      .eq('id', msgId)
      .single();
    return data as StudyGroupMessage | null;
  }, []);

  const loadMessages = useCallback(async () => {
    if (!groupId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data, error: err } = await supabase
      .from('study_group_messages')
      .select(`
        id, group_id, sender_id, body, is_pinned, created_at,
        users ( id, first_name, last_name, avatar_url ),
        study_group_attachments (
          id, attachment_id,
          attachments ( file_name, file_url, mime_type, size_kb )
        )
      `)
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (err) { setError(err.message); setLoading(false); return; }

    const ordered = [...(data ?? [])].reverse().map((row) => ({
      ...row,
      users: Array.isArray(row.users) ? (row.users[0] ?? undefined) : row.users,
      study_group_attachments: (row.study_group_attachments ?? []).map((a: any) => ({
        ...a,
        attachments: Array.isArray(a.attachments) ? (a.attachments[0] ?? undefined) : a.attachments,
      })),
    })) as StudyGroupMessage[];
    setMessages(ordered);
    setLoading(false);
    markSeen(groupId);
    scrollToBottom();
  }, [groupId, scrollToBottom, markSeen]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!groupId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`study-group-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'study_group_messages',
          filter: `group_id=eq.${groupId}`,
        },
        async (payload) => {
          const newMsg = await fetchFullMessage(payload.new.id as string);
          if (newMsg) {
            setMessages(prev => {
              // avoid duplicate if we already appended optimistically
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            if (groupId) markSeen(groupId);
            scrollToBottom();
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [groupId, fetchFullMessage, scrollToBottom, markSeen]);

  const sendMessage = useCallback(async (body: string, files: File[]) => {
    if (!groupId || !userId) throw new Error('Not authenticated');
    if (!body.trim() && files.length === 0) throw new Error('Nothing to send');
    setSending(true);
    setError(null);
    const supabase = createClient();

    try {
      const attachmentIds: string[] = [];

      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) throw new Error(`"${file.name}" exceeds the 10 MB limit`);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `study-groups/${groupId}/${Date.now()}_${safeName}`;

        const { error: storageErr } = await supabase.storage
          .from('lms-uploads')
          .upload(filePath, file, { upsert: false });
        if (storageErr) throw new Error(storageErr.message);

        const { data: urlData } = supabase.storage.from('lms-uploads').getPublicUrl(filePath);

        const { data: att, error: attErr } = await supabase
          .from('attachments')
          .insert({
            file_name: file.name,
            file_url: urlData.publicUrl,
            mime_type: file.type,
            size_kb: Math.ceil(file.size / 1024),
            uploaded_by: userId,
          })
          .select('id')
          .single();
        if (attErr) throw new Error(attErr.message);
        attachmentIds.push((att as { id: string }).id);
      }

      const { data: msg, error: msgErr } = await supabase
        .from('study_group_messages')
        .insert({
          group_id: groupId,
          sender_id: userId,
          body: body.trim() || null,
        })
        .select('id')
        .single();
      if (msgErr) throw new Error(msgErr.message);

      const msgId = (msg as { id: string }).id;
      for (const attId of attachmentIds) {
        await supabase.from('study_group_attachments').insert({
          message_id: msgId,
          attachment_id: attId,
        });
      }
    } finally {
      setSending(false);
    }
  }, [groupId, userId]);

  const deleteMessage = useCallback(async (messageId: string) => {
    const supabase = createClient();
    const { error: err } = await supabase
      .from('study_group_messages')
      .delete()
      .eq('id', messageId);
    if (err) throw new Error(err.message);
    setMessages(prev => prev.filter(m => m.id !== messageId));
  }, []);

  const pinMessage = useCallback(async (messageId: string, isPinned: boolean) => {
    const supabase = createClient();
    const { error: err } = await supabase
      .from('study_group_messages')
      .update({ is_pinned: isPinned })
      .eq('id', messageId);
    if (err) throw new Error(err.message);
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_pinned: isPinned } : m));
  }, []);

  return {
    messages,
    loading,
    sending,
    error,
    bottomRef,
    sendMessage,
    deleteMessage,
    pinMessage,
    reload: loadMessages,
  };
}
