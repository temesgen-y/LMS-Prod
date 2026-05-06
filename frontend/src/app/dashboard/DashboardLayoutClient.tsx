'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ClassSidebarProvider, useClassSidebar } from './ClassSidebarContext';
import { createClient } from '@/lib/supabase/client';
import { useUnreadMessageCount } from '@/hooks/useUnreadMessageCount';
import { useUnreadGroups } from '@/hooks/useUnreadGroups';

export type DashboardUser = { id: string; name: string; email: string; role: string };

type Notif = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
  type: string | null;
};

type NavItem = { href: string; label: string; icon: string; exact: boolean };
type NavGroup = { section: string | null; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    section: null,
    items: [
      { href: '/dashboard', label: 'Home', icon: '🏠', exact: true },
    ],
  },
  {
    section: 'MY PROFILE',
    items: [
      { href: '/dashboard/profile',         label: 'My Academic Profile', icon: '👤', exact: false },
      { href: '/dashboard/standing',        label: 'Academic Standing',   icon: '📊', exact: false },
      { href: '/dashboard/degree-progress', label: 'Degree Progress',     icon: '🎓', exact: false },
      { href: '/dashboard/transcript',      label: 'My Transcript',       icon: '📄', exact: false },
      { href: '/dashboard/fees',            label: 'Fee Account',         icon: '💳', exact: false },
    ],
  },
  {
    section: 'LEARNING',
    items: [
      { href: '/dashboard/courses',     label: 'My Courses',  icon: '📚', exact: false },
      { href: '/dashboard/assessments', label: 'Assessments', icon: '📋', exact: false },
      { href: '/dashboard/assignments', label: 'Assignments',  icon: '📝', exact: false },
    ],
  },
  {
    section: 'MY PROGRESS',
    items: [
      { href: '/dashboard/grades',          label: 'My Grades',         icon: '📈', exact: false },
      { href: '/dashboard/grade-reports',   label: 'Grade Reports',      icon: '📉', exact: false },
      { href: '/dashboard/gpa-calculator',  label: 'GPA Calculator',     icon: '🧮', exact: false },
      { href: '/dashboard/attendance',      label: 'Attendance',         icon: '✅', exact: false },
      { href: '/dashboard/schedule',      label: 'My Schedule',  icon: '📅', exact: false },
      { href: '/dashboard/live-sessions', label: 'Live Sessions', icon: '🎥', exact: false },
      { href: '/dashboard/certificates',  label: 'Certificates', icon: '🏆', exact: false },
      { href: '/dashboard/calendar',      label: 'Academic Calendar', icon: '📆', exact: false },
    ],
  },
  {
    section: 'REGISTRATION',
    items: [
      { href: '/dashboard/registration',             label: 'Course Registration',   icon: '📋', exact: true  },
      { href: '/dashboard/registration/requests',    label: 'My Requests',           icon: '📄', exact: false },
      { href: '/dashboard/registration/add-drop',    label: 'Add/Drop',              icon: '↕️', exact: false },
      { href: '/dashboard/registration/withdrawal',  label: 'Withdrawal Request',    icon: '⬅️', exact: false },
      { href: '/dashboard/registration/readmission', label: 'Readmission Request',   icon: '🔄', exact: false },
      { href: '/dashboard/registration/clearance',   label: 'Clearance Request',     icon: '✅', exact: false },
    ],
  },
  {
    section: 'COMMUNICATION',
    items: [
      { href: '/dashboard/announcements', label: 'Announcements', icon: '📣', exact: false },
      { href: '/dashboard/notifications', label: 'Notifications',  icon: '🔔', exact: false },
      { href: '/dashboard/messages',      label: 'Messages',       icon: '💬', exact: false },
      { href: '/dashboard/forums',        label: 'Forums',         icon: '🗣️', exact: false },
    ],
  },
];

