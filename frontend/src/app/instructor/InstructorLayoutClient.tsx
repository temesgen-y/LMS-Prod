'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUnreadMessageCount } from '@/hooks/useUnreadMessageCount';
import NavDropdown from '@/components/instructor/NavDropdown';

type Notif = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
  type: string | null;
};

const HEADER_BG = '#4c1d95';

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

type NavItem = { href: string; label: string; icon: string; badge?: 'announcements' | 'messages' | 'pending' };
type NavGroup = { label: string; items: NavItem[] };

function buildNavGroups(offeringId: string | null): NavGroup[] {
  const gradebookHref = offeringId
    ? `/instructor/courses/${offeringId}/gradebook`
    : '/instructor/gradebook';
  const syllabusHref = offeringId
    ? `/instructor/courses/${offeringId}/syllabus`
    : '/instructor/syllabus';
  return [
    {
      label: 'Content',
      items: [
        { href: '/instructor/dashboard',      label: 'Home',           icon: 'home' },
        { href: '/instructor/course-modules', label: 'Course Content', icon: 'course-modules' },
        { href: '/instructor/live-sessions',  label: 'Live Sessions',  icon: 'live-sessions' },
        { href: '/instructor/assessments',    label: 'Assessments',    icon: 'assessments' },
        { href: '/instructor/question-bank',  label: 'Question Bank',  icon: 'question-bank' },
        { href: '/instructor/assignments',    label: 'Assignments',    icon: 'assignments' },
        { href: syllabusHref,                 label: 'Syllabus',       icon: 'syllabus' },
      ],
    },
    {
      label: 'Students',
      items: [
        { href: gradebookHref,             label: 'Gradebook',  icon: 'gradebook', badge: 'pending' },
        { href: '/instructor/attendance',  label: 'Attendance', icon: 'attendance' },
      ],
    },
    {
      label: 'Communication',
      items: [
        { href: '/instructor/announcements', label: 'Announcements',     icon: 'announcements', badge: 'announcements' },
        { href: '/instructor/forums',        label: 'Forums',             icon: 'forums' },
        { href: '/instructor/notifications', label: 'Notifications',      icon: 'notifications' },
        { href: '/instructor/calendar',      label: 'Academic Calendar',  icon: 'calendar' },
      ],
    },
  ];
}

const classroomMaterials = [
  { href: '/instructor/resources', label: 'Class Resources' },
  { href: '/instructor/instructor-only', label: 'Instructor Only' },
  { href: '/instructor/topic1', label: 'T1 Topic 1' },
];

const institutionResources = [
  { href: '/instructor/mission', label: 'MS Mission Statement' },
  { href: '/instructor/doctrinal', label: 'DS Doctrinal Statement' },
];

function NavIcon({ name }: { name: string }) {
  const c = 'w-5 h-5 shrink-0';
  switch (name) {
    case 'messages':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      );
    case 'home':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case 'calendar':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'course-modules':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      );
    case 'module-items':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10M4 18h10" />
        </svg>
      );
    case 'lessons':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'attachments':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
      );
    case 'announcements':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.012-6.062a1.76 1.76 0 00-1.756-1.26H3.24A1.76 1.76 0 011.48 12 1.76 1.76 0 013.24 10.24h.586l2.012-6.062A1.76 1.76 0 017.235 3h.586a1.76 1.76 0 011.756 1.26L11 5.882z" />
        </svg>
      );
    case 'syllabus':
    case 'gradebook':
    case 'worklist':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'lesson-materials':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      );
    case 'live-sessions':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.869v6.262a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    case 'assessments':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      );
    case 'question-bank':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 11h6M9 15h4" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 2v4M9 2v4" />
        </svg>
      );
    case 'questions':
    case 'question-options':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'assignments':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'grades':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
        </svg>
      );
    case 'gradebook-items':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 3v18M14 3v18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
        </svg>
      );
    case 'attendance':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'forum-threads':
    case 'forum-posts':
    case 'forums':
    case 'discussion':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      );
    case 'notifications':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      );
    case 'class-questions':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    default:
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      );
  }
}

export type InstructorUser = { id: string; name: string; email: string };

export type CourseInfo = {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  termName: string;
  termNumber: number | null;
  startDate: string | null;
  endDate: string | null;
  enrolledCount: number;
};

