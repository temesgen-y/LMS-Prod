'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Student {
  id: string;
  student_no: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  program_name: string;
}

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-600',
    suspended: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
  };
  return map[status] ?? 'bg-gray-100 text-gray-600';
}

export default function StudentsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.replace('/login'); return; }

      const { data, error: fetchErr } = await supabase
        .from('users')
        .select(`
          id, first_name, last_name, email, status,
          student_profiles!user_id(student_no, program)
        `)
        .eq('role', 'student')
        .order('last_name', { ascending: true });

      if (fetchErr) throw new Error(fetchErr.message);

      setStudents((data ?? []).map((u: any) => ({
        id: u.id,
        student_no: u.student_profiles?.student_no ?? '—',
        first_name: u.first_name ?? '',
        last_name: u.last_name ?? '',
        email: u.email ?? '',
        status: u.status ?? 'active',
        program_name: u.student_profiles?.program ?? '—',
      })));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = students.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Student Records</h1>
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>}

      <div className="mb-4 flex items-center justify-between">
        <input
          type="text"
          placeholder="Search by name, student number, or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-96 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <span className="ml-4 text-sm text-gray-500">{filtered.length} students</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-sm">No students found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Student No</th>
                  <th className="px-5 py-3 text-left font-medium">Name</th>
                  <th className="px-5 py-3 text-left font-medium">Program</th>
                  <th className="px-5 py-3 text-left font-medium">Email</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-gray-700">{s.student_no}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{s.first_name} {s.last_name}</td>
                    <td className="px-5 py-3 text-gray-600">{s.program_name}</td>
                    <td className="px-5 py-3 text-gray-600">{s.email}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadgeClass(s.status)}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => router.push(`/registrar/students/${s.id}`)}
                        className="text-xs px-2 py-1 rounded bg-purple-100 hover:bg-purple-200 text-purple-700"
                      >
                        View
                      </button>
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
