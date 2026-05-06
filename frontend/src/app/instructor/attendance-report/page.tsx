'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface AttendanceRow {
  studentId: string;
  firstName: string;
  lastName: string;
  studentNo: string;
  present: number;
  absent: number;
  total: number;
  rate: number;
}

interface Offering {
  id: string;
  label: string;
}

function exportAttendanceCSV(rows: AttendanceRow[], offeringLabel: string) {
  const header = ['#', 'First Name', 'Last Name', 'Student No', 'Present', 'Absent', 'Total', 'Rate (%)'];
  const dataRows = rows.map((r, i) => [
    String(i + 1), r.firstName, r.lastName, r.studentNo,
    String(r.present), String(r.absent), String(r.total), String(r.rate),
  ]);
  const csv = [header, ...dataRows]
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance-${offeringLabel.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AttendanceReportPage() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [selectedOffering, setSelectedOffering] = useState<string>('');
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;

      const { data: userData } = await supabase
        .from('users').select('id').eq('auth_user_id', authData.user.id).single();
      if (!userData) return;

      const uid = (userData as { id: string }).id;

      const { data: assignments } = await supabase
        .from('course_instructors')
        .select(`
          offering_id,
          course_offerings (
            id, section_name,
            courses ( code, title ),
            academic_terms ( term_name )
          )
        `)
        .eq('instructor_id', uid);

      const offeringList: Offering[] = (assignments ?? []).map((a: any) => ({
        id: a.offering_id,
        label: `${a.course_offerings?.courses?.code ?? ''} - ${a.course_offerings?.section_name ?? ''} (${a.course_offerings?.academic_terms?.term_name ?? ''})`,
      }));

      setOfferings(offeringList);
      if (offeringList.length > 0) setSelectedOffering(offeringList[0].id);
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!selectedOffering) return;
    const load = async () => {
      setLoadingData(true);
      const supabase = createClient();

      // Get enrolled students
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select(`
          users!student_id (
            id, first_name, last_name,
            student_profiles ( student_no )
          )
        `)
        .eq('offering_id', selectedOffering)
        .eq('status', 'active');

      // Get attendance for this offering
      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('student_id, status')
        .eq('offering_id', selectedOffering);

      const attendanceMap: Record<string, { present: number; absent: number }> = {};
      (attendanceData ?? []).forEach((a: any) => {
        if (!attendanceMap[a.student_id]) attendanceMap[a.student_id] = { present: 0, absent: 0 };
        if (a.status === 'present') attendanceMap[a.student_id].present++;
        else attendanceMap[a.student_id].absent++;
      });

      const result: AttendanceRow[] = (enrollments ?? []).map((e: any) => {
        const sid = e.users?.id ?? '';
        const rec = attendanceMap[sid] ?? { present: 0, absent: 0 };
        const total = rec.present + rec.absent;
        return {
          studentId: sid,
          firstName: e.users?.first_name ?? '',
          lastName: e.users?.last_name ?? '',
          studentNo: e.users?.student_profiles?.student_no ?? '—',
          present: rec.present,
          absent: rec.absent,
          total,
          rate: total > 0 ? Math.round((rec.present / total) * 100) : 0,
        };
      });

      result.sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`));
      setRows(result);
      setLoadingData(false);
    };
    load();
  }, [selectedOffering]);

  const getRateColor = (rate: number) => {
    if (rate >= 90) return 'text-green-700 bg-green-50';
    if (rate >= 75) return 'text-yellow-700 bg-yellow-50';
    return 'text-red-700 bg-red-50';
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance Report</h1>
          <p className="text-sm text-gray-500">Per-student attendance summary by course</p>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center gap-2 no-print">
            <button
              type="button"
              onClick={() => exportAttendanceCSV(rows, offerings.find(o => o.id === selectedOffering)?.label ?? selectedOffering)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Print PDF
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="mb-5 no-print">
            <select
              value={selectedOffering}
              onChange={e => setSelectedOffering(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[280px]"
            >
              {offerings.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>

          {loadingData ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm">No attendance records found.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {rows.length > 0 && (
                <div className="grid grid-cols-3 gap-4 p-4 border-b border-gray-100 bg-gray-50">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {Math.round(rows.reduce((s, r) => s + r.rate, 0) / rows.length)}%
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">Average Attendance</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-700">
                      {rows.filter(r => r.rate >= 90).length}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">≥90% Attendance</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-700">
                      {rows.filter(r => r.rate < 75).length}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">Below 75%</div>
                  </div>
                </div>
              )}
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Student</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Student No</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Present</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Absent</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Total</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, idx) => (
                    <tr key={row.studentId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.firstName} {row.lastName}</td>
                      <td className="px-4 py-3 font-mono text-gray-700">{row.studentNo}</td>
                      <td className="px-4 py-3 text-center text-green-700 font-medium">{row.present}</td>
                      <td className="px-4 py-3 text-center text-red-700 font-medium">{row.absent}</td>
                      <td className="px-4 py-3 text-center text-gray-700">{row.total}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${getRateColor(row.rate)}`}>
                          {row.rate}%
                        </span>
                      </td>
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
