'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import ThreadDetailPage from '@/components/forum/ThreadDetailPage';

// ─── Inner component (uses useSearchParams) ───────────────────────────────────

function InstructorThreadDetailInner() {
  const params = useParams();
  const threadId = params?.threadId as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const offeringId = searchParams.get('offering') ?? '';
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        if (!authData.user) { router.push('/login'); return; }
        const { data: appUser } = await supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', authData.user.id)
          .single();
        if (appUser) setUserId((appUser as { id: string }).id);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [router]);

  if (loading || !userId || !threadId) {
    return <div className="p-8 text-gray-400 text-sm">Loading...</div>;
  }

  if (!offeringId) {
    return (
      <div className="p-8 text-center text-gray-400">
        <p className="text-sm">Missing offering context. Please go back and try again.</p>
        <button
          type="button"
          onClick={() => router.push('/instructor/discussion-forums')}
          className="mt-3 text-sm text-cyan-600 hover:underline"
        >
          ← Back to Discussion Forums
        </button>
      </div>
    );
  }

  return (
    <ThreadDetailPage
      offeringId={offeringId}
      threadId={threadId}
      role="instructor"
      userId={userId}
      onBack={() => router.push(`/instructor/discussion-forums?offering=${offeringId}`)}
    />
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function InstructorThreadPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400 text-sm">Loading...</div>}>
      <InstructorThreadDetailInner />
    </Suspense>
  );
}
