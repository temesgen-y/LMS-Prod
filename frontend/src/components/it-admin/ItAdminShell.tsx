'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const SIDEBAR_BG = '#0f3d3e';
const SIDEBAR_ACTIVE = 'rgba(255,255,255,0.15)';

const navItems = [
  { href: '/it-admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/it-admin/users', label: 'User Management', icon: 'users' },
  { href: '/it-admin/audit-logs', label: 'Audit Logs', icon: 'audit' },
  { href: '/it-admin/backups', label: 'Backups', icon: 'backup' },
];

const bottomItems = [
  { href: '/change-password', label: 'Change Password', icon: 'lock' },
  { href: '#', label: 'Logout', icon: 'logout', action: 'logout' as const },
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
    case 'users':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'audit':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      );
    case 'backup':
      return (
        <svg className={c} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
      );
    case 'lock':
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

export default function ItAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const pageTitle =
    pathname === '/it-admin/dashboard'
      ? 'Dashboard'
      : pathname?.split('/').filter(Boolean).pop()?.replace(/-/g, ' ')?.replace(/\b\w/g, c => c.toUpperCase()) ?? 'IT Admin';

  return (
    <div className="flex min-h-screen bg-[#f3f4f6]">
      {/* Sidebar */}
      <aside
        className="flex flex-col shrink-0 text-white transition-[width] duration-200"
        style={{ width: collapsed ? 72 : 260, backgroundColor: SIDEBAR_BG, position: 'sticky', top: 0, height: '100vh', alignSelf: 'flex-start' }}
      >
        <div className="flex items-center justify-between h-16 px-4 shrink-0 border-b border-white/10">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-teal-500 flex items-center justify-center text-white font-bold text-sm">IT</div>
              <span className="font-semibold text-base leading-tight">IT Admin<br /><span className="text-[10px] font-normal text-white/50">Mule LMS</span></span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
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
          {navItems.map(item => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-white/90 hover:bg-white/10"
                style={isActive ? { backgroundColor: SIDEBAR_ACTIVE } : undefined}
              >
                <Icon name={item.icon} />
                {!collapsed && <span className="flex-1">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 py-2">
          {bottomItems.map(item =>
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
            <p className="text-[10px] text-white/40 text-center mt-2 px-4">Mule LMS © {new Date().getFullYear()}</p>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-6 gap-4">
          <h1 className="text-xl font-bold text-gray-900 truncate">{pageTitle}</h1>
          <span className="text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-full">IT Administration</span>
        </header>
        <main className="flex-1 overflow-auto p-4">{children}</main>
      </div>
    </div>
  );
}
