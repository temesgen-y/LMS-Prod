'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ThreadDetailPage from '@/components/forum/ThreadDetailPage';

export default function StudentThreadPage() {
  const params = useParams();
  const offeringId = params?.id as string;
  const threadId = params?.threadId as string;
  const router = useRouter();
  const [userId, setUserId] = useState('');

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;
      const { data: appUser } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', authData.user.id)
        .single();
      if (appUser) setUserId((appUser as { id: string }).id);
    };
    init();
  }, []);

  if (!offeringId || !threadId || !userId) {
    return <div className="p-8 text-gray-400 text-sm">Loading...</div>;
  }

  return (
    <ThreadDetailPage
      offeringId={offeringId}
      threadId={threadId}
      role="student"
      userId={userId}
      onBack={() => router.push(`/dashboard/class/${offeringId}/forums`)}
    />
  );
}
