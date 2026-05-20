'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

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

function standingLabel(gpa: number) {
  if (gpa >= 3.50) return { label: "Dean's List",       color: 'text-green-700',  bg: 'bg-green-100'  };
  if (gpa >= 2.00) return { label: 'Good Standing',     color: 'text-blue-700',   bg: 'bg-blue-100'   };
  if (gpa >= 1.50) return { label: 'Academic Probation',color: 'text-orange-700', bg: 'bg-orange-100' };
  return                  { label: 'Dismissal Warning', color: 'text-red-700',    bg: 'bg-red-100'    };
}

type TermSummary = {
  termId:     string;
  termName:   string;
  termYear:   number;
  semCredits: number;
  semQPs:     number;
  semGpa:     number;
  cumCredits: number;
  cumQPs:     number;
  cumGpa:     number;
  taken:      number;
  passed:     number;
  failed:     number;
};

type ProgramInfo = { name: string; totalRequired: number };

export default function GpaSummaryPage() {
  const [terms, setTerms]           = useState<TermSummary[]>([]);
  const [program, setProgram]       = useState<ProgramInfo | null>(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user: au } } = await supabase.auth.getUser();
      if (!au) { setLoading(false); return; }

      const { data: u } = await supabase.from('users').select('id').eq('auth_user_id', au.id).single();
      if (!u) { setLoading(false); return; }
      const uid = (u as any).id;

      // Program info
      const { data: sp } = await supabase.from('student_profiles').select('program_id, program').eq('user_id', uid).maybeSingle();
      const programId    = (sp as any)?.program_id ?? (sp as any)?.program;
      if (programId) {
        const { data: prog } = await supabase.from('academic_programs').select('name, total_credits').eq('id', programId).maybeSingle();
        if (prog) setProgram({ name: (prog as any).name ?? '—', totalRequired: (prog as any).total_credits ?? 120 });
      }

      // First try semester_gpa table (computed by backend)
      const { data: storedGpa } = await supabase
        .from('semester_gpa')
        .select('*, academic_terms!term_id(term_name, year_start)')
        .eq('student_id', uid)
        .order('calculated_at', { ascending: true });

      if (storedGpa && storedGpa.length > 0) {
        setTerms((storedGpa as any[]).map(r => ({
          termId:     r.term_id,
          termName:   r.academic_terms?.term_name ?? '—',
          termYear:   r.academic_terms?.year_start ?? 0,
          semCredits: r.total_credit_hours,
          semQPs:     r.total_quality_points,
          semGpa:     r.semester_gpa,
          cumCredits: r.cumulative_credit_hours,
          cumQPs:     r.cumulative_quality_points,
          cumGpa:     r.cumulative_gpa,
          taken:      r.courses_taken,
          passed:     r.courses_passed,
          failed:     r.courses_failed,
        })));
        setLoading(false);
        return;
      }

      // Fallback: compute from enrollments
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('id, status, final_grade, course_offerings(courses(id, credit_hours), academic_terms(id, term_name, year_start))')
        .eq('student_id', uid)
        .order('enrolled_at', { ascending: true });

      const termMap = new Map<string, { termId: string; termName: string; termYear: number; items: Array<{ courseId: string; credits: number; grade: string | null; status: string }> }>();
      ((enrollments ?? []) as any[]).forEach(e => {
        const co     = e.course_offerings;
        const course = Array.isArray(co?.courses)        ? co.courses[0]        : co?.courses;
        const term   = Array.isArray(co?.academic_terms) ? co.academic_terms[0] : co?.academic_terms;
        if (!term || !course) return;
        if (!termMap.has(term.id)) termMap.set(term.id, { termId: term.id, termName: term.term_name, termYear: term.year_start ?? 0, items: [] });
        termMap.get(term.id)!.items.push({ courseId: course.id, credits: course.credit_hours ?? 3, grade: e.final_grade, status: e.status });
      });

      const sorted = [...termMap.values()].sort((a, b) => a.termYear - b.termYear);
      // Latest per course
      const latestByCourse = new Map<string, string>();
      sorted.forEach((t, ti) => t.items.forEach(c => { if (c.status !== 'withdrawn') latestByCourse.set(c.courseId, `${ti}`); }));

      let cumCr = 0, cumQP = 0;
      const computed: TermSummary[] = sorted.map((t, ti) => {
        let semCr = 0, semQP = 0, taken = 0, passed = 0, failed = 0;
        t.items.forEach(c => {
          const isLatest = latestByCourse.get(c.courseId) === String(ti);
          const e = SCALE[c.grade ?? ''];
          if (isLatest && e?.countsInGpa && c.status !== 'withdrawn' && c.grade) {
            semCr += c.credits; semQP += e.gradePoint * c.credits;
          }
          if (isLatest && c.status !== 'withdrawn' && c.grade) {
            taken++; if (e?.isPassing) passed++; else failed++;
          }
        });
        const semGpa = semCr > 0 ? r2(semQP / semCr) : 0;
        cumCr += semCr; cumQP += semQP;
        const cumGpa = cumCr > 0 ? r2(cumQP / cumCr) : 0;
        return { termId: t.termId, termName: t.termName, termYear: t.termYear, semCredits: semCr, semQPs: r2(semQP), semGpa, cumCredits: cumCr, cumQPs: r2(cumQP), cumGpa, taken, passed, failed };
      });

      setTerms(computed);
      setLoading(false);
    })();
  }, []);

  const last   = terms[terms.length - 1];
  const cgpa   = last?.cumGpa ?? 0;
  const totalCr = last?.cumCredits ?? 0;
  const maxGpa  = 4.00;

  const graduation = cgpa >= 3.75 ? 'Great Distinction'
    : cgpa >= 3.50 ? 'Distinction'
    : cgpa >= 3.00 ? 'Very Great Credit'
    : cgpa >= 2.75 ? 'Great Credit'
    : cgpa >= 2.00 ? 'Credit'
    : null;

  const progPct = program ? Math.min(100, Math.round((totalCr / program.totalRequired) * 100)) : 0;

  if (loading) return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-64" />
        <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}</div>
        <div className="h-48 bg-gray-200 rounded-xl" />
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/dashboard" className="hover:text-purple-700">Home</Link>
          <span>›</span>
          <Link href="/dashboard/grades" className="hover:text-purple-700">My Grades</Link>
          <span>›</span>
          <span className="text-gray-900 font-medium">GPA Summary</span>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Cumulative GPA', value: cgpa.toFixed(2), sub: '/ 4.00', color: cgpa >= 2.00 ? 'text-green-700' : 'text-red-700' },
            { label: 'Total Credits', value: String(totalCr), sub: program ? `/ ${program.totalRequired} req.` : '', color: 'text-blue-700' },
            { label: 'Total Courses', value: String(terms.reduce((s, t) => s + t.taken, 0)), sub: '', color: 'text-gray-700' },
            { label: 'Academic Standing', value: cgpa > 0 ? standingLabel(cgpa).label : '—', sub: '', color: standingLabel(cgpa).color },
          ].map(c => (
            <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">{c.label}</p>
              <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
              {c.sub && <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>}
            </div>
          ))}
        </div>

        {graduation && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
            <p className="text-sm text-purple-700">Graduation Classification: <strong>{graduation}</strong></p>
          </div>
        )}

        {/* Program progress */}
        {program && totalCr > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-gray-900 text-sm">{program.name}</h2>
              <span className="text-sm font-bold text-[#4c1d95]">{progPct}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#4c1d95] to-[#7c3aed] transition-all duration-700"
                style={{ width: `${progPct}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1.5">{totalCr} of {program.totalRequired} credit hours completed</p>
          </div>
        )}

        {/* GPA progression chart */}
        {terms.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="font-semibold text-gray-900 text-sm mb-4">GPA Progression</h2>
            <div className="flex items-end gap-3 overflow-x-auto pb-2" style={{ minHeight: 120 }}>
              {terms.map(t => {
                const semH   = t.semCredits > 0 ? Math.max(4, Math.round((t.semGpa / maxGpa) * 100)) : 4;
                const cumH   = t.cumCredits > 0 ? Math.max(4, Math.round((t.cumGpa  / maxGpa) * 100)) : 4;
                const { bg } = standingLabel(t.semGpa);
                return (
                  <div key={t.termId} className="flex flex-col items-center gap-1 min-w-[60px]">
                    <div className="flex items-end gap-1 h-24">
                      <div title={`Sem. GPA: ${t.semGpa.toFixed(2)}`}
                        className={`w-5 rounded-t-sm ${bg} border border-current/20 transition-all`}
                        style={{ height: `${semH}%` }} />
                      <div title={`Cum. GPA: ${t.cumGpa.toFixed(2)}`}
                        className="w-5 rounded-t-sm bg-[#4c1d95]/20 border border-[#4c1d95]/30 transition-all"
                        style={{ height: `${cumH}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-500 text-center leading-tight">{t.termName.slice(0,8)}</p>
                    <p className="text-[10px] font-bold text-gray-700">{t.semGpa.toFixed(2)}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-100 border border-green-200 inline-block" />Sem. GPA</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#4c1d95]/20 border border-[#4c1d95]/30 inline-block" />Cum. GPA</span>
            </div>
          </div>
        )}

        {/* Semester-by-semester table */}
        {terms.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 text-sm">Semester Details</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Semester</th>
                    <th className="px-4 py-2.5 text-right">Credits</th>
                    <th className="px-4 py-2.5 text-right">Quality Pts</th>
                    <th className="px-4 py-2.5 text-right">Sem. GPA</th>
                    <th className="px-4 py-2.5 text-right">Cum. GPA</th>
                    <th className="px-4 py-2.5 text-right">Courses</th>
                    <th className="px-4 py-2.5 text-left">Standing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {terms.map((t, i) => {
                    const st = t.semCredits > 0 ? standingLabel(t.semGpa) : { label: '—', color: 'text-gray-400', bg: 'bg-gray-100' };
                    return (
                      <tr key={t.termId} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                        <td className="px-4 py-3 font-medium text-gray-900">{t.termName}<span className="text-gray-400 text-xs ml-1">{t.termYear}</span></td>
                        <td className="px-4 py-3 text-right text-gray-700">{t.semCredits}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{t.semQPs.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                          {t.semCredits > 0 ? t.semGpa.toFixed(2) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-[#4c1d95]">{t.cumGpa.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-gray-600 text-xs">
                          {t.passed}P / {t.failed > 0 ? <span className="text-red-600">{t.failed}F</span> : '0F'} / {t.taken}T
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.bg} ${st.color}`}>{st.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {last && (
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                    <tr>
                      <td className="px-4 py-3 font-bold text-gray-900 text-xs uppercase tracking-wide">Cumulative</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{last.cumCredits}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{last.cumQPs.toFixed(2)}</td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right font-bold text-[#4c1d95] text-base">{last.cumGpa.toFixed(2)}</td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
            No graded courses found. GPA will appear once grades are finalized.
          </div>
        )}

        {/* Quick links */}
        <div className="flex gap-3 no-print">
          <Link href="/dashboard/transcript" className="inline-flex items-center gap-2 px-4 py-2 bg-[#4c1d95] text-white text-sm rounded-lg hover:bg-[#5b21b6]">
            View Full Transcript
          </Link>
          <Link href="/dashboard/grades" className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm text-gray-700 rounded-lg hover:bg-gray-50">
            Course Grades
          </Link>
        </div>

      </div>
    </div>
  );
}
