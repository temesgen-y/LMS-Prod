'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ThemeToggle } from '@/components/ThemeToggle';

type Notif = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
  type: string | null;
};

const SIDEBAR_BG = '#3d2c6d';
const SIDEBAR_ACTIVE = 'rgba(255,255,255,0.15)';

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/admin/departments', label: 'Departments', icon: 'departments' },
  { href: '/admin/academic-programs', label: 'Academic Programs', icon: 'academic-programs' },
  { href: '/admin/academic-terms', label: 'Academic Terms', icon: 'academic-terms' },
  { href: '/admin/students', label: 'Students', icon: 'students' },
  { href: '/admin/instructors', label: 'Instructors', icon: 'instructors' },
  { href: '/admin/admins', label: 'Admins', icon: 'admins' },
  { href: '/admin/courses', label: 'Courses', icon: 'courses' },
  { href: '/admin/course-offerings', label: 'Course Offerings', icon: 'course-offerings' },
  { href: '/admin/course-instructors', label: 'Course Instructors', icon: 'course-instructors' },
  { href: '/admin/admin-profiles', label: 'Admin Profiles', icon: 'admin-profiles' },
  { href: '/admin/announcements', label: 'Announcements', icon: 'announcements' },
  { href: '/admin/institution-settings', label: 'Institution Settings', icon: 'institution-settings' },
  { href: '/admin/reports', label: 'Reports', icon: 'reports' },
  { href: '/admin/settings', label: 'Settings', icon: 'settings' },
];

const staffItems = [
  { href: '/admin/staff/registrars', label: 'Registrars', icon: 'staff-single' },
  { href: '/admin/staff/advisors', label: 'Academic Advisors', icon: 'staff-single' },
  { href: '/admin/advisor-assignments', label: 'Advisor Assignments', icon: 'enrollments' },
  { href: '/admin/staff/it-admins', label: 'IT Administrators', icon: 'staff-group' },
  { href: '/admin/instructors/unassigned', label: 'Unassigned Instructors', icon: 'unassigned' },
];

const bottomItems = [
  { href: '/admin/profile', label: 'Profile', icon: 'profile' },
  { href: '/change-password', label: 'Change Password', icon: 'change-password' },
  { href: '#', label: 'Logout', icon: 'logout', action: 'logout' },
];

