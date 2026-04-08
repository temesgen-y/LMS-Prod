'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type CourseEntry = {
  code    : string;
  title   : string;
  credits : number;
  grade   : string | null;
  status  : string;
};

type TermGroup = {
  termId        : string;
  termName      : string;
  year          : number;
  courses       : CourseEntry[];
  gpa           : number | null;
  cumulativeGpa : number | null;
  standing      : string | null;
  creditsEarned : number | null;
};

type StudentInfo = {
  firstName  : string;
  lastName   : string;
  studentNo  : string | null;
  program    : string;
  email      : string;
};

const GRADE_SCALE = [
  { grade: 'A',  points: '4.0', range: '93–100' },
  { grade: 'A-', points: '3.7', range: '90–92'  },
  { grade: 'B+', points: '3.3', range: '87–89'  },
  { grade: 'B',  points: '3.0', range: '83–86'  },
  { grade: 'B-', points: '2.7', range: '80–82'  },
  { grade: 'C+', points: '2.3', range: '77–79'  },
  { grade: 'C',  points: '2.0', range: '73–76'  },
  { grade: 'D',  points: '1.0', range: '60–72'  },
  { grade: 'F',  points: '0.0', range: 'Below 60'},
  { grade: 'W',  points: '—',   range: 'Withdrawn'},
];

