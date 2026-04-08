'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Classmate {
  student_id: string;
  first_name: string;
  last_name: string;
  student_no: string | null;
  alreadyMember: boolean;
  invited: boolean;
}

interface Props {
  groupId: string;
  offeringId: string;
  currentUserId: string;
  courseCode: string;
  onClose: () => void;
}

export default function InviteMemberModal({
  groupId,
  offeringId,
  currentUserId,
  courseCode,
  onClose,
}: Props) {
  const [classmates, setClassmates] = useState<Classmate[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [inviting, setInviting] = useState<string | null>(null);

  const loadClassmates = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    // Step 1: get student_ids enrolled in this offering (excluding self)
    const { data: enrolled, error: enrErr } = await supabase
      .from('enrollments')
      .select('student_id')
      .eq('offering_id', offeringId)
      .eq('status', 'active')
      .neq('student_id', currentUserId);

    if (enrErr || !enrolled || enrolled.length === 0) { setLoading(false); return; }

    const studentIds = enrolled.map((e: { student_id: string }) => e.student_id);

    // Step 2: fetch user names for those student_ids
    const { data: usersData } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .in('id', studentIds);

    const userMap = new Map<string, { first_name: string; last_name: string }>();
    for (const u of usersData ?? []) {
      const row = u as { id: string; first_name: string; last_name: string };
      userMap.set(row.id, { first_name: row.first_name, last_name: row.last_name });
    }

    // Get student numbers
    const { data: profiles } = studentIds.length > 0
      ? await supabase
          .from('student_profiles')
          .select('user_id, student_no')
          .in('user_id', studentIds)
      : { data: [] };

    const profileMap = new Map<string, string>();
    for (const p of profiles ?? []) {
      profileMap.set((p as any).user_id, (p as any).student_no ?? '');
    }

    // Get existing group members (active + invited)
    const { data: existingMembers } = await supabase
      .from('study_group_members')
      .select('student_id, status')
      .eq('group_id', groupId)
      .in('status', ['active', 'invited']);

    const memberSet = new Set<string>(
      (existingMembers ?? []).map((m: any) => m.student_id as string)
    );

    const list: Classmate[] = enrolled.map((e: any) => ({
      student_id: e.student_id,
      first_name: userMap.get(e.student_id)?.first_name ?? '',
      last_name: userMap.get(e.student_id)?.last_name ?? '',
      student_no: profileMap.get(e.student_id) ?? null,
      alreadyMember: memberSet.has(e.student_id),
      invited: false,
    }));

    // Sort: non-members first, then alphabetically
    list.sort((a, b) => {
      if (a.alreadyMember !== b.alreadyMember) return a.alreadyMember ? 1 : -1;
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    });

    setClassmates(list);
    setLoading(false);
  }, [groupId, offeringId, currentUserId]);

  useEffect(() => { loadClassmates(); }, [loadClassmates]);

  const handleInvite = async (studentId: string) => {
    setInviting(studentId);
    const supabase = createClient();
    await supabase.from('study_group_members').insert({
      group_id: groupId,
      student_id: studentId,
      role: 'member',
      status: 'invited',
      invited_by: currentUserId,
    });
    setClassmates(prev =>
      prev.map(c => c.student_id === studentId ? { ...c, alreadyMember: true, invited: true } : c)
    );
    setInviting(null);
  };

  const filtered = classmates.filter(c => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      (c.student_no ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Invite Student</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 flex-shrink-0">
          <label className="block text-sm text-gray-600 mb-2">
            Search student in {courseCode}
          </label>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or student no…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-2">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-gray-100 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              {query ? 'No students match your search.' : 'No classmates found.'}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map(c => (
                <li key={c.student_id} className="flex items-center gap-3 py-3">
                  <div className="w-9 h-9 rounded-full bg-[#4c1d95]/10 flex items-center justify-center text-[#4c1d95] font-semibold text-sm flex-shrink-0">
                    {c.first_name[0]}{c.last_name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {c.first_name} {c.last_name}
                    </p>
                    {c.student_no && (
                      <p className="text-xs text-gray-500">{c.student_no}</p>
                    )}
                  </div>
                  {c.alreadyMember ? (
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1 flex-shrink-0">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {c.invited ? 'Invited' : 'Member'}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleInvite(c.student_id)}
                      disabled={inviting === c.student_id}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[#4c1d95] text-[#4c1d95] hover:bg-[#4c1d95] hover:text-white transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      {inviting === c.student_id ? '…' : 'Invite'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
