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
  program_name: string;
}

interface Department {
  id: string;
  name: string;
  students: Student[];
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
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { router.replace('/login'); return; }

        // Load departments, programs, and students in parallel
        const [{ data: deptData }, { data: progData }, { data: studentData }] = await Promise.all([
          supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
          supabase.from('academic_programs').select('id, name, department_id').eq('is_active', true),
          supabase
            .from('users')
            .select('id, first_name, last_name, email, status, student_profiles!user_id(student_no, program)')
            .eq('role', 'student')
            .order('last_name'),
        ]);

        // Build program → department map
        const programMap: Record<string, { name: string; department_id: string }> = {};
        ((progData ?? []) as any[]).forEach(p => {
          programMap[p.id] = { name: p.name, department_id: p.department_id };
        });

        // Build department → students map
        const deptStudentMap: Record<string, Student[]> = {};
        ((deptData ?? []) as any[]).forEach(d => { deptStudentMap[d.id] = []; });
        const unassigned: Student[] = [];

        ((studentData ?? []) as any[]).forEach(u => {
          const programId = u.student_profiles?.program;
          const prog = programId ? programMap[programId] : null;
          const student: Student = {
            id: u.id,
            student_no: u.student_profiles?.student_no ?? '',
            first_name: u.first_name ?? '',
            last_name: u.last_name ?? '',
            email: u.email ?? '',
            status: u.status ?? 'active',
            program_name: prog?.name ?? '—',
          };

          if (prog?.department_id && deptStudentMap[prog.department_id] !== undefined) {
            deptStudentMap[prog.department_id].push(student);
          } else {
            unassigned.push(student);
          }
        });

        const depts: Department[] = ((deptData ?? []) as any[]).map(d => ({
          id: d.id,
          name: d.name,
          students: deptStudentMap[d.id] ?? [],
        }));

        if (unassigned.length > 0) {
          depts.push({ id: '__unassigned__', name: 'Unassigned / No Department', students: unassigned });
        }

        setDepartments(depts);
        // Expand all by default
        setExpandedDepts(new Set(depts.map(d => d.id)));
      } catch (e: any) {
        setError(e.message ?? 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const toggleDept = (id: string) => {
    setExpandedDepts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allStudents = departments.flatMap(d => d.students);

  const visibleDepts = departments.filter(d => {
    if (selectedDeptId !== 'all' && d.id !== selectedDeptId) return false;
    if (!search.trim()) return d.students.length > 0;
    const q = search.toLowerCase();
    return d.students.some(s =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      s.student_no.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  });

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
          <p className="text-sm text-gray-500 mt-0.5">{allStudents.length} students across {departments.filter(d => d.students.length > 0).length} departments</p>
        </div>
        <Link href="/registrar/students" className="text-sm text-purple-700 hover:underline">
          ← All Students
        </Link>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>}

      {/* Department filter cards */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          type="button"
          onClick={() => setSelectedDeptId('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            selectedDeptId === 'all'
              ? 'bg-purple-700 text-white border-purple-700'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          All ({allStudents.length})
        </button>
        {departments.filter(d => d.students.length > 0).map(d => (
          <button
            key={d.id}
            type="button"
            onClick={() => setSelectedDeptId(d.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              selectedDeptId === d.id
                ? 'bg-purple-700 text-white border-purple-700'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {d.name} ({d.students.length})
          </button>
        ))}
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

      {/* Department accordion sections */}
      {visibleDepts.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          No students match the current filter.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleDepts.map(dept => {
            const deptStudents = search.trim()
              ? dept.students.filter(s => {
                  const q = search.toLowerCase();
                  return (
                    `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
                    s.student_no.toLowerCase().includes(q) ||
                    s.email.toLowerCase().includes(q)
                  );
                })
              : dept.students;

            if (deptStudents.length === 0) return null;
            const isOpen = expandedDepts.has(dept.id);

            return (
              <div key={dept.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleDept(dept.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-900">{dept.name}</span>
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                      {deptStudents.length} student{deptStudents.length !== 1 ? 's' : ''}
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
                          <th className="px-5 py-3 text-left font-medium">Program</th>
                          <th className="px-5 py-3 text-left font-medium">Email</th>
                          <th className="px-5 py-3 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {deptStudents.map((s, idx) => (
                          <tr key={s.id} className="hover:bg-gray-50">
                            <td className="px-5 py-3 text-gray-400 text-xs">{idx + 1}</td>
                            <td className="px-5 py-3">
                              <Link href={`/registrar/students/${s.id}`} className="font-medium text-gray-900 hover:text-purple-700">
                                {s.first_name} {s.last_name}
                              </Link>
                              {s.student_no && (
                                <div className="text-xs text-gray-400">{s.student_no}</div>
                              )}
                            </td>
                            <td className="px-5 py-3 text-gray-600 text-xs">{s.program_name}</td>
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
