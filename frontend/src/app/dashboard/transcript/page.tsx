'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// ─── Ethiopian grade scale (must match grade_scale seed) ─────────────────────
const SCALE: Record<string, { gradePoint: number; countsInGpa: boolean; isPassing: boolean }> = {
  'A':  { gradePoint: 4.00, countsInGpa: true,  isPassing: true  },
  'A-': { gradePoint: 3.75, countsInGpa: true,  isPassing: true  },
  'B+': { gradePoint: 3.50, countsInGpa: true,  isPassing: true  },
  'B':  { gradePoint: 3.00, countsInGpa: true,  isPassing: true  },
  'B-': { gradePoint: 2.75, countsInGpa: true,  isPassing: true  },
  'C+': { gradePoint: 2.50, countsInGpa: true,  isPassing: true  },
  'C':  { gradePoint: 2.00, countsInGpa: true,  isPassing: true  },
  'C-': { gradePoint: 1.75, countsInGpa: true,  isPassing: true  },
  'D':  { gradePoint: 1.00, countsInGpa: true,  isPassing: true  },
  'F':  { gradePoint: 0.00, countsInGpa: true,  isPassing: false },
  'I':  { gradePoint: 0.00, countsInGpa: false, isPassing: false },
  'W':  { gradePoint: 0.00, countsInGpa: false, isPassing: false },
  'NG': { gradePoint: 0.00, countsInGpa: false, isPassing: false },
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function standing(semGpa: number): { label: string; cls: string } {
  if (semGpa >= 3.50) return { label: "Dean's List",       cls: 'bg-green-100  text-green-800  border border-green-200'  };
  if (semGpa >= 2.00) return { label: 'Good Standing',     cls: 'bg-blue-100   text-blue-800   border border-blue-200'   };
  if (semGpa >= 1.50) return { label: 'Academic Probation',cls: 'bg-orange-100 text-orange-800 border border-orange-200' };
  return                     { label: 'Dismissal Warning', cls: 'bg-red-100    text-red-800    border border-red-200'    };
}

function gradeBadge(g: string | null) {
  if (!g) return 'bg-gray-100 text-gray-400';
  if (['A','A-'].includes(g))         return 'bg-green-100  text-green-800';
  if (['B+','B','B-'].includes(g))    return 'bg-blue-100   text-blue-800';
  if (['C+','C','C-'].includes(g))    return 'bg-yellow-100 text-yellow-800';
  if (g === 'D')                      return 'bg-orange-100 text-orange-800';
  if (g === 'F')                      return 'bg-red-100    text-red-700';
  return 'bg-gray-100 text-gray-500';
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CourseRow = {
  courseId:     string;
  code:         string;
  title:        string;
  credits:      number;
  grade:        string | null;
  finalScore:   number | null;
  status:       string;
  isRetaken:    boolean;
};

type TermGroup = {
  termId:   string;
  termName: string;
  termYear: number;
  courses:  CourseRow[];
};

type TermCalc = TermGroup & {
  semCredits:    number;
  semQPs:        number;
  semGpa:        number;
  cumCredits:    number;
  cumQPs:        number;
  cumGpa:        number;
  coursesPassed: number;
  coursesFailed: number;
};

type StudentInfo = {
  firstName:  string;
  lastName:   string;
  studentNo:  string | null;
  program:    string;
  email:      string;
  admissionYear: number | null;
};

// ─── Calculation helper ───────────────────────────────────────────────────────

function computeTerms(rawTerms: TermGroup[]): TermCalc[] {
  let cumCredits = 0;
  let cumQPs     = 0;

  // Per-course, determine "latest" enrollment across all terms
  const latestByCourse = new Map<string, string>(); // courseId → enrollmentId (use termIndex)
  rawTerms.forEach((t, ti) => {
    t.courses.forEach(c => {
      if (c.status !== 'withdrawn') latestByCourse.set(c.courseId, `${ti}:${c.courseId}`);
    });
  });

  return rawTerms.map((t, ti) => {
    let semCredits = 0;
    let semQPs     = 0;
    let passed = 0, failed = 0;

    // Mark retaken
    const courses: CourseRow[] = t.courses.map(c => {
      const isLatest = latestByCourse.get(c.courseId) === `${ti}:${c.courseId}`;
      return { ...c, isRetaken: !isLatest && c.status !== 'withdrawn' };
    });

    for (const c of courses) {
      const e = SCALE[c.grade ?? ''];
      if (!c.isRetaken && e?.countsInGpa && c.status !== 'withdrawn' && c.grade) {
        semCredits += c.credits;
        semQPs     += e.gradePoint * c.credits;
      }
      if (!c.isRetaken && c.status !== 'withdrawn' && c.grade) {
        if (e?.isPassing) passed++; else failed++;
      }
    }

    const semGpa = semCredits > 0 ? r2(semQPs / semCredits) : 0;
    cumCredits  += semCredits;
    cumQPs      += semQPs;
    const cumGpa = cumCredits > 0 ? r2(cumQPs / cumCredits) : 0;

    return {
      ...t,
      courses,
      semCredits,
      semQPs:        r2(semQPs),
      semGpa,
      cumCredits,
      cumQPs:        r2(cumQPs),
      cumGpa,
      coursesPassed: passed,
      coursesFailed: failed,
    };
  });
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(si: StudentInfo | null, terms: TermCalc[]) {
  const rows: string[][] = [];
  rows.push(['MULE UNIVERSITY — Unofficial Academic Transcript']);
  rows.push([]);
  rows.push(['Student', `${si?.firstName ?? ''} ${si?.lastName ?? ''}`.trim()]);
  rows.push(['Student No', si?.studentNo ?? '—']);
  rows.push(['Program', si?.program ?? '—']);
  rows.push(['Date Printed', new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })]);
  rows.push([]);

  for (const t of terms) {
    rows.push([t.termName, String(t.termYear)]);
    rows.push(['Code','Title','Cr.','Grade','Pts','QP']);
    for (const c of t.courses) {
      const e = SCALE[c.grade ?? ''];
      rows.push([c.code, c.title, String(c.credits), c.grade ?? '—', c.isRetaken ? '—' : String(e?.gradePoint ?? 0), c.isRetaken ? '—' : String(r2((e?.gradePoint ?? 0) * c.credits))]);
    }
    rows.push([`Sem. Credits: ${t.semCredits}`, `Sem. GPA: ${t.semGpa.toFixed(2)}`, `Cum. GPA: ${t.cumGpa.toFixed(2)}`]);
    rows.push([]);
  }

  const last = terms[terms.length - 1];
  rows.push(['TOTALS']);
  rows.push(['Cumulative Credits', String(last?.cumCredits ?? 0)]);
  rows.push(['Cumulative GPA',     last?.cumGpa.toFixed(2) ?? '—']);

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `transcript-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function TranscriptPage() {
  const [rawTerms, setRawTerms]     = useState<TermGroup[]>([]);
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [pdfLoading, setPdfLoading]   = useState(false);
  const [gradeScaleOpen, setGradeScaleOpen] = useState(false);

  const [studentId, setStudentId] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { setError('Not authenticated'); setLoading(false); return; }

        const { data: u } = await supabase
          .from('users')
          .select('id, first_name, last_name, email, created_at')
          .eq('auth_user_id', authUser.id)
          .single();
        if (!u) { setError('User not found'); setLoading(false); return; }

        const uid = (u as any).id;
        setStudentId(uid);

        const { data: sp } = await supabase
          .from('student_profiles')
          .select('student_no, program, program_id')
          .eq('user_id', uid)
          .maybeSingle();

        let programName = (sp as any)?.program ?? '—';
        if ((sp as any)?.program_id) {
          const { data: prog } = await supabase
            .from('academic_programs').select('name').eq('id', (sp as any).program_id).maybeSingle();
          if (prog) programName = (prog as any).name;
        } else if ((sp as any)?.program) {
          // program might be a UUID or a name
          const { data: prog } = await supabase
            .from('academic_programs').select('name').eq('id', (sp as any).program).maybeSingle();
          if (prog) programName = (prog as any).name;
        }

        const admYear = (u as any).created_at ? new Date((u as any).created_at).getFullYear() : null;

        setStudentInfo({
          firstName:     (u as any).first_name ?? '',
          lastName:      (u as any).last_name  ?? '',
          studentNo:     (sp as any)?.student_no ?? null,
          program:       programName,
          email:         (u as any).email ?? '',
          admissionYear: admYear,
        });

        const { data: enrollments } = await supabase
          .from('enrollments')
          .select('id, status, final_grade, final_score, course_offerings(courses(id, code, title, credit_hours), academic_terms(id, term_name, year_start))')
          .eq('student_id', uid)
          .order('enrolled_at', { ascending: true });

        const termMap: Record<string, TermGroup> = {};
        ((enrollments ?? []) as any[]).forEach(e => {
          const co     = e.course_offerings;
          const course = Array.isArray(co?.courses)        ? co.courses[0]        : co?.courses;
          const term   = Array.isArray(co?.academic_terms) ? co.academic_terms[0] : co?.academic_terms;
          if (!term || !course) return;

          if (!termMap[term.id]) {
            termMap[term.id] = { termId: term.id, termName: term.term_name, termYear: term.year_start ?? 0, courses: [] };
          }
          termMap[term.id].courses.push({
            courseId:   course.id,
            code:       course.code,
            title:      course.title,
            credits:    course.credit_hours ?? 3,
            grade:      e.final_grade,
            finalScore: e.final_score,
            status:     e.status,
            isRetaken:  false,
          });
        });

        setRawTerms(Object.values(termMap).sort((a, b) => a.termYear - b.termYear));
      } catch (err: any) {
        setError(err.message ?? 'Failed to load transcript');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const terms = useMemo(() => computeTerms(rawTerms), [rawTerms]);
  const last  = terms[terms.length - 1];
  const cgpa  = last?.cumGpa ?? 0;

  const graduation = cgpa >= 3.75 ? 'Great Distinction'
    : cgpa >= 3.50 ? 'Distinction'
    : cgpa >= 3.00 ? 'Very Great Credit'
    : cgpa >= 2.75 ? 'Great Credit'
    : cgpa >= 2.00 ? 'Credit'
    : null;

  const downloadPdf = async () => {
    if (!studentId) return;
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/transcript/${studentId}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `transcript-${studentInfo?.studentNo ?? studentId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message ?? 'PDF generation failed');
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-6 bg-gray-200 rounded w-48" />
        <div className="h-32 bg-gray-200 rounded-xl" />
        <div className="h-96 bg-gray-200 rounded-xl" />
      </div>
    </div>
  );

  if (error) return (
    <div className="flex-1 p-8">
      <div className="max-w-4xl mx-auto p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Breadcrumb + actions */}
        <div className="flex items-center justify-between no-print">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-purple-700">Home</Link>
            <span>›</span>
            <span className="text-gray-900 font-medium">My Transcript</span>
          </nav>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => terms.length && exportCSV(studentInfo, terms)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              CSV
            </button>
            <button type="button" onClick={downloadPdf} disabled={pdfLoading}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              {pdfLoading ? 'Generating…' : 'PDF'}
            </button>
            <button type="button" onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#4c1d95] text-white text-sm rounded-lg hover:bg-[#5b21b6]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Print
            </button>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 no-print">
          This is an <strong>unofficial transcript</strong>. For an official copy contact the Registrar Office.
        </div>

        {/* Header */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-center mb-5">
            <h1 className="text-lg font-bold text-gray-900 tracking-wide uppercase">Mule University</h1>
            <p className="text-xs text-gray-500 mt-0.5">Learning Management System</p>
            <div className="my-3 border-t border-gray-300" />
            <p className="text-sm font-bold text-gray-700 tracking-widest uppercase">Unofficial Academic Transcript</p>
            <div className="my-3 border-t border-gray-300" />
          </div>
          <div className="grid grid-cols-2 gap-y-2 gap-x-8 text-sm">
            {[
              ['Student', `${studentInfo?.firstName} ${studentInfo?.lastName}`],
              ['Student No', studentInfo?.studentNo ?? '—'],
              ['Program', studentInfo?.program ?? '—'],
              ['Admission Year', studentInfo?.admissionYear ? String(studentInfo.admissionYear) : '—'],
              ['Email', studentInfo?.email ?? '—'],
              ['Date Printed', new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })],
            ].map(([label, val]) => (
              <div key={label}>
                <span className="text-gray-500">{label}: </span>
                <span className="font-medium text-gray-900">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Terms */}
        {terms.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
            No course history found.
          </div>
        ) : (
          <div className="space-y-5">
            {terms.map((t, i) => {
              const { label: standLabel, cls: standCls } = t.semCredits > 0 ? standing(t.semGpa) : { label: '—', cls: 'bg-gray-100 text-gray-500' };
              return (
                <div key={t.termId} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {/* Term header */}
                  <div className="px-5 py-3 bg-[#4c1d95] text-white flex items-center justify-between">
                    <span className="font-semibold text-sm">{t.termName} {t.termYear ? `(${t.termYear})` : ''}</span>
                    {t.semCredits > 0 && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${standCls}`}>
                        {standLabel}
                      </span>
                    )}
                  </div>

                  {/* Courses table */}
                  <table className="w-full text-sm">
                    <thead className="text-[11px] text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left w-6">#</th>
                        <th className="px-4 py-2 text-left">Code</th>
                        <th className="px-4 py-2 text-left">Course Title</th>
                        <th className="px-4 py-2 text-right">Cr.</th>
                        <th className="px-4 py-2 text-right">Grade</th>
                        <th className="px-4 py-2 text-right">Pts</th>
                        <th className="px-4 py-2 text-right">QP</th>
                        <th className="px-4 py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {t.courses.map((c, ci) => {
                        const entry = SCALE[c.grade ?? ''];
                        const isFail = c.grade === 'F';
                        const isW    = c.status === 'withdrawn' || c.grade === 'W';
                        const rowCls = c.isRetaken ? 'opacity-50 bg-gray-50'
                          : isFail ? 'bg-red-50'
                          : isW    ? 'bg-gray-50'
                          : ci % 2 === 0 ? '' : 'bg-gray-50/50';
                        return (
                          <tr key={c.courseId + ci} className={`${rowCls} hover:bg-purple-50/30`}>
                            <td className="px-4 py-2.5 text-gray-400 text-xs">{ci + 1}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{c.code}</td>
                            <td className="px-4 py-2.5 text-gray-800">
                              {c.title}
                              {c.isRetaken && <span className="ml-2 text-[10px] bg-gray-200 text-gray-500 px-1 py-0.5 rounded">Retaken</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-600">{c.credits}</td>
                            <td className="px-4 py-2.5 text-right">
                              {c.grade
                                ? <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${gradeBadge(c.grade)}`}>{c.grade}</span>
                                : <span className="text-gray-300 text-xs">—</span>
                              }
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-600 text-xs">
                              {c.isRetaken || !entry ? '—' : entry.gradePoint.toFixed(2)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-700 text-xs font-medium">
                              {c.isRetaken || !entry || !entry.countsInGpa ? '—'
                                : r2(entry.gradePoint * c.credits).toFixed(2)}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {c.isRetaken
                                ? <span className="text-[10px] text-gray-400">Retaken</span>
                                : c.status === 'withdrawn' || c.grade === 'W'
                                ? <span className="text-[10px] text-gray-400">Withdrawn</span>
                                : c.grade === 'F'
                                ? <span className="text-[10px] text-red-600 font-semibold">Failed</span>
                                : entry?.isPassing
                                ? <span className="text-[10px] text-green-700 font-semibold">Pass</span>
                                : <span className="text-[10px] text-gray-400">—</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Term summary footer */}
                  <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                    <span className="text-gray-500">Credits: <strong className="text-gray-900">{t.semCredits}</strong></span>
                    <span className="text-gray-500">Quality Pts: <strong className="text-gray-900">{t.semQPs.toFixed(2)}</strong></span>
                    {t.semCredits > 0 && (
                      <span className="text-gray-500">Semester GPA: <strong className="text-gray-900">{t.semGpa.toFixed(2)}</strong></span>
                    )}
                    <span className="text-gray-500">Cumulative GPA: <strong className="text-gray-900">{t.cumGpa.toFixed(2)}</strong></span>
                    <span className="text-gray-500">Passed: <strong className="text-green-700">{t.coursesPassed}</strong></span>
                    {t.coursesFailed > 0 && (
                      <span className="text-gray-500">Failed: <strong className="text-red-700">{t.coursesFailed}</strong></span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Overall totals */}
        {terms.length > 0 && last && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-gray-100 border-b border-gray-200">
              <span className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Transcript Totals</span>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 gap-3 text-sm">
              {[
                ['Total Credit Hours',  String(last.cumCredits)],
                ['Total Quality Points', last.cumQPs.toFixed(2)],
                ['Cumulative GPA',       last.cumGpa.toFixed(2) + ' / 4.00'],
                ['Academic Standing',    last.semCredits > 0 ? standing(last.semGpa).label : '—'],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-bold text-gray-900">{val}</span>
                </div>
              ))}
            </div>
            {graduation && (
              <div className="px-5 pb-4 text-center">
                <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-purple-100 text-purple-800 rounded-full text-sm font-semibold">
                  Graduation Classification: {graduation}
                </span>
              </div>
            )}
          </div>
        )}

        {/* CGPA banner */}
        {last && last.cumCredits > 0 && (
          <div className="bg-[#4c1d95] text-white rounded-xl p-5 flex items-center justify-between no-print">
            <div>
              <p className="text-xs uppercase tracking-wider opacity-75 mb-1">Cumulative GPA</p>
              <p className="text-4xl font-bold">{last.cumGpa.toFixed(2)}</p>
              {graduation && <p className="text-xs mt-1 opacity-90">{graduation}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider opacity-75 mb-1">Standing</p>
              <p className="text-sm font-semibold">{standing(last.semGpa).label}</p>
              <p className="text-xs opacity-75 mt-1">{last.cumCredits} credit hrs earned</p>
            </div>
          </div>
        )}

        {/* Grade scale */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden no-print">
          <button type="button" onClick={() => setGradeScaleOpen(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50">
            <span className="font-semibold text-gray-900 text-sm">Grade Scale (Ethiopian University System)</span>
            <svg className={`w-5 h-5 text-gray-400 transition-transform ${gradeScaleOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {gradeScaleOpen && (
            <div className="px-6 pb-4">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="text-left py-1">Grade</th>
                    <th className="text-left py-1">Points</th>
                    <th className="text-left py-1">Range</th>
                    <th className="text-left py-1">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    ['A',  '4.00', '90–100', 'Excellent'],
                    ['A-', '3.75', '85–89',  'Very Good+'],
                    ['B+', '3.50', '80–84',  'Very Good'],
                    ['B',  '3.00', '75–79',  'Good'],
                    ['B-', '2.75', '70–74',  'Above Average'],
                    ['C+', '2.50', '65–69',  'Average+'],
                    ['C',  '2.00', '60–64',  'Average'],
                    ['C-', '1.75', '55–59',  'Below Average'],
                    ['D',  '1.00', '45–54',  'Poor but Passing'],
                    ['F',  '0.00', '0–44',   'Fail'],
                    ['I',  '—',    '—',      'Incomplete (not in GPA)'],
                    ['W',  '—',    '—',      'Withdrawn (not in GPA)'],
                    ['NG', '—',    '—',      'No Grade (not in GPA)'],
                  ].map(([g, p, r, d]) => (
                    <tr key={g}>
                      <td className="py-1.5 font-bold text-gray-800">{g}</td>
                      <td className="py-1.5 text-gray-600">{p}</td>
                      <td className="py-1.5 text-gray-500">{r}</td>
                      <td className="py-1.5 text-gray-500">{d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
