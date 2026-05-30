'use client';

import { useCallback, useEffect, useState } from 'react';

type Backup = {
  id: string;
  name: string;
  backup_type: 'full' | 'database' | 'files';
  status: 'completed' | 'failed' | 'in_progress';
  size_bytes: number | null;
  location: string | null;
  restore_status: 'none' | 'in_progress' | 'completed' | 'failed';
  notes: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  initiatedByName: string;
};

const TYPE_COLORS: Record<string, string> = {
  full: 'bg-purple-100 text-purple-700',
  database: 'bg-blue-100 text-blue-700',
  files: 'bg-amber-100 text-amber-700',
};
const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-50 border border-green-300 text-green-700',
  failed: 'bg-red-50 border border-red-300 text-red-700',
  in_progress: 'bg-amber-50 border border-amber-300 text-amber-700',
};

function fmtSize(bytes: number | null) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}

export default function ItAdminBackupsPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [form, setForm] = useState({ name: '', backup_type: 'full', status: 'completed', size_mb: '', location: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/it-admin/backups');
    const json = await res.json();
    if (res.ok) setBackups(json.backups ?? []);
    else setToast({ kind: 'err', msg: json.error ?? 'Failed to load backups.' });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const submit = async () => {
    if (!form.name.trim()) { setToast({ kind: 'err', msg: 'Name is required.' }); return; }
    setSaving(true);
    const sizeMb = parseFloat(form.size_mb);
    const res = await fetch('/api/it-admin/backups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        backup_type: form.backup_type,
        status: form.status,
        size_bytes: Number.isFinite(sizeMb) ? Math.round(sizeMb * 1024 * 1024) : undefined,
        location: form.location.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setToast({ kind: 'err', msg: json.error ?? 'Failed to record backup.' }); return; }
    setToast({ kind: 'ok', msg: 'Backup recorded.' });
    setShowForm(false);
    setForm({ name: '', backup_type: 'full', status: 'completed', size_mb: '', location: '', notes: '' });
    load();
  };

  const lastSuccess = backups.find(b => b.status === 'completed');
  const failedCount = backups.filter(b => b.status === 'failed').length;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Backup &amp; Restore Monitoring</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track backup runs and restore operations</p>
        </div>
        <button onClick={() => setShowForm(s => !s)}
          className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700">
          {showForm ? 'Cancel' : 'Record backup'}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Records" value={String(backups.length)} accent="text-gray-900" />
        <StatCard label="Last Successful" value={lastSuccess ? fmtDate(lastSuccess.completed_at ?? lastSuccess.created_at).split(',')[0] : '—'} accent="text-green-600" />
        <StatCard label="Failed" value={String(failedCount)} accent={failedCount ? 'text-red-600' : 'text-gray-900'} />
        <StatCard label="Latest Status" value={backups[0]?.status?.replace('_', ' ') ?? '—'} accent="text-teal-600" />
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Record a backup run</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="text-gray-600">Name *</span>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="backup_20260530_020000"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-gray-900" />
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Type</span>
              <select value={form.backup_type} onChange={e => setForm({ ...form, backup_type: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-gray-900">
                <option value="full">Full</option>
                <option value="database">Database Only</option>
                <option value="files">Files Only</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Status</span>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-gray-900">
                <option value="completed">Completed</option>
                <option value="in_progress">In Progress</option>
                <option value="failed">Failed</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Size (MB)</span>
              <input type="number" value={form.size_mb} onChange={e => setForm({ ...form, size_mb: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-gray-900" />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-gray-600">Location</span>
              <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                placeholder="s3://backups/…"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-gray-900" />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-gray-600">Notes</span>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-gray-900" />
            </label>
          </div>
          <div className="flex justify-end">
            <button onClick={submit} disabled={saving}
              className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save record'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400 animate-pulse">Loading backups…</div>
        ) : backups.length === 0 ? (
          <div className="p-16 text-center text-gray-500">No backup records yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Name', 'Type', 'Status', 'Size', 'Restore', 'Initiated By', 'Created', 'Notes'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {backups.map(b => (
                  <tr key={b.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{b.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[b.backup_type]}`}>{b.backup_type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[b.status]}`}>{b.status.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtSize(b.size_bytes)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs capitalize">{b.restore_status === 'none' ? '—' : b.restore_status.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{b.initiatedByName}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(b.created_at)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 max-w-xs truncate">{b.error_message || b.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.kind === 'ok' ? 'bg-gray-900 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
