'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface StudentDetail {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  student_no: string;
  program_name: string;
  date_of_birth: string | null;
  phone: string | null;
}

interface Enrollment {
  id: string;
  offering_id: string;
  course_code: string;
  course_title: string;
  term_name: string;
  status: string;
  enrolled_count: number;
}

interface RegRequest {
  id: string;
  request_type: string;
  status: string;
  created_at: string;
  course_code: string;
}

interface WithdrawalReq {
  id: string;
  reason_category: string;
  status: string;
  created_at: string;
  course_code: string;
}

interface AcademicStanding {
  id: string;
  term_name: string;
  gpa: number;
  cumulative_gpa: number;
  standing: string;
  credits_earned: number;
}

export default function StudentDetailPage() {
  const params = useParams();
  const studentId = params.studentId as string;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [regRequests, setRegRequests] = useState<RegRequest[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalReq[]>([]);
  const [standings, setStandings] = useState<AcademicStanding[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { router.replace('/login'); return; }

        const [userRes, enrollRes, regRes, wdRes, standRes] = await Promise.all([
          supabase.from('users')
            .select('id, first_name, last_name, email, status, student_profiles!user_id(student_no, date_of_birth, program)')
            .eq('id', studentId)
            .single(),
          supabase.from('enrollments')
            .select('id, offering_id, status, course_offerings(courses(code, title), academic_terms(term_name), enrolled_count)')
            .eq('student_id', studentId)
            .order('created_at', { ascending: false }),
          supabase.from('registration_requests')
            .select('id, request_type, status, created_at, course_offerings!offering_id(courses(code))')
            .eq('student_id', studentId)
            .order('created_at', { ascending: false })
            .limit(20),
          supabase.from('withdrawal_requests')
            .select('id, reason_category, status, created_at, course_offerings!offering_id(courses(code))')
            .eq('student_id', studentId)
            .order('created_at', { ascending: false }),
          supabase.from('academic_standing')
            .select('id, gpa, cumulative_gpa, standing, credits_earned, academic_terms(term_name)')
            .eq('student_id', studentId)
            .order('created_at', { ascending: false }),
        ]);

        if (userRes.error || !userRes.data) throw new Error('Student not found');
        const u = userRes.data as any;
        setStudent({
          id: u.id,
          first_name: u.first_name ?? '',
          last_name: u.last_name ?? '',
          email: u.email ?? '',
          status: u.status ?? 'active',
          student_no: u.student_profiles?.student_no ?? '—',
          program_name: u.student_profiles?.program ?? '—',
          date_of_birth: u.student_profiles?.date_of_birth ?? null,
          phone: u.phone ?? null,
        });

        setEnrollments(((enrollRes.data ?? []) as any[]).map(e => ({
          id: e.id,
          offering_id: e.offering_id,
          course_code: e.course_offerings?.courses?.code ?? '—',
          course_title: e.course_offerings?.courses?.title ?? '—',
          term_name: e.course_offerings?.academic_terms?.term_name ?? '—',
          status: e.status,
          enrolled_count: e.course_offerings?.enrolled_count ?? 0,
        })));

        setRegRequests(((regRes.data ?? []) as any[]).map(r => ({
          id: r.id,
          request_type: r.request_type,
          status: r.status,
          created_at: r.created_at,
          course_code: r.course_offerings?.courses?.code ?? '—',
        })));

        setWithdrawals(((wdRes.data ?? []) as any[]).map(r => ({
          id: r.id,
          reason_category: r.reason_category,
          status: r.status,
          created_at: r.created_at,
          course_code: r.course_offerings?.courses?.code ?? '—',
        })));

        setStandings(((standRes.data ?? []) as any[]).map(s => ({
          id: s.id,
          term_name: s.academic_terms?.term_name ?? '—',
          gpa: s.gpa,
          cumulative_gpa: s.cumulative_gpa,
          standing: s.standing,
          credits_earned: s.credits_earned,
        })));
      } catch (e: any) {
        setError(e.message ?? 'Failed to load student');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [studentId, router]);

  const standingBadge = (standing: string) => {
    const map: Record<string, string> = {
      good: 'bg-green-100 text-green-800',
      warning: 'bg-yellow-100 text-yellow-800',
      probation: 'bg-orange-100 text-orange-800',
      suspension: 'bg-red-100 text-red-800',
      dismissed: 'bg-red-900 text-white',
      honors: 'bg-blue-100 text-blue-800',
    };
    return map[standing] ?? 'bg-gray-100 text-gray-600';
  };

  const enrollmentBadge = (status: string) => {
    const map: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      completed: 'bg-blue-100 text-blue-800',
      dropped: 'bg-gray-100 text-gray-600',
      withdrawn: 'bg-orange-100 text-orange-800',
      inactive: 'bg-gray-100 text-gray-600',
    };
    return map[status] ?? 'bg-gray-100 text-gray-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="p-6">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error || 'Student not found'}</div>
        <Link href="/registrar/students" className="mt-4 inline-flex text-sm text-purple-700 hover:underline">
          ← Back to Students
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/registrar/students" className="text-sm text-purple-700 hover:underline">
          ← Back to Students
        </Link>
      </div>

      {/* Personal Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Full Name</p>
            <p className="font-medium text-gray-900 mt-1">{student.first_name} {student.last_name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Student No</p>
            <p className="font-mono text-gray-900 mt-1">{student.student_no}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Email</p>
            <p className="text-gray-900 mt-1">{student.email}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Program</p>
            <p className="text-gray-900 mt-1">{student.program_name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
            <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${student.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
              {student.status}
            </span>
          </div>
        </div>
      </div>

      {/* Enrollments */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Enrollments</h2>
        </div>
        {enrollments.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">No enrollments found</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-6 py-3 text-left">Course</th>
                <th className="px-6 py-3 text-left">Term</th>
                <th className="px-6 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {enrollments.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{e.course_code} — {e.course_title}</td>
                  <td className="px-6 py-3 text-gray-600">{e.term_name}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${enrollmentBadge(e.status)}`}>
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Registration History */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Registration Request History</h2>
        </div>
        {regRequests.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">No registration requests</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-6 py-3 text-left">Course</th>
                <th className="px-6 py-3 text-left">Type</th>
                <th className="px-6 py-3 text-left">Date</th>
                <th className="px-6 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {regRequests.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-900">{r.course_code}</td>
                  <td className="px-6 py-3 capitalize text-gray-600">{r.request_type}</td>
                  <td className="px-6 py-3 text-gray-500">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-3 capitalize text-gray-600">{r.status.replace('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Withdrawal History */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Withdrawal History</h2>
        </div>
        {withdrawals.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">No withdrawal requests</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-6 py-3 text-left">Course</th>
                <th className="px-6 py-3 text-left">Category</th>
                <th className="px-6 py-3 text-left">Date</th>
                <th className="px-6 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {withdrawals.map(w => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-900">{w.course_code}</td>
                  <td className="px-6 py-3 capitalize text-gray-600">{w.reason_category}</td>
                  <td className="px-6 py-3 text-gray-500">{new Date(w.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-3 capitalize text-gray-600">{w.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Academic Standing */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Academic Standing</h2>
        </div>
        {standings.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">No academic standing records</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-6 py-3 text-left">Term</th>
                <th className="px-6 py-3 text-left">GPA</th>
                <th className="px-6 py-3 text-left">Cumulative GPA</th>
                <th className="px-6 py-3 text-left">Credits Earned</th>
                <th className="px-6 py-3 text-left">Standing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {standings.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-900">{s.term_name}</td>
                  <td className="px-6 py-3 text-gray-900 font-medium">{s.gpa.toFixed(2)}</td>
                  <td className="px-6 py-3 text-gray-900">{s.cumulative_gpa.toFixed(2)}</td>
                  <td className="px-6 py-3 text-gray-600">{s.credits_earned}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${standingBadge(s.standing)}`}>
                      {s.standing}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
