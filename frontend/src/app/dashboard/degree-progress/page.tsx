'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type CourseEntry = {
  code    : string;
  title   : string;
  credits : number;
  grade   : string | null;
  score   : number | null;
  status  : string;
  section : string | null;
};

type TermGroup = {
  termId   : string;
  termName : string;
  year     : number;
  courses  : CourseEntry[];
};

type ProfileInfo = {
  programName : string;
  durationYrs : number;
};

function courseIcon(entry: CourseEntry): string {
  if (entry.status === 'withdrawn') return '❌';
  if (entry.status !== 'completed') return '⏳';
  const g = entry.grade ?? '';
  if (g === 'A' || g === 'A-') return '🏆';
  if (g === 'D') return '⚠️';
  return '✅';
}

function termGPA(courses: CourseEntry[]): string {
  const gradePoints: Record<string, number> = {
    'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7,
    'C+': 2.3, 'C': 2.0, 'C-': 1.7, 'D+': 1.3, 'D': 1.0, 'F': 0.0,
  };
  let totalPoints = 0, totalCredits = 0;
  for (const c of courses) {
    if (c.status === 'completed' && c.grade && gradePoints[c.grade] !== undefined) {
      totalPoints  += gradePoints[c.grade] * c.credits;
      totalCredits += c.credits;
    }
  }
  if (totalCredits === 0) return '—';
  return (totalPoints / totalCredits).toFixed(2);
}

