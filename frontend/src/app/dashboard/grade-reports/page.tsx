'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getLetterGrade, getGpaPoints } from '@/utils/gradeCalculator';

// ─── Types ────────────────────────────────────────────────────────────────────

type CourseRow = {
  enrollmentId:    string;
  offeringId:      string;
  courseCode:      string;
  courseTitle:     string;
  creditHours:     number;
  termName:        string;
  academicYear:    string;
  finalScore:      number | null;
  finalGrade:      string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveGrade(score: number | null): string | null {
  if (score == null) return null;
  return getLetterGrade(score);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GradeReportsPage() {
  const [studentName,   setStudentName]   = useState('');
  const [studentNo,     setStudentNo]     = useState<string | null>(null);
  const [courses,       setCourses]       = useState<CourseRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [academicYears, setAcademicYears] = useState<string[]>([]);
  const [selectedYear,  setSelectedYear]  = useState<string>('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const supabase = createClient();

      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setLoading(false); return; }

      const { data: appUser } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .eq('auth_user_id', authData.user.id)
        .single();
      if (!appUser) { setLoading(false); return; }

      const uid = (appUser as any).id;
      setStudentName(
        `${(appUser as any).first_name ?? ''} ${(appUser as any).last_name ?? ''}`.trim() || 'Student'
      );

      const { data: sp } = await supabase
        .from('student_profiles')
        .select('student_no')
        .eq('user_id', uid)
        .maybeSingle();
      setStudentNo((sp as any)?.student_no ?? null);

      const { data: rows, error: enrollErr } = await supabase
        .from('enrollments')
        .select(`
          id, final_score, final_grade,
          offering_id,
          course_offerings!fk_enrollments_offering(
            id,
            courses!fk_course_offerings_course(code, title, credit_hours),
            academic_terms!fk_course_offerings_term(term_name, academic_year_label)
          )
        `)
        .eq('student_id', uid)
        .in('status', ['active', 'completed'])
        .order('enrolled_at', { ascending: false });

      if (enrollErr) console.error('[GradeReports] enrollments query error:', enrollErr);
      console.log('[GradeReports] rows:', rows?.length, rows);

      const mapped: CourseRow[] = ((rows ?? []) as any[]).map(r => {
        const o     = r.course_offerings ?? {};
        const c     = o.courses ?? {};
        const t     = o.academic_terms ?? {};
        const score = r.final_score ?? null;
        const grade = r.final_grade ? r.final_grade : deriveGrade(score);
        return {
          enrollmentId: r.id,
          offeringId:   r.offering_id,
          courseCode:   c.code ?? '—',
          courseTitle:  c.title ?? '—',
          creditHours:  c.credit_hours ?? 3,
          termName:     t.term_name ?? '—',
          academicYear: t.academic_year_label ?? '—',
          finalScore:   score,
          finalGrade:   grade,
        };
      });

      setCourses(mapped);

      const years = [...new Set(mapped.map(r => r.academicYear))].sort().reverse();
      setAcademicYears(years);
      setSelectedYear(years[0] ?? 'all');
      setLoading(false);
    })();
  }, []);

  // ── Derived data ─────────────────────────────────────────────────────────

  const yearCourses = selectedYear === 'all'
    ? courses
    : courses.filter(c => c.academicYear === selectedYear);

  const graded  = yearCourses.filter(c => c.finalGrade != null);
  const pending = yearCourses.filter(c => c.finalGrade == null);

  const totalGradedCredits = graded.reduce((s, c) => s + c.creditHours, 0);
  const totalQualityPts    = graded.reduce((s, c) => s + getGpaPoints(c.finalGrade!) * c.creditHours, 0);
  const gpa = totalGradedCredits > 0
    ? Math.round((totalQualityPts / totalGradedCredits) * 100) / 100
    : null;

  const allSameCredits = graded.length > 0 && graded.every(c => c.creditHours === graded[0].creditHours);
  const gpaLabel = graded.length > 0
    ? allSameCredits
      ? `GPA (${graded.length} graded × ${graded[0].creditHours} credits each):`
      : `GPA (${graded.length} graded, varying credits):`
    : null;

  const gpaFormula = graded.length > 0
    ? `(${graded.map(c => getGpaPoints(c.finalGrade!).toFixed(1)).join(' + ')}) / ${graded.length} = ${gpa?.toFixed(2)}`
    : null;

  if (loading) return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-3 animate-pulse">
        <div className="h-7 bg-gray-200 rounded w-64" />
        <div className="h-4 bg-gray-100 rounded w-40" />
        <div className="h-72 bg-gray-100 rounded-xl mt-4" />
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl" aria-hidden>📑</span>
              <h1 className="text-2xl font-bold text-gray-900">Grade Report</h1>
            </div>
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-800">{studentName}</span>
              {studentNo && <span className="ml-2 text-gray-400">· #{studentNo}</span>}
            </p>
          </div>

          {/* Academic year selector */}
          {academicYears.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">Academic Year</label>
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95]"
              >
                {academicYears.map(y => (
                  <option key={y} value={y}>{y === '—' ? 'All courses' : y}</option>
                ))}
              </select>
            </div>
          )}
          {academicYears.length === 1 && (
            <div className="text-sm text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
              Academic Year: <span className="font-semibold text-gray-800">{selectedYear === '—' ? 'All courses' : selectedYear}</span>
            </div>
          )}
        </div>

        {/* ── Table ──────────────────────────────────────────────────────── */}
        {yearCourses.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <span className="text-4xl block mb-3">📋</span>
            <p className="text-gray-400 font-medium">No courses found for this academic year.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_88px_72px_72px] gap-x-3 px-5 py-3 border-b-2 border-gray-200 bg-gray-50">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Course</span>
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider text-right">Score</span>
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider text-center">Grade</span>
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider text-center">GPA Pts</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-100">
              {[...graded, ...pending].map((row) => {
                const isGraded = row.finalGrade != null;
                const gpaPts   = isGraded ? getGpaPoints(row.finalGrade!) : null;

                return (
                  <div
                    key={row.enrollmentId}
                    className={`grid grid-cols-[1fr_88px_72px_72px] gap-x-3 px-5 py-3 items-center ${
                      !isGraded ? 'opacity-60' : 'hover:bg-gray-50/70'
                    }`}
                  >
                    {/* Course name */}
                    <div className="min-w-0">
                      <span className={`text-sm font-medium ${!isGraded ? 'text-gray-500' : 'text-gray-900'}`}>
                        {row.courseTitle}
                      </span>
                      <span className="ml-1.5 text-xs text-gray-400">({row.creditHours} cr)</span>
                      <p className="text-[11px] text-gray-400 mt-0.5">{row.termName}</p>
                    </div>

                    {/* Score */}
                    <div className="text-right">
                      {row.finalScore != null ? (
                        <span className={`text-sm font-semibold tabular-nums ${
                          row.finalScore >= 90 ? 'text-green-600' :
                          row.finalScore >= 80 ? 'text-blue-600'  :
                          row.finalScore >= 70 ? 'text-amber-600' :
                          'text-red-500'
                        }`}>
                          {row.finalScore.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-300">—</span>
                      )}
                    </div>

                    {/* Grade */}
                    <div className="text-center">
                      {!isGraded ? (
                        <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          Pending
                        </span>
                      ) : (
                        <span className={`text-sm font-bold ${
                          row.finalGrade === 'A'  || row.finalGrade === 'A+' ? 'text-green-700' :
                          row.finalGrade === 'A-'                             ? 'text-green-600' :
                          row.finalGrade === 'B+' || row.finalGrade === 'B'  ? 'text-blue-700'  :
                          row.finalGrade === 'B-'                             ? 'text-blue-600'  :
                          row.finalGrade === 'C+' || row.finalGrade === 'C'  ? 'text-amber-700' :
                          'text-red-600'
                        }`}>
                          {row.finalGrade}
                        </span>
                      )}
                    </div>

                    {/* GPA Pts */}
                    <div className="text-center">
                      {gpaPts != null ? (
                        <span className={`text-sm font-bold tabular-nums ${
                          gpaPts >= 3.7 ? 'text-green-600' :
                          gpaPts >= 3.0 ? 'text-blue-600'  :
                          gpaPts >= 2.0 ? 'text-amber-600' :
                          'text-red-500'
                        }`}>
                          {gpaPts.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-300">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Divider before GPA */}
            <div className="border-t-2 border-gray-200 mx-5" />

            {/* GPA summary */}
            <div className="px-5 py-4 bg-gray-50/60">
              {gpa != null ? (
                <div className="space-y-1">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">{gpaLabel}</span>
                  </p>
                  {gpaFormula && (
                    <p className="text-sm text-[#4c1d95] font-mono pl-4">
                      {gpaFormula}
                    </p>
                  )}
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-2xl font-bold text-gray-900">{gpa.toFixed(2)}</span>
                    <span className="text-sm text-gray-500">Cumulative GPA · {totalGradedCredits} credits</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">GPA will be available once courses are graded.</p>
              )}
            </div>

          </div>
        )}

        {/* ── Print hint ──────────────────────────────────────────────────── */}
        {yearCourses.length > 0 && (
          <p className="text-xs text-gray-400 text-center mt-4">
            Use your browser's print function (Ctrl+P) to save or print this report.
          </p>
        )}

      </div>
    </div>
  );
}
