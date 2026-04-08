'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface ClearanceRequest {
  id              : string;
  student_id      : string;
  clearance_type  : string;
  status          : string;
  library_cleared : boolean;
  dept_cleared    : boolean;
  registrar_cleared: boolean;
  notes           : string | null;
  completed_at    : string | null;
  created_at      : string;
  student_name    : string;
}

const STATUS_BADGE: Record<string, string> = {
  pending    : 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  cleared    : 'bg-green-100 text-green-800',
  rejected   : 'bg-red-100 text-red-800',
};

const CLEARANCE_TYPES = ['graduation', 'withdrawal', 'transfer', 'annual'];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function CheckIcon({ cleared }: { cleared: boolean }) {
  return cleared
    ? <span className="text-green-600 font-bold text-base">✓</span>
    : <span className="text-gray-300 text-base">○</span>;
}

export default function ClearancePage() {
  const router = useRouter();

  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [requests, setRequests]       = useState<ClearanceRequest[]>([]);
  const [activeTab, setActiveTab]     = useState('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Edit modal
  const [editTarget, setEditTarget]   = useState<ClearanceRequest | null>(null);
  const [editType, setEditType]       = useState('');
  const [editNotes, setEditNotes]     = useState('');
  const [editLib, setEditLib]         = useState(false);
  const [editDept, setEditDept]       = useState(false);
  const [editReg, setEditReg]         = useState(false);
  const [editStatus, setEditStatus]   = useState('');
  const [editSaving, setEditSaving]   = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<ClearanceRequest | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.replace('/login'); return; }

      const { data, error: fetchErr } = await supabase
        .from('clearance_requests')
        .select('id, student_id, clearance_type, status, library_cleared, dept_cleared, registrar_cleared, notes, completed_at, created_at')
        .order('created_at', { ascending: false });

      if (fetchErr) throw new Error(fetchErr.message);

      const rows = (data ?? []) as any[];
      const studentIds = [...new Set(rows.map(r => r.student_id))] as string[];
      const nameMap: Record<string, string> = {};

      if (studentIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users').select('id, first_name, last_name').in('id', studentIds);
        (usersData ?? []).forEach((u: any) => {
          nameMap[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim();
        });
      }

      setRequests(rows.map(r => ({
        id:               r.id,
        student_id:       r.student_id,
        clearance_type:   r.clearance_type,
        status:           r.status,
        library_cleared:  r.library_cleared,
        dept_cleared:     r.dept_cleared,
        registrar_cleared:r.registrar_cleared,
        notes:            r.notes,
        completed_at:     r.completed_at,
        created_at:       r.created_at,
        student_name:     nameMap[r.student_id] || 'Unknown',
      })));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Toggle registrar cleared ────────────────────────────────────────────────
  const toggleRegistrarCleared = async (req: ClearanceRequest) => {
    setActionLoading(req.id);
    try {
      const supabase = createClient();
      const newReg = !req.registrar_cleared;
      const allCleared = req.library_cleared && req.dept_cleared && newReg;
      const newStatus = allCleared
        ? 'cleared'
        : (req.library_cleared || req.dept_cleared || newReg) ? 'in_progress' : 'pending';

      await supabase.from('clearance_requests').update({
        registrar_cleared: newReg,
        status:            newStatus,
        completed_at:      allCleared ? new Date().toISOString() : null,
      }).eq('id', req.id);

      if (allCleared) {
        await supabase.from('notifications').insert({
          user_id: req.student_id,
          type:    'announcement',
          title:   'Clearance Complete',
          body:    `Your ${req.clearance_type} clearance has been fully processed.`,
          is_read: false,
        });
      }
      loadData();
    } catch (e: any) {
      setError(e.message ?? 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Open edit modal ─────────────────────────────────────────────────────────
  const openEdit = (req: ClearanceRequest) => {
    setEditTarget(req);
    setEditType(req.clearance_type);
    setEditNotes(req.notes ?? '');
    setEditLib(req.library_cleared);
    setEditDept(req.dept_cleared);
    setEditReg(req.registrar_cleared);
    setEditStatus(req.status);
    setError('');
  };

  // ── Save edit ───────────────────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    setError('');
    try {
      const supabase = createClient();
      const allCleared = editLib && editDept && editReg;
      const derivedStatus = editStatus === 'rejected'
        ? 'rejected'
        : allCleared
          ? 'cleared'
          : (editLib || editDept || editReg) ? 'in_progress' : 'pending';

      await supabase.from('clearance_requests').update({
        clearance_type:    editType,
        notes:             editNotes.trim() || null,
        library_cleared:   editLib,
        dept_cleared:      editDept,
        registrar_cleared: editReg,
        status:            derivedStatus,
        completed_at:      derivedStatus === 'cleared' ? (editTarget.completed_at ?? new Date().toISOString()) : null,
      }).eq('id', editTarget.id);

      // Notify student on status changes
      if (derivedStatus !== editTarget.status) {
        const bodyMap: Record<string, string> = {
          cleared:     `Your ${editType} clearance has been fully approved.`,
          rejected:    `Your ${editType} clearance request has been rejected.`,
          in_progress: `Your ${editType} clearance is now in progress.`,
        };
        if (bodyMap[derivedStatus]) {
          await supabase.from('notifications').insert({
            user_id: editTarget.student_id,
            type:    'announcement',
            title:   'Clearance Status Updated',
            body:    bodyMap[derivedStatus],
            is_read: false,
          });
        }
      }

      setEditTarget(null);
      loadData();
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: delErr } = await supabase
        .from('clearance_requests').delete().eq('id', deleteTarget.id);
      if (delErr) throw new Error(delErr.message);

      await supabase.from('notifications').insert({
        user_id: deleteTarget.student_id,
        type:    'announcement',
        title:   'Clearance Request Removed',
        body:    `Your ${deleteTarget.clearance_type} clearance request has been removed by the registrar.`,
        is_read: false,
      });

      setDeleteTarget(null);
      loadData();
    } catch (e: any) {
      setError(e.message ?? 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filtered = activeTab === 'all'
    ? requests
    : requests.filter(r => r.status === activeTab);

  const tabCounts: Record<string, number> = {
    all:         requests.length,
    pending:     requests.filter(r => r.status === 'pending').length,
    in_progress: requests.filter(r => r.status === 'in_progress').length,
    cleared:     requests.filter(r => r.status === 'cleared').length,
    rejected:    requests.filter(r => r.status === 'rejected').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Clearance Requests</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-gray-200">
        {(['all', 'pending', 'in_progress', 'cleared', 'rejected'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg -mb-px capitalize transition-colors ${
              activeTab === tab
                ? 'bg-white border border-b-white border-gray-200 text-purple-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.replace('_', ' ')}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${activeTab === tab ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
              {tabCounts[tab]}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">No clearance requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Student</th>
                  <th className="px-5 py-3 text-left font-medium">Type</th>
                  <th className="px-5 py-3 text-center font-medium">Library</th>
                  <th className="px-5 py-3 text-center font-medium">Dept</th>
                  <th className="px-5 py-3 text-center font-medium">Registrar</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3 text-left font-medium">Submitted</th>
                  <th className="px-5 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{r.student_name}</td>
                    <td className="px-5 py-3 capitalize text-gray-600">{r.clearance_type}</td>
                    <td className="px-5 py-3 text-center"><CheckIcon cleared={r.library_cleared} /></td>
                    <td className="px-5 py-3 text-center"><CheckIcon cleared={r.dept_cleared} /></td>
                    <td className="px-5 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggleRegistrarCleared(r)}
                        disabled={actionLoading === r.id || r.status === 'cleared' || r.status === 'rejected'}
                        title={r.registrar_cleared ? 'Click to un-clear' : 'Click to mark cleared'}
                        className={`w-8 h-8 rounded-full text-sm font-bold transition-colors disabled:opacity-40 ${
                          r.registrar_cleared
                            ? 'bg-green-100 text-green-600 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                      >
                        {actionLoading === r.id ? '…' : r.registrar_cleared ? '✓' : '○'}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(r)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-700 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Edit Modal ────────────────────────────────────────────────────────── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Edit Clearance Request</h2>
              <button type="button" onClick={() => setEditTarget(null)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="text-sm text-gray-500">
                Student: <span className="font-semibold text-gray-800">{editTarget.student_name}</span>
              </div>

              {/* Clearance type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clearance Type</label>
                <select
                  value={editType}
                  onChange={e => setEditType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {CLEARANCE_TYPES.map(t => (
                    <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>

              {/* Clearance flags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Clearance Status by Department</label>
                <div className="space-y-2">
                  {[
                    { label: 'Library Cleared',   value: editLib,  set: setEditLib },
                    { label: 'Department Cleared', value: editDept, set: setEditDept },
                    { label: 'Registrar Cleared',  value: editReg,  set: setEditReg },
                  ].map(({ label, value, set }) => (
                    <label key={label} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={e => set(e.target.checked)}
                        className="w-4 h-4 rounded accent-purple-600"
                      />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Manual reject override */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Override Status</label>
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="pending">Pending (auto)</option>
                  <option value="in_progress">In Progress (auto)</option>
                  <option value="cleared">Cleared (auto)</option>
                  <option value="rejected">Rejected (manual)</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">Status is auto-calculated from flags unless set to Rejected.</p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={3}
                  placeholder="Optional notes..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={editSaving}
                  className="flex-1 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 flex-shrink-0 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Delete Clearance Request</h2>
                <p className="text-sm text-gray-600 mb-1">
                  Are you sure you want to delete the <strong className="capitalize">{deleteTarget.clearance_type}</strong> clearance request for{' '}
                  <strong>{deleteTarget.student_name}</strong>?
                </p>
                <p className="text-xs text-gray-400">The student will be notified. This action cannot be undone.</p>
              </div>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteLoading}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {deleteLoading ? 'Deleting…' : 'Yes, Delete'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
