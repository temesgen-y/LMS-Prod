'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getGradeColor, getGpaPoints } from '@/utils/gradeCalculator';

type CoursePerf = {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  creditHours: number;
  termName: string;
  finalScore: number | null;
  finalGrade: string | null;
  status: string;
  attendancePct: number | null;
};

type AttemptScore = {
  id: string;
  title: string;
  type: string;
  score: number;
  totalMarks: number;
  pct: number;
};

type AssignmentCompletion = {
  offeringId: string;
  courseTitle: string;
  courseCode: string;
  total: number;
  submitted: number;
};

export default function StudentAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<CoursePerf[]>([]);
  const [attempts, setAttempts] = useState<AttemptScore[]>([]);
  const [assignments, setAssignments] = useState<AssignmentCompletion[]>([]);
  const [overallAttendance, setOverallAttendance] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setLoading(false); return; }

      const { data: appUser } = await supabase
        .from('users').select('id').eq('auth_user_id', authData.user.id).single();
      if (!appUser) { setLoading(false); return; }
      const userId = (appUser as any).id;

      const { data: enrollRows } = await supabase
        .from('enrollments')
        .select('id, offering_id, final_score, final_grade, status')
        .eq('student_id', userId)
        .in('status', ['active', 'completed']);

      if (!enrollRows || enrollRows.length === 0) { setLoading(false); return; }

      const offeringIds = (enrollRows as any[]).map(r => r.offering_id);

      const { data: offeringRows } = await supabase
        .from('course_offerings')
        .select('id, course_id, term_id')
        .in('id', offeringIds);

      const courseIds = [...new Set(((offeringRows ?? []) as any[]).map(o => o.course_id))];
      const termIds = [...new Set(((offeringRows ?? []) as any[]).map(o => o.term_id))];

      const [{ data: courseRows }, { data: termRows }, { data: attRows }, { data: attemptRows }] = await Promise.all([
        supabase.from('courses').select('id, code, title, credit_hours').in('id', courseIds),
        supabase.from('academic_terms').select('id, term_name').in('id', termIds),
        supabase.from('attendance').select('offering_id, status').eq('student_id', userId).in('offering_id', offeringIds),
        supabase.from('assessment_attempts')
          .select('id, score, total_marks, status, submitted_at, assessment_id')
          .eq('student_id', userId)
          .eq('status', 'submitted')
          .order('submitted_at', { ascending: false })
          .limit(15),
      ]);

      const offeringMap: Record<string, any> = {};
      ((offeringRows ?? []) as any[]).forEach(o => { offeringMap[o.id] = o; });
      const courseMap: Record<string, any> = {};
      ((courseRows ?? []) as any[]).forEach(c => { courseMap[c.id] = c; });
      const termMap: Record<string, any> = {};
      ((termRows ?? []) as any[]).forEach(t => { termMap[t.id] = t; });

      const attByOffering: Record<string, { present: number; total: number }> = {};
      (attRows ?? []).forEach((a: any) => {
        if (!attByOffering[a.offering_id]) attByOffering[a.offering_id] = { present: 0, total: 0 };
        attByOffering[a.offering_id].total++;
        if (a.status === 'present') attByOffering[a.offering_id].present++;
      });

      const allAtt = Object.values(attByOffering);
      const totalPresent = allAtt.reduce((s, a) => s + a.present, 0);
      const totalAtt = allAtt.reduce((s, a) => s + a.total, 0);
      setOverallAttendance(totalAtt > 0 ? Math.round((totalPresent / totalAtt) * 100) : null);

      const coursePerf: CoursePerf[] = (enrollRows as any[]).map(r => {
        const offering = offeringMap[r.offering_id] ?? {};
        const course = courseMap[offering.course_id ?? ''] ?? {};
        const term = termMap[offering.term_id ?? ''] ?? {};
        const att = attByOffering[r.offering_id];
        return {
          offeringId: r.offering_id,
          courseCode: course.code ?? '—',
          courseTitle: course.title ?? '—',
          creditHours: course.credit_hours ?? 3,
          termName: term.term_name ?? '—',
          finalScore: r.final_score ?? null,
          finalGrade: r.final_grade ?? null,
          status: r.status,
          attendancePct: att && att.total > 0 ? Math.round((att.present / att.total) * 100) : null,
        };
      });
      setCourses(coursePerf);

      if (attemptRows && (attemptRows as any[]).length > 0) {
        const assessmentIds = [...new Set((attemptRows as any[]).map(a => a.assessment_id))];
        const { data: assessRows } = await supabase
          .from('assessments').select('id, title, type').in('id', assessmentIds);
        const assessMap: Record<string, any> = {};
        ((assessRows ?? []) as any[]).forEach(a => { assessMap[a.id] = a; });

        const mapped: AttemptScore[] = (attemptRows as any[])
          .filter((a: any) => a.total_marks > 0)
          .slice(0, 10)
          .map((a: any) => ({
            id: a.id,
            title: assessMap[a.assessment_id]?.title ?? 'Assessment',
            type: assessMap[a.assessment_id]?.type ?? 'quiz',
            score: a.score ?? 0,
            totalMarks: a.total_marks,
            pct: Math.round(((a.score ?? 0) / a.total_marks) * 100),
          }));
        setAttempts(mapped);
      }

      const { data: assignRows } = await supabase
        .from('assignments').select('id, offering_id').in('offering_id', offeringIds);

      const assignIds = ((assignRows ?? []) as any[]).map(a => a.id);
      const subSet = new Set<string>();
      if (assignIds.length > 0) {
        const { data: subRows } = await supabase
          .from('assignment_submissions').select('assignment_id')
          .eq('student_id', userId).in('assignment_id', assignIds);
        (subRows ?? []).forEach((s: any) => subSet.add(s.assignment_id));
      }

      const assignByOffering: Record<string, { total: number; submitted: number }> = {};
      ((assignRows ?? []) as any[]).forEach((a: any) => {
        if (!assignByOffering[a.offering_id]) assignByOffering[a.offering_id] = { total: 0, submitted: 0 };
        assignByOffering[a.offering_id].total++;
        if (subSet.has(a.id)) assignByOffering[a.offering_id].submitted++;
      });

      const assignCompletion: AssignmentCompletion[] = offeringIds
        .filter(oid => assignByOffering[oid])
        .map(oid => {
          const offering = offeringMap[oid] ?? {};
          const course = courseMap[offering.course_id ?? ''] ?? {};
          return {
            offeringId: oid,
            courseTitle: course.title ?? '—',
            courseCode: course.code ?? '—',
            total: assignByOffering[oid].total,
            submitted: assignByOffering[oid].submitted,
          };
        });
      setAssignments(assignCompletion);
      setLoading(false);
    })();
  }, []);

  const gradedCourses = courses.filter(c => c.finalGrade != null);
  const gpa = gradedCourses.length > 0
    ? (() => {
        const pts = gradedCourses.reduce((s, c) => s + getGpaPoints(c.finalGrade!) * c.creditHours, 0);
        const cred = gradedCourses.reduce((s, c) => s + c.creditHours, 0);
        return cred > 0 ? Math.round((pts / cred) * 100) / 100 : 0;
      })()
    : null;

  const scoredCourses = courses.filter(c => c.finalScore != null);
  const avgScore = scoredCourses.length > 0
    ? Math.round(scoredCourses.reduce((s, c) => s + c.finalScore!, 0) / scoredCourses.length)
    : null;

  const completedCredits = gradedCourses.reduce((s, c) => s + c.creditHours, 0);

  const gradeBins = [
    { bin: 'A', grades: ['A', 'A-'], color: 'bg-green-500' },
    { bin: 'B', grades: ['B+', 'B', 'B-'], color: 'bg-blue-500' },
    { bin: 'C', grades: ['C+', 'C', 'C-'], color: 'bg-yellow-500' },
    { bin: 'D', grades: ['D'], color: 'bg-orange-500' },
    { bin: 'F', grades: ['F'], color: 'bg-red-500' },
  ].map(b => ({
    ...b,
    count: b.grades.reduce((s, g) => {
      return s + gradedCourses.filter(c => c.finalGrade === g).length;
    }, 0),
  }));
  const maxBinCount = Math.max(...gradeBins.map(b => b.count), 1);

  const avgAssessmentScore = attempts.length > 0
    ? Math.round(attempts.reduce((s, a) => s + a.pct, 0) / attempts.length)
    : null;

  const attColor = overallAttendance === null ? 'bg-gray-500' : overallAttendance >= 80 ? 'bg-green-600' : overallAttendance >= 60 ? 'bg-amber-500' : 'bg-red-600';

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Performance Analytics</h1>
        <p className="text-sm text-gray-500 mb-6">Academic performance overview across all enrolled courses</p>

        {courses.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <span className="text-4xl block mb-3">📊</span>
            <p className="text-gray-400 font-medium">No enrolled courses found.</p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-xl p-5 bg-[#4c1d95] text-white">
                <div className="text-3xl font-bold">{gpa !== null ? gpa.toFixed(2) : '—'}</div>
                <div className="text-xs font-semibold mt-1 opacity-80">Cumulative GPA</div>
                <div className="text-xs opacity-60 mt-0.5">/ 4.00 scale</div>
              </div>
              <div className="rounded-xl p-5 bg-blue-600 text-white">
                <div className="text-3xl font-bold">{avgScore !== null ? `${avgScore}%` : '—'}</div>
                <div className="text-xs font-semibold mt-1 opacity-80">Avg Score</div>
                <div className="text-xs opacity-60 mt-0.5">graded courses</div>
              </div>
              <div className={`rounded-xl p-5 text-white ${attColor}`}>
                <div className="text-3xl font-bold">{overallAttendance !== null ? `${overallAttendance}%` : '—'}</div>
                <div className="text-xs font-semibold mt-1 opacity-80">Attendance Rate</div>
                <div className="text-xs opacity-60 mt-0.5">all courses</div>
              </div>
              <div className="rounded-xl p-5 bg-amber-500 text-white">
                <div className="text-3xl font-bold">{completedCredits}</div>
                <div className="text-xs font-semibold mt-1 opacity-80">Credits Earned</div>
                <div className="text-xs opacity-60 mt-0.5">credit hours</div>
              </div>
            </div>

            {/* Grade distribution + Assessment scores */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Grade Distribution */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-900 text-sm mb-4">Grade Distribution</h2>
                {gradedCourses.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No graded courses yet</p>
                ) : (
                  <div className="space-y-3">
                    {gradeBins.map(b => (
                      <div key={b.bin} className="flex items-center gap-3">
                        <span className="w-4 text-xs font-bold text-gray-700 flex-shrink-0">{b.bin}</span>
                        <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${b.color} rounded-full transition-all duration-500`}
                            style={{ width: b.count === 0 ? '0%' : `${Math.max((b.count / maxBinCount) * 100, 4)}%` }}
                          />
                        </div>
                        <span className="w-6 text-xs font-medium text-gray-500 text-right flex-shrink-0">{b.count}</span>
                      </div>
                    ))}
                    <p className="text-xs text-gray-400 mt-2">{gradedCourses.length} graded course{gradedCourses.length !== 1 ? 's' : ''} total</p>
                  </div>
                )}
              </div>

              {/* Recent Assessment Scores */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-900 text-sm">Recent Assessment Scores</h2>
                  {avgAssessmentScore !== null && (
                    <span className="text-xs text-gray-500">
                      Avg: <span className="font-semibold text-gray-800">{avgAssessmentScore}%</span>
                    </span>
                  )}
                </div>
                {attempts.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No submitted assessments yet</p>
                ) : (
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {attempts.map(a => (
                      <div key={a.id}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-600 truncate max-w-[72%]" title={a.title}>{a.title}</span>
                          <span className={`text-xs font-bold flex-shrink-0 ${a.pct >= 70 ? 'text-green-700' : a.pct >= 50 ? 'text-amber-700' : 'text-red-700'}`}>
                            {a.pct}%
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${a.pct >= 70 ? 'bg-green-500' : a.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${a.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Course Performance Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 text-sm">Course Performance</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Course', 'Term', 'Score', 'Grade', 'Attendance', 'Status'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {courses.map(c => (
                      <tr key={c.offeringId} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{c.courseTitle}</div>
                          <div className="text-xs text-gray-400">{c.courseCode} · {c.creditHours} cr</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{c.termName}</td>
                        <td className="px-4 py-3">
                          {c.finalScore != null ? (
                            <div>
                              <span className="text-sm font-semibold text-gray-900">{c.finalScore.toFixed(1)}%</span>
                              <div className="mt-1 w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${c.finalScore >= 70 ? 'bg-green-500' : c.finalScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${Math.min(c.finalScore, 100)}%` }}
                                />
                              </div>
                            </div>
                          ) : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {c.finalGrade
                            ? <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold border ${getGradeColor(c.finalGrade)}`}>{c.finalGrade}</span>
                            : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {c.attendancePct != null ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${c.attendancePct >= 80 ? 'bg-green-500' : c.attendancePct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${c.attendancePct}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500">{c.attendancePct}%</span>
                            </div>
                          ) : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${c.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                            {c.status === 'completed' ? 'Completed' : 'Active'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Assignment Completion */}
            {assignments.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-900 text-sm mb-4">Assignment Completion</h2>
                <div className="space-y-4">
                  {assignments.map(a => {
                    const pct = a.total > 0 ? Math.round((a.submitted / a.total) * 100) : 0;
                    return (
                      <div key={a.offeringId}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div>
                            <span className="text-sm font-medium text-gray-900">{a.courseTitle}</span>
                            <span className="text-xs text-gray-400 ml-2">{a.courseCode}</span>
                          </div>
                          <span className="text-xs font-semibold text-gray-700">{a.submitted}/{a.total}</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${a.submitted === a.total ? 'bg-green-500' : a.submitted > 0 ? 'bg-[#4c1d95]' : 'bg-gray-300'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-0.5">
                          <span className="text-xs text-gray-400">
                            {a.submitted === a.total ? 'All submitted' : `${a.total - a.submitted} pending`}
                          </span>
                          <span className="text-xs text-gray-400">{pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
