'use client';

import { useState } from 'react';

type BackupType = 'full' | 'database' | 'files';
type BackupStatus = 'completed' | 'failed' | 'in_progress';

interface Backup {
  id: string;
  name: string;
  type: BackupType;
  size: string;
  status: BackupStatus;
  initiatedBy: string;
  createdAt: string;
  notes?: string;
}

const INITIAL_BACKUPS: Backup[] = [
  {
    id: '1',
    name: 'backup_20260526_020000',
    type: 'full',
    size: '2.4 GB',
    status: 'completed',
    initiatedBy: 'Scheduled',
    createdAt: '2026-05-26T02:00:00Z',
    notes: 'Nightly full backup',
  },
  {
    id: '2',
    name: 'backup_20260525_020000',
    type: 'full',
    size: '2.3 GB',
    status: 'completed',
    initiatedBy: 'Scheduled',
    createdAt: '2026-05-25T02:00:00Z',
    notes: 'Nightly full backup',
  },
  {
    id: '3',
    name: 'backup_20260524_140512',
    type: 'database',
    size: '840 MB',
    status: 'completed',
    initiatedBy: 'Admin',
    createdAt: '2026-05-24T14:05:12Z',
    notes: 'Pre-migration snapshot',
  },
  {
    id: '4',
    name: 'backup_20260523_020000',
    type: 'full',
    size: '2.2 GB',
    status: 'failed',
    initiatedBy: 'Scheduled',
    createdAt: '2026-05-23T02:00:00Z',
    notes: 'Storage quota exceeded',
  },
  {
    id: '5',
    name: 'backup_20260522_020000',
    type: 'full',
    size: '2.2 GB',
    status: 'completed',
    initiatedBy: 'Scheduled',
    createdAt: '2026-05-22T02:00:00Z',
  },
  {
    id: '6',
    name: 'backup_20260520_093015',
    type: 'files',
    size: '1.6 GB',
    status: 'completed',
    initiatedBy: 'Admin',
    createdAt: '2026-05-20T09:30:15Z',
    notes: 'Storage-only backup before CDN migration',
  },
];

const TYPE_LABELS: Record<BackupType, string> = {
  full: 'Full',
  database: 'Database Only',
  files: 'Files Only',
};

const TYPE_COLORS: Record<BackupType, string> = {
  full: 'bg-purple-100 text-purple-700',
  database: 'bg-blue-100 text-blue-700',
  files: 'bg-amber-100 text-amber-700',
};

const STATUS_COLORS: Record<BackupStatus, string> = {
  completed: 'bg-green-50 border border-green-300 text-green-700',
  failed: 'bg-red-50 border border-red-300 text-red-700',
  in_progress: 'bg-amber-50 border border-amber-300 text-amber-700',
};

