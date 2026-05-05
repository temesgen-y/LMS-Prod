'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ThemeToggle } from '@/components/ThemeToggle';

const HEADER_BG = '#0f766e';

function getInitials(name: string): string {
  return name.split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

type NavItem = { href: string; label: string };
type NavSection = { label: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    label: 'HOME',
    items: [{ href: '/advisor/dashboard', label: 'Dashboard' }],
  },
  {
    label: 'MY STUDENTS',
    items: [{ href: '/advisor/students', label: 'Assigned Students' }],
  },
  {
    label: 'ADVISING',
    items: [
      { href: '/advisor/appointments', label: 'Appointments' },
      { href: '/advisor/holds', label: 'Hold Management' },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [{ href: '/change-password', label: 'Change Password' }],
  },
];

type Notif = { id: string; title: string; body: string; link: string | null; is_read: boolean; created_at: string };

export type AdvisorUser = { id: string; name: string; email: string };

export default function AdvisorLayoutClient({ user, children }: { user: AdvisorUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;
      const { data: userData } = await supabase.from('users').select('id').eq('auth_user_id', authData.user.id).single();
      if (!userData) return;
      const uid = (userData as { id: string }).id;
      const { data } = await supabase
        .from('notifications')
        .select('id, title, body, link, is_read, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) {
        const notifData = data as Notif[];
        setNotifs(notifData.slice(0, 10));
        setUnreadCount(notifData.filter(n => !n.is_read).length);
      }
    };
    init();
  }, []);

  useEffect(() => { setNotifOpen(false); setUserMenuOpen(false); }, [pathname]);

  const markRead = async (notifId: string) => {
    const supabase = createClient();
    await supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
    setNotifs(prev => {
      const updated = prev.map(n => n.id === notifId ? { ...n, is_read: true } : n);
      setUnreadCount(updated.filter(n => !n.is_read).length);
      return updated;
    });
  };

  const fmtTime = (ts: string) => {
    const d = new Date(ts);
    const diffH = (Date.now() - d.getTime()) / 3600000;
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

  const exactOnlyPaths = ['/advisor/dashboard', '/advisor/students'];

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-900">
      <header className="sticky top-0 z-50 flex items-center justify-between h-14 px-4 text-white shrink-0" style={{ backgroundColor: HEADER_BG }}>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setSidebarOpen(o => !o)} className="p-2 rounded hover:bg-white/10" aria-label="Toggle sidebar">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link href="/advisor/dashboard" className="font-semibold text-lg">MULE LMS</Link>
          <span className="ml-2 px-2 py-0.5 rounded bg-white/20 text-xs font-medium">Academic Advisor</span>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle buttonClassName="p-2 rounded hover:bg-white/10 text-white/80" />
          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button type="button" onClick={() => { setNotifOpen(o => !o); setUserMenuOpen(false); }} className="relative p-2 rounded hover:bg-white/10" aria-label="Notifications">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
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
                    ) : notifs.map(n => (
                      <button key={n.id} type="button" onClick={() => { markRead(n.id); if (n.link) { setNotifOpen(false); router.push(n.link); } }}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 ${!n.is_read ? 'bg-teal-50 dark:bg-teal-900/20' : ''}`}>
                        <div className="flex items-start gap-2">
                          {!n.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-teal-600 flex-shrink-0" />}
                          <div className={!n.is_read ? '' : 'pl-4'}>
                            <p className={`text-sm ${!n.is_read ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{n.title}</p>
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

          {/* Profile dropdown */}
          <div className="relative" ref={userMenuRef}>
            <button type="button" onClick={() => setUserMenuOpen(o => !o)} className="flex items-center gap-2 pl-2 pr-1 py-1 rounded hover:bg-white/10">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold">{getInitials(user.name)}</div>
              <div className="text-left hidden sm:block">
                <div className="text-sm font-medium leading-tight">{user.name || 'Advisor'}</div>
                <div className="text-xs text-white/80">Academic Advisor</div>
              </div>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" aria-hidden onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 py-1 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 text-gray-900 dark:text-white">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{user.name}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-xs font-medium">Academic Advisor</span>
                  </div>
                  <button type="button" className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    onClick={() => { setUserMenuOpen(false); router.push('/change-password'); }}>
                    Change Password
                  </button>
                  <hr className="my-1 border-gray-100 dark:border-gray-700" />
                  <button type="button" className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600" onClick={handleLogout}>
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className={`shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col transition-[width] duration-200 ${sidebarOpen ? 'w-56' : 'w-0 overflow-hidden'}`}
          style={sidebarOpen ? { position: 'sticky', top: '3.5rem', height: 'calc(100vh - 3.5rem)', alignSelf: 'flex-start' } : undefined}>
          {sidebarOpen && (
            <div className="sidebar-scroll overflow-y-scroll flex-1 py-4">
              <nav className="space-y-5 px-3">
                {navSections.map(section => (
                  <div key={section.label}>
                    <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-2 mb-1">{section.label}</div>
                    <div className="space-y-0.5">
                      {section.items.map(item => {
                        const isActive = pathname === item.href || (!exactOnlyPaths.includes(item.href) && pathname.startsWith(item.href + '/'));
                        return (
                          <Link key={item.href} href={item.href}
                            className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 font-medium border-l-[3px] border-teal-600' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                            {item.label}
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
