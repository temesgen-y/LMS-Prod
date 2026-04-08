'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';

type PendingStudent = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  registered_at: string;
  program: string;
  degree_level: string;
};

type ActionState = { id: string; type: 'approve' | 'reject' } | null;

export default function StudentApprovalsPage() {
  const [students, setStudents] = useState<PendingStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null); // student id being processed
  const [confirmAction, setConfirmAction] = useState<ActionState>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/students/pending');
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? 'Failed to load pending students');
    } else {
      setStudents(json.students ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id: string) => {
    setProcessing(id);
    const res = await fetch(`/api/admin/students/${id}/approve`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? 'Approval failed');
    } else {
      toast.success(`Student approved — ${json.student_no}`);
      setStudents(prev => prev.filter(s => s.id !== id));
    }
    setProcessing(null);
    setConfirmAction(null);
  };

  const handleReject = async (id: string) => {
    setProcessing(id);
    const res = await fetch(`/api/admin/students/${id}/reject`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? 'Rejection failed');
    } else {
      toast.success('Student registration rejected');
      setStudents(prev => prev.filter(s => s.id !== id));
    }
    setProcessing(null);
    setConfirmAction(null);
  };

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    return (
      !q ||
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.program.toLowerCase().includes(q)
    );
  });

  const confirmStudent = students.find(s => s.id === confirmAction?.id);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Student Approvals</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review and approve or reject pending student registrations
          </p>
        </div>
        <div className="flex items-center gap-3">
          {students.length > 0 && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
              {students.length} pending
            </span>
          )}
          <button
            onClick={load}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          placeholder="Search by name, email or program…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <div className="text-4xl mb-3">🎉</div>
          <p className="text-gray-500 text-sm font-medium">No pending registrations</p>
          <p className="text-gray-400 text-xs mt-1">All caught up!</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Student', 'Email', 'Program', 'Degree Level', 'Registered', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {s.first_name?.[0]?.toUpperCase()}{s.last_name?.[0]?.toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900 whitespace-nowrap">
                        {s.first_name} {s.last_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{s.email}</td>
                  <td className="px-4 py-3 text-gray-700 text-xs max-w-[140px] truncate" title={s.program}>
                    {s.program || <span className="text-gray-300 italic">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {s.degree_level ? (
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium capitalize">
                        {s.degree_level.replace(/_/g, ' ')}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {new Date(s.registered_at).toLocaleDateString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmAction({ id: s.id, type: 'approve' })}
                        disabled={processing === s.id}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setConfirmAction({ id: s.id, type: 'reject' })}
                        disabled={processing === s.id}
                        className="px-3 py-1.5 bg-white border border-red-300 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmAction && confirmStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            {confirmAction.type === 'approve' ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Approve Registration</h2>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  Approve <strong>{confirmStudent.first_name} {confirmStudent.last_name}</strong>?
                </p>
                <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1 mb-5">
                  <p><span className="font-medium text-gray-700">Email:</span> {confirmStudent.email}</p>
                  <p><span className="font-medium text-gray-700">Program:</span> {confirmStudent.program || '—'}</p>
                  <p><span className="font-medium text-gray-700">Degree:</span> {confirmStudent.degree_level || '—'}</p>
                </div>
                <p className="text-xs text-gray-400 mb-5">
                  This will activate the account and auto-generate a student number (STU-YYYY-NNNN).
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="px-4 py-2 rounded-lg border text-sm"
                    disabled={processing === confirmStudent.id}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleApprove(confirmStudent.id)}
                    disabled={processing === confirmStudent.id}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60"
                  >
                    {processing === confirmStudent.id ? 'Approving…' : 'Approve'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Reject Registration</h2>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  Reject <strong>{confirmStudent.first_name} {confirmStudent.last_name}</strong>?
                </p>
                <p className="text-xs text-gray-400 mb-5">
                  Their account will be suspended. No student profile will be created.
                  This action is logged in the audit trail.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="px-4 py-2 rounded-lg border text-sm"
                    disabled={processing === confirmStudent.id}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleReject(confirmStudent.id)}
                    disabled={processing === confirmStudent.id}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
                  >
                    {processing === confirmStudent.id ? 'Rejecting…' : 'Reject'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
