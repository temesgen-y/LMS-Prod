'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type LogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  actorName?: string;
};

const ACTION_COLORS: Record<string, string> = {
  'user.lock': 'bg-red-100 text-red-700',
  'user.unlock': 'bg-green-100 text-green-700',
  'user.password_reset': 'bg-amber-100 text-amber-700',
  'user.session_revoke': 'bg-orange-100 text-orange-700',
  'backup.record': 'bg-emerald-100 text-emerald-700',
};

const PAGE_SIZE = 50;

export default function ItAdminAuditLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from('audit_logs')
      .select('id, actor_id, action, target_type, target_id, details, ip_address, user_agent, created_at')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (actionFilter) query = query.eq('action', actionFilter);
    if (fromDate) query = query.gte('created_at', new Date(fromDate).toISOString());
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      query = query.lte('created_at', end.toISOString());
    }

    const { data, error } = await query;
    if (error || !data) { setLogs([]); setLoading(false); return; }

    const actorIds = [...new Set((data as LogRow[]).map(l => l.actor_id).filter(Boolean))] as string[];
    const { data: users } = actorIds.length
      ? await supabase.from('users').select('id, first_name, last_name').in('id', actorIds)
      : { data: [] };
    const nameMap: Record<string, string> = {};
    ((users ?? []) as { id: string; first_name: string; last_name: string }[]).forEach(u => {
      nameMap[u.id] = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
    });

    setLogs((data as LogRow[]).map(l => ({
      ...l,
      actorName: l.actor_id ? (nameMap[l.actor_id] ?? 'Unknown') : 'System',
    })));
    setLoading(false);
  }, [page, actionFilter, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? logs.filter(l =>
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        (l.actorName ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (l.target_type ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (l.target_id ?? '').includes(search) ||
        (l.ip_address ?? '').includes(search))
    : logs;

  const uniqueActions = [...new Set(logs.map(l => l.action))].sort();

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Immutable record of sensitive system actions</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search logs…"
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 bg-white w-44" />
          <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 bg-white">
            <option value="">All Actions</option>
            {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(0); }}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 bg-white" title="From date" />
          <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(0); }}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 bg-white" title="To date" />
          <button onClick={load} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50" aria-label="Refresh">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400 animate-pulse">Loading audit logs…</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center text-gray-500">No audit logs found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Timestamp', 'Action', 'Actor', 'Target', 'IP Address', 'Details'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-600'}`}>
                        {log.action.replace(/[._]/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-medium whitespace-nowrap">{log.actorName}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {log.target_type && <span className="font-medium text-gray-700">{log.target_type}</span>}
                      {log.target_id && <span className="ml-1 font-mono text-gray-400">{log.target_id.slice(0, 8)}…</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{log.ip_address ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">{log.details ? JSON.stringify(log.details) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
          <span className="text-gray-400">Page {page + 1}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">Previous</button>
            <button onClick={() => setPage(p => p + 1)} disabled={logs.length < PAGE_SIZE}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
