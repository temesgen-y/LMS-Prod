'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface Student {
  id: string;
  student_no: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  program: string; // raw text value stored at signup = department name
}

interface DeptGroup {
  name: string;
  students: Student[];
}

interface Department {
  id: string;
  name: string;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-600',
    suspended: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
  };
  return map[status] ?? 'bg-gray-100 text-gray-600';
}

export default function ByDepartmentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [groups, setGroups] = useState<DeptGroup[]>([]);
  const [allDepts, setAllDepts] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { router.replace('/login'); return; }

        const [{ data: deptData }, { data, error: err }] = await Promise.all([
          supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
          supabase
            .from('users')
            .select('id, first_name, last_name, email, status, student_profiles!user_id(student_no, program)')
            .eq('role', 'student')
            .order('last_name'),
        ]);

        setAllDepts(((deptData ?? []) as any[]).map(d => ({ id: d.id, name: d.name })));

        if (err) throw new Error(err.message);

        const students: Student[] = ((data ?? []) as any[]).map(u => ({
          id: u.id,
          student_no: u.student_profiles?.student_no ?? '',
          first_name: u.first_name ?? '',
          last_name: u.last_name ?? '',
          email: u.email ?? '',
          status: u.status ?? 'active',
          program: u.student_profiles?.program ?? '',
        }));

        // Group by student_profiles.program (which stores the department name at signup)
        const map: Record<string, Student[]> = {};
        const unassigned: Student[] = [];

        for (const s of students) {
          const key = s.program.trim();
          if (!key) {
            unassigned.push(s);
          } else {
            if (!map[key]) map[key] = [];
            map[key].push(s);
          }
        }

        const result: DeptGroup[] = Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, students]) => ({ name, students }));

        if (unassigned.length > 0) {
          result.push({ name: 'Unassigned / No Department', students: unassigned });
        }

        setGroups(result);
        setExpanded(new Set(result.map(g => g.name)));
      } catch (e: any) {
        setError(e.message ?? 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const toggle = (name: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });

  const allStudents = groups.flatMap(g => g.students);

  const matchSearch = (s: Student) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      s.student_no.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  };

  const visibleGroups = groups
    .filter(g => selectedDept === 'all' || g.name === selectedDept)
    .map(g => ({ ...g, students: g.students.filter(matchSearch) }))
    .filter(g => g.students.length > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students by Department</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {allStudents.length} students across {groups.filter(g => g.name !== 'Unassigned / No Department').length} departments
          </p>
        </div>
        <Link href="/registrar/students" className="text-sm text-purple-700 hover:underline">← All Students</Link>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>}

      {/* Department filter buttons */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          type="button"
          onClick={() => setSelectedDept('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            selectedDept === 'all'
              ? 'bg-purple-700 text-white border-purple-700'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          All ({allStudents.length})
        </button>
        {allDepts.map(d => {
          const count = groups.find(g => g.name === d.name)?.students.length ?? 0;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelectedDept(d.name)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                selectedDept === d.name
                  ? 'bg-purple-700 text-white border-purple-700'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {d.name} ({count})
            </button>
          );
        })}
        {/* Show Unassigned button if any students lack a department */}
        {groups.find(g => g.name === 'Unassigned / No Department') && (
          <button
            type="button"
            onClick={() => setSelectedDept('Unassigned / No Department')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              selectedDept === 'Unassigned / No Department'
                ? 'bg-gray-700 text-white border-gray-700'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
            }`}
          >
            Unassigned ({groups.find(g => g.name === 'Unassigned / No Department')?.students.length ?? 0})
          </button>
        )}
      </div>

      {/* Search */}
      <div className="mb-5">
        <input
          type="text"
          placeholder="Search by name, student number, or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-80 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* Accordion groups */}
      {visibleGroups.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          No students match the current filter.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleGroups.map(group => {
            const isOpen = expanded.has(group.name);
            return (
              <div key={group.name} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(group.name)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-900">{group.name}</span>
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                      {group.students.length} student{group.students.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                        <tr>
                          <th className="px-5 py-3 text-left font-medium">#</th>
                          <th className="px-5 py-3 text-left font-medium">Student</th>
                          <th className="px-5 py-3 text-left font-medium">Email</th>
                          <th className="px-5 py-3 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {group.students.map((s, idx) => (
                          <tr key={s.id} className="hover:bg-gray-50">
                            <td className="px-5 py-3 text-gray-400 text-xs">{idx + 1}</td>
                            <td className="px-5 py-3">
                              <Link href={`/registrar/students/${s.id}`} className="font-medium text-gray-900 hover:text-purple-700">
                                {s.first_name} {s.last_name}
                              </Link>
                              {s.student_no && <div className="text-xs text-gray-400">{s.student_no}</div>}
                            </td>
                            <td className="px-5 py-3 text-gray-500 text-xs">{s.email}</td>
                            <td className="px-5 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(s.status)}`}>
                                {s.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