function formatDateRange(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  const s = new Date(start);
  const e = new Date(end);
  const startStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startStr} – ${endStr}`;
}

export default function InstructorLayoutClient({
  user,
  courseInfo,
  children,
}: {
  user: InstructorUser;
  courseInfo: CourseInfo | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [classesOpen, setClassesOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [announcementUnreadCount, setAnnouncementUnreadCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const unreadMsgCount = useUnreadMessageCount(userId);

  const loadNotifs = useCallback(async (uid: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, link, is_read, created_at, type')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) {
      const notifData = data as Notif[];
      setNotifs(notifData.slice(0, 10));
      setUnreadCount(notifData.filter(n => !n.is_read).length);
      setAnnouncementUnreadCount(notifData.filter(n => !n.is_read && n.type === 'announcement').length);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;
      const { data: userData } = await supabase
        .from('users').select('id').eq('auth_user_id', authData.user.id).single();
      if (!userData) return;
      const uid = (userData as { id: string }).id;
      setUserId(uid);
      loadNotifs(uid);

      // Pending grades: submitted assignments not yet graded
      if (courseInfo?.offeringId) {
        const { data: assignIds } = await supabase
          .from('assignments')
          .select('id')
          .eq('offering_id', courseInfo.offeringId);
        if (assignIds && assignIds.length > 0) {
          const ids = (assignIds as any[]).map(a => a.id);
          const { count } = await supabase
            .from('assignment_submissions')
            .select('id', { count: 'exact', head: true })
            .in('assignment_id', ids)
            .eq('status', 'submitted');
          setPendingCount(count ?? 0);
        }
      }
    };
    init();
  }, [loadNotifs, courseInfo?.offeringId]);

  const markRead = async (notifId: string) => {
    const supabase = createClient();
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notifId);
    setNotifs(prev => {
      const updated = prev.map(n => n.id === notifId ? { ...n, is_read: true } : n);
      setUnreadCount(updated.filter(n => !n.is_read).length);
      setAnnouncementUnreadCount(updated.filter(n => !n.is_read && n.type === 'announcement').length);
      return updated;
    });
  };

  const fmtNotifTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 3600000;
    if (diffH < 1) return `${Math.floor(diffH * 60)}m ago`;
    if (diffH < 24) return `${Math.floor(diffH)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Purple top header */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between h-14 px-4 text-white shrink-0"
        style={{ backgroundColor: HEADER_BG }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="p-2 rounded hover:bg-white/10"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link href="/instructor/dashboard" className="font-semibold text-lg">
            MULE LMS
          </Link>
          <div className="flex items-center gap-1 ml-2">
            <button
              type="button"
              onClick={() => setClassesOpen((o) => !o)}
              className="flex items-center gap-1 px-3 py-1.5 rounded hover:bg-white/10 text-sm"
            >
              MY CLASSES
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <Link
              href="/instructor/messages"
              className="relative flex items-center gap-1 px-3 py-1.5 rounded hover:bg-white/10 text-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              MESSAGES
              {unreadMsgCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadMsgCount > 9 ? '9+' : unreadMsgCount}
                </span>
              )}
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2">

          <NavDropdown
            label="STUDENTS"
            items={[
              { label: 'Student List', path: '/instructor/students' },
              { label: 'Gradebook', path: '/instructor/gradebook' },
              { label: 'Attendance', path: '/instructor/attendance' },
              { label: 'Student Progress', path: '/instructor/progress' },
            ]}
          />

          <NavDropdown
            label="REPORTS"
            items={[
              { label: 'My Schedule', path: '/instructor/schedule' },
              { label: 'Class Roster', path: '/instructor/roster' },
              { label: 'Attendance Report', path: '/instructor/attendance-report' },
              { label: 'Course Analytics', path: '/instructor/analytics' },
            ]}
          />

          <NavDropdown
            label="LEAVE"
            items={[
              { label: 'Request Leave', path: '/instructor/leave/request' },
              { label: 'Leave Balance', path: '/instructor/leave/balance' },
              { label: 'Leave History', path: '/instructor/leave/history' },
            ]}
          />

          <div className="w-px h-6 bg-white/20 mx-1" />

          <div className="relative">
            <button
              type="button"
              onClick={() => { setNotifOpen(o => !o); setUserMenuOpen(false); }}
              className="relative p-2 rounded hover:bg-white/10"
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
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
                <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className="font-semibold text-sm text-gray-900">Notifications</span>
                    <Link href="/instructor/notifications" onClick={() => setNotifOpen(false)} className="text-xs text-[#4c1d95] hover:underline">
                      View all
                    </Link>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                    {notifs.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-gray-400 text-center">No notifications</p>
                    ) : notifs.map(n => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => { markRead(n.id); if (n.link) { setNotifOpen(false); router.push(n.link); } }}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${!n.is_read ? 'bg-indigo-50' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          {!n.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-[#4c1d95] flex-shrink-0" />}
                          <div className={!n.is_read ? '' : 'pl-4'}>
                            <p className={`text-sm leading-snug ${!n.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{n.title}</p>
                            {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{n.body}</p>}
                            <p className="text-xs text-gray-400 mt-1">{fmtNotifTime(n.created_at)}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <button type="button" className="p-2 rounded hover:bg-white/10" aria-label="Profile">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
          <a href="#" className="p-2 rounded hover:bg-white/10" aria-label="Help">
            <span className="text-lg font-bold">?</span>
          </a>
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((o) => !o)}
              className="flex items-center gap-2 pl-2 pr-1 py-1 rounded hover:bg-white/10"
            >
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold">
                {getInitials(user.name)}
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-sm font-medium leading-tight">{user.name || 'Instructor'}</div>
                <div className="text-xs text-white/80">Instructor</div>
              </div>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" aria-hidden onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 py-1 w-52 bg-white rounded-lg shadow-lg border border-gray-200 z-20 text-gray-900">
                  <div className="px-4 py-2 text-sm border-b border-gray-100">{user.email}</div>
                  <Link
                    href="/change-password"
                    onClick={() => setUserMenuOpen(false)}
                    className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                  >
                    Change Password
                  </Link>
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    type="button"
                    className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                    onClick={() => {
                      setUserMenuOpen(false);
                      handleLogout();
                    }}
                  >
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left sidebar */}
        <aside
          className={`shrink-0 border-r border-gray-200 bg-gray-50/80 flex flex-col transition-[width] duration-200 ${
            sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
          }`}
          style={sidebarOpen ? { position: 'sticky', top: '3.5rem', height: 'calc(100vh - 3.5rem)', alignSelf: 'flex-start' } : undefined}
        >
          {sidebarOpen && (
            <div className="sidebar-scroll p-4 overflow-y-scroll flex-1">
              <div className="mb-4 pb-3 border-b border-gray-200">
                {courseInfo ? (
                  <>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {courseInfo.termName || 'Course'}
                    </div>
                    <div className="text-sm font-medium text-gray-900 mt-0.5">
                      {courseInfo.courseCode || '—'}
                    </div>
                    <div className="text-sm text-gray-600">{courseInfo.courseTitle || '—'}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {formatDateRange(courseInfo.startDate, courseInfo.endDate)}
                      {courseInfo.enrolledCount > 0 && (
                        <> · {courseInfo.enrolledCount} {courseInfo.enrolledCount === 1 ? 'Student' : 'Students'}</>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-gray-400 italic">No course assigned</div>
                )}
              </div>
              <div className="text-xs text-gray-500 mb-3">
                {new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
              <nav className="space-y-4">
                {buildNavGroups(courseInfo?.offeringId ?? null).map(group => (
                  <div key={group.label}>
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-1">
                      {group.label}
                    </div>
                    <div className="space-y-0.5">
                      {group.items.map(item => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        let badge: React.ReactNode = null;
                        if (item.badge === 'announcements' && announcementUnreadCount > 0) {
                          badge = (
                            <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-gray-900 text-[10px] font-bold">
                              {announcementUnreadCount > 99 ? '99+' : announcementUnreadCount}
                            </span>
                          );
                        } else if (item.badge === 'pending' && pendingCount > 0) {
                          badge = (
                            <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-orange-400 text-white text-[10px] font-bold">
                              {pendingCount > 99 ? '99+' : pendingCount}
                            </span>
                          );
                        }
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                              isActive ? 'bg-primary/10 text-primary font-medium' : 'text-gray-700 hover:bg-gray-200/80'
                            }`}
                          >
                            <NavIcon name={item.icon} />
                            <span className="flex-1">{item.label}</span>
                            {badge}
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

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-auto bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}
