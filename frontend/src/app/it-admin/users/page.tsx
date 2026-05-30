'use client';

import { useCallback, useEffect, useState } from 'react';

type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-50 border border-green-300 text-green-700',
  suspended: 'bg-red-50 border border-red-300 text-red-700',
  inactive: 'bg-gray-100 border border-gray-300 text-gray-600',
  pending: 'bg-amber-50 border border-amber-300 text-amber-700',
};

const ROLES = ['admin', 'instructor', 'student', 'registrar', 'department_head', 'academic_advisor', 'it_admin'];
const PAGE_SIZE = 25;

export default function ItAdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [resetLink, setResetLink] = useState<{ email: string; link: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (roleFilter) params.set('role', roleFilter);
    if (statusFilter) params.set('status', statusFilter);
    const res = await fetch(`/api/it-admin/users?${params.toString()}`);
    const json = await res.json();
    if (res.ok) {
      setUsers(json.users ?? []);
      setTotal(json.total ?? 0);
    } else {
      setToast({ kind: 'err', msg: json.error ?? 'Failed to load users.' });
    }
    setLoading(false);
  }, [page, debouncedSearch, roleFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const runAction = async (user: UserRow, action: 'lock' | 'unlock' | 'reset-password' | 'revoke-sessions') => {
    setMenuOpen(null);
    if (action === 'lock' && !confirm(`Lock ${user.email}? They will be signed out and blocked from logging in.`)) return;
    if (action === 'revoke-sessions' && !confirm(`Sign ${user.email} out of all devices?`)) return;

    setBusyId(user.id);
    try {
      const res = await fetch('/api/it-admin/users/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, action }),
      });
      const json = await res.json();
      if (!res.ok) {
        setToast({ kind: 'err', msg: json.error ?? 'Action failed.' });
      } else if (action === 'reset-password' && json.resetLink) {
        setResetLink({ email: user.email, link: json.resetLink });
      } else {
        setToast({ kind: 'ok', msg: json.message ?? 'Done.' });
        if (action === 'lock' || action === 'unlock') load();
      }
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Lock, unlock, force password resets, and revoke sessions</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 w-56"
          />
          <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 bg-white">
            <option value="">All Roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </select>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 bg-white">
            <option value="">All Statuses</option>
            {['active', 'suspended', 'inactive', 'pending'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400 animate-pulse">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="p-16 text-center text-gray-500">No users found.</div>
        ) : (
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['User', 'Role', 'Status', 'Joined', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{`${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || '—'}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 capitalize whitespace-nowrap">{u.role.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[u.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(u.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-right relative">
                      <button
                        type="button"
                        disabled={busyId === u.id}
                        onClick={() => setMenuOpen(menuOpen === u.id ? null : u.id)}
                        className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                      >
                        {busyId === u.id ? '…' : '⋯'}
                      </button>
                      {menuOpen === u.id && (
                        <>
                          <div className="fixed inset-0 z-10" aria-hidden onClick={() => setMenuOpen(null)} />
                          <div className="absolute right-4 top-full mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 text-left">
                            {u.status === 'suspended' ? (
                              <button onClick={() => runAction(u, 'unlock')} className="w-full text-left px-4 py-2 text-sm text-green-700 hover:bg-gray-50">Unlock account</button>
                            ) : (
                              <button onClick={() => runAction(u, 'lock')} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50">Lock account</button>
                            )}
                            <button onClick={() => runAction(u, 'reset-password')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Force password reset</button>
                            <button onClick={() => runAction(u, 'revoke-sessions')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Revoke sessions</button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
          <span className="text-gray-400">{total} user{total === 1 ? '' : 's'} · Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">Previous</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page + 1 >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>

      {/* Reset link modal */}
      {resetLink && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setResetLink(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900">Password reset link</h2>
            <p className="text-sm text-gray-500 mt-1">Share this one-time recovery link with <span className="font-medium">{resetLink.email}</span>.</p>
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 break-all">{resetLink.link}</div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { navigator.clipboard.writeText(resetLink.link); setToast({ kind: 'ok', msg: 'Link copied.' }); }}
                className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700">Copy link</button>
              <button onClick={() => setResetLink(null)} className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.kind === 'ok' ? 'bg-gray-900 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
