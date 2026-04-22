'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

type Instructor = {
  userId: string;
  profileId: string | null;
  fullName: string;
  email: string;
  departmentId: string | null;
  departmentName: string;
  title: string;
  status: string;
  hasProfile: boolean;
};

type Department = { id: string; name: string };

const PAGE_SIZE = 10;

const initialForm = {
  firstName: '',
  lastName: '',
  email: '',
  departmentId: '',
  title: '',
  specialization: '',
  qualification: '',
  bio: '',
  officeHours: '',
  employmentStatus: '',
  profileStatus: 'PENDING',
};

const EMPLOYMENT_OPTIONS = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'ADJUNCT'];
const PROFILE_STATUS_OPTIONS = ['PENDING', 'ACTIVE', 'INACTIVE'];

export default function AdminInstructorsPage() {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deptLoading, setDeptLoading] = useState(false);

  // Assign-department modal
  const [assignTarget, setAssignTarget] = useState<Instructor | null>(null);
  const [assignDeptId, setAssignDeptId] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Remove-department confirm
  const [removeTarget, setRemoveTarget] = useState<Instructor | null>(null);
  const [removing, setRemoving] = useState(false);

  // Delete instructor confirm
  const [deleteTarget, setDeleteTarget] = useState<Instructor | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDepartments = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from('departments').select('id, name').eq('is_active', true).order('name');
    setDepartments((data as Department[]) ?? []);
  }, []);

  const fetchInstructors = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    // Fetch ALL users with instructor or department_head role
    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, status, role')
      .in('role', ['instructor', 'department_head'])
      .order('first_name', { ascending: true });

    if (usersErr) { toast.error('Failed to load instructors.'); setLoading(false); return; }

    // Fetch all instructor_profiles
    const { data: profiles } = await supabase
      .from('instructor_profiles')
      .select('user_id, id, department, department_id, title, profile_status');

    // Fetch department names
    const { data: depts } = await supabase.from('departments').select('id, name');
    const deptNameMap: Record<string, string> = {};
    for (const d of depts ?? []) deptNameMap[d.id] = d.name;

    const profileMap: Record<string, any> = {};
    for (const p of profiles ?? []) profileMap[(p as any).user_id] = p;

    const rows: Instructor[] = (users ?? []).map((u: any) => {
      const p = profileMap[u.id] ?? null;
      // Resolve department name: prefer department_id FK lookup, fallback to text field
      let deptName = 'Unassigned';
      let deptId: string | null = null;
      if (p) {
        if (p.department_id && deptNameMap[p.department_id]) {
          deptId = p.department_id;
          deptName = deptNameMap[p.department_id];
        } else if (p.department && p.department !== 'Unassigned') {
          // Text field may be UUID or name
          const byId = deptNameMap[p.department];
          if (byId) {
            deptId = p.department;
            deptName = byId;
          } else {
            deptName = p.department;
          }
        }
      }
      return {
        userId: u.id,
        profileId: p?.id ?? null,
        fullName: [u.first_name, u.last_name].filter(Boolean).join(' ') || '—',
        email: u.email ?? '—',
        departmentId: deptId,
        departmentName: deptName,
        title: p?.title ?? '—',
        status: p?.profile_status ?? u.status ?? 'active',
        hasProfile: !!p,
      };
    });

    setInstructors(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInstructors();
    fetchDepartments();
  }, [fetchInstructors, fetchDepartments]);

  // Invite instructor
  const openInvite = () => {
    setForm(initialForm);
    setSubmitError('');
    setDeptLoading(true);
    setInviteOpen(true);
    fetchDepartments().then(() => setDeptLoading(false));
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim().toLowerCase();
    const departmentId = form.departmentId.trim();
    if (!firstName || !lastName || !email || !departmentId) {
      setSubmitError('First name, last name, email, and department are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setSubmitError('Please enter a valid email address.');
      return;
    }
    // Resolve department name for the invite API (which stores text)
    const deptName = departments.find(d => d.id === departmentId)?.name ?? departmentId;
    setIsSubmitting(true);
    try {
      // Get the current session token and pass it explicitly so the API route
      // can verify the caller even if server-side cookie reading fails.
      const supabaseClient = createClient();
      const { data: { session } } = await supabaseClient.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setSubmitError('Your session has expired. Please sign in again.');
        setIsSubmitting(false);
        return;
      }
      const res = await fetch('/api/admin/instructors/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          firstName, lastName, email,
          department: deptName,
          title: form.title.trim() || undefined,
          specialization: form.specialization.trim() || undefined,
          qualification: form.qualification.trim() || undefined,
          bio: form.bio.trim() || undefined,
          officeHours: form.officeHours.trim() || undefined,
          employmentStatus: form.employmentStatus.trim() || undefined,
          profileStatus: form.profileStatus.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setSubmitError(data.error || `Request failed (${res.status}).`); return; }

      // Also set department_id properly
      if (data.userId || data.user_id) {
        const uid = data.userId ?? data.user_id;
        await fetch('/api/admin/instructors/assign-department', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instructorUserId: uid, departmentId }),
        });
      }

      toast.success(data.message || 'Instructor invited. They will receive an email to set their password.');
      setInviteOpen(false);
      setForm(initialForm);
      fetchInstructors();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Assign / reassign department
  const openAssign = (instr: Instructor) => {
    setAssignTarget(instr);
    setAssignDeptId(instr.departmentId ?? '');
  };

  const handleAssign = async () => {
    if (!assignTarget) return;
    if (!assignDeptId) { toast.error('Please select a department.'); return; }
    setAssigning(true);
    try {
      const res = await fetch('/api/admin/instructors/assign-department', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructorUserId: assignTarget.userId, departmentId: assignDeptId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Failed to assign department.'); return; }
      toast.success(`${assignTarget.fullName} assigned to ${departments.find(d => d.id === assignDeptId)?.name ?? 'department'}.`);
      setAssignTarget(null);
      fetchInstructors();
    } catch { toast.error('Something went wrong.'); }
    finally { setAssigning(false); }
  };

  // Delete instructor entirely
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const supabaseClient = createClient();
      const { data: { session } } = await supabaseClient.auth.getSession();
      const res = await fetch('/api/admin/instructors/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ instructorUserId: deleteTarget.userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Failed to delete instructor.'); return; }
      toast.success(`${deleteTarget.fullName} has been deleted.`);
      setDeleteTarget(null);
      fetchInstructors();
    } catch { toast.error('Something went wrong.'); }
    finally { setDeleting(false); }
  };

  // Remove from department
  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const res = await fetch('/api/admin/instructors/assign-department', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructorUserId: removeTarget.userId, departmentId: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Failed to remove from department.'); return; }
      toast.success(`${removeTarget.fullName} removed from department.`);
      setRemoveTarget(null);
      fetchInstructors();
    } catch { toast.error('Something went wrong.'); }
    finally { setRemoving(false); }
  };

  const filtered = instructors.filter(i =>
    i.fullName.toLowerCase().includes(search.toLowerCase()) ||
    i.email.toLowerCase().includes(search.toLowerCase()) ||
    i.departmentName.toLowerCase().includes(search.toLowerCase()) ||
    i.title.toLowerCase().includes(search.toLowerCase())
  );
  const totalCount = filtered.length;
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, totalCount);
  const paginated = filtered.slice(start, end);

  const closeX = (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md">
          <input type="search" placeholder="Search instructors..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button type="button" onClick={openInvite}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Instructor
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                {['Full Name', 'Email', 'Department', 'Title', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left text-sm font-semibold text-gray-700 px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500">Loading instructors...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500">
                  {search ? 'No instructors match your search.' : 'No instructors found.'}
                </td></tr>
              ) : paginated.map(instr => (
                <tr key={instr.userId} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">{instr.fullName}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{instr.email}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">
                    {instr.departmentName === 'Unassigned' ? (
                      <span className="text-amber-600 italic">Unassigned</span>
                    ) : instr.departmentName}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">{instr.title}</td>
                  <td className="px-5 py-3">
                    <span className={`text-sm font-medium ${
                      instr.status.toLowerCase() === 'active' ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {instr.status.charAt(0).toUpperCase() + instr.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button type="button" onClick={() => openAssign(instr)}
                        className="px-3 py-1 rounded text-xs font-medium bg-purple-50 text-purple-700 hover:bg-purple-100">
                        {instr.departmentName === 'Unassigned' ? 'Assign Dept' : 'Reassign'}
                      </button>
                      {instr.departmentName !== 'Unassigned' && (
                        <button type="button" onClick={() => setRemoveTarget(instr)}
                          className="px-3 py-1 rounded text-xs font-medium bg-orange-50 text-orange-700 hover:bg-orange-100">
                          Unassign
                        </button>
                      )}
                      <button type="button" onClick={() => setDeleteTarget(instr)}
                        className="px-3 py-1 rounded text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-5 py-3 border-t border-gray-200 bg-gray-50/50">
          <p className="text-sm text-gray-600">
            {totalCount === 0 ? 'No results' : `Showing ${start + 1}–${end} of ${totalCount}`}
          </p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button type="button" onClick={() => setPage(p => p + 1)} disabled={end >= totalCount}
              className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Invite Modal ── */}
      {inviteOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={() => { if (!isSubmitting) setInviteOpen(false); }} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200"
            role="dialog" aria-modal="true">
            <div className="flex items-center justify-between shrink-0 p-6 pb-0">
              <h2 className="text-lg font-bold text-gray-900">Add Instructor</h2>
              <button type="button" onClick={() => setInviteOpen(false)} disabled={isSubmitting}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50">{closeX}</button>
            </div>
            <form onSubmit={handleInviteSubmit} className="flex flex-col flex-1 min-h-0 p-6">
              <div className="space-y-4 overflow-y-auto pr-1 max-h-[60vh]">
                {submitError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{submitError}</div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                    <input type="text" required value={form.firstName}
                      onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                    <input type="text" required value={form.lastName}
                      onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" required value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
                  {deptLoading ? (
                    <div className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-400 text-sm">Loading departments…</div>
                  ) : departments.length === 0 ? (
                    <p className="text-sm text-amber-600">No active departments found. <a href="/admin/departments" className="underline font-medium" target="_blank" rel="noreferrer">Add departments first.</a></p>
                  ) : (
                    <select required value={form.departmentId}
                      onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                      <option value="">Select department…</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input type="text" placeholder="e.g. Professor, Lecturer" value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Specialization</label>
                  <input type="text" value={form.specialization}
                    onChange={e => setForm(f => ({ ...f, specialization: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Qualification</label>
                  <input type="text" placeholder="e.g. Ph.D. Computer Science" value={form.qualification}
                    onChange={e => setForm(f => ({ ...f, qualification: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employment Status</label>
                  <select value={form.employmentStatus}
                    onChange={e => setForm(f => ({ ...f, employmentStatus: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                    <option value="">Select...</option>
                    {EMPLOYMENT_OPTIONS.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Profile Status</label>
                  <select value={form.profileStatus}
                    onChange={e => setForm(f => ({ ...f, profileStatus: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                    {PROFILE_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 mt-4 shrink-0 border-t border-gray-100">
                <button type="button" onClick={() => setInviteOpen(false)} disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 min-w-[120px]">
                  {isSubmitting ? 'Adding...' : 'Add Instructor'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ── Assign / Reassign Modal ── */}
      {assignTarget && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={() => { if (!assigning) setAssignTarget(null); }} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6"
            role="dialog" aria-modal="true">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">
                {assignTarget.departmentName === 'Unassigned' ? 'Assign Department' : 'Reassign Department'}
              </h2>
              <button type="button" onClick={() => setAssignTarget(null)} disabled={assigning}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50">{closeX}</button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              <span className="font-medium">{assignTarget.fullName}</span>
              {assignTarget.departmentName !== 'Unassigned' && (
                <span className="text-gray-400"> · Currently in <span className="font-medium text-gray-700">{assignTarget.departmentName}</span></span>
              )}
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Department *</label>
              <select value={assignDeptId} onChange={e => setAssignDeptId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                <option value="">— Choose department —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setAssignTarget(null)} disabled={assigning}
                className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleAssign} disabled={assigning || !assignDeptId}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 min-w-[100px]">
                {assigning ? 'Saving...' : 'Assign'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Unassign from Department Confirm ── */}
      {removeTarget && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={() => { if (!removing) setRemoveTarget(null); }} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6"
            role="dialog" aria-modal="true">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Unassign from Department?</h2>
            <p className="text-sm text-gray-600 mb-6">
              Remove <span className="font-medium">{removeTarget.fullName}</span> from{' '}
              <span className="font-medium">{removeTarget.departmentName}</span>?
              They will remain in the system as an instructor without a department.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setRemoveTarget(null)} disabled={removing}
                className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleRemove} disabled={removing}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 disabled:opacity-50 min-w-[100px]">
                {removing ? 'Removing...' : 'Unassign'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Delete Instructor Confirm ── */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={() => { if (!deleting) setDeleteTarget(null); }} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6"
            role="dialog" aria-modal="true">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900">Delete Instructor?</h2>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              This will permanently delete <span className="font-semibold">{deleteTarget.fullName}</span> ({deleteTarget.email}).
            </p>
            <p className="text-sm text-red-600 font-medium mb-6">This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 min-w-[120px]">
                {deleting ? 'Deleting...' : 'Delete Instructor'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
