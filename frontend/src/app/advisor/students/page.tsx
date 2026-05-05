'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface AssignedStudent {
  userId: string;
  name: string;
  email: string;
  studentNo: string;
  program: string;
  profileStatus: string;
  activeHolds: number;
}

export default function AdvisorStudentsPage() {
  const supabase = createClient();
  const [students, setStudents] = useState<AssignedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
      if (!me) return;
      const advisorId = (me as { id: string }).id;

      const { data: assignments } = await supabase
        .from('advisor_assignments')
        .select('student_id')
        .eq('advisor_id', advisorId)
        .eq('is_active', true);

      if (!assignments || assignments.length === 0) { setLoading(false); return; }

      const studentIds = assignments.map((a: any) => a.student_id);

      const { data: usersData } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, student_profiles!user_id(student_no, profile_status, program)')
        .in('id', studentIds);

      const { data: holdsData } = await supabase
        .from('student_holds')
        .select('student_id')
        .in('student_id', studentIds)
        .eq('is_active', true);

      const holdCounts: Record<string, number> = {};
      (holdsData ?? []).forEach((h: any) => { holdCounts[h.student_id] = (holdCounts[h.student_id] ?? 0) + 1; });

      setStudents(
        ((usersData ?? []) as any[]).map(u => {
          const profile = Array.isArray(u.student_profiles) ? u.student_profiles[0] : u.student_profiles;
          return {
            userId: u.id,
            name: `${u.first_name} ${u.last_name}`.trim(),
            email: u.email,
            studentNo: profile?.student_no ?? '—',
            program: profile?.program ?? '—',
            profileStatus: profile?.profile_status ?? 'active',
            activeHolds: holdCounts[u.id] ?? 0,
          };
        })
      );
      setLoading(false);
    };
    load();
  }, []);

  const filtered = students.filter(s =>
    !search || `${s.name} ${s.email} ${s.studentNo}`.toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      inactive: 'bg-gray-100 text-gray-500',
      graduated: 'bg-blue-100 text-blue-700',
      suspended: 'bg-red-100 text-red-600',
    };
    return map[s] ?? 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assigned Students</h1>
          <p className="text-sm text-gray-500 mt-0.5">{students.length} student{students.length !== 1 ? 's' : ''} assigned to you</p>
        </div>
        <input
          type="search"
          placeholder="Search by name, ID, or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64"
        />
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Student No.', 'Name', 'Email', 'Program', 'Status', 'Active Holds', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  {students.length === 0 ? 'No students assigned to you yet' : 'No students match your search'}
                </td></tr>
              ) : filtered.map(s => (
                <tr key={s.userId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.studentNo}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{s.email}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{s.program}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${statusBadge(s.profileStatus)}`}>
                      {s.profileStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.activeHolds > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">{s.activeHolds}</span>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/advisor/students/${s.userId}`} className="text-teal-600 hover:underline text-xs font-medium">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
