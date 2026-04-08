'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  studentNo: string;
  program: string;
  yearOfStudy: number | null;
  enrollmentStatus: string;
  enrolledAt: string;
}

interface Offering {
  id: string;
  label: string;
}

export default function ClassRosterPage() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [selectedOffering, setSelectedOffering] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', authData.user.id)
        .single();
      if (!userData) return;

      const uid = (userData as { id: string }).id;
      setUserId(uid);

      const { data: assignments } = await supabase
        .from('course_instructors')
        .select(`
          offering_id,
          course_offerings (
            id, section_name,
            courses ( code, title ),
            academic_terms ( term_name, is_current )
          )
        `)
        .eq('instructor_id', uid);

      const offeringList: Offering[] = (assignments ?? []).map((a: any) => ({
        id: a.offering_id,
        label: `${a.course_offerings?.courses?.code ?? ''} - ${a.course_offerings?.section_name ?? ''} (${a.course_offerings?.academic_terms?.term_name ?? ''})`,
      }));

      offeringList.sort((a, b) => a.label.localeCompare(b.label));
      setOfferings(offeringList);

      if (offeringList.length > 0) {
        setSelectedOffering(offeringList[0].id);
      }
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!selectedOffering) return;
    const load = async () => {
      setLoadingStudents(true);
      const supabase = createClient();

      const { data } = await supabase
        .from('enrollments')
        .select(`
          id, status, created_at,
          users!student_id (
            id, first_name, last_name, email,
            student_profiles ( student_no, program, year_of_study )
          )
        `)
        .eq('offering_id', selectedOffering)
        .in('status', ['active', 'completed', 'dropped', 'withdrawn']);

      const rows: Student[] = (data ?? []).map((e: any) => ({
        id: e.users?.id ?? e.id,
        firstName: e.users?.first_name ?? '',
        lastName: e.users?.last_name ?? '',
        email: e.users?.email ?? '',
        studentNo: e.users?.student_profiles?.student_no ?? '—',
        program: e.users?.student_profiles?.program ?? '—',
        yearOfStudy: e.users?.student_profiles?.year_of_study ?? null,
        enrollmentStatus: e.status,
        enrolledAt: e.created_at,
      }));

      rows.sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`));
      setStudents(rows);
      setLoadingStudents(false);
    };
    load();
  }, [selectedOffering]);

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    return (
      s.firstName.toLowerCase().includes(q) ||
      s.lastName.toLowerCase().includes(q) ||
      s.studentNo.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  });

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      completed: 'bg-blue-100 text-blue-800',
      dropped: 'bg-red-100 text-red-800',
      withdrawn: 'bg-gray-100 text-gray-600',
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Class Roster</h1>
      <p className="text-sm text-gray-500 mb-6">Student enrollment list by course</p>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <select
              value={selectedOffering}
              onChange={e => setSelectedOffering(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[280px]"
            >
              {offerings.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search by name, student no, email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 flex-1"
            />
          </div>

          {loadingStudents ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-sm">No students found.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 text-sm text-gray-500">
                {filtered.length} student{filtered.length !== 1 ? 's' : ''}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Student No</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Program</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Year</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((s, idx) => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{s.firstName} {s.lastName}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-mono">{s.studentNo}</td>
                      <td className="px-4 py-3 text-gray-700">{s.program}</td>
                      <td className="px-4 py-3 text-gray-700">{s.yearOfStudy ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{s.email}</td>
                      <td className="px-4 py-3">{statusBadge(s.enrollmentStatus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
