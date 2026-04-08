'use client';

import Link from 'next/link';

export default function SchedulePage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-[#0078d4] hover:underline mb-6"
      >
        ← Back to Student Home
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Full Schedule</h1>
      <p className="text-gray-600 text-sm mb-6">Your full class schedule will appear here.</p>
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">
        No schedule data yet.
      </div>
    </div>
  );
}