function getInitials(name: string): string {
  return name.split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function DashboardLayoutClient({
  user,
  studyGroupsEnabled = false,
  children,
}: {
  user: DashboardUser;
  studyGroupsEnabled?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [announcementUnreadCount, setAnnouncementUnreadCount] = useState(0);

  const loadNotifs = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, link, is_read, created_at, type')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) {
      const notifData = data as Notif[];
      setNotifs(notifData.slice(0, 10));
      setUnreadCount(notifData.filter(n => !n.is_read).length);
      setAnnouncementUnreadCount(notifData.filter(n => !n.is_read && n.type === 'announcement').length);
    }
  }, [user.id]);

  useEffect(() => { loadNotifs(); }, [loadNotifs]);

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

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  const closeAll = () => { setUserMenuOpen(false); setHelpOpen(false); setNotifOpen(false); };

  return (
    <ClassSidebarProvider>
      <InnerLayout
        user={user}
        studyGroupsEnabled={studyGroupsEnabled}
        pathname={pathname}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        userMenuOpen={userMenuOpen}
        setUserMenuOpen={setUserMenuOpen}
        helpOpen={helpOpen}
        setHelpOpen={setHelpOpen}
        notifOpen={notifOpen}
        setNotifOpen={setNotifOpen}
        notifs={notifs}
        unreadCount={unreadCount}
        announcementUnreadCount={announcementUnreadCount}
        markRead={markRead}
        handleLogout={handleLogout}
        closeAll={closeAll}
      >
        {children}
      </InnerLayout>
    </ClassSidebarProvider>
  );
}