export default function DegreeProgressPage() {
  const [terms, setTerms] = useState<TermGroup[]>([]);
  const [profileInfo, setProfileInfo] = useState<ProfileInfo>({ programName: '—', durationYrs: 4 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { setError('Not authenticated'); setLoading(false); return; }

        const { data: currentUser } = await supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', authUser.id)
          .single();
        if (!currentUser) { setError('User not found'); setLoading(false); return; }

        const uid = (currentUser as any).id;

        // Load profile for program info
        const { data: sp } = await supabase
          .from('student_profiles')
          .select('program')
          .eq('user_id', uid)
          .maybeSingle();

        let programName = (sp as any)?.program ?? '—';
        let durationYrs = 4;
        if ((sp as any)?.program) {
          const { data: prog } = await supabase
            .from('academic_programs')
            .select('name, duration_years')
            .eq('id', (sp as any).program)
            .maybeSingle();
          if (prog) {
            programName = (prog as any).name;
            durationYrs = (prog as any).duration_years ?? 4;
          }
        }
        setProfileInfo({ programName, durationYrs });

        // Load enrollments
        const { data: enrollments, error: enrErr } = await supabase
          .from('enrollments')
          .select('id, status, final_grade, final_score, created_at, course_offerings(section_name, courses(id, code, title, credit_hours), academic_terms(id, term_name, year_start))')
          .eq('student_id', uid)
          .order('created_at', { ascending: true });

        if (enrErr) throw enrErr;

        const termMap: Record<string, TermGroup> = {};
        ((enrollments ?? []) as any[]).forEach(e => {
          const co   = e.course_offerings;
          const term = co?.academic_terms;
          const course = co?.courses;
          if (!term || !course) return;

          if (!termMap[term.id]) {
            termMap[term.id] = {
              termId   : term.id,
              termName : term.term_name,
              year     : term.year_start ?? 0,
              courses  : [],
            };
          }

          termMap[term.id].courses.push({
            code    : course.code,
            title   : course.title,
            credits : course.credit_hours ?? 3,
            grade   : e.final_grade,
            score   : e.final_score,
            status  : e.status,
            section : co.section_name,
          });
        });

        setTerms(Object.values(termMap).sort((a, b) => a.year - b.year));
      } catch (e: any) {
        setError(e.message ?? 'Failed to load degree progress');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const allCourses   = terms.flatMap(t => t.courses);
  const earned       = allCourses.filter(c => c.status === 'completed').reduce((s, c) => s + c.credits, 0);
  const attempted    = allCourses.filter(c => c.status !== 'withdrawn').reduce((s, c) => s + c.credits, 0);
  const withdrawn    = allCourses.filter(c => c.status === 'withdrawn').reduce((s, c) => s + c.credits, 0);
  const required     = profileInfo.durationYrs * 30;
  const remaining    = Math.max(0, required - earned);
  const progressPct  = Math.min(100, Math.round((earned / required) * 100));

  const toggleTerm = (id: string) =>
    setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const collapseAll = () => setCollapsed(new Set(terms.map(t => t.termId)));
  const expandAll   = () => setCollapsed(new Set());

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-48" />
          <div className="h-32 bg-gray-200 rounded-xl" />
          <div className="h-48 bg-gray-200 rounded-xl" />
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

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/dashboard" className="hover:text-purple-700">Home</Link>
          <span>›</span>
          <Link href="/dashboard/profile" className="hover:text-purple-700">My Profile</Link>
          <span>›</span>
          <span className="text-gray-900 font-medium">Degree Progress</span>
        </nav>

        <h1 className="text-2xl font-bold text-gray-900">Degree Progress</h1>

        {/* Progress overview */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <p className="text-sm text-gray-500 mb-1">
            {profileInfo.programName} · {profileInfo.durationYrs}-year program
          </p>
          <div className="flex items-center gap-4 my-3">
            <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
              <div className="bg-[#4c1d95] h-3 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-sm font-bold text-gray-800 w-12 text-right">{progressPct}%</span>
          </div>
          <p className="text-sm text-gray-600">{earned} credits completed of {required} required</p>
          <p className="text-sm text-gray-500 mt-1">{remaining} credits remaining</p>
        </div>

        {/* Credit summary row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Earned',    value: earned,    color: 'text-green-700' },
            { label: 'Remaining', value: remaining,  color: 'text-amber-700' },
            { label: 'Required',  value: required,   color: 'text-purple-700' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Courses by term */}
        {terms.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
            No course history found.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Courses by Term</h2>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={expandAll} className="text-purple-600 hover:underline">Expand All</button>
                <span className="text-gray-300">|</span>
                <button type="button" onClick={collapseAll} className="text-purple-600 hover:underline">Collapse All</button>
              </div>
            </div>

            <div className="space-y-3">
              {terms.map(term => {
                const isCollapsed = collapsed.has(term.termId);
                const termCredits = term.courses.filter(c => c.status === 'completed').reduce((s, c) => s + c.credits, 0);
                return (
                  <div key={term.termId} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleTerm(term.termId)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 text-left"
                    >
                      <span className="font-semibold text-gray-900">
                        {term.termName}{term.year ? ` · ${term.year}` : ''}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">{termCredits} cr</span>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {!isCollapsed && (
                      <div className="border-t border-gray-100">
                        <table className="w-full text-sm">
                          <tbody className="divide-y divide-gray-50">
                            {term.courses.map((c, ci) => (
                              <tr key={ci} className="hover:bg-gray-50">
                                <td className="px-5 py-2.5 w-6 text-base">{courseIcon(c)}</td>
                                <td className="px-3 py-2.5">
                                  <span className="font-mono text-xs text-gray-500 mr-2">{c.code}</span>
                                  <span className="text-gray-800">{c.title}</span>
                                </td>
                                <td className="px-3 py-2.5 text-right font-medium text-gray-700 whitespace-nowrap">
                                  {c.grade ?? (c.status === 'withdrawn' ? 'W' : '—')}
                                </td>
                                <td className="px-5 py-2.5 text-right text-gray-500 whitespace-nowrap">
                                  {c.credits}cr
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between text-xs text-gray-500">
                          <span>Term: {termCredits} credits</span>
                          <span>GPA: {termGPA(term.courses)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Totals summary */}
        {terms.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm space-y-2">
            <h2 className="font-semibold text-gray-900 mb-3">Summary</h2>
            {[
              { label: 'Credits Attempted', value: String(attempted) },
              { label: 'Credits Earned',    value: String(earned) },
              { label: 'Withdrawn',         value: `${withdrawn} credits (W)` },
            ].map(r => (
              <div key={r.label} className="flex justify-between text-gray-700">
                <span className="text-gray-500">{r.label}</span>
                <span className="font-medium">{r.value}</span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
