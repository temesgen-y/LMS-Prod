'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useUnreadGroups(userId: string | null): number {
  const [count, setCount] = useState(0);

  const compute = useCallback(async () => {
    if (!userId || typeof window === 'undefined') { setCount(0); return; }
    const supabase = createClient();

    // Fetch all groups I'm an active member of
    const { data: memberships } = await supabase
      .from('study_group_members')
      .select('group_id')
      .eq('student_id', userId)
      .eq('status', 'active');

    if (!memberships || memberships.length === 0) { setCount(0); return; }
    const groupIds = memberships.map((m: { group_id: string }) => m.group_id);

    // Get latest message per group
    const { data: latestMsgs } = await supabase
      .from('study_group_messages')
      .select('group_id, sender_id, created_at')
      .in('group_id', groupIds)
      .order('created_at', { ascending: false });

    if (!latestMsgs) { setCount(0); return; }

    // Group by group_id, keeping only the latest
    const latestByGroup = new Map<string, { sender_id: string; created_at: string }>();
    for (const msg of latestMsgs) {
      const row = msg as { group_id: string; sender_id: string; created_at: string };
      if (!latestByGroup.has(row.group_id)) {
        latestByGroup.set(row.group_id, { sender_id: row.sender_id, created_at: row.created_at });
      }
    }

    let unread = 0;
    for (const [gId, latest] of latestByGroup) {
      if (latest.sender_id === userId) continue; // I sent it
      const lastSeen = localStorage.getItem(`sg_seen_${gId}`);
      if (!lastSeen || latest.created_at > lastSeen) unread++;
    }
    setCount(unread);
  }, [userId]);

  useEffect(() => {
    compute();
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`unread-groups-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'study_group_messages' },
        () => { compute(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, compute]);

  return count;
}