const STATUS_LABELS: Record<BackupStatus, string> = {
  completed: 'Completed',
  failed: 'Failed',
  in_progress: 'In Progress',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatCard({
  label,
  value,
  sub,
  iconColor,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  iconColor: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${iconColor}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-lg font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function BackupManagementPage() {
  const [backups, setBackups] = useState<Backup[]>(INITIAL_BACKUPS);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState<Backup | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState<Backup | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | BackupStatus>('all');
  const [filterType, setFilterType] = useState<'all' | BackupType>('all');

  // Create modal state
  const [newType, setNewType] = useState<BackupType>('full');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // Schedule settings state
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [scheduleFreq, setScheduleFreq] = useState('daily');
  const [scheduleTime, setScheduleTime] = useState('02:00');
  const [retention, setRetention] = useState('14');
  const [scheduleSaved, setScheduleSaved] = useState(false);

  const completed = backups.filter(b => b.status === 'completed');
  const lastSuccess = completed.length
    ? completed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;

  const totalSizeGB = backups
    .filter(b => b.status === 'completed')
    .reduce((acc, b) => {
      const n = parseFloat(b.size);
      const unit = b.size.toLowerCase();
      return acc + (unit.includes('gb') ? n : n / 1024);
    }, 0);

  const filtered = backups.filter(b => {
    const matchStatus = filterStatus === 'all' || b.status === filterStatus;
    const matchType = filterType === 'all' || b.type === filterType;
    return matchStatus && matchType;
  });

  const handleCreate = () => {
    setCreating(true);
    const id = Date.now().toString();
    const now = new Date().toISOString();
    const ts = now.replace(/[-:T]/g, '').slice(0, 15);
    const inProgress: Backup = {
      id,
      name: `backup_${ts}`,
      type: newType,
      size: '—',
      status: 'in_progress',
      initiatedBy: 'Admin',
      createdAt: now,
      notes: newNotes || undefined,
    };
    setBackups(prev => [inProgress, ...prev]);
    setShowCreateModal(false);
    setNewNotes('');
    setNewType('full');
    setCreating(false);

    // Simulate backup completing after 4 seconds
    setTimeout(() => {
      const sizes: Record<BackupType, string> = { full: '2.4 GB', database: '842 MB', files: '1.6 GB' };
      setBackups(prev =>
        prev.map(b =>
          b.id === id ? { ...b, status: 'completed', size: sizes[newType] } : b
        )
      );
    }, 4000);
  };

  const handleDelete = (backup: Backup) => {
    setBackups(prev => prev.filter(b => b.id !== backup.id));
    setShowDeleteModal(null);
  };

  const handleSaveSchedule = () => {
    setScheduleSaved(true);
    setTimeout(() => setScheduleSaved(false), 2500);
  };

  const nextBackupDate = () => {
    const now = new Date();
    const [h, m] = scheduleTime.split(':').map(Number);
    const next = new Date();
    next.setHours(h, m, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Backup Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">Create, schedule, and manage system backups</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Backup
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Backups"
          value={String(backups.length)}
          sub={`${completed.length} successful`}
          iconColor="bg-purple-50"
          icon={
            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
          }
        />
        <StatCard
          label="Last Successful Backup"
          value={lastSuccess ? fmtDate(lastSuccess.createdAt) : 'None'}
          sub={lastSuccess ? `${lastSuccess.size} · ${TYPE_LABELS[lastSuccess.type]}` : undefined}
          iconColor="bg-green-50"
          icon={
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Storage Used"
          value={`${totalSizeGB.toFixed(1)} GB`}
          sub="across completed backups"
          iconColor="bg-blue-50"
          icon={
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
            </svg>
          }
        />
        <StatCard
          label="Next Scheduled Backup"
          value={scheduleEnabled ? nextBackupDate() : 'Disabled'}
          sub={scheduleEnabled ? `${scheduleFreq.charAt(0).toUpperCase() + scheduleFreq.slice(1)} at ${scheduleTime}` : 'Enable schedule below'}
          iconColor="bg-amber-50"
          icon={
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
      </div>

      {/* Backup list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-5 py-4 border-b border-gray-100">
          <span className="font-semibold text-gray-900 text-sm mr-auto">Backup History</span>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as 'all' | BackupType)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="all">All Types</option>
            <option value="full">Full</option>
            <option value="database">Database Only</option>
            <option value="files">Files Only</option>
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as 'all' | BackupStatus)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="in_progress">In Progress</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Name</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Type</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Size</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Initiated By</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Created At</th>
                <th className="text-right px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-gray-400 text-sm">
                    No backups match the selected filters.
                  </td>
                </tr>
              ) : (
                filtered.map(backup => (
                  <tr key={backup.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-mono text-xs text-gray-700">{backup.name}</div>
                      {backup.notes && (
                        <div className="text-xs text-gray-400 mt-0.5">{backup.notes}</div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[backup.type]}`}>
                        {TYPE_LABELS[backup.type]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-700">{backup.size}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[backup.status]}`}>
                        {backup.status === 'in_progress' && (
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                        )}
                        {STATUS_LABELS[backup.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{backup.initiatedBy}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(backup.createdAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {backup.status === 'completed' && (
                          <>
                            <button
                              type="button"
                              onClick={() => setShowRestoreModal(backup)}
                              title="Restore"
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              title="Download"
                              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </button>
                          </>
                        )}
                        {backup.status !== 'in_progress' && (
                          <button
                            type="button"
                            onClick={() => setShowDeleteModal(backup)}
                            title="Delete"
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Schedule & Retention Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Schedule */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Automatic Backup Schedule</h3>
              <p className="text-xs text-gray-500 mt-0.5">Configure when backups run automatically</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={scheduleEnabled}
              onClick={() => setScheduleEnabled(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${scheduleEnabled ? 'bg-primary' : 'bg-gray-200'}`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${scheduleEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className={`space-y-3 ${!scheduleEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Frequency</label>
              <select
                value={scheduleFreq}
                onChange={e => setScheduleFreq(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Time (UTC)</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={e => setScheduleTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleSaveSchedule}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition"
            >
              Save Schedule
            </button>
            {scheduleSaved && (
              <span className="ml-3 text-sm text-green-600 font-medium">Saved!</span>
            )}
          </div>
        </div>

        {/* Retention policy */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900">Retention Policy</h3>
            <p className="text-xs text-gray-500 mt-0.5">Oldest backups beyond the limit are removed automatically</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Keep last N backups</label>
              <input
                type="number"
                min={1}
                max={365}
                value={retention}
                onChange={e => setRetention(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Deleted backups cannot be recovered. Ensure your retention window is sufficient for your recovery needs.
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleSaveSchedule}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition"
            >
              Save Policy
            </button>
          </div>
        </div>
      </div>

      {/* Create Backup Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Create Backup</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Backup Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['full', 'database', 'files'] as BackupType[]).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewType(t)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${newType === t ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                    >
                      {t === 'full' && (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                        </svg>
                      )}
                      {t === 'database' && (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                        </svg>
                      )}
                      {t === 'files' && (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      )}
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {newType === 'full' && 'Backs up the entire database and all uploaded files. Recommended.'}
                  {newType === 'database' && 'Backs up database tables and records only. Faster, smaller size.'}
                  {newType === 'files' && 'Backs up uploaded files and storage only. No database data.'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
                <textarea
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Pre-deployment snapshot"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-60"
              >
                {creating ? 'Starting…' : 'Start Backup'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Delete Backup</h3>
                  <p className="text-xs text-gray-500">This action cannot be undone.</p>
                </div>
              </div>
              <p className="text-sm text-gray-600">
                Are you sure you want to delete <span className="font-mono font-medium text-gray-900">{showDeleteModal.name}</span>? ({showDeleteModal.size})
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowDeleteModal(null)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(showDeleteModal)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirm Modal */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Restore Backup</h3>
                  <p className="text-xs text-gray-500">This will overwrite current data.</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                You are about to restore{' '}
                <span className="font-mono font-medium text-gray-900">{showRestoreModal.name}</span>{' '}
                ({fmtDate(showRestoreModal.createdAt)}).
              </p>
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                All data created after this backup will be permanently lost. Create a current backup first if needed.
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowRestoreModal(null)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setShowRestoreModal(null)}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
              >
                Confirm Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
