'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getGradeColor } from '@/utils/gradeCalculator';

interface Offering {
  id: string;
  label: string;
}

interface SummaryStats {
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

interface GradeBin {
  bin: string;
  count: number;
  color: string;
}

interface AtRiskStudent {
  studentId: string;
  name: string;
  email: string;
  finalScore: number | null;
  attendancePct: number | null;
  submissionRate: number | null;
}

interface StudentRow {
  studentId: string;
  name: string;
  email: string;
  finalScore: number | null;
  finalGrade: string | null;
  attendancePct: number | null;
  submissionRate: number | null;
}

interface AssignmentRate {
  id: string;
  title: string;
  total: number;
  submitted: number;
}

type SortKey = 'name' | 'score' | 'attendance' | 'submissions';

export default function CourseAnalyticsPage() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [selectedOffering, setSelectedOffering] = useState<string>('');
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [gradeBins, setGradeBins] = useState<GradeBin[]>([]);
  const [atRisk, setAtRisk] = useState<AtRiskStudent[]>([]);
  const [studentRows, setStudentRows] = useState<StudentRow[]>([]);
  const [assignmentRates, setAssignmentRates] = useState<AssignmentRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortAsc, setSortAsc] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'assignments'>('overview');

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;

      const { data: userData } = await supabase
        .from('users').select('id').eq('auth_user_id', authData.user.id).single();
      if (!userData) return;

      const uid = (userData as { id: string }).id;

      const { data: ciRows } = await supabase
        .from('course_instructors')
        .select(`offering_id, course_offerings(id, section_name, courses(code, title), academic_terms(term_name))`)
        .eq('instructor_id', uid);

      const list: Offering[] = (ciRows ?? []).map((a: any) => ({
        id: a.offering_id,
        label: `${a.course_offerings?.courses?.code ?? ''} – ${a.course_offerings?.courses?.title ?? ''} · ${a.course_offerings?.section_name ?? ''} (${a.course_offerings?.academic_terms?.term_name ?? ''})`,
      }));

      setOfferings(list);
      if (list.length > 0) setSelectedOffering(list[0].id);
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!selectedOffering) return;
    const load = async () => {
      setLoadingData(true);
      const supabase = createClient();

      const [enrollRes, assessRes, assignRes, attRes, progressRes] = await Promise.all([
        supabase.from('enrollments').select('student_id, status, final_score, final_grade').eq('offering_id', selectedOffering),
        supabase.from('assessments').select('id', { count: 'exact', head: true }).eq('offering_id', selectedOffering),
        supabase.from('assignments').select('id, title').eq('offering_id', selectedOffering),
        supabase.from('attendance').select('student_id, status').eq('offering_id', selectedOffering),
        supabase.from('lesson_progress').select('id', { count: 'exact', head: true }).eq('offering_id', selectedOffering).eq('is_completed', true),
      ]);

      const enrollData = (enrollRes.data ?? []) as any[];
      const enrolled = enrollData.length;
      const activeStudents = enrollData.filter(e => e.status === 'active').length;
      const dropped = enrollData.filter(e => e.status === 'dropped').length;
      const withdrawn = enrollData.filter(e => e.status === 'withdrawn').length;

      const assignRows = (assignRes.data ?? []) as any[];
      const assignIds = assignRows.map(a => a.id);
      let pendingGrading = 0;
      let submittedAssignments = 0;
      let allSubs: any[] = [];

      if (assignIds.length > 0) {
        const { data: subs } = await supabase
          .from('assignment_submissions').select('assignment_id, student_id, status')
          .in('assignment_id', assignIds);
        allSubs = subs ?? [];
        submittedAssignments = allSubs.filter(s => s.status === 'submitted' || s.status === 'graded').length;
        pendingGrading = allSubs.filter(s => s.status === 'submitted').length;
      }

      const attData = (attRes.data ?? []) as any[];
      const studentAttMap: Record<string, { present: number; total: number }> = {};
      attData.forEach(a => {
        if (!studentAttMap[a.student_id]) studentAttMap[a.student_id] = { present: 0, total: 0 };
        studentAttMap[a.student_id].total++;
        if (a.status === 'present') studentAttMap[a.student_id].present++;
      });
      const rates = Object.values(studentAttMap).map(r => r.total > 0 ? (r.present / r.total) * 100 : 0);
      const avgAttendanceRate = rates.length > 0 ? Math.round(rates.reduce((s, r) => s + r, 0) / rates.length) : 0;

      setSummary({
        enrolled, activeStudents, dropped, withdrawn,
        assessmentCount: assessRes.count ?? 0,
        assignmentCount: assignIds.length,
        avgAttendanceRate,
        submittedAssignments,
        pendingGrading,
        completedLessons: progressRes.count ?? 0,
      });

      // Grade distribution bins
      const gradeOrder = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];
      const gradedEnroll = enrollData.filter(e => e.final_grade != null);
      const bins: GradeBin[] = [
        { bin: 'A', count: gradedEnroll.filter(e => e.final_grade === 'A' || e.final_grade === 'A-').length, color: 'bg-green-500' },
        { bin: 'B', count: gradedEnroll.filter(e => ['B+', 'B', 'B-'].includes(e.final_grade)).length, color: 'bg-blue-500' },
        { bin: 'C', count: gradedEnroll.filter(e => ['C+', 'C', 'C-'].includes(e.final_grade)).length, color: 'bg-yellow-500' },
        { bin: 'D', count: gradedEnroll.filter(e => e.final_grade === 'D').length, color: 'bg-orange-500' },
        { bin: 'F', count: gradedEnroll.filter(e => e.final_grade === 'F').length, color: 'bg-red-500' },
      ];
      setGradeBins(bins);

      // Fetch student names for enrolled students
      const activeEnrollIds = enrollData.filter(e => e.status === 'active' || e.status === 'completed').map(e => e.student_id);
      let userMap: Record<string, { name: string; email: string }> = {};
      if (activeEnrollIds.length > 0) {
        const { data: users } = await supabase
          .from('users').select('id, first_name, last_name, email').in('id', activeEnrollIds);
        (users ?? []).forEach((u: any) => {
          userMap[u.id] = {
            name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email,
            email: u.email ?? '',
          };
        });
      }

      // Student submission counts per student
      const subsByStudent: Record<string, number> = {};
      allSubs.forEach(s => {
        if (!subsByStudent[s.student_id]) subsByStudent[s.student_id] = 0;
        subsByStudent[s.student_id]++;
      });

      // Build student rows
      const rows: StudentRow[] = enrollData
        .filter(e => e.status === 'active' || e.status === 'completed')
        .map(e => {
          const att = studentAttMap[e.student_id];
          const attPct = att && att.total > 0 ? Math.round((att.present / att.total) * 100) : null;
          const subRate = assignIds.length > 0
            ? Math.round(((subsByStudent[e.student_id] ?? 0) / assignIds.length) * 100)
            : null;
          return {
            studentId: e.student_id,
            name: userMap[e.student_id]?.name ?? '—',
            email: userMap[e.student_id]?.email ?? '—',
            finalScore: e.final_score ?? null,
            finalGrade: e.final_grade ?? null,
            attendancePct: attPct,
            submissionRate: subRate,
          };
        });
      setStudentRows(rows);

      // At-risk: score < 60, or attendance < 70, or submission rate < 50
      const risk = rows.filter(r =>
        (r.finalScore !== null && r.finalScore < 60) ||
        (r.attendancePct !== null && r.attendancePct < 70) ||
        (r.submissionRate !== null && r.submissionRate < 50)
      ).slice(0, 10);
      setAtRisk(risk);

      // Assignment submission rates
      const assignRates: AssignmentRate[] = assignRows.map((a: any) => ({
        id: a.id,
        title: a.title,
        total: activeStudents || enrolled,
        submitted: allSubs.filter(s => s.assignment_id === a.id && (s.status === 'submitted' || s.status === 'graded')).length,
      }));
      setAssignmentRates(assignRates);

      setLoadingData(false);
    };
    load();
  }, [selectedOffering]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) { setSortAsc(!sortAsc); } else { setSortKey(key); setSortAsc(false); }
  };

  const sortedStudents = [...studentRows].sort((a, b) => {
    let av: any, bv: any;
    if (sortKey === 'name') { av = a.name; bv = b.name; }
    else if (sortKey === 'score') { av = a.finalScore ?? -1; bv = b.finalScore ?? -1; }
    else if (sortKey === 'attendance') { av = a.attendancePct ?? -1; bv = b.attendancePct ?? -1; }
    else { av = a.submissionRate ?? -1; bv = b.submissionRate ?? -1; }
    if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortAsc ? av - bv : bv - av;
  });

  const maxBinCount = Math.max(...gradeBins.map(b => b.count), 1);

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className="ml-1 opacity-50">
      {sortKey === k ? (sortAsc ? '↑' : '↓') : '↕'}
    </span>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Course Analytics</h1>
      <p className="text-sm text-gray-500 mb-6">Comprehensive metrics and student performance data</p>

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
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[320px]"
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
          ) : !summary ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <p className="text-sm">No data available.</p>
            </div>
          ) : (
            <div className="space-y-6">

              {/* Tabs */}
              <div className="flex gap-1 border-b border-gray-200">
                {(['overview', 'students', 'assignments'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                      activeTab === tab
                        ? 'border-[#4c1d95] text-[#4c1d95]'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* OVERVIEW TAB */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Enrollment stats */}
                  <div>
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Enrollment</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {[
                        { label: 'Total Enrolled', value: summary.enrolled, color: 'bg-purple-50 text-purple-700' },
                        { label: 'Active', value: summary.activeStudents, color: 'bg-green-50 text-green-700' },
                        { label: 'Dropped', value: summary.dropped, color: 'bg-red-50 text-red-700' },
                        { label: 'Withdrawn', value: summary.withdrawn, color: 'bg-gray-50 text-gray-600' },
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
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Engagement</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {[
                        { label: 'Avg Attendance', value: `${summary.avgAttendanceRate}%`, color: 'bg-amber-50 text-amber-700' },
                        { label: 'Submissions', value: summary.submittedAssignments, color: 'bg-cyan-50 text-cyan-700' },
                        { label: 'Pending Grading', value: summary.pendingGrading, color: summary.pendingGrading > 0 ? 'bg-orange-50 text-orange-700' : 'bg-gray-50 text-gray-500' },
                        { label: 'Assessments', value: summary.assessmentCount, color: 'bg-blue-50 text-blue-700' },
                        { label: 'Assignments', value: summary.assignmentCount, color: 'bg-indigo-50 text-indigo-700' },
                        { label: 'Completed Lessons', value: summary.completedLessons, color: 'bg-teal-50 text-teal-700' },
                      ].map(card => (
                        <div key={card.label} className={`rounded-xl p-4 ${card.color}`}>
                          <div className="text-3xl font-bold">{card.value}</div>
                          <div className="text-xs font-medium mt-1 opacity-80">{card.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Grade distribution */}
                  {gradeBins.some(b => b.count > 0) && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <h2 className="font-semibold text-gray-900 text-sm mb-4">Grade Distribution</h2>
                      <div className="space-y-3">
                        {gradeBins.map(b => (
                          <div key={b.bin} className="flex items-center gap-3">
                            <span className="w-4 text-xs font-bold text-gray-700 flex-shrink-0">{b.bin}</span>
                            <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                              <div
                                className={`h-full ${b.color} transition-all duration-500 flex items-center justify-end pr-2`}
                                style={{ width: b.count === 0 ? '0%' : `${Math.max((b.count / maxBinCount) * 100, 4)}%` }}
                              >
                                {b.count > 0 && <span className="text-white text-xs font-bold">{b.count}</span>}
                              </div>
                            </div>
                            {b.count === 0 && <span className="text-xs text-gray-400">0</span>}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-3">
                        {gradeBins.reduce((s, b) => s + b.count, 0)} students with final grades
                      </p>
                    </div>
                  )}

                  {/* At-risk students */}
                  {atRisk.length > 0 && (
                    <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
                      <div className="px-5 py-4 border-b border-red-100 bg-red-50 flex items-center gap-2">
                        <span className="text-red-600 text-sm font-semibold">⚠ At-Risk Students</span>
                        <span className="text-xs text-red-400">score &lt;60% or attendance &lt;70% or submissions &lt;50%</span>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {atRisk.map(s => (
                          <div key={s.studentId} className="px-5 py-3 flex items-center gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                              <p className="text-xs text-gray-400 truncate">{s.email}</p>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                              {s.finalScore !== null && (
                                <span className={`px-2 py-0.5 rounded font-medium ${s.finalScore < 60 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                  Score: {s.finalScore.toFixed(1)}%
                                </span>
                              )}
                              {s.attendancePct !== null && (
                                <span className={`px-2 py-0.5 rounded font-medium ${s.attendancePct < 70 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                                  Att: {s.attendancePct}%
                                </span>
                              )}
                              {s.submissionRate !== null && (
                                <span className={`px-2 py-0.5 rounded font-medium ${s.submissionRate < 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                                  Subs: {s.submissionRate}%
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STUDENTS TAB */}
              {activeTab === 'students' && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900 text-sm">Student Performance</h2>
                    <span className="text-xs text-gray-400">{sortedStudents.length} students</span>
                  </div>
                  {sortedStudents.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-10">No students enrolled.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th
                              className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                              onClick={() => handleSort('name')}
                            >Name <SortIcon k="name" /></th>
                            <th
                              className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                              onClick={() => handleSort('score')}
                            >Score <SortIcon k="score" /></th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Grade</th>
                            <th
                              className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                              onClick={() => handleSort('attendance')}
                            >Attendance <SortIcon k="attendance" /></th>
                            <th
                              className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                              onClick={() => handleSort('submissions')}
                            >Submissions <SortIcon k="submissions" /></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {sortedStudents.map(s => (
                            <tr key={s.studentId} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <p className="font-medium text-gray-900 text-sm">{s.name}</p>
                                <p className="text-xs text-gray-400">{s.email}</p>
                              </td>
                              <td className="px-4 py-3">
                                {s.finalScore !== null ? (
                                  <div>
                                    <span className={`text-sm font-semibold ${s.finalScore < 60 ? 'text-red-600' : s.finalScore < 75 ? 'text-amber-600' : 'text-green-700'}`}>
                                      {s.finalScore.toFixed(1)}%
                                    </span>
                                    <div className="mt-1 w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${s.finalScore >= 70 ? 'bg-green-500' : s.finalScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                        style={{ width: `${Math.min(s.finalScore, 100)}%` }}
                                      />
                                    </div>
                                  </div>
                                ) : <span className="text-gray-400 text-xs">—</span>}
                              </td>
                              <td className="px-4 py-3">
                                {s.finalGrade
                                  ? <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold border ${getGradeColor(s.finalGrade)}`}>{s.finalGrade}</span>
                                  : <span className="text-gray-400 text-xs">—</span>}
                              </td>
                              <td className="px-4 py-3">
                                {s.attendancePct !== null ? (
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${s.attendancePct >= 80 ? 'bg-green-500' : s.attendancePct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                                        style={{ width: `${s.attendancePct}%` }}
                                      />
                                    </div>
                                    <span className={`text-xs font-medium ${s.attendancePct < 70 ? 'text-red-600' : 'text-gray-600'}`}>{s.attendancePct}%</span>
                                  </div>
                                ) : <span className="text-gray-400 text-xs">—</span>}
                              </td>
                              <td className="px-4 py-3">
                                {s.submissionRate !== null ? (
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${s.submissionRate >= 80 ? 'bg-green-500' : s.submissionRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                        style={{ width: `${s.submissionRate}%` }}
                                      />
                                    </div>
                                    <span className={`text-xs font-medium ${s.submissionRate < 50 ? 'text-red-600' : 'text-gray-600'}`}>{s.submissionRate}%</span>
                                  </div>
                                ) : <span className="text-gray-400 text-xs">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ASSIGNMENTS TAB */}
              {activeTab === 'assignments' && (
                <div className="space-y-4">
                  {assignmentRates.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                      <p className="text-sm text-gray-400">No assignments for this course.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <h2 className="font-semibold text-gray-900 text-sm mb-4">Assignment Submission Rates</h2>
                      <div className="space-y-4">
                        {assignmentRates.map(a => {
                          const pct = a.total > 0 ? Math.round((a.submitted / a.total) * 100) : 0;
                          return (
                            <div key={a.id}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-sm font-medium text-gray-900">{a.title}</span>
                                <span className="text-xs font-semibold text-gray-700">{a.submitted}/{a.total}</span>
                              </div>
                              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <div className="flex justify-between mt-0.5">
                                <span className="text-xs text-gray-400">{a.total - a.submitted} not submitted</span>
                                <span className={`text-xs font-medium ${pct >= 80 ? 'text-green-700' : pct >= 50 ? 'text-amber-700' : 'text-red-700'}`}>{pct}%</span>
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
          )}
        </>
      )}
    </div>
  );
}
