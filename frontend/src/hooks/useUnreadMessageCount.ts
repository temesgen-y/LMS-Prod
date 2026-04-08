'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useUnreadMessageCount(userId: string | null): number {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!userId) { setCount(0); return; }
    const supabase = createClient();

    const { data: convs } = await supabase
      .from('conversations')
      .select('id')
      .or(`student_id.eq.${userId},instructor_id.eq.${userId}`);

    if (!convs || convs.length === 0) { setCount(0); return; }

    const convIds = convs.map((c: { id: string }) => c.id);

    const { count: unread } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .in('conversation_id', convIds)
      .neq('sender_id', userId)
      .eq('is_read', false);

    setCount(unread ?? 0);
  }, [userId]);

  useEffect(() => {
    fetchCount();
    if (!userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`unread-msg-count-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => { fetchCount(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchCount]);

  return count;
}