function InnerLayout({
  user, studyGroupsEnabled, pathname, sidebarOpen, setSidebarOpen,
  userMenuOpen, setUserMenuOpen, helpOpen, setHelpOpen,
  notifOpen, setNotifOpen, notifs, unreadCount, announcementUnreadCount, markRead, handleLogout, closeAll,
  children,
}: {
  user: DashboardUser;
  studyGroupsEnabled: boolean;
  pathname: string | null;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  userMenuOpen: boolean; setUserMenuOpen: (v: boolean) => void;
  helpOpen: boolean; setHelpOpen: (v: boolean) => void;
  notifOpen: boolean; setNotifOpen: (v: boolean) => void;
  notifs: Notif[];
  unreadCount: number;
  announcementUnreadCount: number;
  markRead: (id: string) => void;
  handleLogout: () => void;
  closeAll: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const isClassView = !!pathname?.includes('/dashboard/class');
  const unreadMsgCount = useUnreadMessageCount(user.id);
  const unreadGroupCount = useUnreadGroups(studyGroupsEnabled ? user.id : null);
  const [pendingAssignmentCount, setPendingAssignmentCount] = useState(0);

  useEffect(() => {
    const fetchPendingAssignments = async () => {
      const supabase = createClient();
      // Get enrolled offering IDs
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('offering_id')
        .eq('student_id', user.id)
        .eq('status', 'active');
      if (!enrollments || enrollments.length === 0) return;
      const offeringIds = enrollments.map((e: any) => e.offering_id);
      // Get submitted assignment IDs for this student
      const { data: submissions } = await supabase
        .from('assignment_submissions')
        .select('assignment_id')
        .eq('student_id', user.id);
      const submittedIds = new Set((submissions || []).map((s: any) => s.assignment_id));
      // Count assignments not yet submitted, not past due, status published
      const now = new Date().toISOString();
      const { data: assignments } = await supabase
        .from('assignments')
        .select('id')
        .in('offering_id', offeringIds)
        .eq('status', 'published')
        .gte('due_date', now);
      const pending = (assignments || []).filter((a: any) => !submittedIds.has(a.id));
      setPendingAssignmentCount(pending.length);
    };
    fetchPendingAssignments();
  }, [user.id]);
  const headerPurple = true; // Always purple, matching Halo Learn style
  const { toggle: toggleClassSidebar } = useClassSidebar();

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : (pathname?.startsWith(href) ?? false);

  const fmtNotifTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 3600000;
    if (diffH < 1) return `${Math.floor(diffH * 60)}m ago`;
    if (diffH < 24) return `${Math.floor(diffH)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#4c1d95] border-b border-[#5b21b6]">
        <div className="flex items-center h-14 px-3 gap-2">

          {/* Left: hamburger + logo + nav buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Sidebar toggle */}
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded text-white/80 hover:bg-white/10 leading-none"
              aria-label="Toggle navigation"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M3 6.75A.75.75 0 0 1 3.75 6h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 6.75ZM3 12a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 12Zm0 5.25a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Logo */}
            <Link href="/dashboard" className="flex items-center gap-1.5 mr-2">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-white text-sm font-black leading-none">M</span>
              </div>
              <span className="font-extrabold text-lg text-white tracking-tight hidden sm:block">
                mule <span className="font-light">learn</span>
              </span>
            </Link>

            {/* MY CLASSES nav button */}
            <Link
              href="/dashboard/courses"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/15 hover:bg-white/25 text-white text-sm font-semibold transition-colors border border-white/20"
            >
              {/* campus icon */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M1 2.75A.75.75 0 0 1 1.75 2h10.5a.75.75 0 0 1 0 1.5H12v13.75a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-2.5a.75.75 0 0 0-.75-.75h-2.5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 1-.75.75H3a.75.75 0 0 1-.75-.75V5A.75.75 0 0 1 3 4.25h1V2.75ZM4.75 5.5a.75.75 0 0 0-.75.75v1.5c0 .414.336.75.75.75h1.5A.75.75 0 0 0 7 7.75v-1.5A.75.75 0 0 0 6.25 5.5h-1.5ZM4 10.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5ZM8.75 5.5a.75.75 0 0 0-.75.75v1.5c0 .414.336.75.75.75h1.5A.75.75 0 0 0 11 7.75v-1.5a.75.75 0 0 0-.75-.75h-1.5ZM8 10.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5ZM13.25 2a.75.75 0 0 0-.75.75v16.5c0 .414.336.75.75.75h3a.75.75 0 0 0 .75-.75V2.75a.75.75 0 0 0-.75-.75h-3ZM14 5.75a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1-.75-.75Zm.75 2.75a.75.75 0 0 0 0 1.5h.5a.75.75 0 0 0 0-1.5h-.5ZM14 11.75a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1-.75-.75Zm.75 2.75a.75.75 0 0 0 0 1.5h.5a.75.75 0 0 0 0-1.5h-.5Z" clipRule="evenodd" />
              </svg>
              MY CLASSES
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 opacity-70">
                <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </Link>

            {/* MESSAGES button */}
            <Link
              href="/dashboard/messages"
              className="relative hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/15 hover:bg-white/25 text-white text-sm font-semibold transition-colors border border-white/20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M3.505 2.365A41.369 41.369 0 0 1 9 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 0 0-.577-.069 43.141 43.141 0 0 0-4.706 0C9.229 4.696 7.5 6.727 7.5 8.998v2.24c0 1.413.67 2.735 1.76 3.562l-2.98 2.98A.75.75 0 0 1 5 17.25v-3.443c-.501-.048-1-.106-1.495-.172C2.033 13.438 1 12.162 1 10.72V5.28c0-1.441 1.033-2.717 2.505-2.914Z" />
                <path d="M14 6c-.762 0-1.52.02-2.271.059C10.343 6.13 9.5 7.209 9.5 8.998v2.24c0 1.946 1.048 3.032 2.229 3.303.327.076.66.13.998.163a.75.75 0 0 1 .681.753v1.268l1.72-1.72a.75.75 0 0 1 .577-.22 36.92 36.92 0 0 0 1.3-.042c1.372-.065 2.495-1.142 2.495-2.503v-2.24C19.5 7.21 18.657 6.13 17.271 6.06 16.518 6.02 15.76 6 15 6h-1Z" />
              </svg>
              MESSAGES
              {unreadMsgCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadMsgCount > 9 ? '9+' : unreadMsgCount}
                </span>
              )}
            </Link>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right: notifications + accessibility + help + user */}
          <div className="flex items-center gap-1">

            {/* Notification bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setNotifOpen(!notifOpen); setUserMenuOpen(false); setHelpOpen(false); }}
                className="relative p-2 rounded-full text-white/80 hover:bg-white/10 transition-colors"
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M5.25 9a6.75 6.75 0 0 1 13.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 0 1-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 1 1-7.48 0 24.585 24.585 0 0 1-4.831-1.244.75.75 0 0 1-.298-1.205A8.217 8.217 0 0 0 5.25 9.75V9Zm4.502 8.9a2.25 2.25 0 1 0 4.496 0 25.057 25.057 0 0 1-4.496 0Z" clipRule="evenodd" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className="font-semibold text-sm text-gray-900">Notifications</span>
                    <Link href="/dashboard/notifications" onClick={closeAll} className="text-xs text-[#4c1d95] hover:underline">
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
                        onClick={() => { markRead(n.id); if (n.link) { closeAll(); router.push(n.link); } }}
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
              )}
            </div>

            {/* Accessibility icon */}
            <button
              type="button"
              className="p-2 rounded-full text-white/80 hover:bg-white/10 transition-colors hidden sm:flex items-center justify-center"
              aria-label="Accessibility options"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M12 3.75a.75.75 0 0 1 .75.75v.75h3a.75.75 0 0 1 0 1.5H8.25a.75.75 0 0 1 0-1.5h3V4.5a.75.75 0 0 1 .75-.75ZM7.5 9.75a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 .563 1.249l-2.063 2.375V19.5a.75.75 0 0 1-1.5 0V12.625L10.686 10.5H8.25a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Help */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setHelpOpen(!helpOpen); setUserMenuOpen(false); setNotifOpen(false); }}
                className="flex items-center gap-0.5 px-2 py-1.5 rounded text-white/80 hover:bg-white/10 text-sm transition-colors"
              >
                <span className="font-bold text-base leading-none">?</span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 opacity-70">
                  <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>
              {helpOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                  <a href="#" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Help & Support</a>
                  <a href="#" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Keyboard Shortcuts</a>
                </div>
              )}
            </div>

            {/* User menu */}
            <div className="relative pl-2 border-l border-white/20">
              <button
                type="button"
                onClick={() => { setUserMenuOpen(!userMenuOpen); setHelpOpen(false); setNotifOpen(false); }}
                className="flex items-center gap-2 pl-1"
                aria-expanded={userMenuOpen}
              >
                <span className="w-8 h-8 rounded-full bg-amber-400 text-gray-900 text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {getInitials(user.name)}
                </span>
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-semibold text-white leading-tight">{user.name}</p>
                  <p className="text-[10px] text-white/70 leading-tight">Student</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-white/60">
                  <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-800 truncate">{user.name}</p>
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  </div>
                  <Link href="/dashboard" onClick={closeAll} className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    My Dashboard
                  </Link>
                  <Link href="/change-password" onClick={closeAll} className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    Change Password
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Student sidebar */}
        {sidebarOpen && (
          <aside
            className="sidebar-scroll w-56 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-scroll flex flex-col"
            style={{ position: 'sticky', top: '3.5rem', height: 'calc(100vh - 3.5rem)', alignSelf: 'flex-start' }}
          >
            <nav className="py-3 px-2 flex-1">
              {NAV_GROUPS.map((group, gi) => {
                const items = group.section === 'COMMUNICATION' && studyGroupsEnabled
                  ? [...group.items, { href: '/dashboard/study-groups', label: 'Study Groups', icon: '👥', exact: false }]
                  : group.items;
                return (
                  <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
                    {group.section && (
                      <p className="px-3 mb-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        {group.section}
                      </p>
                    )}
                    <div className="space-y-0.5">
                      {items.map(item => {
                        const active = isActive(item.href, item.exact);
                        let badge: React.ReactNode = null;
                        if (item.href === '/dashboard/assignments' && pendingAssignmentCount > 0) {
                          badge = <span className={`w-5 h-5 text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0 ${active ? 'bg-white/30 text-white' : 'bg-red-500 text-white'}`}>{pendingAssignmentCount > 9 ? '9+' : pendingAssignmentCount}</span>;
                        } else if (item.href === '/dashboard/notifications' && unreadCount > 0) {
                          badge = <span className={`w-5 h-5 text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0 ${active ? 'bg-white/30 text-white' : 'bg-red-500 text-white'}`}>{unreadCount > 9 ? '9+' : unreadCount}</span>;
                        } else if (item.href === '/dashboard/announcements' && announcementUnreadCount > 0) {
                          badge = <span className={`w-5 h-5 text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0 ${active ? 'bg-amber-300 text-gray-900' : 'bg-amber-400 text-gray-900'}`}>{announcementUnreadCount > 9 ? '9+' : announcementUnreadCount}</span>;
                        } else if (item.href === '/dashboard/messages' && unreadMsgCount > 0) {
                          badge = <span className={`w-5 h-5 text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0 ${active ? 'bg-white/30 text-white' : 'bg-blue-500 text-white'}`}>{unreadMsgCount > 9 ? '9+' : unreadMsgCount}</span>;
                        } else if (item.href === '/dashboard/study-groups' && unreadGroupCount > 0) {
                          badge = <span className={`w-5 h-5 text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0 ${active ? 'bg-white/30 text-white' : 'bg-blue-500 text-white'}`}>{unreadGroupCount > 9 ? '9+' : unreadGroupCount}</span>;
                        }
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                              active
                                ? 'bg-[#4c1d95] text-white shadow-sm'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                            }`}
                          >
                            <span className="text-base w-5 text-center leading-none" aria-hidden>{item.icon}</span>
                            <span className="flex-1">{item.label}</span>
                            {badge}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>

            {/* Sidebar footer */}
            <div className="px-3 py-3 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 text-center">
                Mule LMS v1.4 · © 2026
              </p>
            </div>
          </aside>
        )}

        {/* Main content */}
        <main className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden bg-gray-50">
          {children}
        </main>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-gray-200 py-2.5 px-4 text-center text-xs text-gray-400">
        Mule LMS © {new Date().getFullYear()} All Rights Reserved
      </footer>
    </div>
  );
}
