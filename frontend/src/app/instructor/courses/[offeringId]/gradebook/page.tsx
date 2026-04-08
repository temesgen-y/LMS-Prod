'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getGradeColor, getLetterGrade } from '@/utils/gradeCalculator';

// ─── Types ────────────────────────────────────────────────────────────────────

type Column = {
  id:       string;
  title:    string;
  colType:  'assessment' | 'assignment';
  maxScore: number;
};

type StudentScore = {
  raw:   number | null;
  total: number;
};

type StudentRow = {
  enrollmentId: string;
  studentId:    string;
  name:         string;
  studentNo:    string;
  scores:       Record<string, StudentScore>;
  finalScore:   number | null;
  finalGrade:   string | null;
};

type CourseInfo = {
  courseCode:  string;
  courseTitle: string;
  termName:    string;
  sectionName: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function exportCSV(courseInfo: CourseInfo | null, columns: Column[], students: StudentRow[]) {
  const header = [
    'Student', 'Student No',
    ...columns.map(c => `${c.title} (/${c.maxScore})`),
    'Final Score', 'Final Grade',
  ];
  const dataRows = students.map(s => [
    s.name, s.studentNo,
    ...columns.map(c => {
      const sc = s.scores[c.id];
      return sc?.raw != null ? String(sc.raw) : '—';
    }),
    s.finalScore != null ? s.finalScore.toFixed(2) : '—',
    s.finalGrade ?? '—',
  ]);
  const csv = [header, ...dataRows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `gradebook-${courseInfo?.courseCode ?? 'export'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InstructorGradebookPage() {
  const params     = useParams();
  const offeringId = params?.offeringId as string;

  const [courseInfo, setCourseInfo]   = useState<CourseInfo | null>(null);
  const [columns, setColumns]         = useState<Column[]>([]);
  const [students, setStudents]       = useState<StudentRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState('');
  const [page, setPage]               = useState(1);
  const PAGE_SIZE = 10;

  const load = useCallback(async () => {
    if (!offeringId) return;
    setLoading(true);
    const supabase = createClient();

    // Verify instructor owns this offering
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setError('Not authenticated.'); setLoading(false); return; }
    const { data: appUser } = await supabase.from('users').select('id').eq('auth_user_id', authData.user.id).single();
    if (!appUser) { setError('User not found.'); setLoading(false); return; }
    const instructorId = (appUser as any).id;

    const { data: ci } = await supabase.from('course_instructors').select('id').eq('offering_id', offeringId).eq('instructor_id', instructorId).single();
    if (!ci) { setError('You are not assigned to this course.'); setLoading(false); return; }

    // Course info
    const { data: offering } = await supabase
      .from('course_offerings')
      .select(`section_name, courses!fk_course_offerings_course(code,title), academic_terms!fk_course_offerings_term(term_name)`)
      .eq('id', offeringId)
      .single();
    if (offering) {
      const o = offering as any;
      setCourseInfo({
        courseCode:  o.courses?.code ?? '—',
        courseTitle: o.courses?.title ?? '—',
        termName:    o.academic_terms?.term_name ?? '—',
        sectionName: o.section_name ?? 'A',
      });
    }

    // Dynamic columns: quizzes → assignments → midterm → final
    const [{ data: assessRes }, { data: assignRes }] = await Promise.all([
      supabase.from('assessments').select('id, title, type, total_marks').eq('offering_id', offeringId).neq('status', 'archived').order('created_at'),
      supabase.from('assignments').select('id, title, max_score').eq('offering_id', offeringId).neq('status', 'archived').order('created_at'),
    ]);

    const assessments = (assessRes ?? []) as any[];
    const assignments = (assignRes ?? []) as any[];

    const cols: Column[] = [
      ...assessments.filter(a => a.type === 'quiz').map((a: any): Column => ({ id: a.id, title: a.title, colType: 'assessment', maxScore: a.total_marks })),
      ...assignments.map((a: any): Column => ({ id: a.id, title: a.title, colType: 'assignment', maxScore: a.max_score })),
      ...assessments.filter(a => a.type === 'midterm').map((a: any): Column => ({ id: a.id, title: a.title, colType: 'assessment', maxScore: a.total_marks })),
      ...assessments.filter(a => a.type === 'final_exam').map((a: any): Column => ({ id: a.id, title: a.title, colType: 'assessment', maxScore: a.total_marks })),
    ];
    setColumns(cols);

    // All active enrollments for this offering (no FK hints, no created_at)
    const { data: enrollments, error: enrErr } = await supabase
      .from('enrollments')
      .select('id, student_id, final_score, final_grade')
      .eq('offering_id', offeringId)
      .eq('status', 'active')
      .order('enrolled_at');

    if (enrErr) { console.error('[Gradebook] enrollments:', enrErr); setError('Failed to load students.'); setLoading(false); return; }
    if (!enrollments?.length) { setStudents([]); setLoading(false); return; }

    const enrollmentIds = (enrollments as any[]).map(e => e.id);
    const studentIds    = (enrollments as any[]).map(e => e.student_id);

    // Fetch student names + profiles separately
    const [{ data: userRows }, { data: profiles }] = await Promise.all([
      supabase.from('users').select('id, first_name, last_name').in('id', studentIds),
      supabase.from('student_profiles').select('user_id, student_no').in('user_id', studentIds),
    ]);
    const userMap: Record<string, any> = {};
    ((userRows ?? []) as any[]).forEach(u => { userMap[u.id] = u; });
    const profileMap: Record<string, string> = {};
    ((profiles ?? []) as any[]).forEach((p: any) => { profileMap[p.user_id] = p.student_no ?? '—'; });

    // Gradebook items for all enrollments
    const { data: gbItems } = await supabase
      .from('gradebook_items')
      .select('enrollment_id, assessment_id, assignment_id, raw_score')
      .in('enrollment_id', enrollmentIds);

    // Build lookup: enrollmentId → { itemId → raw_score }
    const scoresByEnrollment: Record<string, Record<string, number | null>> = {};
    ((gbItems ?? []) as any[]).forEach(g => {
      const eid  = g.enrollment_id;
      const iid  = g.assessment_id ?? g.assignment_id;
      if (!scoresByEnrollment[eid]) scoresByEnrollment[eid] = {};
      if (iid) scoresByEnrollment[eid][iid] = g.raw_score;
    });

    const rows: StudentRow[] = (enrollments as any[]).map(e => {
      const u = userMap[e.student_id] ?? {};
      const eid = e.id;
      const envScores = scoresByEnrollment[eid] ?? {};
      const scores: Record<string, StudentScore> = {};
      for (const col of cols) {
        scores[col.id] = { raw: envScores[col.id] ?? null, total: col.maxScore };
      }
      return {
        enrollmentId: eid,
        studentId:    e.student_id,
        name:         `${u.first_name ?? ''} ${(u.last_name ?? '').charAt(0)}.`.trim(),
        studentNo:    profileMap[e.student_id] ?? '—',
        scores,
        finalScore:   e.final_score ?? null,
        finalGrade:   e.final_grade ?? null,
      };
    });

    setStudents(rows);
    setLoading(false);
  }, [offeringId]);

  useEffect(() => { load(); }, [load]);

  // ── Search + pagination ───────────────────────────────────────────────────
  const filtered = students.filter(s => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || s.studentNo.toLowerCase().includes(q);
  });
  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage    = Math.min(page, totalPages);
  const pageStudents = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ── Class averages ────────────────────────────────────────────────────────
  const classAvg: Record<string, number | null> = {};
  for (const col of columns) {
    const vals = students.map(s => s.scores[col.id]?.raw).filter(v => v != null) as number[];
    classAvg[col.id] = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  }
  const gradedStudents   = students.filter(s => s.finalScore != null);
  const avgFinalScore    = gradedStudents.length > 0
    ? Math.round(gradedStudents.reduce((s, st) => s + st.finalScore!, 0) / gradedStudents.length * 100) / 100
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Gradebook — {courseInfo?.courseTitle ?? '…'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {courseInfo?.termName} · Section {courseInfo?.sectionName ?? 'A'}
            {columns.length > 0 && (
              <span className="ml-3 text-gray-400">
                {columns.length} item{columns.length !== 1 ? 's' : ''} · {students.length} student{students.length !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/instructor/courses/${offeringId}/students`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4c1d95] text-white text-sm font-medium hover:bg-[#3b1677]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            View Students
          </Link>
          {students.length > 0 && (
            <button
              type="button"
              onClick={() => exportCSV(courseInfo, columns, students)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Search bar */}
      {students.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or student no…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/30 focus:border-[#4c1d95]"
            />
          </div>
          {search && (
            <span className="text-xs text-gray-500">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      )}

      {columns.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">📋</span>
          <p className="text-gray-400 font-medium">No assessments or assignments yet.</p>
          <p className="text-gray-400 text-sm mt-1">Add assessments and assignments to this course to see the gradebook.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">🔍</span>
          <p className="text-gray-400 font-medium">No students match "{search}".</p>
        </div>
      ) : students.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">👥</span>
          <p className="text-gray-400 font-medium">No enrolled students.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 sticky left-0 bg-gray-50 z-10 min-w-[180px]">Student</th>
                  {columns.map(col => (
                    <th key={col.id} className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-3 min-w-[100px]">
                      <div className="truncate max-w-[120px] mx-auto" title={col.title}>{col.title}</div>
                      <div className="text-[10px] font-normal text-gray-400 normal-case">/{col.maxScore}</div>
                    </th>
                  ))}
                  <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-3 min-w-[90px]">Score</th>
                  <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-3 min-w-[70px]">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageStudents.map(student => (
                  <tr key={student.enrollmentId} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 sticky left-0 bg-white z-10">
                      <div className="font-medium text-gray-900 text-sm">{student.name}</div>
                      <div className="text-xs text-gray-400">{student.studentNo}</div>
                    </td>
                    {columns.map(col => {
                      const sc = student.scores[col.id];
                      return (
                        <td key={col.id} className="px-3 py-3 text-center">
                          {sc?.raw != null
                            ? <span className="font-semibold text-gray-900">{sc.raw}<span className="text-gray-400 text-xs font-normal">/{sc.total}</span></span>
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-center">
                      {student.finalScore != null
                        ? <span className="font-semibold text-gray-800">{student.finalScore.toFixed(1)}%</span>
                        : <span className="text-gray-300 text-xs">pend.</span>
                      }
                    </td>
                    <td className="px-3 py-3 text-center">
                      {student.finalGrade
                        ? <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(student.finalGrade)}`}>{student.finalGrade}</span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                  </tr>
                ))}

                {/* Class averages row */}
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                  <td className="px-4 py-3 sticky left-0 bg-gray-50 z-10 text-xs text-gray-600 uppercase tracking-wider">Class Average</td>
                  {columns.map(col => (
                    <td key={col.id} className="px-3 py-3 text-center text-sm text-gray-700">
                      {classAvg[col.id] != null ? classAvg[col.id] : <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center text-sm text-gray-700">
                    {avgFinalScore != null ? `${avgFinalScore.toFixed(1)}%` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {avgFinalScore != null && (() => {
                      const g = getLetterGrade(avgFinalScore);
                      return <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(g)}`}>{g}</span>;
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Showing {filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} student{filtered.length !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="px-2.5 py-1.5 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-2.5 py-1.5 text-xs rounded-md border ${
                    p === safePage
                      ? 'bg-[#4c1d95] text-white border-[#4c1d95]'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="px-2.5 py-1.5 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
