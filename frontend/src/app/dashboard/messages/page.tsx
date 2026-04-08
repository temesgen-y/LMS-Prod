'use client';

import { Suspense } from 'react';
import MessagesPage from '@/components/messages/MessagesPage';

export default function StudentMessagesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading…</div>}>
      <MessagesPage role="student" />
    </Suspense>
  );
}
