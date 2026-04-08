'use client';

import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type CourseInfo = {
  courseCode: string;
  courseTitle: string;
  sectionName: string;
};

type TopicTab = {
  id: string;
  index: number; // 1-based position
};

// ─── Nav config ───────────────────────────────────────────────────────────────

const STATIC_TABS = [
  { href: 'calendar',      label: 'Calendar',     icon: '📅' },
  { href: 'announcements', label: 'Announcements', icon: '📢' },
  { href: 'syllabus',      label: 'Syllabus',      icon: '📋' },
  { href: 'gradebook',     label: 'Gradebook',     icon: '📊' },
  { href: 'forums',        label: 'Forums',        icon: '💬' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function primaryInstructor(
  instructors: Array<{ role: string; users: { first_name: string; last_name: string } | null }> | null
): string {
  if (!instructors || instructors.length === 0) return 'TBA';
  const primary = instructors.find(i => i.role === 'primary') ?? instructors[0];
  if (!primary.users) return 'TBA';
  return `${primary.users.first_name} ${primary.users.last_name}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClassLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const id = params?.id as string;
  const base = `/dashboard/class/${id}`;

  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [topics, setTopics] = useState<TopicTab[]>([]);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();

    // Fetch course info and visible modules in parallel
    Promise.all([
      supabase
        .from('course_offerings')
        .select(`
          id, section_name,
          courses!fk_course_offerings_course(code, title),
          course_instructors(
            role,
            users!fk_course_instructors_instructor(first_name, last_name)
          )
        `)
        .eq('id', id)
        .single(),
      supabase
        .from('course_modules')
        .select('id, sort_order')
        .eq('offering_id', id)
        .eq('is_visible', true)
        .order('sort_order', { ascending: true }),
    ]).then(([offeringRes, modulesRes]) => {
      if (offeringRes.data) {
        const d = offeringRes.data as any;
        setCourse({
          courseCode:  d.courses?.code ?? '',
          courseTitle: `${d.courses?.code ?? ''}-${d.section_name ?? ''} ${d.courses?.title ?? ''}`,
          sectionName: d.section_name ?? '',
        });
      }
      if (modulesRes.data) {
        setTopics(
          (modulesRes.data as any[]).map((m, idx) => ({ id: m.id, index: idx + 1 }))
        );
      }
    });
  }, [id]);

  const isStaticTabActive = (href: string) => {
    if (href === 'calendar') return pathname === base || pathname === `${base}/calendar`;
    return (pathname ?? '').startsWith(`${base}/${href}`);
  };

  // A topic tab is active when the pathname is exactly /tN or starts with /tN/
  const isTopicActive = (n: number) => {
    const exact = `${base}/t${n}`;
    return pathname === exact || (pathname ?? '').startsWith(`${exact}/`);
  };

  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
      active
        ? 'border-[#4c1d95] text-[#4c1d95]'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

      {/* ── Course tab bar ────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 shrink-0">

        {/* Course info strip */}
        <div className="px-6 pt-2.5 pb-0 flex items-center gap-2.5 min-h-[32px]">
          {course ? (
            <>
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">
                {course.sectionName}
              </span>
              <span className="text-sm font-semibold text-gray-800 truncate">{course.courseTitle}</span>
            </>
          ) : (
            <div className="h-4 bg-gray-100 rounded w-48 animate-pulse" />
          )}
        </div>

        {/* Tab row — topic tabs first, then static tabs */}
        <nav className="flex items-end gap-0 px-4 overflow-x-auto">

          {/* Dynamic topic tabs — one per visible module */}
          {topics.map(topic => (
            <Link
              key={topic.id}
              href={`${base}/t${topic.index}`}
              className={tabClass(isTopicActive(topic.index))}
            >
              T{topic.index}
            </Link>
          ))}

          {/* Divider between topic tabs and static tabs */}
          {topics.length > 0 && (
            <span className="self-center mx-1 h-4 w-px bg-gray-200 flex-shrink-0" />
          )}

          {/* Static tabs */}
          {STATIC_TABS.map(tab => (
            <Link
              key={tab.href}
              href={tab.href === 'calendar' ? base : `${base}/${tab.href}`}
              className={tabClass(isStaticTabActive(tab.href))}
            >
              <span className="text-base">{tab.icon}</span>
              <span>{tab.label}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50 px-8 py-6">
        {children}
      </div>
    </div>
  );
}
