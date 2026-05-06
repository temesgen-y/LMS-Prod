'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type StudentOption = { id: string; name: string; studentNo: string; program: string };

type CourseEntry = {
  code: string;
  title: string;
  credits: number;
  grade: string | null;
  status: string;
};

type TermGroup = {
  termId: string;
  termName: string;
  year: number;
  courses: CourseEntry[];
  gpa: number | null;
  cumulativeGpa: number | null;
  standing: string | null;
  creditsEarned: number | null;
};

type StudentInfo = {
  firstName: string;
  lastName: string;
  studentNo: string | null;
  program: string;
  email: string;
};

function exportTranscriptCSV(
  studentInfo: StudentInfo | null,
  terms: TermGroup[],
  totalAttempted: number,
  totalEarned: number,
  latestStanding: TermGroup | undefined,
) {
  const rows: string[][] = [];
  rows.push(['MULE LMS — Academic Transcript (Registrar Copy)']);
  rows.push([]);
  rows.push(['Student', `${studentInfo?.firstName ?? ''} ${studentInfo?.lastName ?? ''}`.trim()]);
  rows.push(['Student No', studentInfo?.studentNo ?? '—']);
  rows.push(['Program', studentInfo?.program ?? '—']);
  rows.push(['Date Printed', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })]);
  rows.push([]);

  for (const term of terms) {
    rows.push([term.termName, term.year ? String(term.year) : '']);
    rows.push(['Code', 'Title', 'Credits', 'Grade']);
    for (const c of term.courses) {
      rows.push([c.code, c.title, String(c.credits), c.grade ?? (c.status === 'withdrawn' ? 'W' : '—')]);
    }
    const termCredits = term.courses.filter(c => c.status === 'completed').reduce((s, c) => s + c.credits, 0);
    const summary = [`Credits: ${termCredits}`];
    if (term.gpa !== null) summary.push(`GPA: ${term.gpa.toFixed(2)}`);
    if (term.cumulativeGpa !== null) summary.push(`Cumulative GPA: ${term.cumulativeGpa.toFixed(2)}`);
    if (term.standing) summary.push(`Standing: ${term.standing.replace('_', ' ')}`);
    rows.push([summary.join('  ·  ')]);
    rows.push([]);
  }

  rows.push(['TOTALS']);
  rows.push(['Total Credits Attempted', String(totalAttempted)]);
  rows.push(['Total Credits Earned', String(totalEarned)]);
  rows.push(['Cumulative GPA', latestStanding?.cumulativeGpa?.toFixed(2) ?? '—']);
  rows.push(['Academic Standing', latestStanding?.standing ?? '—']);

  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const slug = `${studentInfo?.lastName ?? 'student'}-${studentInfo?.studentNo ?? ''}`.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  a.download = `transcript-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RegistrarTranscriptsPage() {
  const [search, setSearch] = useState('');
  const [allStudents, setAllStudents] = useState<StudentOption[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);

  const [terms, setTerms] = useState<TermGroup[]>([]);
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState('');

  // Load all students on mount
  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('users')
        .select('id, first_name, last_name, student_profiles!user_id(student_no, program)')
        .eq('role', 'student')
        .eq('status', 'active')
        .order('first_name');

      const rows: StudentOption[] = ((data ?? []) as any[]).map(u => ({
        id: u.id,
        name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
        studentNo: u.student_profiles?.student_no ?? '—',
        program: u.student_profiles?.program ?? '—',
      }));
      setAllStudents(rows);
      setListLoading(false);
    };
    init();
  }, []);

  const filtered = allStudents.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.studentNo.toLowerCase().includes(q) || s.program.toLowerCase().includes(q);
  });

  const loadTranscript = useCallback(async (student: StudentOption) => {
    setSelectedStudent(student);
    setTranscriptLoading(true);
    setTranscriptError('');
    setTerms([]);
    setStudentInfo(null);

    try {
      const supabase = createClient();
      const uid = student.id;

      const { data: u } = await supabase
        .from('users')
        .select('first_name, last_name, email')
        .eq('id', uid)
        .single();

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
        firstName: (u as any)?.first_name ?? '',
        lastName: (u as any)?.last_name ?? '',
        studentNo: (sp as any)?.student_no ?? null,
        program: programName,
        email: (u as any)?.email ?? '',
      });

      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('id, status, final_grade, created_at, course_offerings(section_name, courses(id, code, title, credit_hours), academic_terms(id, term_name, year_start))')
        .eq('student_id', uid)
        .order('created_at', { ascending: true });

      const { data: standingsAll } = await supabase
        .from('academic_standing')
        .select('term_id, gpa, cumulative_gpa, standing, credits_earned')
        .eq('student_id', uid);

      const standingByTerm: Record<string, any> = {};
      ((standingsAll ?? []) as any[]).forEach(s => { standingByTerm[s.term_id] = s; });

      const termMap: Record<string, TermGroup> = {};
      ((enrollments ?? []) as any[]).forEach(e => {
        const co = e.course_offerings;
        const term = co?.academic_terms;
        const course = co?.courses;
        if (!term || !course) return;
        if (!termMap[term.id]) {
          const st = standingByTerm[term.id];
          termMap[term.id] = {
            termId: term.id,
            termName: term.term_name,
            year: term.year_start ?? 0,
            courses: [],
            gpa: st?.gpa ?? null,
            cumulativeGpa: st?.cumulative_gpa ?? null,
            standing: st?.standing ?? null,
            creditsEarned: st?.credits_earned ?? null,
          };
        }
        termMap[term.id].courses.push({
          code: course.code,
          title: course.title,
          credits: course.credit_hours ?? 3,
          grade: e.final_grade,
          status: e.status,
        });
      });

      setTerms(Object.values(termMap).sort((a, b) => a.year - b.year));
    } catch (e: any) {
      setTranscriptError(e.message ?? 'Failed to load transcript');
    } finally {
      setTranscriptLoading(false);
    }
  }, []);

  const allCourses = terms.flatMap(t => t.courses);
  const totalAttempted = allCourses.filter(c => c.status !== 'withdrawn').reduce((s, c) => s + c.credits, 0);
  const totalEarned = allCourses.filter(c => c.status === 'completed').reduce((s, c) => s + c.credits, 0);
  const latestStanding = [...terms].reverse().find(t => t.cumulativeGpa !== null);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 no-print">
        <h1 className="text-2xl font-bold text-gray-900">Student Transcripts</h1>
        {selectedStudent && terms.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportTranscriptCSV(studentInfo, terms, totalAttempted, totalEarned, latestStanding)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Print PDF
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-5 items-start">
        {/* ── Student list panel ── */}
        <div className="w-72 flex-shrink-0 no-print">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-gray-100">
              <input
                type="text"
                placeholder="Search students…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              {!listLoading && (
                <p className="text-xs text-gray-400 mt-1.5 px-1">{filtered.length} student{filtered.length !== 1 ? 's' : ''}</p>
              )}
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
              {listLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No students found</p>
              ) : (
                filtered.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => loadTranscript(s)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 transition-colors ${
                      selectedStudent?.id === s.id
                        ? 'bg-purple-50 border-l-[3px] border-l-purple-600'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <p className="font-medium text-gray-900 text-sm truncate">{s.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.studentNo}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Transcript panel ── */}
        <div className="flex-1 min-w-0">
          {!selectedStudent ? (
            <div className="flex flex-col items-center justify-center py-32 text-gray-400 bg-white border border-gray-200 rounded-xl">
              <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">Select a student to view their transcript</p>
            </div>
          ) : transcriptLoading ? (
            <div className="flex items-center justify-center py-32 bg-white border border-gray-200 rounded-xl">
              <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : transcriptError ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{transcriptError}</div>
          ) : (
            <div className="space-y-4">
              {/* Transcript header */}
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="text-center mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Mule LMS — University</h2>
                  <div className="my-3 border-t border-gray-200" />
                  <p className="text-base font-bold text-gray-700 tracking-wider uppercase">Academic Transcript</p>
                  <div className="my-3 border-t border-gray-200" />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">Student: </span><span className="font-medium text-gray-900">{studentInfo?.firstName} {studentInfo?.lastName}</span></div>
                  <div><span className="text-gray-500">Student No: </span><span className="font-mono text-gray-900">{studentInfo?.studentNo ?? '—'}</span></div>
                  <div><span className="text-gray-500">Program: </span><span className="font-medium text-gray-900">{studentInfo?.program}</span></div>
                  <div><span className="text-gray-500">Date Printed: </span><span className="text-gray-900">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
                </div>
              </div>

              {/* Per term */}
              {terms.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
                  No course history found for this student.
                </div>
              ) : (
                terms.map(term => {
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
                        {term.standing && <span>Standing: <strong className="capitalize">{term.standing.replace('_', ' ')}</strong></span>}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Totals */}
              {terms.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-500 mb-3">Transcript Totals</h3>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
