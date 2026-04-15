'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { StudyGroup, StudyGroupInvitation } from '@/types/study-groups';

export function useStudyGroups(userId: string | null) {
  const [myGroups, setMyGroups] = useState<StudyGroup[]>([]);
  const [invitations, setInvitations] = useState<StudyGroupInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const supabase = createClient();

    // ── Step 1: get the group IDs the user is actively a member of ──────────
    const { data: memberships, error: memErr } = await supabase
      .from('study_group_members')
      .select('group_id')
      .eq('student_id', userId)
      .eq('status', 'active');

    if (memErr) { setError(memErr.message); setLoading(false); return; }

    const activeGroupIds = (memberships ?? []).map((m: { group_id: string }) => m.group_id);

    // ── Step 2: fetch those groups (no FK-disambiguation needed here) ────────
    let mine: StudyGroup[] = [];
    if (activeGroupIds.length > 0) {
      const { data: groupsData, error: gErr } = await supabase
        .from('study_groups')
        .select(`
          id, name, description, is_active,
          created_by, created_at, updated_at, offering_id,
          course_offerings ( courses ( code, title ) ),
          study_group_members ( id, student_id, role, status )
        `)
        .in('id', activeGroupIds)
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

      if (gErr) { setError(gErr.message); setLoading(false); return; }
      mine = (groupsData ?? []) as unknown as StudyGroup[];
    }
    setMyGroups(mine);

    // ── Step 3: pending invitations ──────────────────────────────────────────
    const { data: invites, error: invErr } = await supabase
      .from('study_group_members')
      .select(`
        id, group_id, role, status, invited_by, joined_at,
        study_groups (
          id, name, offering_id,
          course_offerings ( courses ( code, title ) )
        )
      `)
      .eq('student_id', userId)
      .eq('status', 'invited');

    if (invErr) { setLoading(false); return; }

    // ── Step 4: fetch inviter names separately (avoids FK ambiguity) ─────────
    const inviterIds = [...new Set(
      (invites ?? [])
        .map((i: { invited_by: string | null }) => i.invited_by)
        .filter(Boolean) as string[]
    )];

    const inviterMap: Record<string, { first_name: string; last_name: string }> = {};
    if (inviterIds.length > 0) {
      const { data: inviters } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .in('id', inviterIds);
      for (const u of inviters ?? []) {
        const row = u as { id: string; first_name: string; last_name: string };
        inviterMap[row.id] = { first_name: row.first_name, last_name: row.last_name };
      }
    }

    const mapped = (invites ?? []).map((i: any) => ({
      ...i,
      inviter: i.invited_by ? (inviterMap[i.invited_by] ?? null) : null,
    }));
    setInvitations(mapped as unknown as StudyGroupInvitation[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const createGroup = useCallback(async (
    offeringId: string,
    name: string,
    description: string | null,
  ): Promise<StudyGroup> => {
    if (!userId) throw new Error('Not authenticated');
    const supabase = createClient();

    const { data: group, error: gErr } = await supabase
      .from('study_groups')
      .insert({ offering_id: offeringId, created_by: userId, name, description })
      .select()
      .single();
    if (gErr) throw new Error(gErr.message);

    const { error: mErr } = await supabase.from('study_group_members').insert({
      group_id: (group as StudyGroup).id,
      student_id: userId,
      role: 'owner',
      status: 'active',
    });
    if (mErr) throw new Error(mErr.message);

    await loadGroups();
    return group as StudyGroup;
  }, [userId, loadGroups]);

  const leaveGroup = useCallback(async (groupId: string) => {
    if (!userId) throw new Error('Not authenticated');
    const supabase = createClient();
    const { error: err } = await supabase
      .from('study_group_members')
      .update({ status: 'left' })
      .eq('group_id', groupId)
      .eq('student_id', userId);
    if (err) throw new Error(err.message);
    await loadGroups();
  }, [userId, loadGroups]);

  const acceptInvitation = useCallback(async (groupId: string) => {
    if (!userId) throw new Error('Not authenticated');
    const supabase = createClient();
    const { error: err } = await supabase
      .from('study_group_members')
      .update({ status: 'active', joined_at: new Date().toISOString() })
      .eq('group_id', groupId)
      .eq('student_id', userId);
    if (err) throw new Error(err.message);
    await loadGroups();
  }, [userId, loadGroups]);

  const declineInvitation = useCallback(async (groupId: string) => {
    if (!userId) throw new Error('Not authenticated');
    const supabase = createClient();
    const { error: err } = await supabase
      .from('study_group_members')
      .update({ status: 'left' })
      .eq('group_id', groupId)
      .eq('student_id', userId);
    if (err) throw new Error(err.message);
    await loadGroups();
  }, [userId, loadGroups]);

  return {
    myGroups,
    invitations,
    loading,
    error,
    createGroup,
    leaveGroup,
    acceptInvitation,
    declineInvitation,
    reload: loadGroups,
  };
}
