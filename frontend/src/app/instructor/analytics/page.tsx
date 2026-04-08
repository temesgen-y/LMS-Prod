'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Offering {
  id: string;
  label: string;
}

interface Analytics {
  enrolled: number;
  activeStudents: number;
  dropped: number;
  withdrawn: number;
  assessmentCount: number;
  assignmentCount: number;
  avgAttendanceRate: number;
  submittedAssignments: number;
  pendingGrading: number;
  completedLessons: number;
}

export default function CourseAnalyticsPage() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [selectedOffering, setSelectedOffering] = useState<string>('');
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
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

      const [enrollRes, assessRes, assignRes, attRes, subsRes, progressRes] = await Promise.all([
        supabase.from('enrollments').select('status').eq('offering_id', selectedOffering),
        supabase.from('assessments').select('id', { count: 'exact', head: true }).eq('offering_id', selectedOffering),
        supabase.from('assignments').select('id').eq('offering_id', selectedOffering),
        supabase.from('attendance').select('student_id, status').eq('offering_id', selectedOffering),
        supabase.from('assignment_submissions').select('id, status').eq('offering_id', selectedOffering),
        supabase.from('lesson_progress').select('id', { count: 'exact', head: true }).eq('offering_id', selectedOffering).eq('is_completed', true),
      ]);

      const enrollData = enrollRes.data ?? [];
      const enrolled = enrollData.length;
      const activeStudents = enrollData.filter((e: any) => e.status === 'active').length;
      const dropped = enrollData.filter((e: any) => e.status === 'dropped').length;
      const withdrawn = enrollData.filter((e: any) => e.status === 'withdrawn').length;

      const assessmentCount = assessRes.count ?? 0;

      // Pending grading: assignments submitted but not graded
      const assignIds = (assignRes.data ?? []).map((a: any) => a.id);
      let pendingGrading = 0;
      let submittedAssignments = 0;
      if (assignIds.length > 0) {
        const { data: subs } = await supabase
          .from('assignment_submissions')
          .select('status')
          .in('assignment_id', assignIds);
        submittedAssignments = (subs ?? []).filter((s: any) => s.status === 'submitted' || s.status === 'graded').length;
        pendingGrading = (subs ?? []).filter((s: any) => s.status === 'submitted').length;
      }

      const attData = attRes.data ?? [];
      const studentAttMap: Record<string, { present: number; total: number }> = {};
      attData.forEach((a: any) => {
        if (!studentAttMap[a.student_id]) studentAttMap[a.student_id] = { present: 0, total: 0 };
        studentAttMap[a.student_id].total++;
        if (a.status === 'present') studentAttMap[a.student_id].present++;
      });
      const rates = Object.values(studentAttMap).map(r => r.total > 0 ? (r.present / r.total) * 100 : 0);
      const avgAttendanceRate = rates.length > 0 ? Math.round(rates.reduce((s, r) => s + r, 0) / rates.length) : 0;

      setAnalytics({
        enrolled,
        activeStudents,
        dropped,
        withdrawn,
        assessmentCount,
        assignmentCount: assignIds.length,
        avgAttendanceRate,
        submittedAssignments,
        pendingGrading,
        completedLessons: progressRes.count ?? 0,
      });
      setLoadingData(false);
    };
    load();
  }, [selectedOffering]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Course Analytics</h1>
      <p className="text-sm text-gray-500 mb-6">Key metrics and engagement data for your courses</p>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="mb-6">
            <select
              value={selectedOffering}
              onChange={e => setSelectedOffering(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[280px]"
            >
              {offerings.length === 0 && <option value="">No courses assigned</option>}
              {offerings.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>

          {loadingData ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !analytics ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <p className="text-sm">No data available.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Enrollment stats */}
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Enrollment</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Enrolled', value: analytics.enrolled, color: 'bg-purple-50 text-purple-700' },
                    { label: 'Active', value: analytics.activeStudents, color: 'bg-green-50 text-green-700' },
                    { label: 'Dropped', value: analytics.dropped, color: 'bg-red-50 text-red-700' },
                    { label: 'Withdrawn', value: analytics.withdrawn, color: 'bg-gray-50 text-gray-600' },
                  ].map(card => (
                    <div key={card.label} className={`rounded-xl p-4 ${card.color}`}>
                      <div className="text-3xl font-bold">{card.value}</div>
                      <div className="text-xs font-medium mt-1 opacity-80">{card.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Course content */}
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Course Content</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    { label: 'Assessments', value: analytics.assessmentCount, color: 'bg-blue-50 text-blue-700' },
                    { label: 'Assignments', value: analytics.assignmentCount, color: 'bg-indigo-50 text-indigo-700' },
                    { label: 'Completed Lessons', value: analytics.completedLessons, color: 'bg-teal-50 text-teal-700' },
                  ].map(card => (
                    <div key={card.label} className={`rounded-xl p-4 ${card.color}`}>
                      <div className="text-3xl font-bold">{card.value}</div>
                      <div className="text-xs font-medium mt-1 opacity-80">{card.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Engagement */}
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Engagement</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    { label: 'Avg Attendance', value: `${analytics.avgAttendanceRate}%`, color: 'bg-amber-50 text-amber-700' },
                    { label: 'Submissions', value: analytics.submittedAssignments, color: 'bg-cyan-50 text-cyan-700' },
                    { label: 'Pending Grading', value: analytics.pendingGrading, color: analytics.pendingGrading > 0 ? 'bg-orange-50 text-orange-700' : 'bg-gray-50 text-gray-500' },
                  ].map(card => (
                    <div key={card.label} className={`rounded-xl p-4 ${card.color}`}>
                      <div className="text-3xl font-bold">{card.value}</div>
                      <div className="text-xs font-medium mt-1 opacity-80">{card.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
