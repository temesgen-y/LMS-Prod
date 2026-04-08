'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getLetterGrade, getGradeColor } from '@/utils/gradeCalculator';

// ─── Types ─────────────────────────────────────────────────────────────────

type ColType = 'assessment' | 'assignment';

type Column = {
  id:       string;
  title:    string;
  colType:  ColType;
  maxScore: number;
  itemType: string; // quiz | midterm | final_exam | assignment
};

type CellData = {
  status:    'not_submitted' | 'pending' | 'graded';
  score:     number | null;
  attemptId: string | null;
};

type StudentRow = {
  enrollmentId: string;
  studentId:    string;
  name:         string;
  studentNo:    string;
  cells:        Record<string, CellData>; // colId → cell
  finalScore:   number | null;
  finalGrade:   string | null;
};

type CourseInfo = {
  courseCode:  string;
  courseTitle: string;
  sectionName: string;
  termName:    string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  quiz:       'Quiz',
  midterm:    'Midterm',
  final_exam: 'Final',
  assignment: 'Asgn',
};

const TYPE_COLOR: Record<string, string> = {
  quiz:       'bg-blue-50 text-blue-700 border-blue-200',
  midterm:    'bg-purple-50 text-purple-700 border-purple-200',
  final_exam: 'bg-red-50 text-red-700 border-red-200',
  assignment: 'bg-amber-50 text-amber-700 border-amber-200',
};

function CellBadge({ cell, maxScore }: { cell: CellData; maxScore: number }) {
  if (cell.status === 'not_submitted') {
    return <span className="text-xs text-gray-300 font-medium">—</span>;
  }
  if (cell.status === 'pending') {
    return (
      <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
        Pending
      </span>
    );
  }
  // graded
  return (
    <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 whitespace-nowrap">
      {cell.score}/{maxScore}
    </span>
  );
}

