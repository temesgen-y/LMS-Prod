'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Stats = {
  totalUsers: number;
  suspended: number;
  pending: number;
  auditToday: number;
  lastBackup: { status: string; created_at: string } | null;
};

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

const QUICK_LINKS = [
  { href: '/it-admin/users', title: 'User Management', desc: 'Lock, unlock, reset passwords, revoke sessions' },
  { href: '/it-admin/audit-logs', title: 'Audit Logs', desc: 'Review sensitive system actions' },
  { href: '/it-admin/backups', title: 'Backups', desc: 'Monitor backup & restore operations' },
];

export default function ItAdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);

      const [totalRes, suspRes, pendRes, auditRes, backupRes] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('status', 'suspended'),
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('audit_logs').select('id', { count: 'exact', head: true }).gte('created_at', startOfDay.toISOString()),
        fetch('/api/it-admin/backups').then(r => r.ok ? r.json() : { backups: [] }).catch(() => ({ backups: [] })),
      ]);

      setStats({
        totalUsers: totalRes.count ?? 0,
        suspended: suspRes.count ?? 0,
        pending: pendRes.count ?? 0,
        auditToday: auditRes.count ?? 0,
        lastBackup: backupRes.backups?.[0] ?? null,
      });
    };
    run();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">IT Admin Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">System administration &amp; account operations</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={stats?.totalUsers ?? '—'} accent="text-gray-900" />
        <StatCard label="Locked Accounts" value={stats?.suspended ?? '—'} accent={stats?.suspended ? 'text-red-600' : 'text-gray-900'} />
        <StatCard label="Pending Approval" value={stats?.pending ?? '—'} accent={stats?.pending ? 'text-amber-600' : 'text-gray-900'} />
        <StatCard label="Audit Events Today" value={stats?.auditToday ?? '—'} accent="text-teal-600" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Last Backup</p>
        {stats?.lastBackup ? (
          <p className="mt-1 text-gray-800">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mr-2 ${stats.lastBackup.status === 'completed' ? 'bg-green-50 border border-green-300 text-green-700' : stats.lastBackup.status === 'failed' ? 'bg-red-50 border border-red-300 text-red-700' : 'bg-amber-50 border border-amber-300 text-amber-700'}`}>
              {stats.lastBackup.status.replace('_', ' ')}
            </span>
            {new Date(stats.lastBackup.created_at).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        ) : (
          <p className="mt-1 text-gray-400 text-sm">No backups recorded yet.</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {QUICK_LINKS.map(l => (
          <Link key={l.href} href={l.href}
            className="block bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:border-teal-400 hover:shadow transition-colors">
            <h3 className="font-semibold text-gray-900">{l.title}</h3>
            <p className="text-sm text-gray-500 mt-1">{l.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