function Icon({ name, className }: { name: string; className?: string }) {
  const c = className ?? 'w-5 h-5';
  switch (name) {
    case 'dashboard':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      );
    case 'departments':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      );
    case 'academic-programs':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'academic-terms':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'student-approvals':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'students':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
        </svg>
      );
    case 'instructors':
    case 'profile':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    case 'admins':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    case 'course-instructors':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'courses':
    case 'course-offerings':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case 'enrollments':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'announcements':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.012-6.062a1.76 1.76 0 00-1.756-1.26H3.24A1.76 1.76 0 011.48 12 1.76 1.76 0 013.24 10.24h.586l2.012-6.062A1.76 1.76 0 017.235 3h.586a1.76 1.76 0 011.756 1.26L11 5.882zM18 9a2 2 0 100 4 2 2 0 000-4zm0 8a4 4 0 100-8 4 4 0 000 8z" />
        </svg>
      );
    case 'reports':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    case 'settings':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'certificates':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      );
    case 'admin-profiles':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'institution-settings':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case 'staff-single':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    case 'staff-group':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'unassigned':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12h4M20 10v4" />
        </svg>
      );
    case 'change-password':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      );
    case 'logout':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      );
    default:
      return null;
  }
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [announcementUnreadCount, setAnnouncementUnreadCount] = useState(0);

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
      loadNotifs((userData as { id: string }).id);
    };
    init();
  }, [loadNotifs]);

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
    <div className="flex min-h-screen bg-[#f3f4f6] dark:bg-gray-900">
      {/* Sidebar */}
      <aside
        className="flex flex-col shrink-0 text-white transition-[width] duration-200"
        style={{
          width: collapsed ? 72 : 260,
          backgroundColor: SIDEBAR_BG,
          position: 'sticky',
          top: 0,
          height: '100vh',
          alignSelf: 'flex-start',
        }}
      >
        <div className="flex items-center justify-between h-16 px-4 shrink-0 border-b border-white/10">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm">
                M
              </div>
              <span className="font-semibold text-lg">MULE LMS</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded hover:bg-white/10 text-white/80"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {collapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
              )}
            </svg>
          </button>
        </div>
        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const isAnnouncements = item.href === '/admin/announcements';
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-white/90 hover:bg-white/10 ${isActive ? 'bg-white/15' : ''}`}
                style={isActive ? { backgroundColor: SIDEBAR_ACTIVE } : undefined}
              >
                <Icon name={item.icon} />
                {!collapsed && <span className="flex-1">{item.label}</span>}
                {!collapsed && isAnnouncements && announcementUnreadCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-gray-900 text-[10px] font-bold">
                    {announcementUnreadCount > 99 ? '99+' : announcementUnreadCount}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Staff Management section */}
          {!collapsed && (
            <p className="px-4 pt-4 pb-1 text-[10px] font-semibold tracking-widest text-white/40 uppercase">
              Staff Management
            </p>
          )}
          {collapsed && <div className="mx-2 my-3 border-t border-white/10" />}
          {staffItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-white/90 hover:bg-white/10 ${isActive ? 'bg-white/15' : ''}`}
                style={isActive ? { backgroundColor: SIDEBAR_ACTIVE } : undefined}
              >
                <Icon name={item.icon} />
                {!collapsed && <span className="flex-1">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 py-2">
          {bottomItems.map((item) =>
            item.action === 'logout' ? (
              <button
                key={item.label}
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-2.5 mx-2 w-[calc(100%-1rem)] rounded-lg text-white/90 hover:bg-white/10"
              >
                <Icon name={item.icon} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-white/90 hover:bg-white/10"
              >
                <Icon name={item.icon} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )
          )}
          {!collapsed && (
            <p className="text-[10px] text-white/40 text-center mt-2 px-4">
              Mule LMS © {new Date().getFullYear()} All Rights Reserved
            </p>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 main-content-scroll">
        {/* Top bar */}
        <header className="h-16 shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6 gap-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">
            {pathname === '/admin/dashboard' ? 'Dashboard' : pathname?.split('/').filter(Boolean).pop()?.replace(/-/g, ' ')?.replace(/\b\w/g, (c) => c.toUpperCase()) ?? 'Admin'}
          </h1>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="search"
                placeholder="Search"
                className="w-56 md:w-64 pl-10 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div className="relative">
              <ThemeToggle buttonClassName="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300" />
              <button
                type="button"
                onClick={() => { setNotifOpen(o => !o); setUserMenuOpen(false); }}
                className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
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
                  <div className="absolute right-0 top-full mt-1 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-20 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                      <span className="font-semibold text-sm text-gray-900 dark:text-white">Notifications</span>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700">
                      {notifs.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-gray-400 dark:text-gray-500 text-center">No notifications</p>
                      ) : notifs.map(n => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => { markRead(n.id); if (n.link) { setNotifOpen(false); router.push(n.link); } }}
                          className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${!n.is_read ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
                        >
                          <div className="flex items-start gap-2">
                            {!n.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-[#4c1d95] flex-shrink-0" />}
                            <div className={!n.is_read ? '' : 'pl-4'}>
                              <p className={`text-sm leading-snug ${!n.is_read ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{n.title}</p>
                              {n.body && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{n.body}</p>}
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{fmtNotifTime(n.created_at)}</p>
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
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold">
                  AU
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Admin</div>
                </div>
                <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" aria-hidden onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 py-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20">
                    <Link href="/admin/profile" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setUserMenuOpen(false)}>
                      Profile
                    </Link>
                    <Link href="/change-password" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setUserMenuOpen(false)}>
                      Change Password
                    </Link>
                    <hr className="my-1 border-gray-100 dark:border-gray-700" />
                    <button type="button" className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => { setUserMenuOpen(false); handleLogout(); }}>
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 dark:bg-gray-900">
          {children}
        </main>
      </div>
    </div>
  );
}
