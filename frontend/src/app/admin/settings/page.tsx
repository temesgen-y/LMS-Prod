'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

type Tab = 'audit' | 'users' | 'health' | 'overrides';

const AUDIT_ACTIONS = [
  'user.create', 'user.update', 'user.suspend',
  'enrollment.create', 'enrollment.drop',
  'grade.override', 'grade.release',
  'offering.create', 'offering.cancel',
  'certificate.issue', 'certificate.revoke',
  'term.activate', 'term.close',
];

const ROLES = ['admin', 'instructor', 'student', 'registrar', 'department_head', 'academic_advisor', 'it_admin'];
const STATUSES = ['active', 'inactive', 'suspended', 'pending'];

interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  table_name: string;
  record_id: string;
  ip_address: string | null;
  created_at: string;
}

interface UserRow {
  id: string;
  auth_user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

interface HealthData {
  connected: boolean;
  message?: string;
  error?: string;
  account?: { url: string; projectRef: string | null; dashboardUrl: string | null };
}

const PAGE_SIZE = 15;

function ActionBadge({ action }: { action: string }) {
  const [cat] = action.split('.');
  const colors: Record<string, string> = {
    user: 'bg-blue-100 text-blue-700',
    enrollment: 'bg-green-100 text-green-700',
    grade: 'bg-orange-100 text-orange-700',
    offering: 'bg-purple-100 text-purple-700',
    certificate: 'bg-teal-100 text-teal-700',
    term: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colors[cat] ?? 'bg-gray-100 text-gray-600'}`}>
      {action}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const normalized = role.toLowerCase();
  const colors: Record<string, string> = {
    admin: 'bg-red-100 text-red-700',
    instructor: 'bg-blue-100 text-blue-700',
    student: 'bg-green-100 text-green-700',
    registrar: 'bg-yellow-100 text-yellow-700',
    department_head: 'bg-purple-100 text-purple-700',
    academic_advisor: 'bg-teal-100 text-teal-700',
    it_admin: 'bg-orange-100 text-orange-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${colors[normalized] ?? 'bg-gray-100 text-gray-600'}`}>
      {normalized.replace(/_/g, ' ')}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-500',
    suspended: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${colors[normalized] ?? 'bg-gray-100 text-gray-600'}`}>
      {normalized}
    </span>
  );
}

export default function AdminSettingsPage() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<Tab>('audit');

  // ── Audit Logs ──────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    let q = supabase
      .from('audit_logs')
      .select('id, actor_id, action, table_name, record_id, ip_address, created_at, users!fk_audit_logs_actor(first_name, last_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((logPage - 1) * PAGE_SIZE, logPage * PAGE_SIZE - 1);

    if (filterAction) q = q.eq('action', filterAction);
    if (filterFrom) q = q.gte('created_at', filterFrom);
    if (filterTo) q = q.lte('created_at', filterTo + 'T23:59:59');

    const { data, count } = await q;
    setLogTotal(count ?? 0);
    setLogs(
      ((data ?? []) as any[]).map(r => ({
        id: r.id,
        actor_id: r.actor_id,
        actor_name: r.users ? `${r.users.first_name} ${r.users.last_name}`.trim() : 'System',
        action: r.action,
        table_name: r.table_name,
        record_id: r.record_id,
        ip_address: r.ip_address,
        created_at: r.created_at,
      }))
    );
    setLogsLoading(false);
  }, [logPage, filterAction, filterFrom, filterTo]);

  useEffect(() => { if (activeTab === 'audit') loadLogs(); }, [activeTab, loadLogs]);

  // ── User Management ─────────────────────────────────────────────────────────
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<{ userId: string; link: string } | null>(null);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    let q = supabase
      .from('users')
      .select('id, auth_user_id, first_name, last_name, email, role, status, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE - 1);

    if (filterRole) q = q.eq('role', filterRole);
    if (filterStatus) q = q.eq('status', filterStatus);
    if (userSearch) q = q.or(`first_name.ilike.%${userSearch}%,last_name.ilike.%${userSearch}%,email.ilike.%${userSearch}%`);

    const { data, count } = await q;
    setUserTotal(count ?? 0);
    setUsers((data ?? []) as UserRow[]);
    setUsersLoading(false);
  }, [userPage, filterRole, filterStatus, userSearch]);

  useEffect(() => { if (activeTab === 'users') loadUsers(); }, [activeTab, loadUsers]);

  const handleResetPassword = async (user: UserRow) => {
    setResettingId(user.id);
    try {
      const res = await fetch('/api/admin/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error || 'Failed to generate reset link'); return; }
      if (result.resetLink) {
        setResetLink({ userId: user.id, link: result.resetLink });
      } else {
        toast.success('Password reset email sent');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setResettingId(null);
    }
  };

  // ── System Health ────────────────────────────────────────────────────────────
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const checkHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/supabase-health');
      const data: HealthData = await res.json();
      setHealth(data);
    } catch {
      setHealth({ connected: false, error: 'Network error — could not reach health endpoint' });
    }
    setHealthLoading(false);
  }, []);

  useEffect(() => { if (activeTab === 'health') checkHealth(); }, [activeTab, checkHealth]);

  // ── Permission Overrides ─────────────────────────────────────────────────────
  const [restricted, setRestricted] = useState<UserRow[]>([]);
  const [restrictedLoading, setRestrictedLoading] = useState(false);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [confirmUnlock, setConfirmUnlock] = useState<UserRow | null>(null);

  const loadRestricted = useCallback(async () => {
    setRestrictedLoading(true);
    const { data } = await supabase
      .from('users')
      .select('id, auth_user_id, first_name, last_name, email, role, status, created_at')
      .in('status', ['suspended', 'inactive'])
      .order('status')
      .order('created_at', { ascending: false });
    setRestricted((data ?? []) as UserRow[]);
    setRestrictedLoading(false);
  }, []);

  useEffect(() => { if (activeTab === 'overrides') loadRestricted(); }, [activeTab, loadRestricted]);

  const handleUnlock = async (user: UserRow) => {
    setUnlockingId(user.id);
    const { error } = await supabase.from('users').update({ status: 'active' }).eq('id', user.id);
    if (error) { toast.error(error.message); }
    else { toast.success(`${user.first_name} ${user.last_name} account unlocked`); loadRestricted(); }
    setUnlockingId(null);
    setConfirmUnlock(null);
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const fmtDate = (ts: string) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtDateTime = (ts: string) =>
    new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'audit', label: 'Audit Log Viewer' },
    { key: 'users', label: 'User Management' },
    { key: 'health', label: 'System Health' },
    { key: 'overrides', label: 'Permission Overrides' },
  ];

  const logTotalPages = Math.ceil(logTotal / PAGE_SIZE);
  const userTotalPages = Math.ceil(userTotal / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Audit logs, user administration, and system monitoring</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── AUDIT LOGS ───────────────────────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex flex-wrap gap-3">
              <select value={filterAction} onChange={e => { setFilterAction(e.target.value); setLogPage(1); }}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
                <option value="">All Actions</option>
                {AUDIT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">From</label>
                <input type="date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setLogPage(1); }}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">To</label>
                <input type="date" value={filterTo} onChange={e => { setFilterTo(e.target.value); setLogPage(1); }}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              </div>
              {(filterAction || filterFrom || filterTo) && (
                <button onClick={() => { setFilterAction(''); setFilterFrom(''); setFilterTo(''); setLogPage(1); }}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {logsLoading ? (
              <div className="py-16 text-center text-gray-400">Loading…</div>
            ) : logs.length === 0 ? (
              <div className="py-16 text-center text-gray-400">No audit log entries found</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        {['Timestamp', 'Actor', 'Action', 'Table', 'Record ID', 'IP'].map(h => (
                          <th key={h} className="text-left text-xs font-semibold text-gray-600 px-4 py-3 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {logs.map(log => (
                        <tr key={log.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(log.created_at)}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {log.actor_id ? log.actor_name : (
                              <span className="text-gray-400 italic">System</span>
                            )}
                          </td>
                          <td className="px-4 py-3"><ActionBadge action={log.action} /></td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-600">{log.table_name}</td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-400 max-w-[120px] truncate" title={log.record_id}>
                            {log.record_id.slice(0, 8)}…
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">{log.ip_address ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50 text-sm text-gray-600">
                  <span>Showing {(logPage - 1) * PAGE_SIZE + 1}–{Math.min(logPage * PAGE_SIZE, logTotal)} of {logTotal} entries</span>
                  <div className="flex gap-1">
                    <button onClick={() => setLogPage(p => Math.max(1, p - 1))} disabled={logPage <= 1}
                      className="px-3 py-1 rounded border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40">← Prev</button>
                    <button onClick={() => setLogPage(p => p + 1)} disabled={logPage >= logTotalPages}
                      className="px-3 py-1 rounded border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40">Next →</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── USER MANAGEMENT ──────────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex flex-wrap gap-3">
              <input type="search" placeholder="Search by name or email…" value={userSearch}
                onChange={e => { setUserSearch(e.target.value); setUserPage(1); }}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm w-56" />
              <select value={filterRole} onChange={e => { setFilterRole(e.target.value); setUserPage(1); }}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
                <option value="">All Roles</option>
                {ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
              </select>
              <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setUserPage(1); }}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
                <option value="">All Statuses</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {(userSearch || filterRole || filterStatus) && (
                <button onClick={() => { setUserSearch(''); setFilterRole(''); setFilterStatus(''); setUserPage(1); }}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Clear</button>
              )}
            </div>
          </div>

          {/* Reset link display */}
          {resetLink && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-yellow-800">Password reset link generated</p>
                <p className="text-xs text-yellow-700 mt-0.5">Share this link with the user. It expires in 24 hours.</p>
                <div className="flex items-center gap-2 mt-2">
                  <code className="text-xs bg-white border border-yellow-200 rounded px-2 py-1 flex-1 truncate text-gray-700 font-mono">
                    {resetLink.link}
                  </code>
                  <button onClick={() => { navigator.clipboard.writeText(resetLink.link); toast.success('Copied!'); }}
                    className="px-2.5 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium hover:bg-yellow-200 shrink-0">
                    Copy
                  </button>
                  <button onClick={() => setResetLink(null)} className="px-2.5 py-1 text-yellow-600 hover:text-yellow-800 text-xs shrink-0">Dismiss</button>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {usersLoading ? (
              <div className="py-16 text-center text-gray-400">Loading…</div>
            ) : users.length === 0 ? (
              <div className="py-16 text-center text-gray-400">No users match your filters</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px]">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        {['Name', 'Email', 'Role', 'Status', 'Joined', 'Actions'].map(h => (
                          <th key={h} className="text-left text-xs font-semibold text-gray-600 px-4 py-3 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {users.map(u => (
                        <tr key={u.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{u.first_name} {u.last_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                          <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                          <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                          <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(u.created_at)}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => handleResetPassword(u)} disabled={resettingId === u.id}
                              className="px-3 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">
                              {resettingId === u.id ? 'Generating…' : 'Reset Password'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50 text-sm text-gray-600">
                  <span>Showing {(userPage - 1) * PAGE_SIZE + 1}–{Math.min(userPage * PAGE_SIZE, userTotal)} of {userTotal} users</span>
                  <div className="flex gap-1">
                    <button onClick={() => setUserPage(p => Math.max(1, p - 1))} disabled={userPage <= 1}
                      className="px-3 py-1 rounded border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40">← Prev</button>
                    <button onClick={() => setUserPage(p => p + 1)} disabled={userPage >= userTotalPages}
                      className="px-3 py-1 rounded border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40">Next →</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── SYSTEM HEALTH ─────────────────────────────────────────────────────── */}
      {activeTab === 'health' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={checkHealth} disabled={healthLoading}
              className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">
              {healthLoading ? 'Checking…' : '↻ Refresh'}
            </button>
          </div>

          {healthLoading ? (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">Checking connectivity…</div>
          ) : !health ? null : (
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Connectivity card */}
              <div className={`bg-white rounded-xl border p-5 ${health.connected ? 'border-green-200' : 'border-red-200'}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-3 h-3 rounded-full ${health.connected ? 'bg-green-500' : 'bg-red-500'}`} />
                  <h3 className="text-sm font-semibold text-gray-900">Supabase Connection</h3>
                </div>
                {health.connected ? (
                  <p className="text-sm text-green-700">{health.message}</p>
                ) : (
                  <p className="text-sm text-red-700">{health.error}</p>
                )}
              </div>

              {/* Project info card */}
              {health.account && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Project Details</h3>
                  <dl className="space-y-2">
                    <div>
                      <dt className="text-xs text-gray-500">Supabase URL</dt>
                      <dd className="text-sm font-mono text-gray-700 truncate">{health.account.url}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">Project Reference</dt>
                      <dd className="text-sm font-mono text-gray-700">{health.account.projectRef ?? '—'}</dd>
                    </div>
                    {health.account.dashboardUrl && (
                      <div>
                        <a href={health.account.dashboardUrl} target="_blank" rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline">
                          Open Supabase Dashboard →
                        </a>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Env config card */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 sm:col-span-2">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Environment Configuration</h3>
                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    { label: 'NEXT_PUBLIC_SUPABASE_URL', present: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) },
                    { label: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', present: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) },
                  ].map(cfg => (
                    <div key={cfg.label} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.present ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="text-xs font-mono text-gray-600 truncate">{cfg.label}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                    <div className="w-2 h-2 rounded-full shrink-0 bg-gray-300" />
                    <span className="text-xs font-mono text-gray-400 truncate">SUPABASE_SERVICE_ROLE_KEY (server-only)</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PERMISSION OVERRIDES ─────────────────────────────────────────────── */}
      {activeTab === 'overrides' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
            <svg className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-blue-800">
              Accounts listed here are <strong>suspended</strong> or <strong>inactive</strong>. Unlocking sets their status to <em>active</em> and restores full access.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {restrictedLoading ? (
              <div className="py-16 text-center text-gray-400">Loading…</div>
            ) : restricted.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-gray-500 text-sm font-medium">No restricted accounts</p>
                <p className="text-gray-400 text-xs mt-1">All users are active.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      {['Name', 'Email', 'Role', 'Status', 'Action'].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-gray-600 px-4 py-3 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {restricted.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{u.first_name} {u.last_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                        <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                        <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                        <td className="px-4 py-3">
                          <button onClick={() => setConfirmUnlock(u)}
                            disabled={unlockingId === u.id}
                            className="px-3 py-1 rounded text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50">
                            {unlockingId === u.id ? 'Unlocking…' : 'Unlock Account'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Unlock confirm modal ──────────────────────────────────────────────── */}
      {confirmUnlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Unlock Account?</h2>
            <p className="text-sm text-gray-600 mb-4">
              <strong>{confirmUnlock.first_name} {confirmUnlock.last_name}</strong> ({confirmUnlock.email}) will be set to <strong>active</strong> and regain full system access.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmUnlock(null)}
                className="px-4 py-2 rounded-lg border text-sm text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => handleUnlock(confirmUnlock)} disabled={unlockingId === confirmUnlock.id}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60">
                {unlockingId === confirmUnlock.id ? 'Unlocking…' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
