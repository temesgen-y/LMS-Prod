'use client';

// NOTE: This page intentionally does NOT use InstructorCourseContext.
// It queries department_head_profiles directly to find the dept head's
// department, then loads instructors from instructor_profiles.

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Department {
  id: string;
  name: string;
  code: string;
}

interface CourseRow {
  code: string;
  title: string;
  termName: string;
}

interface LeaveBalance {
  total: number;
  used: number;
  remaining: number;
}

interface InstructorRow {
  userId: string;
  fullName: string;
  email: string;
  staffNo: string;
  role: string;
  coursesThisTerm: CourseRow[];
  annualLeave: LeaveBalance | null;
  onLeaveToday: boolean;
  leaveInfo: string | null;
  // for detail modal
  allCourses: CourseRow[];
  leaveBalances: { leave_type: string; total_days: number; used_days: number; remaining_days: number }[];
  leaveHistory: { leave_type: string; start_date: string; end_date: string; total_days: number; status: string }[];
}

function getInitials(name: string) {
  return name.split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function DeptHeadInstructorsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [department, setDepartment] = useState<Department | null>(null);
  const [instructors, setInstructors] = useState<InstructorRow[]>([]);
  const [search, setSearch] = useState('');
  const [modalInstr, setModalInstr] = useState<InstructorRow | null>(null);
  const [modalTab, setModalTab] = useState<'overview' | 'courses' | 'leave'>('overview');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();

      // ── Step 1: current user (always use users.id, not auth uid) ──────────
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setError('Not authenticated.'); return; }

      const { data: me, error: meErr } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', authUser.id)
        .single();
      if (meErr || !me) { setError('User record not found.'); return; }
      const myUserId = (me as any).id as string;

      // ── Step 2: get MY department directly from department_head_profiles ──
      // Never use InstructorCourseContext here — that carries course data.
      const { data: dhProfile, error: dhErr } = await supabase
        .from('department_head_profiles')
        .select('department_id')
        .eq('user_id', myUserId)
        .eq('profile_status', 'active')
        .maybeSingle();

      // Fallback: departments.head_id (handles stale profiles where department_id is null)
      let myDeptId: string | null = (dhProfile as any)?.department_id ?? null;

      if (!myDeptId) {
        const { data: deptByHead } = await supabase
          .from('departments')
          .select('id')
          .eq('head_id', myUserId)
          .maybeSingle();
        myDeptId = (deptByHead as any)?.id ?? null;
      }

      if (!myDeptId) {
        setError('No department assigned to your account. Ask your administrator to assign you as department head of a department.');
        return;
      }

      // ── Step 3: load department info ────────────────────────────────────
      const { data: dept } = await supabase
        .from('departments')
        .select('id, name, code')
        .eq('id', myDeptId)
        .single();
      if (!dept) { setError('Department not found.'); return; }
      const myDept = dept as Department;
      setDepartment(myDept);

      // ── Step 4: load ALL instructor_profiles, filter client-side ─────────
      // This matches the admin Departments page counting algorithm exactly.
      // Note: instructor_profiles requires the grant in migration
      // 20260401000006_instructor_profiles_grants.sql — run that in Supabase first.
      const { data: allProfiles, error: profErr } = await supabase
        .from('instructor_profiles')
        .select('user_id, instructor_no, department, department_id');

      if (profErr) {
        setError(`Could not load instructor profiles: ${profErr.message}. Make sure migration 20260401000006_instructor_profiles_grants.sql has been applied in Supabase.`);
        return;
      }

      const deptNameLc = myDept.name.toLowerCase().trim();
      const deptCodeLc = myDept.code.toLowerCase().trim();
      const deptIdLc   = myDeptId.toLowerCase();

      const matchedProfiles = (allProfiles ?? []).filter((p: any) => {
        const pDeptId: string  = (p.department_id ?? '').toLowerCase();
        const pDeptTxt: string = (p.department    ?? '').toLowerCase().trim();
        return (
          pDeptId  === deptIdLc   ||   // department_id UUID FK
          pDeptTxt === deptIdLc   ||   // department text stored as UUID
          pDeptTxt === deptNameLc ||   // department text = dept name
          pDeptTxt === deptCodeLc      // department text = dept code
        );
      });

      if (matchedProfiles.length === 0) {
        setInstructors([]);
        return;
      }

      const instrUserIds = matchedProfiles.map((p: any) => p.user_id as string);
      const staffNoMap: Record<string, string> = {};
      for (const p of matchedProfiles) staffNoMap[(p as any).user_id] = (p as any).instructor_no ?? '—';

      // ── Step 5: load user rows for those instructor IDs ──────────────────
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, role')
        .in('id', instrUserIds);

      // ── Step 6: current academic term ────────────────────────────────────
      const { data: term } = await supabase
        .from('academic_terms')
        .select('id, term_name')
        .eq('is_current', true)
        .maybeSingle();
      const termId = (term as any)?.id ?? null;

      // ── Step 7: courses this term per instructor ──────────────────────────
      const coursesByInstr: Record<string, CourseRow[]> = {};
      if (termId && instrUserIds.length > 0) {
        const { data: ciRows } = await supabase
          .from('course_instructors')
          .select('instructor_id, offering_id')
          .in('instructor_id', instrUserIds);

        const offeringIds = [...new Set((ciRows ?? []).map((r: any) => r.offering_id))];
        if (offeringIds.length > 0) {
          const { data: offerings } = await supabase
            .from('course_offerings')
            .select('id, term_id, courses(code, title), academic_terms(term_name)')
            .in('id', offeringIds)
            .eq('term_id', termId);

          const offerMap: Record<string, any> = {};
          for (const o of offerings ?? []) offerMap[(o as any).id] = o;

          for (const ci of ciRows ?? []) {
            const o = offerMap[(ci as any).offering_id];
            if (!o) continue;
            const row: CourseRow = {
              code: (o.courses as any)?.code ?? '—',
              title: (o.courses as any)?.title ?? '—',
              termName: (o.academic_terms as any)?.term_name ?? '—',
            };
            if (!coursesByInstr[(ci as any).instructor_id]) coursesByInstr[(ci as any).instructor_id] = [];
            coursesByInstr[(ci as any).instructor_id].push(row);
          }
        }
      }

      // ── Step 8: annual leave balances ─────────────────────────────────────
      const now = new Date();
      const yr  = now.getFullYear();
      const mo  = now.getMonth() + 1;
      const acadYear = mo >= 9 ? `${yr}-${yr + 1}` : `${yr - 1}-${yr}`;

      const { data: balances } = await supabase
        .from('leave_balances')
        .select('user_id, total_days, used_days, remaining_days')
        .in('user_id', instrUserIds)
        .eq('leave_type', 'annual')
        .eq('academic_year', acadYear);

      const balanceMap: Record<string, LeaveBalance> = {};
      for (const b of balances ?? []) {
        balanceMap[(b as any).user_id] = {
          total: (b as any).total_days,
          used:  (b as any).used_days,
          remaining: (b as any).remaining_days,
        };
      }

      // ── Step 9: who is on leave today ─────────────────────────────────────
      const today = new Date().toISOString().split('T')[0];
      const { data: onLeaveRows } = await supabase
        .from('leave_requests')
        .select('requester_id, leave_type, end_date')
        .in('requester_id', instrUserIds)
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today);

      const onLeaveMap: Record<string, { type: string; endDate: string }> = {};
      for (const l of onLeaveRows ?? []) {
        onLeaveMap[(l as any).requester_id] = { type: (l as any).leave_type, endDate: (l as any).end_date };
      }

      // ── Step 10: assemble ─────────────────────────────────────────────────
      const result: InstructorRow[] = ((users ?? []) as any[]).map(u => {
        const leaveEntry = onLeaveMap[u.id];
        const leaveInfo = leaveEntry
          ? leaveEntry.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) +
            ' leave until ' +
            new Date(leaveEntry.endDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : null;

        return {
          userId: u.id,
          fullName: [u.first_name, u.last_name].filter(Boolean).join(' ') || '—',
          email: u.email ?? '',
          staffNo: staffNoMap[u.id] ?? '—',
          role: u.role ?? '',
          coursesThisTerm: coursesByInstr[u.id] ?? [],
          annualLeave: balanceMap[u.id] ?? null,
          onLeaveToday: !!leaveEntry,
          leaveInfo,
          allCourses: [],
          leaveBalances: [],
          leaveHistory: [],
        };
      });

      result.sort((a, b) => a.fullName.localeCompare(b.fullName));
      setInstructors(result);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load instructors.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openModal = async (instr: InstructorRow) => {
    setModalInstr({ ...instr, allCourses: [], leaveBalances: [], leaveHistory: [] });
    setModalTab('overview');

    try {
      const supabase = createClient();
      const currentYear = new Date().getFullYear();
      const acadYear = `${currentYear}-${currentYear + 1}`;

      const [coursesRes, balancesRes, historyRes] = await Promise.all([
        supabase.from('course_instructors').select('offering_id').eq('instructor_id', instr.userId),
        supabase.from('leave_balances').select('leave_type, total_days, used_days, remaining_days').eq('user_id', instr.userId).eq('academic_year', acadYear),
        supabase.from('leave_requests').select('leave_type, start_date, end_date, total_days, status').eq('requester_id', instr.userId).order('created_at', { ascending: false }).limit(20),
      ]);

      const offeringIds = (coursesRes.data ?? []).map((r: any) => r.offering_id);
      let allCourses: CourseRow[] = [];
      if (offeringIds.length > 0) {
        const { data: offerings } = await supabase
          .from('course_offerings')
          .select('courses(code, title), academic_terms(term_name)')
          .in('id', offeringIds);
        allCourses = ((offerings ?? []) as any[]).map(o => ({
          code: o.courses?.code ?? '—',
          title: o.courses?.title ?? '—',
          termName: o.academic_terms?.term_name ?? '—',
        }));
      }

      setModalInstr(prev => prev ? {
        ...prev,
        allCourses,
        leaveBalances: (balancesRes.data ?? []) as any[],
        leaveHistory: (historyRes.data ?? []) as any[],
      } : null);
    } catch { /* keep modal open, details just won't load */ }
  };

  const filtered = instructors.filter(i => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return i.fullName.toLowerCase().includes(q) ||
      i.email.toLowerCase().includes(q) ||
      i.staffNo.toLowerCase().includes(q);
  });

  const teachingCount = instructors.filter(i => i.coursesThisTerm.length > 0).length;
  const onLeaveCount  = instructors.filter(i => i.onLeaveToday).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-6">
        <svg className="w-14 h-14 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <h3 className="text-base font-semibold text-gray-700 mb-1">Department Not Configured</h3>
        <p className="text-sm text-gray-400 max-w-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          {department ? `Department of ${department.name}` : 'Department Instructors'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {department?.code && <span className="font-mono mr-2">{department.code}</span>}
          {instructors.length} instructor{instructors.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Instructors',   value: instructors.length, color: 'bg-purple-50 text-purple-700' },
          { label: 'Teaching This Term',  value: teachingCount,      color: 'bg-blue-50 text-blue-700' },
          { label: 'On Leave Today',      value: onLeaveCount,       color: 'bg-amber-50 text-amber-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-4 border border-current/10 ${s.color.split(' ')[0]}`}>
            <p className={`text-2xl font-bold ${s.color.split(' ')[1]}`}>{s.value}</p>
            <p className="text-sm text-gray-600 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <input
          type="search" placeholder="Search instructors..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Instructor</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Instructor No</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Courses This Term</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="font-medium text-gray-500">
                        {instructors.length === 0
                          ? 'No instructors assigned to your department yet.'
                          : 'No instructors match your search.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(instr => (
                <tr key={instr.userId} className={`hover:bg-gray-50 transition-colors ${instr.onLeaveToday ? 'bg-amber-50/40' : ''}`}>
                  {/* Instructor name + avatar */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-700 shrink-0">
                        {getInitials(instr.fullName)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 whitespace-nowrap">{instr.fullName}</p>
                        {instr.role === 'department_head' && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">Dept Head</span>
                        )}
                      </div>
                    </div>
                  </td>
                  {/* Instructor No */}
                  <td className="px-4 py-3 font-mono text-gray-500 whitespace-nowrap">{instr.staffNo}</td>
                  {/* Email */}
                  <td className="px-4 py-3 text-gray-600 max-w-[220px] truncate">{instr.email}</td>
                  {/* Courses this term */}
                  <td className="px-4 py-3">
                    {instr.coursesThisTerm.length === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <div>
                        <span className="font-semibold text-gray-900">{instr.coursesThisTerm.length}</span>
                        <span className="text-gray-400 text-xs ml-1.5 truncate">
                          {instr.coursesThisTerm.map(c => c.code).join(', ')}
                        </span>
                      </div>
                    )}
                  </td>
                  {/* Action */}
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => openModal(instr)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 font-medium transition-colors whitespace-nowrap">
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {modalInstr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-700">
                  {getInitials(modalInstr.fullName)}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{modalInstr.fullName}</p>
                  <p className="text-xs text-gray-400">{modalInstr.email}</p>
                </div>
              </div>
              <button type="button" onClick={() => setModalInstr(null)} className="p-2 rounded-lg hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex border-b border-gray-100 px-6 shrink-0">
              {(['overview', 'courses', 'leave'] as const).map(tab => (
                <button key={tab} type="button" onClick={() => setModalTab(tab)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${
                    modalTab === tab ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {modalTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Staff No',            value: modalInstr.staffNo },
                      { label: 'Courses This Term',   value: String(modalInstr.coursesThisTerm.length) },
                      { label: 'Leave Status Today',  value: modalInstr.onLeaveToday ? 'On Leave' : 'Available' },
                    ].map(item => (
                      <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">{item.label}</p>
                        <p className="font-medium text-gray-900 mt-0.5">{item.value}</p>
                      </div>
                    ))}
                  </div>
                  {modalInstr.annualLeave && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-2">Annual Leave Balance</p>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-sm text-gray-700">{modalInstr.annualLeave.remaining} days remaining</span>
                        <span className="text-xs text-gray-400">of {modalInstr.annualLeave.total} total</span>
                      </div>
                      <div className="bg-gray-200 rounded-full h-2">
                        <div className="bg-purple-500 h-2 rounded-full"
                          style={{ width: `${modalInstr.annualLeave.total > 0 ? (modalInstr.annualLeave.remaining / modalInstr.annualLeave.total) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {modalTab === 'courses' && (
                <div>
                  <p className="text-sm text-gray-500 mb-3">All course assignments across all terms</p>
                  {modalInstr.allCourses.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No courses assigned</p>
                  ) : modalInstr.allCourses.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-4 py-3 mb-2">
                      <div>
                        <span className="font-medium text-gray-900">{c.code}</span>
                        <span className="text-gray-500 ml-2">{c.title}</span>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0 ml-2">{c.termName}</span>
                    </div>
                  ))}
                </div>
              )}

              {modalTab === 'leave' && (
                <div className="space-y-6">
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-3">Leave Balances (Current Year)</p>
                    {modalInstr.leaveBalances.length === 0 ? (
                      <p className="text-sm text-gray-400">No leave balances recorded</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {modalInstr.leaveBalances.map((b, i) => (
                          <div key={i} className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs font-semibold text-gray-500 capitalize">{b.leave_type.replace(/_/g, ' ')}</p>
                            <p className="text-sm font-medium text-gray-700 mt-1">{b.remaining_days} / {b.total_days} days</p>
                            <div className="mt-1.5 bg-gray-200 rounded-full h-1.5">
                              <div className="bg-purple-500 h-1.5 rounded-full"
                                style={{ width: `${b.total_days > 0 ? (b.remaining_days / b.total_days) * 100 : 0}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-3">Leave History</p>
                    {modalInstr.leaveHistory.length === 0 ? (
                      <p className="text-sm text-gray-400">No leave requests found</p>
                    ) : modalInstr.leaveHistory.map((l, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-4 py-2.5 mb-2">
                        <div>
                          <span className="font-medium text-gray-900 capitalize">{l.leave_type.replace(/_/g, ' ')}</span>
                          <span className="text-gray-400 text-xs ml-2">
                            {new Date(l.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
                            {new Date(l.end_date   + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-gray-500 text-xs">{l.total_days}d</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                            l.status === 'approved' ? 'bg-green-100 text-green-800' :
                            l.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                          }`}>{l.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
