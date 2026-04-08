'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

interface UnassignedInstructor {
  userId: string;
  fullName: string;
  email: string;
  staffNo: string;
  joinedAt: string;
}

interface Department { id: string; name: string; }

export default function UnassignedInstructorsPage() {
  const [loading, setLoading] = useState(true);
  const [instructors, setInstructors] = useState<UnassignedInstructor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedDepts, setSelectedDepts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const [usersRes, profilesRes, deptsRes] = await Promise.all([
      supabase.from('users').select('id, first_name, last_name, email, created_at').in('role', ['instructor', 'department_head']).order('last_name'),
      supabase.from('instructor_profiles').select('user_id, staff_no, department'),
      supabase.from('departments').select('id, name').order('name'),
    ]);

    const profileMap: Record<string, any> = {};
    for (const p of profilesRes.data ?? []) profileMap[(p as any).user_id] = p;

    const unassigned = ((usersRes.data ?? []) as any[]).filter(u => {
      const profile = profileMap[u.id];
      return !profile || !profile.department;
    });

    setInstructors(unassigned.map(u => ({
      userId: u.id,
      fullName: [u.first_name, u.last_name].filter(Boolean).join(' ') || '—',
      email: u.email ?? '',
      staffNo: profileMap[u.id]?.staff_no ?? '—',
      joinedAt: u.created_at,
    })));
    setDepartments((deptsRes.data ?? []) as Department[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAssign = async (userId: string) => {
    const deptId = selectedDepts[userId];
    if (!deptId) { toast.error('Please select a department first.'); return; }
    setAssigningId(userId);
    const supabase = createClient();

    const { data: existing } = await supabase
      .from('instructor_profiles').select('id').eq('user_id', userId).maybeSingle();

    const op = existing
      ? supabase.from('instructor_profiles').update({ department: deptId }).eq('user_id', userId)
      : supabase.from('instructor_profiles').insert({ user_id: userId, department: deptId });

    const { error } = await op;
    setAssigningId(null);
    if (error) toast.error(error.message);
    else {
      const dept = departments.find(d => d.id === deptId);
      toast.success(`Assigned to ${dept?.name ?? 'department'}.`);
      load();
    }
  };

  const filtered = instructors.filter(i =>
    i.fullName.toLowerCase().includes(search.toLowerCase()) ||
    i.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Unassigned Instructors</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? '...' : `${instructors.length} instructor${instructors.length !== 1 ? 's' : ''} not assigned to any department`}
          </p>
        </div>
        <div className="relative max-w-xs">
          <input type="search" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="px-5 py-16 text-center text-sm text-gray-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="font-medium text-gray-500">{instructors.length === 0 ? 'All instructors are assigned to departments.' : 'No instructors match your search.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  {['Name', 'Email', 'Staff No', 'Joined', 'Assign to Department'].map(h => (
                    <th key={h} className="text-left text-sm font-semibold text-gray-700 px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(i => (
                  <tr key={i.userId} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-medium text-gray-900">{i.fullName}</td>
                    <td className="px-5 py-3 text-gray-600">{i.email}</td>
                    <td className="px-5 py-3 text-gray-500 font-mono">{i.staffNo}</td>
                    <td className="px-5 py-3 text-gray-500">
                      {new Date(i.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedDepts[i.userId] ?? ''}
                          onChange={e => setSelectedDepts(s => ({ ...s, [i.userId]: e.target.value }))}
                          className="flex-1 min-w-[160px] px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                          <option value="">— Select dept —</option>
                          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        <button type="button"
                          onClick={() => handleAssign(i.userId)}
                          disabled={!selectedDepts[i.userId] || assigningId === i.userId}
                          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 shrink-0">
                          {assigningId === i.userId ? '...' : 'Assign'}
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
    </div>
  );
}
