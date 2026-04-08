'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getGradeColor, getGpaPoints } from '@/utils/gradeCalculator';

type CourseGrade = {
  enrollmentId: string;
  offeringId:   string;
  courseCode:   string;
  courseTitle:  string;
  creditHours:  number;
  termName:     string;
  finalScore:   number | null;
  finalGrade:   string | null;
  status:       'final' | 'in_progress' | 'not_started';
};

export default function GradesPage() {
  const [courses, setCourses] = useState<CourseGrade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setLoading(false); return; }

      const { data: appUser } = await supabase
        .from('users').select('id').eq('auth_user_id', authData.user.id).single();
      if (!appUser) { setLoading(false); return; }
      const userId = (appUser as any).id;

      // Step 1: enrollments (scalar columns only — no FK hints)
      const { data: enrollRows, error: enrErr } = await supabase
        .from('enrollments')
        .select('id, offering_id, final_score, final_grade, status')
        .eq('student_id', userId)
        .in('status', ['active', 'completed'])
        .order('enrolled_at', { ascending: false });

      if (enrErr) { console.error('[Grades] enrollments:', enrErr); setLoading(false); return; }
      if (!enrollRows || enrollRows.length === 0) { setLoading(false); return; }

      // Step 2: course offerings for those offering IDs
      const offeringIds = (enrollRows as any[]).map(r => r.offering_id);

      const { data: offeringRows, error: offrErr } = await supabase
        .from('course_offerings')
        .select('id, section_name, course_id, term_id')
        .in('id', offeringIds);

      if (offrErr) console.error('[Grades] offerings:', offrErr);

      // Step 3: courses and terms
      const courseIds = [...new Set(((offeringRows ?? []) as any[]).map(o => o.course_id))];
      const termIds   = [...new Set(((offeringRows ?? []) as any[]).map(o => o.term_id))];

      const [{ data: courseRows }, { data: termRows }] = await Promise.all([
        supabase.from('courses').select('id, code, title, credit_hours').in('id', courseIds),
        supabase.from('academic_terms').select('id, term_name').in('id', termIds),
      ]);

      // Build lookup maps
      const offeringMap: Record<string, any> = {};
      ((offeringRows ?? []) as any[]).forEach(o => { offeringMap[o.id] = o; });
      const courseMap: Record<string, any> = {};
      ((courseRows ?? []) as any[]).forEach(c => { courseMap[c.id] = c; });
      const termMap: Record<string, any> = {};
      ((termRows ?? []) as any[]).forEach(t => { termMap[t.id] = t; });

      const mapped: CourseGrade[] = (enrollRows as any[]).map(r => {
        const offering = offeringMap[r.offering_id] ?? {};
        const course   = courseMap[offering.course_id ?? ''] ?? {};
        const term     = termMap[offering.term_id ?? ''] ?? {};
        const gradeStatus: CourseGrade['status'] =
          r.final_grade != null ? 'final'
          : r.final_score != null ? 'in_progress'
          : 'not_started';
        return {
          enrollmentId: r.id,
          offeringId:   r.offering_id,
          courseCode:   course.code  ?? '—',
          courseTitle:  course.title ?? '—',
          creditHours:  course.credit_hours ?? 3,
          termName:     term.term_name ?? '—',
          finalScore:   r.final_score  ?? null,
          finalGrade:   r.final_grade  ?? null,
          status:       gradeStatus,
        };
      });

      setCourses(mapped);
      setLoading(false);
    })();
  }, []);

  // GPA — only courses with a final letter grade
  const gradedCourses = courses.filter(c => c.finalGrade != null);
  const gpa = gradedCourses.length > 0
    ? (() => {
        const totalPts  = gradedCourses.reduce((s, c) => s + getGpaPoints(c.finalGrade!) * c.creditHours, 0);
        const totalCred = gradedCourses.reduce((s, c) => s + c.creditHours, 0);
        return totalCred > 0 ? Math.round((totalPts / totalCred) * 100) / 100 : 0;
      })()
    : null;

  const statusLabel: Record<CourseGrade['status'], string> = {
    final:       'Final',
    in_progress: 'In Progress',
    not_started: 'Not Started',
  };
  const statusColor: Record<CourseGrade['status'], string> = {
    final:       'text-green-700 bg-green-50',
    in_progress: 'text-amber-700 bg-amber-50',
    not_started: 'text-gray-500 bg-gray-50',
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl" aria-hidden>📊</span>
          <h1 className="text-2xl font-bold text-gray-900">My Grades</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">Course-level grade summary across all enrolled courses</p>

        {loading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-gray-200 rounded" />)}
          </div>
        ) : courses.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <span className="text-4xl block mb-3">📚</span>
            <p className="text-gray-400 font-medium">No enrolled courses found.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Course', 'Term', 'Score', 'Grade', 'Status', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {courses.map(c => (
                    <tr key={c.enrollmentId} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{c.courseTitle}</div>
                        <div className="text-xs text-gray-400">{c.courseCode}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{c.termName}</td>
                      <td className="px-4 py-3">
                        {c.finalScore != null
                          ? <span className="font-semibold text-gray-900">{c.finalScore.toFixed(1)}%</span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        {c.finalGrade
                          ? <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold ${getGradeColor(c.finalGrade)}`}>{c.finalGrade}</span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[c.status]}`}>
                          {statusLabel[c.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/class/${c.offeringId}/grades`} className="text-xs text-[#4c1d95] hover:underline">
                          Details →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* GPA footer */}
              {gpa !== null && (
                <div className="border-t border-gray-200 bg-gray-50 px-4 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">GPA — completed courses ({gradedCourses.length})</p>
                    <p className="text-xs text-gray-400 mt-0.5">4.0 scale · weighted by credit hours</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-[#4c1d95]">{gpa.toFixed(2)}</p>
                    <p className="text-xs text-gray-400">/ 4.00</p>
                  </div>
                </div>
              )}
            </div>

            {/* GPA scale legend */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-600 mb-2">GPA Scale (4.0)</p>
              <div className="flex flex-wrap gap-2">
                {[['A','4.0'],['A-','3.7'],['B+','3.3'],['B','3.0'],['B-','2.7'],['C+','2.3'],['C','2.0'],['D','1.0'],['F','0.0']].map(([g, pts]) => (
                  <span key={g} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${getGradeColor(g)}`}>
                    {g} = {pts}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
