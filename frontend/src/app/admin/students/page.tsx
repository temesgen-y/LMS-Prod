'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const PAGE_SIZE = 10;

type Student = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  created_at: string;
  student_no: string | null;
  program: string | null;
  degree_level: string | null;
  profile_status: string | null;
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="w-36 shrink-0 text-xs text-gray-400 uppercase tracking-wide pt-0.5">{label}</span>
      <span className="text-sm text-gray-800 font-medium">{value ?? <span className="text-gray-300 italic font-normal">—</span>}</span>
    </div>
  );
}

const statusBadge = (s: string) => {
  switch (s?.toLowerCase()) {
    case 'active':    return 'border border-green-400 text-green-600 bg-green-50';
    case 'inactive':  return 'border border-gray-300 text-gray-500 bg-gray-50';
    case 'pending':   return 'border border-amber-400 text-amber-600 bg-amber-50';
    case 'suspended': return 'border border-red-400 text-red-600 bg-red-50';
    default:          return 'border border-gray-200 text-gray-400 bg-gray-50';
  }
};

export default function StudentsPage() {
  const supabase = createClient();

  const [students, setStudents]         = useState<Student[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [filterProgram, setFilterProgram] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage]                 = useState(1);

  // modal state
  const [viewStudent, setViewStudent]   = useState<Student | null>(null);
  const [editStudent, setEditStudent]   = useState<Student | null>(null);
  const [editStatus, setEditStatus]     = useState('');
  const [editSaving, setEditSaving]     = useState(false);
  const [editError, setEditError]       = useState('');
  const [deleteStudent, setDeleteStudent] = useState<Student | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('users')
      .select(`
        id, email, first_name, last_name, status, created_at,
        student_profiles!user_id(student_no, program, degree_level, profile_status)
      `)
      .in('role', ['STUDENT', 'student'])
      .order('created_at', { ascending: false });

    setStudents(
      (data ?? []).map((r: any) => ({
        id: r.id,
        email: r.email,
        first_name: r.first_name,
        last_name: r.last_name,
        status: r.status,
        created_at: r.created_at,
        student_no: r.student_profiles?.student_no ?? null,
        program: r.student_profiles?.program ?? null,
        degree_level: r.student_profiles?.degree_level ?? null,
        profile_status: r.student_profiles?.profile_status ?? null,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // unique programs for dropdown
  const programs = Array.from(new Set(students.map(s => s.program).filter(Boolean))) as string[];

  const filtered = students
    .filter(s => !filterProgram || s.program === filterProgram)
    .filter(s => !filterStatus || s.status.toLowerCase() === filterStatus)
    .filter(s => {
      const q = search.toLowerCase();
      return !q
        || `${s.first_name} ${s.last_name}`.toLowerCase().includes(q)
        || s.email.toLowerCase().includes(q)
        || (s.student_no ?? '').toLowerCase().includes(q);
    });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const showFrom   = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showTo     = Math.min(page * PAGE_SIZE, filtered.length);

  const openEdit = (s: Student) => {
    setEditStudent(s);
    setEditStatus(s.status.toLowerCase());
    setEditError('');
  };

  const saveEdit = async () => {
    if (!editStudent) return;
    setEditSaving(true);
    setEditError('');
    const supabase = createClient();
    const { error } = await supabase
      .from('users')
      .update({ status: editStatus })
      .eq('id', editStudent.id);
    if (error) {
      setEditError(error.message);
    } else {
      setStudents(prev => prev.map(s => s.id === editStudent.id ? { ...s, status: editStatus } : s));
      setEditStudent(null);
    }
    setEditSaving(false);
  };

  const openDelete = (s: Student) => {
    setDeleteStudent(s);
    setDeleteConfirm('');
    setDeleteError('');
  };

  const confirmDelete = async () => {
    if (!deleteStudent) return;
    setDeleteLoading(true);
    setDeleteError('');
    const supabase = createClient();
    // Delete student_profiles first (FK), then users row
    await supabase.from('student_profiles').delete().eq('user_id', deleteStudent.id);
    const { error } = await supabase.from('users').delete().eq('id', deleteStudent.id);
    if (error) {
      setDeleteError(error.message);
    } else {
      setStudents(prev => prev.filter(s => s.id !== deleteStudent.id));
      setDeleteStudent(null);
    }
    setDeleteLoading(false);
  };

  const counts = {
    total:     students.length,
    active:    students.filter(s => s.status.toLowerCase() === 'active').length,
    pending:   students.filter(s => s.status.toLowerCase() === 'pending').length,
    suspended: students.filter(s => s.status.toLowerCase() === 'suspended').length,
  };

  return (
    <div>

      {/* ── Summary cards (unchanged) ─────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Students</h1>
        <p className="text-sm text-gray-500 mb-4">All registered students and their profiles</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total',     count: counts.total,     color: 'text-gray-700',  key: '' },
            { label: 'Active',    count: counts.active,    color: 'text-green-600', key: 'active' },
            { label: 'Pending',   count: counts.pending,   color: 'text-amber-600', key: 'pending' },
            { label: 'Suspended', count: counts.suspended, color: 'text-red-600',   key: 'suspended' },
          ].map(c => (
            <button
              key={c.key}
              onClick={() => { setFilterStatus(filterStatus === c.key ? '' : c.key); setPage(1); }}
              className={`bg-white rounded-xl border p-4 text-left hover:shadow-sm transition ${filterStatus === c.key ? 'border-primary ring-1 ring-primary' : 'border-gray-200'}`}
            >
              <div className={`text-2xl font-bold ${c.color}`}>{c.count}</div>
              <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Table card ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-100">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              placeholder="Search students..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Program filter */}
          <div className="relative">
            <select
              value={filterProgram}
              onChange={e => { setFilterProgram(e.target.value); setPage(1); }}
              className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
            >
              <option value="">All Programs</option>
              {programs.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
              className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
            <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-48">Full Name</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Program</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-32">Degree</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-28">Status</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-400">No students found</td>
                </tr>
              ) : paginated.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-gray-900 whitespace-nowrap">
                    {s.first_name} {s.last_name}
                  </td>
                  <td className="px-5 py-3.5 text-gray-400 text-xs">{s.email}</td>
                  <td className="px-5 py-3.5 text-indigo-500 text-sm">
                    {s.program ?? <span className="text-gray-300 italic">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-gray-600 capitalize">
                    {s.degree_level
                      ? s.degree_level.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                      : <span className="text-gray-300 italic">—</span>
                    }
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-block px-3 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(s.status)}`}>
                      {s.status?.toLowerCase() === 'active' ? 'Active'
                        : s.status?.toLowerCase() === 'inactive' ? 'Inactive'
                        : s.status?.toLowerCase() === 'pending' ? 'Pending'
                        : s.status?.toLowerCase() === 'suspended' ? 'Suspended'
                        : s.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-3">
                      {/* View */}
                      <button type="button" onClick={() => setViewStudent(s)} className="text-gray-400 hover:text-gray-600 transition-colors" title="View">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                      {/* Edit */}
                      <button type="button" onClick={() => openEdit(s)} className="text-gray-400 hover:text-indigo-600 transition-colors" title="Edit">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      {/* Delete */}
                      <button type="button" onClick={() => openDelete(s)} className="text-gray-400 hover:text-red-500 transition-colors" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination footer */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-400">
              Showing {showFrom}–{showTo} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── View Modal ──────────────────────────────────────────────────────── */}
      {viewStudent && (
        <Modal title="Student Details" onClose={() => setViewStudent(null)}>
          <DetailRow label="Full Name"    value={`${viewStudent.first_name} ${viewStudent.last_name}`} />
          <DetailRow label="Email"        value={viewStudent.email} />
          <DetailRow label="Student No"   value={viewStudent.student_no} />
          <DetailRow label="Program"      value={viewStudent.program} />
          <DetailRow label="Degree Level" value={viewStudent.degree_level?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} />
          <DetailRow label="Status"       value={
            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(viewStudent.status)}`}>
              {viewStudent.status}
            </span>
          } />
          <DetailRow label="Registered"   value={new Date(viewStudent.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
        </Modal>
      )}

      {/* ── Edit Modal ──────────────────────────────────────────────────────── */}
      {editStudent && (
        <Modal title="Edit Student" onClose={() => setEditStudent(null)}>
          <p className="text-sm text-gray-500 mb-4">
            Editing <span className="font-medium text-gray-800">{editStudent.first_name} {editStudent.last_name}</span>
          </p>
          <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">Status</label>
          <select
            value={editStatus}
            onChange={e => setEditStatus(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
          {editError && <p className="mt-2 text-xs text-red-500">{editError}</p>}
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" onClick={() => setEditStudent(null)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="button" onClick={saveEdit} disabled={editSaving}
              className="px-4 py-2 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">
              {editSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirm Modal ─────────────────────────────────────────────── */}
      {deleteStudent && (
        <Modal title="Delete Student" onClose={() => setDeleteStudent(null)}>
          <p className="text-sm text-gray-600 mb-4">
            This will permanently delete <span className="font-semibold text-gray-900">{deleteStudent.first_name} {deleteStudent.last_name}</span> and all their data. This cannot be undone.
          </p>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Type <span className="font-mono text-red-600">DELETE</span> to confirm
          </label>
          <input
            type="text"
            value={deleteConfirm}
            onChange={e => setDeleteConfirm(e.target.value)}
            placeholder="DELETE"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
          />
          {deleteError && <p className="mt-2 text-xs text-red-500">{deleteError}</p>}
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" onClick={() => setDeleteStudent(null)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="button" onClick={confirmDelete}
              disabled={deleteConfirm !== 'DELETE' || deleteLoading}
              className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40">
              {deleteLoading ? 'Deleting…' : 'Delete Student'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
