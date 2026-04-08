'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Stats = {
  students: number;
  instructors: number;
  admins: number;
  courses: number;
  enrollments_active: number;
  enrollments_completed: number;
  enrollments_dropped: number;
  enrollments_failed: number;
  certificates_total: number;
  certificates_active: number;
  certificates_revoked: number;
};

type DeptEnrollment = {
  department: string;
  count: number;
};

type TopCourse = {
  code: string;
  title: string;
  enrolled: number;
};

type MonthlyEnrollment = {
  month: string;
  count: number;
};

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className={`text-2xl font-bold ${color ?? 'text-gray-900'}`}>{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="text-base font-semibold text-gray-700 mb-3 mt-6">{title}</h2>;
}

export default function AdminReportsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [deptEnrollments, setDeptEnrollments] = useState<DeptEnrollment[]>([]);
  const [topCourses, setTopCourses] = useState<TopCourse[]>([]);
  const [monthly, setMonthly] = useState<MonthlyEnrollment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();

      // Main stats from existing API
      const res = await fetch('/api/admin/dashboard-stats');
      if (res.ok) {
        const data = await res.json();
        setStats({
          students: data.students,
          instructors: data.instructors,
          admins: data.admins,
          courses: data.courses,
          enrollments_active: data.enrollments_active,
          enrollments_completed: data.enrollments_completed,
          enrollments_dropped: data.enrollments_dropped,
          enrollments_failed: data.enrollments_failed,
          certificates_total: data.certificates_total,
          certificates_active: data.certificates_active,
          certificates_revoked: data.certificates_revoked,
        });
      }

      // Enrollments by department
      const { data: deptData } = await supabase
        .from('enrollments')
        .select(`
          course_offerings!fk_enrollments_offering(
            courses!fk_course_offerings_course(
              departments!fk_courses_department(name)
            )
          )
        `);

      if (deptData) {
        const counts: Record<string, number> = {};
        for (const row of deptData as any[]) {
          const name = row.course_offerings?.courses?.departments?.name ?? 'Unknown';
          counts[name] = (counts[name] ?? 0) + 1;
        }
        setDeptEnrollments(
          Object.entries(counts)
            .map(([department, count]) => ({ department, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8)
        );
      }

      // Top courses by enrollment
      const { data: courseData } = await supabase
        .from('enrollments')
        .select(`
          offering_id,
          course_offerings!fk_enrollments_offering(
            section_name,
            courses!fk_course_offerings_course(code, title)
          )
        `);

      if (courseData) {
        const counts: Record<string, { code: string; title: string; count: number }> = {};
        for (const row of courseData as any[]) {
          const code = row.course_offerings?.courses?.code ?? 'Unknown';
          const title = row.course_offerings?.courses?.title ?? '';
          if (!counts[code]) counts[code] = { code, title, count: 0 };
          counts[code].count++;
        }
        setTopCourses(
          Object.values(counts)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
            .map(c => ({ code: c.code, title: c.title, enrolled: c.count }))
        );
      }

      // Monthly enrollments (last 6 months)
      const { data: monthData } = await supabase
        .from('enrollments')
        .select('enrolled_at')
        .gte('enrolled_at', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
        .order('enrolled_at', { ascending: true });

      if (monthData) {
        const counts: Record<string, number> = {};
        for (const row of monthData as any[]) {
          const month = new Date(row.enrolled_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          counts[month] = (counts[month] ?? 0) + 1;
        }
        setMonthly(Object.entries(counts).map(([month, count]) => ({ month, count })));
      }

      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Loading reports…</div>;
  }

  const totalEnrollments = (stats?.enrollments_active ?? 0) + (stats?.enrollments_completed ?? 0) +
    (stats?.enrollments_dropped ?? 0) + (stats?.enrollments_failed ?? 0);
  const completionRate = totalEnrollments > 0
    ? Math.round(((stats?.enrollments_completed ?? 0) / totalEnrollments) * 100)
    : 0;

  const maxDept = deptEnrollments[0]?.count ?? 1;
  const maxMonthly = Math.max(...monthly.map(m => m.count), 1);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overview of students, enrollments, and certificates</p>
      </div>

      {/* People */}
      <SectionTitle title="People" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Students" value={stats?.students ?? 0} />
        <StatCard label="Instructors" value={stats?.instructors ?? 0} />
        <StatCard label="Admins" value={stats?.admins ?? 0} />
        <StatCard label="Courses" value={stats?.courses ?? 0} />
      </div>

      {/* Enrollments */}
      <SectionTitle title="Enrollments" />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard label="Total" value={totalEnrollments} />
        <StatCard label="Active" value={stats?.enrollments_active ?? 0} color="text-blue-600" />
        <StatCard label="Completed" value={stats?.enrollments_completed ?? 0} color="text-green-600" />
        <StatCard label="Dropped" value={stats?.enrollments_dropped ?? 0} color="text-amber-600" />
        <StatCard label="Failed" value={stats?.enrollments_failed ?? 0} color="text-red-600" />
      </div>

      {/* Completion rate bar */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Completion Rate</span>
          <span className="text-sm font-bold text-green-600">{completionRate}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5">
          <div className="bg-green-500 h-2.5 rounded-full transition-all" style={{ width: `${completionRate}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {stats?.enrollments_completed ?? 0} completed out of {totalEnrollments} total enrollments
        </p>
      </div>

      {/* Certificates */}
      <SectionTitle title="Certificates" />
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Issued" value={stats?.certificates_total ?? 0} />
        <StatCard label="Active" value={stats?.certificates_active ?? 0} color="text-green-600" />
        <StatCard label="Revoked" value={stats?.certificates_revoked ?? 0} color="text-red-600" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
        {/* Enrollments by Department */}
        {deptEnrollments.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Enrollments by Department</h3>
            <div className="space-y-3">
              {deptEnrollments.map(d => (
                <div key={d.department}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600 truncate max-w-[180px]" title={d.department}>{d.department}</span>
                    <span className="text-xs font-semibold text-gray-800">{d.count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-purple-500 h-1.5 rounded-full"
                      style={{ width: `${Math.round((d.count / maxDept) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Courses */}
        {topCourses.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Courses by Enrollment</h3>
            <div className="space-y-3">
              {topCourses.map((c, i) => (
                <div key={c.code} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-800 truncate">{c.code} — {c.title}</div>
                  </div>
                  <span className="text-xs font-semibold text-gray-700 shrink-0">{c.enrolled}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Monthly Enrollments */}
      {monthly.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Monthly Enrollments (Last 6 Months)</h3>
          <div className="flex items-end gap-3 h-32">
            {monthly.map(m => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-gray-500 font-medium">{m.count}</span>
                <div
                  className="w-full bg-purple-500 rounded-t"
                  style={{ height: `${Math.round((m.count / maxMonthly) * 80)}px`, minHeight: '4px' }}
                />
                <span className="text-[9px] text-gray-400 text-center leading-tight">{m.month}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
