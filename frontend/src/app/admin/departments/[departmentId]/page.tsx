'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

interface DeptInfo { id: string; name: string; code: string; description: string; }
interface DeptHead { userId: string; fullName: string; email: string; appointedAt: string | null; }
interface CourseItem { offeringId: string; code: string; title: string; section: string; enrolled: number; }
interface InstructorRow {
  userId: string; profileId: string; fullName: string; email: string; staffNo: string;
  courses: CourseItem[];
}

function initials(name: string) {
  return name.split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

/* ─── AssignInstructorModal (inline) ─── */
function AssignInstructorModal({
  departmentId, departmentName, alreadyAssigned, onClose, onSuccess,
}: {
  departmentId: string; departmentName: string; alreadyAssigned: string[];
  onClose: () => void; onSuccess: () => void;
}) {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState<{ userId: string; fullName: string; email: string; currentDept: string | null }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: users } = await supabase
        .from('users').select('id, first_name, last_name, email')
        .in('role', ['instructor', 'department_head']).order('last_name');
      const { data: profiles } = await supabase
        .from('instructor_profiles').select('user_id, department');
      const { data: depts } = await supabase.from('departments').select('id, name');

      const deptMap: Record<string, string> = {};
      for (const d of depts ?? []) deptMap[d.id] = d.name;
      const profMap: Record<string, string | null> = {};
      for (const p of profiles ?? []) profMap[(p as any).user_id] = (p as any).department ?? null;

      setAvailable(((users ?? []) as any[])
        .filter(u => !alreadyAssigned.includes(u.id))
        .map(u => ({
          userId: u.id,
          fullName: [u.first_name, u.last_name].filter(Boolean).join(' ') || '—',
          email: u.email ?? '',
          currentDept: profMap[u.id] ? (deptMap[profMap[u.id]!] ?? null) : null,
        })));
      setLoading(false);
    };
    load();
  }, [alreadyAssigned]);

  const filtered = available.filter(i =>
    i.fullName.toLowerCase().includes(search.toLowerCase()) ||
    i.email.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const handleAssign = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    const supabase = createClient();
    const ids = Array.from(selected);
    const { data: existingProfiles } = await supabase
      .from('instructor_profiles').select('user_id').in('user_id', ids);
    const existingIds = new Set((existingProfiles ?? []).map((p: any) => p.user_id));

    let failed = 0;
    for (const uid of ids) {
      const op = existingIds.has(uid)
        ? supabase.from('instructor_profiles').update({ department: departmentId }).eq('user_id', uid)
        : supabase.from('instructor_profiles').insert({ user_id: uid, department: departmentId });
      const { error } = await op;
      if (error) failed++;
    }

    setSaving(false);
    if (failed > 0) toast.error(`${failed} assignment(s) failed.`);
    else toast.success(`${ids.length} instructor(s) assigned to ${departmentName}.`);
    onSuccess();
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg max-h-[85vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200" role="dialog">
        <div className="flex items-center justify-between shrink-0 px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Assign Instructors to {departmentName}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-4 py-3 shrink-0">
          <input type="search" placeholder="Search instructors..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {loading ? (
            <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">
              {available.length === 0 ? 'All instructors are already assigned to this department.' : 'No instructors match your search.'}
            </p>
          ) : filtered.map(i => (
            <label key={i.userId} className={`flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer hover:bg-gray-50 ${selected.has(i.userId) ? 'bg-primary/5' : ''}`}>
              <input type="checkbox" checked={selected.has(i.userId)} onChange={() => toggle(i.userId)} className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary" />
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">{initials(i.fullName)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{i.fullName}</p>
                <p className="text-xs text-gray-400 truncate">{i.email}</p>
              </div>
              {i.currentDept ? (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">{i.currentDept}</span>
              ) : (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full shrink-0">Unassigned</span>
              )}
            </label>
          ))}
        </div>
        <div className="shrink-0 px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={handleAssign} disabled={saving || selected.size === 0}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 min-w-[160px]">
            {saving ? 'Assigning...' : `Assign Selected (${selected.size})`}
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Main Page ─── */
export default function DepartmentDetailPage() {
  const params = useParams();
  const departmentId = params.departmentId as string;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [dept, setDept] = useState<DeptInfo | null>(null);
  const [deptHead, setDeptHead] = useState<DeptHead | null>(null);
  const [instructors, setInstructors] = useState<InstructorRow[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'courses' | 'nocourses'>('all');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<InstructorRow | null>(null);
  const [removing, setRemoving] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const [deptRes, dhRes, instrRes, termRes] = await Promise.all([
      supabase.from('departments').select('id, name, code, description').eq('id', departmentId).single(),
      supabase.from('department_head_profiles').select('user_id, appointed_at').eq('department_id', departmentId).eq('profile_status', 'active').maybeSingle(),
      supabase.from('instructor_profiles').select('id, user_id, staff_no').eq('department', departmentId),
      supabase.from('academic_terms').select('id').eq('is_current', true).maybeSingle(),
    ]);

    if (deptRes.error || !deptRes.data) { setLoading(false); return; }
    setDept(deptRes.data as DeptInfo);

    // Load dept head user info
    if (dhRes.data) {
      const { data: dhUser } = await supabase.from('users')
        .select('id, first_name, last_name, email').eq('id', (dhRes.data as any).user_id).single();
      if (dhUser) {
        setDeptHead({
          userId: (dhUser as any).id,
          fullName: [(dhUser as any).first_name, (dhUser as any).last_name].filter(Boolean).join(' '),
          email: (dhUser as any).email ?? '',
          appointedAt: (dhRes.data as any).appointed_at ?? null,
        });
      }
    } else {
      setDeptHead(null);
    }

    const profiles = (instrRes.data ?? []) as any[];
    if (profiles.length === 0) { setInstructors([]); setLoading(false); return; }

    const userIds = profiles.map(p => p.user_id);
    const [usersRes, ciRes] = await Promise.all([
      supabase.from('users').select('id, first_name, last_name, email').in('id', userIds),
      termRes.data
        ? supabase.from('course_instructors').select('instructor_id, offering_id').in('instructor_id', userIds)
        : Promise.resolve({ data: [] }),
    ]);

    const usersMap: Record<string, any> = {};
    for (const u of (usersRes.data ?? [])) usersMap[(u as any).id] = u;

    const offeringIds = [...new Set(((ciRes as any).data ?? []).map((c: any) => c.offering_id))];
    let offeringsMap: Record<string, any> = {};
    if (offeringIds.length > 0) {
      const { data: offerings } = await supabase
        .from('course_offerings')
        .select('id, section_name, enrolled_count, course_id')
        .in('id', offeringIds)
        .eq(termRes.data ? 'term_id' : 'id', termRes.data ? termRes.data.id : '___none___');
      const courseIds = [...new Set((offerings ?? []).map((o: any) => o.course_id))];
      let coursesMap: Record<string, any> = {};
      if (courseIds.length > 0) {
        const { data: courses } = await supabase.from('courses').select('id, code, title').in('id', courseIds);
        for (const c of courses ?? []) coursesMap[(c as any).id] = c;
      }
      for (const o of offerings ?? []) {
        const course = coursesMap[(o as any).course_id] ?? {};
        offeringsMap[(o as any).id] = { ...o, code: course.code ?? '—', title: course.title ?? '—' };
      }
    }

    const ciByInstructor: Record<string, CourseItem[]> = {};
    for (const ci of ((ciRes as any).data ?? []) as any[]) {
      if (!ciByInstructor[ci.instructor_id]) ciByInstructor[ci.instructor_id] = [];
      const off = offeringsMap[ci.offering_id];
      if (off) ciByInstructor[ci.instructor_id].push({
        offeringId: off.id, code: off.code, title: off.title,
        section: off.section_name ?? '', enrolled: off.enrolled_count ?? 0,
      });
    }

    setInstructors(profiles.map(p => {
      const u = usersMap[p.user_id] ?? {};
      return {
        userId: p.user_id, profileId: p.id,
        fullName: [u.first_name, u.last_name].filter(Boolean).join(' ') || '—',
        email: u.email ?? '',
        staffNo: p.staff_no ?? '',
        courses: ciByInstructor[p.user_id] ?? [],
      };
    }));
    setLoading(false);
  }, [departmentId]);

  useEffect(() => { load(); }, [load]);

  // Close menu on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleRemove = async () => {
    if (!removeTarget) return;
    if (deptHead && deptHead.userId === removeTarget.userId) {
      toast.error(`Cannot remove ${removeTarget.fullName} — they are the current Department Head. Change the Department Head first.`);
      setRemoveTarget(null);
      return;
    }
    setRemoving(true);
    const supabase = createClient();
    const { error } = await supabase.from('instructor_profiles').update({ department: null }).eq('user_id', removeTarget.userId);
    setRemoving(false);
    if (error) toast.error(error.message);
    else { toast.success(`${removeTarget.fullName} removed from ${dept?.name}.`); setRemoveTarget(null); load(); }
  };

  const filtered = instructors
    .filter(i => i.fullName.toLowerCase().includes(search.toLowerCase()) || i.staffNo.toLowerCase().includes(search.toLowerCase()))
    .filter(i => filter === 'all' ? true : filter === 'courses' ? i.courses.length > 0 : i.courses.length === 0);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  if (!dept) return (
    <div className="p-6 text-center text-gray-500">Department not found.</div>
  );

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin/dashboard" className="hover:text-gray-700">Admin</Link>
        <span>/</span>
        <Link href="/admin/departments" className="hover:text-gray-700">Departments</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{dept.name}</span>
      </nav>

      {/* Department header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-lg font-bold">
            {dept.code.slice(0, 3)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{dept.name}</h1>
            {dept.description && <p className="text-sm text-gray-500 mt-1">{dept.description}</p>}
          </div>
        </div>
        <button type="button" onClick={() => router.push('/admin/departments')}
          className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 shrink-0">
          ← Back
        </button>
      </div>

      {/* Department Head card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Department Head</h2>
        {deptHead ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
                {initials(deptHead.fullName)}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{deptHead.fullName}</p>
                <p className="text-sm text-gray-500">{deptHead.email}</p>
                {deptHead.appointedAt && (
                  <p className="text-xs text-gray-400">Appointed: {new Date(deptHead.appointedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                )}
              </div>
            </div>
            <Link href="/admin/departments"
              className="text-sm text-primary hover:underline shrink-0">Change Head</Link>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">No department head assigned yet.</p>
            <Link href="/admin/departments" className="text-sm text-primary hover:underline">Assign Head</Link>
          </div>
        )}
      </div>

      {/* Instructors section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Instructors ({instructors.length})</h2>
          <button type="button" onClick={() => setAssignModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Assign Instructor
          </button>
        </div>

        {instructors.length > 0 && (
          <div className="px-6 py-3 flex flex-col sm:flex-row gap-3 border-b border-gray-100">
            <div className="relative flex-1 max-w-sm">
              <input type="search" placeholder="Search by name or staff no..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <div className="flex gap-1">
              {(['all', 'courses', 'nocourses'] as const).map(f => (
                <button key={f} type="button" onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {f === 'all' ? 'All' : f === 'courses' ? 'With Courses' : 'No Courses'}
                </button>
              ))}
            </div>
          </div>
        )}

        {instructors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <p className="font-medium text-gray-500">No instructors in this department yet.</p>
            <p className="text-sm mt-1">Assign instructors using the button above.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">No instructors match your search.</div>
        ) : (
          <div className="divide-y divide-gray-100" ref={menuRef}>
            {filtered.map(instr => (
              <div key={instr.userId} className="px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                      {initials(instr.fullName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{instr.fullName}</p>
                        {deptHead?.userId === instr.userId && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Dept Head</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{instr.email}</p>
                      {instr.staffNo && <p className="text-xs text-gray-400">Staff No: {instr.staffNo}</p>}
                      {instr.courses.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {instr.courses.map(c => (
                            <div key={c.offeringId} className="flex items-center gap-2 text-sm">
                              <span className="text-xs font-mono bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{c.code}</span>
                              <span className="text-gray-700">{c.title}</span>
                              {c.section && <span className="text-gray-400">· {c.section}</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 mt-1">No courses assigned this term.</p>
                      )}
                    </div>
                  </div>
                  {/* Actions menu */}
                  <div className="relative shrink-0">
                    <button type="button" onClick={() => setOpenMenu(openMenu === instr.userId ? null : instr.userId)}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 6a2 2 0 110-4 2 2 0 010 4zm0 8a2 2 0 110-4 2 2 0 010 4zm0 8a2 2 0 110-4 2 2 0 010 4z" /></svg>
                    </button>
                    {openMenu === instr.userId && (
                      <div className="absolute right-0 top-full mt-1 z-10 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                        <div className="border-t border-gray-100 mt-1 pt-1">
                          <button type="button" onClick={() => { setRemoveTarget(instr); setOpenMenu(null); }}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                            Remove from Department
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign modal */}
      {assignModalOpen && (
        <AssignInstructorModal
          departmentId={departmentId}
          departmentName={dept.name}
          alreadyAssigned={instructors.map(i => i.userId)}
          onClose={() => setAssignModalOpen(false)}
          onSuccess={load}
        />
      )}

      {/* Remove confirm */}
      {removeTarget && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={() => { if (!removing) setRemoveTarget(null); }} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6" role="dialog">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Remove {removeTarget.fullName}?</h2>
            <p className="text-sm text-gray-600 mb-6">
              They will not be assigned to any department until reassigned.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setRemoveTarget(null)} disabled={removing}
                className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={handleRemove} disabled={removing}
                className="px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 min-w-[80px]">
                {removing ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
