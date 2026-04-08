'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type AttendanceRow = {
  id: string;
  attendanceDate: string;
  type: string;
  status: string;
  courseCode: string;
  courseTitle: string;
  note: string | null;
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    present:   'bg-green-100 text-green-700',
    absent:    'bg-red-100 text-red-600',
    late:      'bg-amber-100 text-amber-700',
    excused:   'bg-blue-100 text-blue-700',
  };
  return map[status.toLowerCase()] ?? 'bg-gray-100 text-gray-500';
}

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setLoading(false); return; }

      const { data: appUser } = await supabase
        .from('users').select('id').eq('auth_user_id', authData.user.id).single();
      if (!appUser) { setLoading(false); return; }

      const userId = (appUser as { id: string }).id;

      const { data: rows } = await supabase
        .from('attendance')
        .select(`
          id, attendance_date, type, status, note,
          offering_id,
          course_offerings!fk_attendance_offering(
            courses!fk_course_offerings_course(code, title)
          )
        `)
        .eq('student_id', userId)
        .order('attendance_date', { ascending: false });

      const mapped: AttendanceRow[] = (rows ?? []).map((r: any) => ({
        id: r.id,
        attendanceDate: r.attendance_date,
        type:       r.type,
        status:     r.status,
        courseCode: r.course_offerings?.courses?.code ?? '—',
        courseTitle: r.course_offerings?.courses?.title ?? '—',
        note:       r.note,
      }));

      setRecords(mapped);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = records.filter(r => !filterStatus || r.status.toLowerCase() === filterStatus);

  const counts = {
    total:   records.length,
    present: records.filter(r => r.status.toLowerCase() === 'present').length,
    absent:  records.filter(r => r.status.toLowerCase() === 'absent').length,
    late:    records.filter(r => r.status.toLowerCase() === 'late').length,
  };
  const attendanceRate = counts.total > 0
    ? Math.round(((counts.present + counts.late) / counts.total) * 100)
    : 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-2xl" aria-hidden>✅</span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
            <p className="text-sm text-gray-500 mt-0.5">Your class attendance records</p>
          </div>
        </div>

        {/* Summary cards */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Attendance Rate', value: `${attendanceRate}%`, color: 'text-green-600', key: '' },
              { label: 'Present',          value: counts.present,       color: 'text-green-600', key: 'present' },
              { label: 'Absent',           value: counts.absent,        color: 'text-red-600',   key: 'absent'  },
              { label: 'Late',             value: counts.late,          color: 'text-amber-600', key: 'late'    },
            ].map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilterStatus(filterStatus === c.key ? '' : c.key)}
                className={`bg-white rounded-xl border p-4 text-left hover:shadow-sm transition ${filterStatus === c.key ? 'border-[#4c1d95] ring-1 ring-[#4c1d95]' : 'border-gray-200'}`}
              >
                <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading attendance…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            {filterStatus ? `No ${filterStatus} records.` : 'No attendance records yet.'}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Date', 'Course', 'Type', 'Status', 'Note'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {new Date(r.attendanceDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-medium">{r.courseCode}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs capitalize">{r.type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${statusBadge(r.status)}`}>
                        {r.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[180px] truncate">{r.note ?? '—'}</td>
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
