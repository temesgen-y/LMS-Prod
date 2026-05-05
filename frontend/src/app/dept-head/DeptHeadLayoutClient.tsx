'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  InstructorCourseProvider,
  useInstructorCourse,
} from '@/contexts/InstructorCourseContext';
import { ThemeToggle } from '@/components/ThemeToggle';

export type DeptHeadUser = { id: string; name: string; email: string };

type Notif = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

const HEADER_BG = '#4c1d95';

function getInitials(name: string): string {
  return name.split(/\s+/).map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function NavIcon({ name }: { name: string }) {
  const c = 'w-4 h-4 shrink-0';
  switch (name) {
    case 'home':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;
    case 'course-modules':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>;
    case 'live-sessions':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>;
    case 'assessments':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
    case 'assignments':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>;
    case 'syllabus':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
    case 'gradebook':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>;
    case 'attendance':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    case 'announcements':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.012-6.062a1.76 1.76 0 00-1.756-1.26H3.24A1.76 1.76 0 011.48 12 1.76 1.76 0 013.24 10.24h.586l2.012-6.062A1.76 1.76 0 017.235 3h.586a1.76 1.76 0 011.756 1.26L11 5.882zM18 9a2 2 0 100 4 2 2 0 000-4zm0 8a4 4 0 100-8 4 4 0 000 8z" /></svg>;
    case 'forums':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" /></svg>;
    case 'notifications':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>;
    case 'schedule':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
    case 'roster':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
    case 'attendance-report':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
    case 'leave':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
    case 'calendar':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
    case 'instructors':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
    case 'course-offerings':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
    case 'reports':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
    case 'leave-request':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
    case 'leave-balance':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>;
    case 'leave-history':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    case 'clearance':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>;
    case 'settings':
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg>;
    default:
      return <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>;
  }
}

/* ── Outer wrapper — provides InstructorCourseContext ─────── */
export default function DeptHeadLayoutClient({
  user,
  children,
}: {
  user: DeptHeadUser;
  children: React.ReactNode;
}) {
  return (
    <InstructorCourseProvider>
      <DeptHeadLayoutInner user={user}>{children}</DeptHeadLayoutInner>
    </InstructorCourseProvider>
  );
}

/* ── Inner shell — consumes InstructorCourseContext ─────────── */
function DeptHeadLayoutInner({
  user,
  children,
}: {
  user: DeptHeadUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeOfferingId, allOfferings, setActiveOfferingId, loadingOfferings } =
    useInstructorCourse();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [classesOpen, setClassesOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

  const classesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNotifOpen(false);
    setUserMenuOpen(false);
    setClassesOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (classesRef.current && !classesRef.current.contains(e.target as Node)) {
        setClassesOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadNotifs = useCallback(async () => {
    if (!user.id) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, link, is_read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) {
      const nd = data as Notif[];
      setNotifs(nd.slice(0, 10));
      setUnreadCount(nd.filter((n) => !n.is_read).length);
    }
  }, [user.id]);

  useEffect(() => { loadNotifs(); }, [loadNotifs]);

  useEffect(() => {
    const fetchPendingCount = async () => {
      if (!user.id) return;
      const supabase = createClient();
      const { data: dhProfile } = await supabase
        .from('department_head_profiles')
        .select('department_id')
        .eq('user_id', user.id)
        .eq('profile_status', 'active')
        .maybeSingle();
      if (!(dhProfile as any)?.department_id) return;
      const { data: instrProfiles } = await supabase
        .from('instructor_profiles')
        .select('user_id')
        .eq('department', (dhProfile as any).department_id);
      const instrIds = (instrProfiles ?? []).map((p: any) => p.user_id);
      if (instrIds.length === 0) return;
      const { count } = await supabase
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .in('requester_id', instrIds)
        .eq('status', 'pending');
      setPendingLeaveCount(count ?? 0);
    };
    fetchPendingCount();
  }, [user.id]);

  const markRead = async (notifId: string) => {
    const supabase = createClient();
    await supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
    setNotifs((prev) => {
      const updated = prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n));
      setUnreadCount(updated.filter((n) => !n.is_read).length);
      return updated;
    });
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  const fmtTime = (ts: string) => {
    const diffH = (Date.now() - new Date(ts).getTime()) / 3600000;
    if (diffH < 1) return `${Math.floor(diffH * 60)}m ago`;
    if (diffH < 24) return `${Math.floor(diffH)}h ago`;
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Dynamic hrefs from active offering
  const gradebookHref = activeOfferingId
    ? `/dept-head/courses/${activeOfferingId}/gradebook`
    : '/dept-head/gradebook';
  const syllabusHref = activeOfferingId
    ? `/dept-head/courses/${activeOfferingId}/syllabus`
    : '/dept-head/syllabus';

  const checkActive = (href: string): boolean => {
    if (pathname === href) return true;
    // Dynamic offering routes: match by page type (gradebook / syllabus)
    if (href.includes('/courses/') && href.endsWith('/gradebook')) {
      return pathname.includes('/courses/') && pathname.endsWith('/gradebook');
    }
    if (href.includes('/courses/') && href.endsWith('/syllabus')) {
      return pathname.includes('/courses/') && pathname.endsWith('/syllabus');
    }
    // Exact-only items (have child routes in nav)
    const exactOnly = [
      '/dept-head/leave',
      '/dept-head/reports',
      '/dept-head/home',
      '/dept-head/dashboard',
    ];
    if (exactOnly.includes(href)) return pathname === href;
    return pathname.startsWith(href + '/');
  };

  type SidebarItem = { href: string; label: string; icon: string; badge?: number };
  type SidebarSection = { label: string; isDeptHead?: boolean; items: SidebarItem[] };

  const navSections: SidebarSection[] = [
    {
      label: 'MY COURSES',
      items: [
        { href: '/dept-head/home',         label: 'Home',           icon: 'home' },
        { href: '/dept-head/content',      label: 'Course Content', icon: 'course-modules' },
        { href: '/dept-head/live-sessions',label: 'Live Sessions',  icon: 'live-sessions' },
        { href: '/dept-head/assessments',  label: 'Assessments',    icon: 'assessments' },
        { href: '/dept-head/assignments',  label: 'Assignments',    icon: 'assignments' },
        { href: syllabusHref,              label: 'Syllabus',       icon: 'syllabus' },
      ],
    },
    {
      label: 'STUDENTS',
      items: [
        { href: gradebookHref,             label: 'Gradebook',  icon: 'gradebook' },
        { href: '/dept-head/attendance',   label: 'Attendance', icon: 'attendance' },
      ],
    },
    {
      label: 'COMMUNICATION',
      items: [
        { href: '/dept-head/announcements',label: 'Announcements',    icon: 'announcements' },
        { href: '/dept-head/forums',       label: 'Forums',            icon: 'forums' },
        { href: '/dept-head/notifications',label: 'Notifications',     icon: 'notifications' },
        { href: '/dept-head/calendar',     label: 'Academic Calendar', icon: 'calendar' },
      ],
    },
    {
      label: 'REPORTS',
      items: [
        { href: '/dept-head/schedule',          label: 'My Schedule',       icon: 'schedule' },
        { href: '/dept-head/roster',            label: 'Class Roster',      icon: 'roster' },
        { href: '/dept-head/attendance-report', label: 'Attendance Report', icon: 'attendance-report' },
      ],
    },
    {
      label: 'DEPARTMENT HEAD',
      isDeptHead: true,
      items: [
        { href: '/dept-head/leave',           label: 'Leave Requests',   icon: 'leave',            badge: pendingLeaveCount },
        { href: '/dept-head/leave/calendar',  label: 'Leave Calendar',   icon: 'calendar' },
        { href: '/dept-head/instructors',     label: 'Instructor List',  icon: 'instructors' },
        { href: '/dept-head/course-offerings',label: 'Course Offerings', icon: 'course-offerings' },
        { href: '/dept-head/clearance',       label: 'Clearance Requests', icon: 'clearance' },
        { href: '/dept-head/reports',         label: 'Dept Reports',     icon: 'reports' },
      ],
    },
    {
      label: 'MY LEAVE',
      items: [
        { href: '/dept-head/leave/request', label: 'Request Leave', icon: 'leave-request' },
        { href: '/dept-head/leave/balance', label: 'Leave Balance', icon: 'leave-balance' },
        { href: '/dept-head/leave/history', label: 'Leave History', icon: 'leave-history' },
      ],
    },
    {
      label: 'ACCOUNT',
      items: [
        { href: '/change-password', label: 'Change Password', icon: 'settings' },
      ],
    },
  ];

  const activeOffering = allOfferings.find((o) => o.id === activeOfferingId);
  const classLabel = activeOffering
    ? `${activeOffering.courses?.code ?? ''} ${activeOffering.courses?.title ?? ''}`.trim()
    : 'My Classes';

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-900">
      {/* ── Navbar ──────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between h-14 px-4 text-white shrink-0 gap-2"
        style={{ backgroundColor: HEADER_BG }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="p-2 rounded hover:bg-white/10 shrink-0"
            aria-label="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link href="/dept-head/home" className="font-bold text-base shrink-0">
            MULE LMS
          </Link>

          {/* MY CLASSES dropdown */}
          <div className="relative ml-1" ref={classesRef}>
            <button
              type="button"
              onClick={() => setClassesOpen((o) => !o)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-sm font-medium max-w-[200px]"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="truncate">{classLabel || 'My Classes'}</span>
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {classesOpen && (
              <>
                <div className="fixed inset-0 z-10" aria-hidden onClick={() => setClassesOpen(false)} />
                <div className="absolute left-0 top-full mt-1 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-20 overflow-hidden text-gray-900 dark:text-white">
                  <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    Switch Course
                  </p>
                  {loadingOfferings ? (
                    <p className="px-3 py-4 text-sm text-gray-400 dark:text-gray-500 text-center">Loading…</p>
                  ) : allOfferings.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-gray-400 text-center">No courses assigned</p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto pb-2">
                      {allOfferings.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => { setActiveOfferingId(o.id); setClassesOpen(false); }}
                          className={`w-full flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-left ${o.id === activeOfferingId ? 'bg-purple-50 dark:bg-purple-900/20' : ''}`}
                        >
                          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700 text-xs font-bold shrink-0 mt-0.5">
                            {(o.courses?.code ?? 'C').slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${o.id === activeOfferingId ? 'text-purple-700 dark:text-purple-300' : 'text-gray-900 dark:text-white'}`}>
                              {o.courses?.code} — {o.courses?.title}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                              {o.academic_terms?.term_name} · {o.enrolled_count} students
                            </p>
                          </div>
                          {o.id === activeOfferingId && (
                            <svg className="w-4 h-4 text-purple-600 shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: notifications + user */}
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle buttonClassName="p-2 rounded hover:bg-white/10 text-white/80" />
          <div className="relative">
            <button
              type="button"
              onClick={() => { setNotifOpen((o) => !o); setUserMenuOpen(false); }}
              className="relative p-2 rounded hover:bg-white/10"
              aria-label="Notifications"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <>
                <div className="fixed inset-0 z-10" aria-hidden onClick={() => setNotifOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-20 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <span className="font-semibold text-sm text-gray-900 dark:text-white">Notifications</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700">
                    {notifs.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-gray-400 dark:text-gray-500 text-center">No notifications</p>
                    ) : notifs.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => { markRead(n.id); if (n.link) { setNotifOpen(false); router.push(n.link); } }}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${!n.is_read ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          {!n.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-purple-700 flex-shrink-0" />}
                          <div className={!n.is_read ? '' : 'pl-4'}>
                            <p className={`text-sm leading-snug ${!n.is_read ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{n.title}</p>
                            {n.body && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{n.body}</p>}
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{fmtTime(n.created_at)}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((o) => !o)}
              className="flex items-center gap-2 pl-1.5 pr-1 py-1 rounded hover:bg-white/10"
            >
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold shrink-0">
                {getInitials(user.name)}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-sm font-medium leading-tight">{user.name}</div>
                <div className="text-xs text-white/70 leading-tight">Department Head</div>
              </div>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" aria-hidden onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 py-1 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 text-gray-900 dark:text-white">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{user.name}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium">
                      Department Head
                    </span>
                  </div>
                  <button
                    type="button"
                    className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    onClick={() => { setUserMenuOpen(false); router.push('/change-password'); }}
                  >
                    Change Password
                  </button>
                  <hr className="my-1 border-gray-100 dark:border-gray-700" />
                  <button
                    type="button"
                    className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600"
                    onClick={handleLogout}
                  >
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        <aside
          className={`shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col transition-[width] duration-200 ${sidebarOpen ? 'w-60' : 'w-0 overflow-hidden'}`}
          style={sidebarOpen ? { position: 'sticky', top: '3.5rem', height: 'calc(100vh - 3.5rem)', alignSelf: 'flex-start' } : undefined}
        >
          {sidebarOpen && (
            <div className="sidebar-scroll overflow-y-scroll flex-1 py-3">
              <nav className="space-y-4 px-3">
                {navSections.map((section) => (
                  <div key={section.label}>
                    <p
                      className={`text-[10px] font-semibold uppercase tracking-widest px-2 mb-1 ${
                        section.isDeptHead ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {section.label}
                    </p>
                    {section.isDeptHead && <div className="mx-2 mb-1.5 h-px bg-purple-100 dark:bg-purple-900/30" />}
                    <div className="space-y-0.5">
                      {section.items.map((item) => {
                        const active = checkActive(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                              active
                                ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 font-medium border-l-[3px] border-purple-600'
                                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                            }`}
                          >
                            <NavIcon name={item.icon} />
                            <span className="flex-1 truncate">{item.label}</span>
                            {item.badge != null && item.badge > 0 && (
                              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-gray-900 text-[10px] font-bold">
                                {item.badge > 99 ? '99+' : item.badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </div>
          )}
        </aside>

        <main className="flex-1 min-w-0 overflow-auto bg-gray-50 dark:bg-gray-900">
          {children}
        </main>
      </div>
    </div>
  );
}