export default function MyTranscriptPage() {
  const [terms, setTerms] = useState<TermGroup[]>([]);
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gradeScaleOpen, setGradeScaleOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { setError('Not authenticated'); setLoading(false); return; }

        const { data: currentUser } = await supabase
          .from('users')
          .select('id, first_name, last_name, email')
          .eq('auth_user_id', authUser.id)
          .single();
        if (!currentUser) { setError('User not found'); setLoading(false); return; }

        const uid = (currentUser as any).id;
        const u   = currentUser as any;

        // Student profile
        const { data: sp } = await supabase
          .from('student_profiles')
          .select('student_no, program')
          .eq('user_id', uid)
          .maybeSingle();

        let programName = (sp as any)?.program ?? '—';
        if ((sp as any)?.program) {
          const { data: prog } = await supabase
            .from('academic_programs')
            .select('name')
            .eq('id', (sp as any).program)
            .maybeSingle();
          if (prog) programName = (prog as any).name;
        }

        setStudentInfo({
          firstName : u.first_name ?? '',
          lastName  : u.last_name  ?? '',
          studentNo : (sp as any)?.student_no ?? null,
          program   : programName,
          email     : u.email ?? '',
        });

        // Enrollments
        const { data: enrollments } = await supabase
          .from('enrollments')
          .select('id, status, final_grade, created_at, course_offerings(section_name, courses(id, code, title, credit_hours), academic_terms(id, term_name, year_start))')
          .eq('student_id', uid)
          .order('created_at', { ascending: true });

        // Academic standing per term
        const { data: standingsAll } = await supabase
          .from('academic_standing')
          .select('term_id, gpa, cumulative_gpa, standing, credits_earned')
          .eq('student_id', uid);

        const standingByTerm: Record<string, any> = {};
        ((standingsAll ?? []) as any[]).forEach(s => { standingByTerm[s.term_id] = s; });

        const termMap: Record<string, TermGroup> = {};
        ((enrollments ?? []) as any[]).forEach(e => {
          const co    = e.course_offerings;
          const term  = co?.academic_terms;
          const course = co?.courses;
          if (!term || !course) return;

          if (!termMap[term.id]) {
            const st = standingByTerm[term.id];
            termMap[term.id] = {
              termId        : term.id,
              termName      : term.term_name,
              year          : term.year_start ?? 0,
              courses       : [],
              gpa           : st?.gpa ?? null,
              cumulativeGpa : st?.cumulative_gpa ?? null,
              standing      : st?.standing ?? null,
              creditsEarned : st?.credits_earned ?? null,
            };
          }

          termMap[term.id].courses.push({
            code    : course.code,
            title   : course.title,
            credits : course.credit_hours ?? 3,
            grade   : e.final_grade,
            status  : e.status,
          });
        });

        setTerms(Object.values(termMap).sort((a, b) => a.year - b.year));
      } catch (e: any) {
        setError(e.message ?? 'Failed to load transcript');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const allCourses       = terms.flatMap(t => t.courses);
  const totalAttempted   = allCourses.filter(c => c.status !== 'withdrawn').reduce((s, c) => s + c.credits, 0);
  const totalEarned      = allCourses.filter(c => c.status === 'completed').reduce((s, c) => s + c.credits, 0);
  const latestStanding   = [...terms].reverse().find(t => t.cumulativeGpa !== null);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-48" />
          <div className="h-32 bg-gray-200 rounded-xl" />
          <div className="h-96 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Breadcrumb + Print (no-print) */}
        <div className="flex items-center justify-between no-print">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-purple-700">Home</Link>
            <span>›</span>
            <Link href="/dashboard/profile" className="hover:text-purple-700">My Profile</Link>
            <span>›</span>
            <span className="text-gray-900 font-medium">My Transcript</span>
          </nav>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#4c1d95] text-white text-sm font-medium rounded-lg hover:bg-[#5b21b6] transition-colors"
          >
            🖨️ Print Transcript
          </button>
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          ⚠️ This is an <strong>unofficial transcript</strong>. For an official transcript contact the Registrar Office.
        </div>

        {/* Transcript Header */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-center mb-4">
            <h1 className="text-xl font-bold text-gray-900">Mule LMS — University</h1>
            <div className="my-3 border-t border-gray-200" />
            <p className="text-base font-bold text-gray-700 tracking-wider uppercase">Unofficial Academic Transcript</p>
            <div className="my-3 border-t border-gray-200" />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Student: </span>
              <span className="font-medium text-gray-900">{studentInfo?.firstName} {studentInfo?.lastName}</span>
            </div>
            <div>
              <span className="text-gray-500">Student No: </span>
              <span className="font-mono text-gray-900">{studentInfo?.studentNo ?? '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">Program: </span>
              <span className="font-medium text-gray-900">{studentInfo?.program}</span>
            </div>
            <div>
              <span className="text-gray-500">Date Printed: </span>
              <span className="text-gray-900">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          </div>
        </div>

        {/* Per term */}
        {terms.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
            No course history found.
          </div>
        ) : (
          <div className="space-y-4">
            {terms.map(term => {
              const termCredits = term.courses.filter(c => c.status === 'completed').reduce((s, c) => s + c.credits, 0);
              return (
                <div key={term.termId} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                    <span className="font-semibold text-gray-900">{term.termName}</span>
                    {term.year ? <span className="text-gray-500 ml-2">· {term.year}</span> : null}
                  </div>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-2 text-left">Code</th>
                        <th className="px-5 py-2 text-left">Title</th>
                        <th className="px-5 py-2 text-right">Credits</th>
                        <th className="px-5 py-2 text-right">Grade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {term.courses.map((c, ci) => (
                        <tr key={ci} className="hover:bg-gray-50">
                          <td className="px-5 py-2.5 font-mono text-xs text-gray-600">{c.code}</td>
                          <td className="px-5 py-2.5 text-gray-800">{c.title}</td>
                          <td className="px-5 py-2.5 text-right text-gray-600">{c.credits}</td>
                          <td className="px-5 py-2.5 text-right font-medium text-gray-900">
                            {c.grade ?? (c.status === 'withdrawn' ? 'W' : '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
                    <span>Credits: <strong>{termCredits}</strong></span>
                    {term.gpa !== null && <span>GPA: <strong>{term.gpa.toFixed(2)}</strong></span>}
                    {term.cumulativeGpa !== null && <span>Cumulative GPA: <strong>{term.cumulativeGpa.toFixed(2)}</strong></span>}
                    {term.standing && (
                      <span>Standing: <strong className="capitalize">{term.standing.replace('_', ' ')}</strong></span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Totals */}
        {terms.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="font-semibold text-gray-900 mb-3 text-sm uppercase tracking-wide text-gray-500">Transcript Totals</h2>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Total Credits Attempted', value: String(totalAttempted) },
                { label: 'Total Credits Earned',    value: String(totalEarned) },
                { label: 'Cumulative GPA',          value: latestStanding?.cumulativeGpa?.toFixed(2) ?? '—' },
                { label: 'Academic Standing',       value: latestStanding?.standing ? latestStanding.standing.charAt(0).toUpperCase() + latestStanding.standing.slice(1) : '—' },
              ].map(r => (
                <div key={r.label} className="flex justify-between">
                  <span className="text-gray-500">{r.label}</span>
                  <span className="font-medium text-gray-900">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grade scale (collapsible) */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden no-print">
          <button
            type="button"
            onClick={() => setGradeScaleOpen(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50"
          >
            <span className="font-semibold text-gray-900 text-sm">Grade Scale</span>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {GRADE_SCALE.map(g => (
                    <tr key={g.grade}>
                      <td className="py-1.5 font-medium text-gray-800">{g.grade}</td>
                      <td className="py-1.5 text-gray-600">{g.points}</td>
                      <td className="py-1.5 text-gray-500">{g.range}</td>
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
