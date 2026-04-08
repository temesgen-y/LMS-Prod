'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useStudyGroups } from '@/hooks/useStudyGroups';
import CreateGroupModal from '@/components/study-groups/CreateGroupModal';
import type { StudyGroup, StudyGroupInvitation } from '@/types/study-groups';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function GroupCard({
  group,
  userId,
  onLeave,
}: {
  group: StudyGroup;
  userId: string;
  onLeave: (g: StudyGroup) => void;
}) {
  const activeMembers = group.study_group_members?.filter(m => m.status === 'active') ?? [];
  const course = group.course_offerings?.courses;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-[#4c1d95]/10 flex items-center justify-center text-[#4c1d95] text-lg flex-shrink-0">
          👥
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900 text-sm truncate">{group.name}</p>
            {course && (
              <span className="px-1.5 py-0.5 bg-[#4c1d95]/10 text-[#4c1d95] text-[10px] font-semibold rounded">
                {course.code}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {activeMembers.length} {activeMembers.length === 1 ? 'member' : 'members'}
          </p>
          {group.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-1">{group.description}</p>
          )}
        </div>
        <p className="text-xs text-gray-400 flex-shrink-0">{timeAgo(group.updated_at)}</p>
      </div>

      <div className="flex gap-2">
        <Link
          href={`/dashboard/study-groups/${group.id}`}
          className="flex-1 text-center px-3 py-1.5 text-sm font-medium text-white bg-[#4c1d95] rounded-lg hover:bg-[#5b21b6] transition-colors"
        >
          Open
        </Link>
        <button
          type="button"
          onClick={() => onLeave(group)}
          className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
        >
          Leave
        </button>
      </div>
    </div>
  );
}

function InvitationCard({
  inv,
  onAccept,
  onDecline,
}: {
  inv: StudyGroupInvitation;
  onAccept: (inv: StudyGroupInvitation) => void;
  onDecline: (inv: StudyGroupInvitation) => void;
}) {
  const course = inv.study_groups?.course_offerings?.courses;
  const inviterName = inv.inviter
    ? `${inv.inviter.first_name} ${inv.inviter.last_name}`
    : 'Someone';

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-lg flex-shrink-0">
          👥
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{inv.study_groups?.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">Invited by: {inviterName}</p>
          {course && (
            <span className="mt-1 inline-block px-1.5 py-0.5 bg-[#4c1d95]/10 text-[#4c1d95] text-[10px] font-semibold rounded">
              {course.code}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onAccept(inv)}
          className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-[#4c1d95] rounded-lg hover:bg-[#5b21b6] transition-colors"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => onDecline(inv)}
          className="flex-1 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

export default function StudyGroupsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<StudyGroup | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { myGroups, invitations, loading, createGroup, leaveGroup, acceptInvitation, declineInvitation } =
    useStudyGroups(userId);

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace('/login'); return; }

      const { data: u } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', auth.user.id)
        .single();
      if (u) setUserId((u as { id: string }).id);

      const { data: settings } = await supabase
        .from('institution_settings')
        .select('features')
        .single();
      const enabled = (settings?.features as Record<string, unknown>)?.study_groups ?? false;
      setFeatureEnabled(!!enabled);
    };
    init();
  }, [router]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleCreated = (group: { id: string; name: string }) => {
    setShowCreate(false);
    showToast('Study group created successfully!');
    router.push(`/dashboard/study-groups/${group.id}`);
  };

  const handleLeaveConfirm = async () => {
    if (!leaveTarget) return;
    try {
      await leaveGroup(leaveTarget.id);
      setLeaveTarget(null);
      showToast(`You left "${leaveTarget.name}".`);
    } catch (e) {
      setActionError((e as Error).message);
      setLeaveTarget(null);
    }
  };

  const handleAccept = async (inv: StudyGroupInvitation) => {
    try {
      await acceptInvitation(inv.group_id);
      showToast(`Joined "${inv.study_groups?.name}"!`);
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const handleDecline = async (inv: StudyGroupInvitation) => {
    try {
      await declineInvitation(inv.group_id);
      showToast('Invitation declined.');
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  // Loading state
  if (featureEnabled === null || (featureEnabled && !userId)) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <svg className="w-6 h-6 animate-spin text-[#4c1d95]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    );
  }

  // Feature disabled
  if (!featureEnabled) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
        <div className="text-5xl">🔒</div>
        <h2 className="text-lg font-semibold text-gray-800">Study Groups Not Available</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          Study Groups have not been enabled for this institution. Contact your administrator.
        </p>
      </div>
    );
  }

  const hasContent = myGroups.length > 0 || invitations.length > 0;

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Study Groups</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Collaborate with classmates in self-organized study groups.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#4c1d95] rounded-lg hover:bg-[#5b21b6] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Group
          </button>
        </div>

        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {actionError}
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="ml-2 underline text-red-600 hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 h-28 animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !hasContent && (
          <div className="text-center py-16 flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center text-4xl">
              👥
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-800">No study groups yet</h2>
              <p className="text-sm text-gray-500 mt-1 max-w-xs">
                Create a group to start collaborating with your classmates.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#4c1d95] rounded-lg hover:bg-[#5b21b6] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Group
            </button>
          </div>
        )}

        {/* Invitations */}
        {!loading && invitations.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Invitations ({invitations.length} pending)
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {invitations.map(inv => (
                <InvitationCard
                  key={inv.id}
                  inv={inv}
                  onAccept={handleAccept}
                  onDecline={handleDecline}
                />
              ))}
            </div>
          </section>
        )}

        {/* My groups */}
        {!loading && myGroups.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              My Groups
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {myGroups.map(g => (
                <GroupCard
                  key={g.id}
                  group={g}
                  userId={userId!}
                  onLeave={setLeaveTarget}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Create modal */}
      {showCreate && userId && (
        <CreateGroupModal
          userId={userId}
          onCreated={handleCreated}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Leave confirmation dialog */}
      {leaveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-2">Leave group?</h3>
            <p className="text-sm text-gray-600 mb-5">
              You will leave <span className="font-medium">"{leaveTarget.name}"</span>. You can be
              re-invited by the group owner.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setLeaveTarget(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLeaveConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Leave Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
