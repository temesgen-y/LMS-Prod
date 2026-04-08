'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export type SearchOffering = {
  id: string;
  courseCode: string;
  courseTitle: string;
  termName: string;
  enrolledCount: number;
};

export default function DashboardSearch({ offerings }: { offerings: SearchOffering[] }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const results = q
    ? offerings.filter(
        (o) =>
          o.courseCode.toLowerCase().includes(q) ||
          o.courseTitle.toLowerCase().includes(q) ||
          o.termName.toLowerCase().includes(q),
      )
    : [];

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = (offering: SearchOffering) => {
    setQuery('');
    setOpen(false);
    router.push(`/instructor/courses/${offering.id}/gradebook`);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
          />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search courses, students..."
          className="w-full rounded-full border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
        />
      </div>

      {open && q && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">No courses found for &quot;{query}&quot;</p>
          ) : (
            <ul>
              {results.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(o)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
                  >
                    <span className="inline-block text-xs font-semibold bg-gray-100 text-gray-600 rounded px-2 py-0.5 shrink-0">
                      {o.courseCode}
                    </span>
                    <span className="text-sm text-gray-900 truncate">{o.courseTitle}</span>
                    <span className="ml-auto text-xs text-gray-400 shrink-0">{o.termName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