function exportCSV(courseInfo: CourseInfo | null, columns: Column[], students: StudentRow[]) {
  const header = [
    'Student', 'Student No',
    ...columns.map(c => `${c.title} (/${c.maxScore})`),
    'Final Score', 'Final Grade',
  ];
  const rows = students.map(s => [
    s.name,
    s.studentNo,
    ...columns.map(c => {
      const cell = s.cells[c.id];
      if (!cell || cell.status === 'not_submitted') return '—';
      if (cell.status === 'pending') return 'Pending';
      return cell.score != null ? String(cell.score) : '—';
    }),
    s.finalScore != null ? s.finalScore.toFixed(1) : '—',
    s.finalGrade ?? '—',
  ]);
  const csv = [header, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `students-${courseInfo?.courseCode ?? 'export'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function CourseStudentsPage() {
  const params     = useParams();
  const offeringId = params?.offeringId as string;

  const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null);
  const [columns, setColumns]       = useState<Column[]>([]);
  const [students, setStudents]     = useState<StudentRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [search, setSearch]         = useState('');

  const load = useCallback(async () => {
    if (!offeringId) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      // ── Course info ──────────────────────────────────────────────────
      const { data: offeringData } = await supabase
        .from('course_offerings')
        .select('section_name, courses!fk_course_offerings_course(code, title), academic_terms!fk_course_offerings_term(term_name)')
        .eq('id', offeringId)
        .maybeSingle();

      if (!offeringData) { setError('Course offering not found.'); return; }
      const oc = (offeringData as any).courses ?? {};
      const ot = (offeringData as any).academic_terms ?? {};
      setCourseInfo({
        courseCode:  oc.code ?? '—',
        courseTitle: oc.title ?? '—',
        sectionName: (offeringData as any).section_name ?? '—',
        termName:    ot.term_name ?? '—',
      });

      // ── Assessments (quiz, midterm, final_exam) ──────────────────────
      const { data: assessData } = await supabase
        .from('assessments')
        .select('id, title, type, total_marks')
        .eq('offering_id', offeringId)
        .in('type', ['quiz', 'midterm', 'final_exam'])
        .eq('status', 'published')
        .order('created_at');

      const assessRows = (assessData ?? []) as any[];

      // ── Assignments ──────────────────────────────────────────────────
      const { data: assignData } = await supabase
        .from('assignments')
        .select('id, title, max_score')
        .eq('offering_id', offeringId)
        .order('created_at');

      const assignRows = (assignData ?? []) as any[];

      // ── Build columns ────────────────────────────────────────────────
      const cols: Column[] = [
        ...assessRows.map((a: any) => ({
          id: a.id, title: a.title, colType: 'assessment' as ColType,
          maxScore: a.total_marks ?? 100, itemType: a.type,
        })),
        ...assignRows.map((a: any) => ({
          id: a.id, title: a.title, colType: 'assignment' as ColType,
          maxScore: a.max_score ?? 100, itemType: 'assignment',
        })),
      ];
      setColumns(cols);

      // ── Enrollments ──────────────────────────────────────────────────
      const { data: enrollData } = await supabase
        .from('enrollments')
        .select('id, student_id, final_score, final_grade')
        .eq('offering_id', offeringId)
        .in('status', ['active', 'completed'])
        .order('id');

      const enrollRows = (enrollData ?? []) as any[];
      const studentIds = enrollRows.map((e: any) => e.student_id);

      if (studentIds.length === 0) {
        setStudents([]);
        setLoading(false);
        return;
      }

      // ── Student names + student numbers ──────────────────────────────
      const { data: usersData } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .in('id', studentIds);
      const nameMap: Record<string, string> = {};
      ((usersData ?? []) as any[]).forEach((u: any) => {
        nameMap[u.id] = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || '—';
      });

      const { data: spData } = await supabase
        .from('student_profiles')
        .select('user_id, student_no')
        .in('user_id', studentIds);
      const studentNoMap: Record<string, string> = {};
      ((spData ?? []) as any[]).forEach((sp: any) => {
        studentNoMap[sp.user_id] = sp.student_no ?? '';
      });

      // ── Assessment attempts ──────────────────────────────────────────
      const assessIds = assessRows.map((a: any) => a.id);
      let attemptCells: Record<string, Record<string, CellData>> = {};
      // studentId → assessmentId → cell

      if (assessIds.length > 0) {
        const { data: attData } = await supabase
          .from('assessment_attempts')
          .select('id, student_id, assessment_id, status, score')
          .in('assessment_id', assessIds)
          .in('student_id', studentIds)
          .not('status', 'eq', 'in_progress')
          .order('submitted_at', { ascending: false });

        ((attData ?? []) as any[]).forEach((att: any) => {
          if (!attemptCells[att.student_id]) attemptCells[att.student_id] = {};
          // Only keep latest (first due to descending order) attempt per student+assessment
          if (!attemptCells[att.student_id][att.assessment_id]) {
            const isGraded = att.status === 'graded' && att.score != null;
            attemptCells[att.student_id][att.assessment_id] = {
              status:    isGraded ? 'graded' : 'pending',
              score:     att.score ?? null,
              attemptId: att.id,
            };
          }
        });
      }

      // ── Assignment submissions ────────────────────────────────────────
      const assignIds = assignRows.map((a: any) => a.id);
      let submissionCells: Record<string, Record<string, CellData>> = {};
      // studentId → assignmentId → cell

      if (assignIds.length > 0) {
        const { data: subData } = await supabase
          .from('assignment_submissions')
          .select('id, student_id, assignment_id, status, score, final_score')
          .in('assignment_id', assignIds)
          .in('student_id', studentIds)
          .order('submitted_at', { ascending: false });

        ((subData ?? []) as any[]).forEach((sub: any) => {
          if (!submissionCells[sub.student_id]) submissionCells[sub.student_id] = {};
          if (!submissionCells[sub.student_id][sub.assignment_id]) {
            const rawScore = sub.final_score ?? sub.score ?? null;
            const isGraded = sub.status === 'graded' && rawScore != null;
            submissionCells[sub.student_id][sub.assignment_id] = {
              status:    isGraded ? 'graded' : 'pending',
              score:     rawScore,
              attemptId: sub.id,
            };
          }
        });
      }

      // ── Build student rows ────────────────────────────────────────────
      const enrollByStudent: Record<string, any> = {};
      enrollRows.forEach((e: any) => { enrollByStudent[e.student_id] = e; });

      const rows: StudentRow[] = enrollRows.map((enroll: any) => {
        const sid = enroll.student_id;
        const cells: Record<string, CellData> = {};

        assessIds.forEach((aid: string) => {
          cells[aid] = attemptCells[sid]?.[aid] ?? { status: 'not_submitted', score: null, attemptId: null };
        });
        assignIds.forEach((aid: string) => {
          cells[aid] = submissionCells[sid]?.[aid] ?? { status: 'not_submitted', score: null, attemptId: null };
        });

        return {
          enrollmentId: enroll.id,
          studentId:    sid,
          name:         nameMap[sid] ?? '—',
          studentNo:    studentNoMap[sid] ?? '—',
          cells,
          finalScore:   enroll.final_score ?? null,
          finalGrade:   enroll.final_grade ?? null,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));

      setStudents(rows);
    } catch (err: any) {
      console.error('CourseStudentsPage load error:', err);
      setError(`Failed to load: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [offeringId]);

  useEffect(() => { load(); }, [load]);

  const filtered = search.trim()
    ? students.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.studentNo.toLowerCase().includes(search.toLowerCase())
      )
    : students;

  // Stats
  const totalSubmitted = students.reduce((sum, s) => {
    const any = columns.some(c => s.cells[c.id]?.status !== 'not_submitted');
    return sum + (any ? 1 : 0);
  }, 0);
  const pendingCount = students.reduce((sum, s) => {
    const has = columns.some(c => s.cells[c.id]?.status === 'pending');
    return sum + (has ? 1 : 0);
  }, 0);

  if (loading) return (
    <div className="p-6 space-y-4 animate-pulse max-w-full">
      <div className="h-7 bg-gray-200 rounded w-64 mb-2" />
      <div className="h-5 bg-gray-100 rounded w-40" />
      <div className="grid grid-cols-4 gap-3 mt-4">
        {[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}
      </div>
      <div className="h-64 bg-gray-100 rounded-xl" />
    </div>
  );

  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
        <p className="text-red-700 font-medium">{error}</p>
        <Link href="/instructor/dashboard" className="text-sm text-[#4c1d95] hover:underline mt-3 inline-block">← Back to Dashboard</Link>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-full">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <Link href="/instructor/dashboard" className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 mb-2">
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {courseInfo?.courseCode} — {courseInfo?.courseTitle}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {courseInfo?.sectionName} · {courseInfo?.termName} · Student Submissions
        </p>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Enrolled',    value: students.length,   color: 'text-gray-800' },
          { label: 'Active',      value: totalSubmitted,    color: 'text-blue-600' },
          { label: 'Has Pending', value: pendingCount,      color: 'text-amber-600' },
          { label: 'Assessments', value: columns.length,    color: 'text-[#4c1d95]' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <input
          type="text"
          placeholder="Search by name or student no…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-72 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95]"
        />
        <button
          type="button"
          onClick={() => exportCSV(courseInfo, columns, filtered)}
          className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 flex items-center gap-2 flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">👥</span>
          <p className="text-gray-400 font-medium">
            {students.length === 0 ? 'No enrolled students.' : 'No students match your search.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="sticky left-0 z-10 bg-gray-50 text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  Student
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  No.
                </th>
                {columns.map(col => (
                  <th key={col.id} className="text-center px-3 py-3 max-w-[120px]">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TYPE_COLOR[col.itemType] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                        {TYPE_LABEL[col.itemType] ?? col.itemType}
                      </span>
                      <span className="text-[11px] font-medium text-gray-600 text-center leading-tight line-clamp-2 max-w-[100px]">
                        {col.title}
                      </span>
                      <span className="text-[10px] text-gray-400">/{col.maxScore}</span>
                    </div>
                  </th>
                ))}
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  Final Grade
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(student => (
                <tr key={student.studentId} className="hover:bg-gray-50/50 transition-colors">
                  {/* Student name — sticky */}
                  <td className="sticky left-0 z-10 bg-white px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#4c1d95] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                        {student.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900 whitespace-nowrap">{student.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-gray-500 text-xs whitespace-nowrap">{student.studentNo}</td>

                  {/* Per-column cells */}
                  {columns.map(col => (
                    <td key={col.id} className="px-3 py-3.5 text-center">
                      <CellBadge cell={student.cells[col.id] ?? { status: 'not_submitted', score: null, attemptId: null }} maxScore={col.maxScore} />
                    </td>
                  ))}

                  {/* Final grade */}
                  <td className="px-4 py-3.5 text-center">
                    {student.finalGrade ? (
                      <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-lg ${getGradeColor(student.finalGrade)}`}>
                        {student.finalGrade}
                        {student.finalScore != null && (
                          <span className="ml-1 font-normal opacity-75">({student.finalScore.toFixed(0)})</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>

                  {/* Detail link */}
                  <td className="px-4 py-3.5 text-center">
                    <Link
                      href={`/instructor/courses/${offeringId}/students/${student.studentId}`}
                      className="text-xs font-medium text-[#4c1d95] hover:underline whitespace-nowrap"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
