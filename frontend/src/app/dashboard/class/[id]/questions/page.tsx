'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function ClassQuestionsPage() {
  const params = useParams();
  const id = params?.id as string;

  return (
    <div className="w-full min-w-0">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl" aria-hidden>👤</span>
        <h1 className="text-2xl font-bold text-gray-900">Class Questions</h1>
      </div>
      <div className="border-t border-gray-200 mb-6" />

      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
        <span className="text-5xl block mb-4">💬</span>
        <p className="text-gray-600 font-medium mb-2">Have a question for your instructor?</p>
        <p className="text-gray-400 text-sm mb-5">
          Use the Discussion Forums to post questions that the whole class can benefit from,
          or reach out directly through the messaging system.
        </p>
        <Link
          href={`/dashboard/class/${id}/forums`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#4c1d95] hover:bg-[#5b21b6] text-white text-sm font-semibold transition-colors"
        >
          Go to Discussion Forums
        </Link>
      </div>
    </div>
  );
}
