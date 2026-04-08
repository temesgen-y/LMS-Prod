'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ForumIndexPage from '@/components/forum/ForumIndexPage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Offering {
  id: string;
  section_name: string;
  courseCode: string;
  courseTitle: string;
}

// ─── Inner component (uses useSearchParams, must be wrapped in Suspense) ──────

function InstructorDiscussionForumsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState('');
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [selectedOfferingId, setSelectedOfferingId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const supabase = createClient();

        // Get auth user
        const { data: authData } = await supabase.auth.getUser();
        if (!authData.user) { router.push('/login'); return; }

        // Get app user
        const { data: appUser } = await supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', authData.user.id)
          .single();
        if (!appUser) return;
        const appUserId = (appUser as { id: string }).id;
        setUserId(appUserId);

        // Fetch instructor's offerings via course_instructors
        const { data: ciRows } = await supabase
          .from('course_instructors')
          .select(`
            course_offerings!fk_course_instructors_offering(
              id, section_name,
              courses!fk_course_offerings_course(code, title)
            )
          `)
          .eq('instructor_id', appUserId);

        const offeringList: Offering[] = ((ciRows ?? []) as any[])
          .map((row: any) => {
            const co = row.course_offerings;
            if (!co) return null;
            return {
              id: co.id,
              section_name: co.section_name ?? '',
              courseCode: co.courses?.code ?? '',
              courseTitle: co.courses?.title ?? '',
            };
          })
          .filter(Boolean) as Offering[];

        // Deduplicate by offering id
        const seen = new Set<string>();
        const dedupedOfferings = offeringList.filter(o => {
          if (seen.has(o.id)) return false;
          seen.add(o.id);
          return true;
        });

        setOfferings(dedupedOfferings);

        // Determine selected offering from URL or auto-select first
        const urlOffering = searchParams.get('offering');
        if (urlOffering && dedupedOfferings.some(o => o.id === urlOffering)) {
          setSelectedOfferingId(urlOffering);
        } else if (dedupedOfferings.length > 0) {
          setSelectedOfferingId(dedupedOfferings[0].id);
          router.replace(`/instructor/discussion-forums?offering=${dedupedOfferings[0].id}`);
        }
      } finally {
        setLoading(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When user changes dropdown
  const handleOfferingChange = (offeringId: string) => {
    setSelectedOfferingId(offeringId);
    router.push(`/instructor/discussion-forums?offering=${offeringId}`);
  };

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-10 bg-gray-200 rounded w-64" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  // ─── No offerings ──────────────────────────────────────────────────────────
  if (offerings.length === 0) {
    return (
      <div className="w-full p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p className="text-gray-500 font-medium">No course offerings assigned</p>
        <p className="text-sm text-gray-400 mt-1">
          You are not assigned as instructor on any active course offering.
        </p>
      </div>
    );
  }

  // ─── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="w-full min-w-0">
      {/* Course selector */}
      {offerings.length > 1 && (
        <div className="mb-6">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Select Course
          </label>
          <select
            value={selectedOfferingId}
            onChange={e => handleOfferingChange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent max-w-sm w-full"
          >
            {offerings.map(o => (
              <option key={o.id} value={o.id}>
                {o.courseCode} — {o.courseTitle}
                {o.section_name ? ` (Section ${o.section_name})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Single offering label */}
      {offerings.length === 1 && (
        <div className="mb-6">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-0.5">Course</p>
          <p className="text-base font-semibold text-gray-800">
            {offerings[0].courseCode} — {offerings[0].courseTitle}
            {offerings[0].section_name ? ` · Section ${offerings[0].section_name}` : ''}
          </p>
        </div>
      )}

      {/* Forum index */}
      {selectedOfferingId && userId && (
        <ForumIndexPage
          key={selectedOfferingId}
          offeringId={selectedOfferingId}
          role="instructor"
          userId={userId}
          onOpenThread={(threadId) =>
            router.push(
              `/instructor/discussion-forums/${threadId}?offering=${selectedOfferingId}`
            )
          }
        />
      )}
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function InstructorDiscussionForumsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400 text-sm">Loading...</div>}>
      <InstructorDiscussionForumsInner />
    </Suspense>
  );
}
