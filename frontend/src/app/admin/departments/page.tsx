'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import {
  assignDeptHead as assignDeptHeadApi,
  removeDeptHead as removeDeptHeadApi,
} from '@/services/departments.service';

type DeptHead = {
  userId: string;
  fullName: string;
  email: string;
  appointedAt: string | null;
};

type Department = {
  id: string;
  name: string;
  code: string;
  description: string;
  isActive: boolean;
  activeDeptHead: DeptHead | null;
  instructorCount: number;
};

type InstructorOption = {
  userId: string;
  fullName: string;
  staffNo: string;
  currentDeptId: string | null;
  currentDept: string | null;
  isDeptHead: boolean;
  deptHeadOf: string | null;
};

const PAGE_SIZE = 10;

function getInitials(name: string) {
  return name.split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm';

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [adminUserId, setAdminUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Modal state
  const [editTarget, setEditTarget] = useState<Department | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [selectedInstructorId, setSelectedInstructorId] = useState(''); // dept head
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Dept head dropdown
  const [instrSearch, setInstrSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Instructor member assignment
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [initialMemberIds, setInitialMemberIds] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState('');

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Instructor list modal
  const [instrListDept, setInstrListDept] = useState<Department | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data: appUser } = await supabase
        .from('users').select('id').eq('auth_user_id', authUser.id).single();
      if (appUser) setAdminUserId((appUser as any).id);
    }

    const { data: depts, error: deptErr } = await supabase
      .from('departments')
      .select('id, name, code, description, is_active')
      .order('name', { ascending: true });

    if (deptErr) { toast.error('Failed to load departments.'); setLoading(false); return; }

    const { data: dhProfiles } = await supabase
      .from('department_head_profiles')
      .select('department_id, user_id, profile_status, appointed_at')
      .eq('profile_status', 'active');

    const dhUserIds = (dhProfiles ?? []).map((p: any) => p.user_id);
    let dhUsersMap: Record<string, any> = {};
    if (dhUserIds.length > 0) {
      const { data: dhUsers } = await supabase
        .from('users').select('id, first_name, last_name, email').in('id', dhUserIds);
      for (const u of dhUsers ?? []) dhUsersMap[u.id] = u;
    }

    // Load all instructor_profiles for counts and dept assignments
    const { data: instrProfiles } = await supabase
      .from('instructor_profiles').select('user_id, department, department_id');

    const deptNameMap: Record<string, string> = {};
    for (const d of depts ?? []) deptNameMap[(d as any).id] = (d as any).name;

    // Count instructors per department (by UUID FK, then fallback to text name match)
    const instrCountByDeptId: Record<string, number> = {};
    for (const p of instrProfiles ?? []) {
      const dId = (p as any).department_id
        ?? Object.entries(deptNameMap).find(([, n]) => n.toLowerCase() === ((p as any).department ?? '').toLowerCase())?.[0]
        ?? null;
      if (dId) instrCountByDeptId[dId] = (instrCountByDeptId[dId] ?? 0) + 1;
    }

    const dhByDept: Record<string, DeptHead> = {};
    for (const p of dhProfiles ?? []) {
      const u = dhUsersMap[(p as any).user_id];
      if (u) {
        dhByDept[(p as any).department_id] = {
          userId: u.id,
          fullName: [u.first_name, u.last_name].filter(Boolean).join(' ') || '—',
          email: u.email ?? '',
          appointedAt: (p as any).appointed_at ?? null,
        };
      }
    }

    setDepartments((depts ?? []).map((d: any) => ({
      id: d.id,
      name: d.name ?? '—',
      code: d.code ?? '—',
      description: d.description ?? '',
      isActive: d.is_active ?? true,
      activeDeptHead: dhByDept[d.id] ?? null,
      instructorCount: instrCountByDeptId[d.id] ?? 0,
    })));

    // Load all instructor/dept_head users for dropdowns
    const { data: instrRows } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .in('role', ['instructor', 'department_head'])
      .order('first_name', { ascending: true });

    const instrProfileMap: Record<string, any> = {};
    for (const p of instrProfiles ?? []) instrProfileMap[(p as any).user_id] = p;

    const dhDeptNameByUserId: Record<string, string> = {};
    for (const [dId, dh] of Object.entries(dhByDept)) {
      dhDeptNameByUserId[dh.userId] = deptNameMap[dId] ?? dId;
    }

    setInstructors((instrRows ?? []).map((u: any) => {
      const profile = instrProfileMap[u.id];
      const dId = profile?.department_id ?? null;
      const dName = dId ? (deptNameMap[dId] ?? null) : (profile?.department ?? null);
      return {
        userId: u.id,
        fullName: [u.first_name, u.last_name].filter(Boolean).join(' ') || '—',
        staffNo: profile?.staff_no ?? '',
        currentDeptId: dId,
        currentDept: dName,
        isDeptHead: !!dhDeptNameByUserId[u.id],
        deptHeadOf: dhDeptNameByUserId[u.id] ?? null,
      };
    }));

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Close dept-head dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ESC to close modals
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (modalOpen && !submitting) closeModal();
      if (deleteTarget && !deleting) setDeleteTarget(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modalOpen, submitting, deleteTarget, deleting]);

  const buildMemberSet = useCallback((deptId: string | null) => {
    if (!deptId) return new Set<string>();
    const s = new Set<string>();
    for (const i of instructors) {
      if (i.currentDeptId === deptId) s.add(i.userId);
    }
    return s;
  }, [instructors]);

  const openCreate = () => {
    setEditTarget(null);
    setName(''); setCode(''); setDescription('');
    setSelectedInstructorId('');
    setSelectedMemberIds(new Set()); setInitialMemberIds(new Set());
    setModalError(''); setInstrSearch(''); setDropdownOpen(false); setMemberSearch('');
    setModalOpen(true);
  };

  const openEdit = (dept: Department) => {
    setEditTarget(dept);
    setName(dept.name); setCode(dept.code); setDescription(dept.description);
    setSelectedInstructorId(dept.activeDeptHead?.userId ?? '');
    const members = buildMemberSet(dept.id);
    setSelectedMemberIds(new Set(members)); setInitialMemberIds(new Set(members));
    setModalError(''); setInstrSearch(''); setDropdownOpen(false); setMemberSearch('');
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false); setDropdownOpen(false);
  };

  const selectedInstructor = instructors.find(i => i.userId === selectedInstructorId) ?? null;

  const blockedByOtherDept = selectedInstructor?.isDeptHead
    && selectedInstructor.deptHeadOf
    && selectedInstructor.deptHeadOf !== editTarget?.name
    && selectedInstructor.userId !== (editTarget?.activeDeptHead?.userId ?? '');

  const previousDeptHead = editTarget?.activeDeptHead ?? null;
  const changingDeptHead = selectedInstructorId !== (previousDeptHead?.userId ?? '');

  let promotionNotice: { type: 'purple' | 'amber' | 'red'; msg: string } | null = null;
  if (changingDeptHead) {
    if (blockedByOtherDept && selectedInstructor) {
      promotionNotice = { type: 'red', msg: `${selectedInstructor.fullName} is already department head of ${selectedInstructor.deptHeadOf}. Remove them from that department first.` };
    } else if (selectedInstructorId && previousDeptHead && previousDeptHead.userId !== selectedInstructorId) {
      promotionNotice = { type: 'amber', msg: `${previousDeptHead.fullName} will be removed as department head and their role will revert to Instructor.` };
    } else if (selectedInstructorId && !previousDeptHead && selectedInstructor) {
      promotionNotice = { type: 'purple', msg: `${selectedInstructor.fullName} will be promoted to Department Head.` };
    }
  }

  const toggleMember = (userId: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    const trimName = name.trim();
    const trimCode = code.trim().toUpperCase();
    if (!trimName) { setModalError('Department name is required.'); return; }
    if (!trimCode) { setModalError('Department code is required.'); return; }
    if (blockedByOtherDept) { setModalError(promotionNotice?.msg ?? 'Cannot assign this instructor.'); return; }

    setSubmitting(true);
    const supabase = createClient();
    try {
      let deptId = editTarget?.id;

      if (!editTarget) {
        const { data: newDept, error: insertErr } = await supabase
          .from('departments')
          .insert({ name: trimName, code: trimCode, description: description.trim() || null })
          .select('id').single();
        if (insertErr) {
          const msg = insertErr.message ?? '';
          if (msg.includes('uq_departments_name')) throw new Error('A department with this name already exists.');
          if (msg.includes('uq_departments_code')) throw new Error('A department with this code already exists.');
          throw new Error(msg || 'Failed to create department.');
        }
        deptId = (newDept as any).id;
      } else {
        const { error: updateErr } = await supabase
          .from('departments')
          .update({ name: trimName, code: trimCode, description: description.trim() || null })
          .eq('id', deptId!);
        if (updateErr) throw new Error(updateErr.message || 'Failed to update department.');
      }

      // Handle dept head assignment
      if (changingDeptHead) {
        if (selectedInstructorId) {
          await assignDeptHeadApi(selectedInstructorId, deptId!);
        } else {
          await removeDeptHeadApi(deptId!);
        }
      }

      // Handle instructor member assignments: assign added, unassign removed
      const added = [...selectedMemberIds].filter(id => !initialMemberIds.has(id));
      const removed = [...initialMemberIds].filter(id => !selectedMemberIds.has(id));

      if (added.length > 0 || removed.length > 0) {
        const results = await Promise.all([
          ...added.map(uid =>
            fetch('/api/admin/instructors/assign-department', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ instructorUserId: uid, departmentId: deptId }),
            }).then(r => r.json())
          ),
          ...removed.map(uid =>
            fetch('/api/admin/instructors/assign-department', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ instructorUserId: uid, departmentId: null }),
            }).then(r => r.json())
          ),
        ]);
        const failures = results.filter((r: any) => !r.success && r.error);
        if (failures.length > 0) {
          throw new Error(`Instructor assignment failed: ${(failures[0] as any).error}`);
        }
      }

      toast.success(editTarget ? `Department "${trimName}" updated.` : `Department "${trimName}" created.`);
      setModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('departments').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) { toast.error(error.message || 'Failed to delete department.'); }
    else { toast.success(`"${deleteTarget.name}" deleted.`); setDeleteTarget(null); fetchData(); }
  };

  const filtered = departments.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.code.toLowerCase().includes(search.toLowerCase()) ||
    (d.activeDeptHead?.fullName ?? '').toLowerCase().includes(search.toLowerCase())
  );
  const totalCount = filtered.length;
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, totalCount);
  const paginated = filtered.slice(start, end);

  const filteredHeadOptions = instructors.filter(i =>
    i.fullName.toLowerCase().includes(instrSearch.toLowerCase()) ||
    i.staffNo.toLowerCase().includes(instrSearch.toLowerCase()) ||
    (i.currentDept ?? '').toLowerCase().includes(instrSearch.toLowerCase())
  );

  // For member checklist: exclude the selected dept head from the list
  const memberCandidates = instructors.filter(i =>
    i.userId !== selectedInstructorId &&
    (i.fullName.toLowerCase().includes(memberSearch.toLowerCase()) ||
      (i.currentDept ?? '').toLowerCase().includes(memberSearch.toLowerCase()))
  );

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
          <input type="search" placeholder="Search departments..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button type="button" onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Department
        </button>
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={closeModal} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200"
            role="dialog" aria-modal="true">
            <div className="flex items-center justify-between shrink-0 p-6 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{editTarget ? 'Edit Department' : 'Add Department'}</h2>
              <button type="button" onClick={closeModal} disabled={submitting}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50">{closeX}</button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {modalError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{modalError}</div>
                )}

                {/* Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department Code *</label>
                  <input type="text" required value={code} maxLength={10} placeholder="e.g. CS"
                    onChange={e => setCode(e.target.value.toUpperCase())} className={inputCls} />
                </div>

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department Name *</label>
                  <input type="text" required value={name} maxLength={100} placeholder="e.g. Computer Science"
                    onChange={e => setName(e.target.value)} className={inputCls} />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea rows={2} value={description} placeholder="Brief description…"
                    onChange={e => setDescription(e.target.value)}
                    className={`${inputCls} resize-none`} />
                </div>

                {/* ── Department Head ── */}
                <div className="border-t border-gray-100 pt-4">
                  <label className="block text-sm font-semibold text-gray-800 mb-0.5">Department Head</label>
                  <p className="text-xs text-gray-500 mb-2">The selected instructor will be promoted to Department Head role.</p>
                  <div className="relative" ref={dropdownRef}>
                    <button type="button" onClick={() => setDropdownOpen(o => !o)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                      <span className={selectedInstructor ? 'text-gray-900' : 'text-gray-400'}>
                        {selectedInstructor ? selectedInstructor.fullName : '— No Department Head —'}
                      </span>
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {dropdownOpen && (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 flex flex-col">
                        <div className="p-2 border-b border-gray-100 shrink-0">
                          <input type="text" placeholder="Search instructors..."
                            value={instrSearch} onChange={e => setInstrSearch(e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" autoFocus />
                        </div>
                        <div className="overflow-y-auto">
                          <button type="button" onClick={() => { setSelectedInstructorId(''); setDropdownOpen(false); setInstrSearch(''); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left ${!selectedInstructorId ? 'bg-primary/5 text-primary font-medium' : 'text-gray-600'}`}>
                            — No Department Head —
                          </button>
                          {filteredHeadOptions.map(i => (
                            <button key={i.userId} type="button"
                              onClick={() => { setSelectedInstructorId(i.userId); setDropdownOpen(false); setInstrSearch(''); }}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left ${selectedInstructorId === i.userId ? 'bg-primary/5' : ''}`}>
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                                {getInitials(i.fullName)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{i.fullName}</p>
                                <p className="text-xs text-gray-400 truncate">{i.currentDept ?? 'No department'}</p>
                              </div>
                              {i.isDeptHead && i.deptHeadOf && (
                                <span className="text-xs text-amber-600 font-medium shrink-0">Head · {i.deptHeadOf}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {promotionNotice && (
                    <div className={`mt-2 text-sm rounded-lg px-3 py-2 ${
                      promotionNotice.type === 'red' ? 'bg-red-50 border border-red-200 text-red-700' :
                      promotionNotice.type === 'amber' ? 'bg-amber-50 border border-amber-200 text-amber-700' :
                      'bg-purple-50 border border-purple-200 text-purple-700'}`}>
                      {promotionNotice.msg}
                    </div>
                  )}
                </div>

                {/* ── Instructors ── */}
                <div className="border-t border-gray-100 pt-4">
                  <label className="block text-sm font-semibold text-gray-800 mb-0.5">
                    Instructors
                    {selectedMemberIds.size > 0 && (
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                        {selectedMemberIds.size} selected
                      </span>
                    )}
                  </label>
                  <p className="text-xs text-gray-500 mb-2">Check instructors to assign them to this department.</p>
                  <input type="text" placeholder="Search instructors…"
                    value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                    className={`${inputCls} mb-2`} />
                  <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
                    {memberCandidates.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-gray-400 text-center">No instructors found</p>
                    ) : memberCandidates.map(i => {
                      const checked = selectedMemberIds.has(i.userId);
                      const inOtherDept = i.currentDeptId && editTarget && i.currentDeptId !== editTarget.id;
                      return (
                        <label key={i.userId}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 ${checked ? 'bg-purple-50/50' : ''}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleMember(i.userId)}
                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30 shrink-0" />
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                            {getInitials(i.fullName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{i.fullName}</p>
                            <p className={`text-xs truncate ${inOtherDept ? 'text-amber-600' : 'text-gray-400'}`}>
                              {inOtherDept ? `Currently in ${i.currentDept}` : (i.currentDept ?? 'No department')}
                            </p>
                          </div>
                          {i.isDeptHead && <span className="text-xs text-purple-600 font-medium shrink-0">Dept Head</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 shrink-0 border-t border-gray-100">
                <button type="button" onClick={closeModal} disabled={submitting}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={submitting || !!blockedByOtherDept}
                  className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 min-w-[120px]">
                  {submitting ? 'Saving...' : editTarget ? 'Save Changes' : 'Add Department'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={() => { if (!deleting) setDeleteTarget(null); }} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6"
            role="dialog" aria-modal="true">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete "{deleteTarget.name}"?</h2>
            <p className="text-sm text-gray-600 mb-6">
              This action cannot be undone.
              {deleteTarget.instructorCount > 0 && (
                <span className="block mt-1 text-amber-600">⚠️ This department has {deleteTarget.instructorCount} instructor{deleteTarget.instructorCount !== 1 ? 's' : ''} assigned.</span>
              )}
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 min-w-[100px]">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="px-5 py-16 text-center text-sm text-gray-500">Loading departments...</div>
        ) : departments.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-gray-600 font-medium mb-1">No departments yet.</p>
            <p className="text-sm text-gray-400">Create the first department using the button above.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    {['Code', 'Department Name', 'Department Head', 'Instructors', 'Actions'].map(h => (
                      <th key={h} className="text-left text-sm font-semibold text-gray-700 px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-500">No departments match your search.</td></tr>
                  ) : paginated.map(dept => (
                    <tr key={dept.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="px-5 py-3 text-sm font-mono font-medium text-gray-700 uppercase">{dept.code}</td>
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium text-gray-900">{dept.name}</p>
                        {dept.description && <p className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">{dept.description}</p>}
                      </td>
                      <td className="px-5 py-3">
                        {dept.activeDeptHead ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                              {getInitials(dept.activeDeptHead.fullName)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{dept.activeDeptHead.fullName}</p>
                              <p className="text-xs text-gray-400">{dept.activeDeptHead.email}</p>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => openEdit(dept)}
                            className="text-sm text-primary hover:underline">+ Assign Dept Head</button>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => setInstrListDept(dept)}
                          className={`text-sm font-medium hover:underline ${dept.instructorCount > 0 ? 'text-primary' : 'text-gray-400 cursor-default'}`}
                          disabled={dept.instructorCount === 0}
                        >
                          {dept.instructorCount} instructor{dept.instructorCount !== 1 ? 's' : ''}
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Link href={`/admin/departments/${dept.id}`}
                            className="px-3 py-1 rounded text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20">View</Link>
                          <button type="button" onClick={() => openEdit(dept)}
                            className="px-3 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">Edit</button>
                          <button type="button" onClick={() => setDeleteTarget(dept)}
                            className="px-3 py-1 rounded text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          </>
        )}
      </div>

      {/* Instructor list modal */}
      {instrListDept && (() => {
        const deptInstructors = instructors.filter(i => i.currentDeptId === instrListDept.id);
        return (
          <>
            <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={() => setInstrListDept(null)} />
            <div
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-xl shadow-xl border border-gray-200"
              role="dialog" aria-modal="true"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <h2 className="text-base font-bold text-gray-900">
                    {instrListDept.name} — Instructors
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {deptInstructors.length} instructor{deptInstructors.length !== 1 ? 's' : ''} assigned
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setInstrListDept(null)}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                {deptInstructors.length === 0 ? (
                  <p className="px-6 py-8 text-sm text-center text-gray-400">No instructors assigned to this department.</p>
                ) : deptInstructors.map(i => (
                  <div key={i.userId} className="flex items-center gap-3 px-6 py-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                      {getInitials(i.fullName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{i.fullName}</p>
                      {i.staffNo && <p className="text-xs text-gray-400 font-mono">{i.staffNo}</p>}
                    </div>
                    {i.isDeptHead && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium shrink-0">
                        Dept Head
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => { setInstrListDept(null); openEdit(instrListDept); }}
                  className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20"
                >
                  Manage Instructors
                </button>
                <button
                  type="button"
                  onClick={() => setInstrListDept(null)}
                  className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
