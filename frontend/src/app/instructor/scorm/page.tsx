'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

type SCORMLesson = {
  id: string;
  title: string;
  offeringId: string;
  offeringLabel: string;
  enrolledCount: number;
  attempts: AttemptRow[];
};

type AttemptRow = {
  studentId: string;
  studentName: string;
  studentNo: string;
  status: string;
  scoreRaw: number | null;
  scoreMax: number | null;
  totalTime: string;
  updatedAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  'passed':        'bg-green-100 text-green-700 border border-green-300',
  'completed':     'bg-green-100 text-green-700 border border-green-300',
  'failed':        'bg-red-100 text-red-600 border border-red-300',
  'incomplete':    'bg-amber-100 text-amber-700 border border-amber-300',
  'browsed':       'bg-blue-100 text-blue-700 border border-blue-300',
  'not attempted': 'bg-gray-100 text-gray-500 border border-gray-200',
};

export default function InstructorSCORMPage() {
  const [lessons, setLessons]   = useState<SCORMLesson[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterOffering, setFilterOffering] = useState('');

  const getCurrentUserId = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
    return (data as any)?.id ?? null;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const userId = await getCurrentUserId();
    if (!userId) { setLoading(false); return; }

    // Get instructor's offerings
    const { data: ciRows } = await supabase
      .from('course_instructors')
      .select(`offering_id, course_offerings!fk_course_instructors_offering(
        id, section_name, enrolled_count,
        courses!fk_course_offerings_course(code, title),
        academic_terms!fk_course_offerings_term(academic_year_label, term_name, term_code)
      )`)
      .eq('instructor_id', userId);

    if (!ciRows || ciRows.length === 0) { setLessons([]); setLoading(false); return; }

    const offeringIds = (ciRows as any[]).map(r => r.offering_id);
    const offeringMap: Record<string, any> = {};
    (ciRows as any[]).forEach(r => {
      const co = r.course_offerings ?? {};
      const c  = co.courses ?? {};
      const t  = co.academic_terms ?? {};
      offeringMap[r.offering_id] = {
        label: `${(c.code ?? '').toUpperCase()} — ${c.title ?? ''} · ${[t.academic_year_label, t.term_name ?? t.term_code].filter(Boolean).join(' · ')} · Sec ${co.section_name ?? 'A'}`,
        enrolledCount: co.enrolled_count ?? 0,
      };
    });

    // Get SCORM lessons for these offerings
    const { data: lessonRows, error } = await supabase
      .from('lessons')
      .select('id, title, offering_id')
      .in('offering_id', offeringIds)
      .eq('type', 'scorm')
      .order('created_at', { ascending: false });

    if (error) { toast.error('Failed to load SCORM lessons'); setLoading(false); return; }
    if (!lessonRows || lessonRows.length === 0) { setLessons([]); setLoading(false); return; }

    const lessonIds = (lessonRows as any[]).map(l => l.id);

    // Get all attempts for these lessons
    const { data: attemptRows } = await supabase
      .from('scorm_attempts')
      .select('lesson_id, student_id, status, score_raw, score_max, total_time, updated_at')
      .in('lesson_id', lessonIds);

    const studentIds = [...new Set(((attemptRows ?? []) as any[]).map(a => a.student_id))];
    const { data: userRows } = studentIds.length > 0
      ? await supabase.from('users').select('id, first_name, last_name').in('id', studentIds)
      : { data: [] };
    const { data: profileRows } = studentIds.length > 0
      ? await supabase.from('student_profiles').select('user_id, student_no').in('user_id', studentIds)
      : { data: [] };

    const userMap: Record<string, string> = {};
    ((userRows ?? []) as any[]).forEach(u => { userMap[u.id] = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(); });
    const profileMap: Record<string, string> = {};
    ((profileRows ?? []) as any[]).forEach(p => { profileMap[p.user_id] = p.student_no ?? ''; });

    // Group attempts by lesson
    const attByLesson: Record<string, AttemptRow[]> = {};
    ((attemptRows ?? []) as any[]).forEach(a => {
      if (!attByLesson[a.lesson_id]) attByLesson[a.lesson_id] = [];
      attByLesson[a.lesson_id].push({
        studentId:   a.student_id,
        studentName: userMap[a.student_id] ?? a.student_id,
        studentNo:   profileMap[a.student_id] ?? '',
        status:      a.status ?? 'not attempted',
        scoreRaw:    a.score_raw ?? null,
        scoreMax:    a.score_max ?? 100,
        totalTime:   a.total_time ?? '00:00:00',
        updatedAt:   a.updated_at ?? '',
      });
    });

    setLessons(
      (lessonRows as any[]).map(l => ({
        id:            l.id,
        title:         l.title,
        offeringId:    l.offering_id,
        offeringLabel: offeringMap[l.offering_id]?.label ?? '',
        enrolledCount: offeringMap[l.offering_id]?.enrolledCount ?? 0,
        attempts:      attByLesson[l.id] ?? [],
      }))
    );
    setLoading(false);
  }, [getCurrentUserId]);

  useEffect(() => { load(); }, [load]);

  const offerings = [...new Set(lessons.map(l => l.offeringId))];
  const filtered  = filterOffering ? lessons.filter(l => l.offeringId === filterOffering) : lessons;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">SCORM Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Completion and score tracking for SCORM modules</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterOffering}
            onChange={e => setFilterOffering(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">All Offerings</option>
            {offerings.map(oid => {
              const l = lessons.find(x => x.offeringId === oid);
              return <option key={oid} value={oid}>{l?.offeringLabel ?? oid}</option>;
            })}
          </select>
          <button onClick={load} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">No SCORM modules found.</p>
          <p className="text-gray-400 text-sm mt-1">Add a lesson with type "SCORM" to your course modules.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(lesson => {
            const isOpen      = expanded === lesson.id;
            const passedCount = lesson.attempts.filter(a => a.status === 'passed' || a.status === 'completed').length;
            const avgScore    = lesson.attempts.filter(a => a.scoreRaw !== null).length > 0
              ? lesson.attempts.reduce((s, a) => s + (a.scoreRaw ?? 0), 0) / lesson.attempts.filter(a => a.scoreRaw !== null).length
              : null;
            const pct = lesson.enrolledCount > 0 ? Math.round((passedCount / lesson.enrolledCount) * 100) : 0;

            return (
              <div key={lesson.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Lesson header row */}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : lesson.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{lesson.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{lesson.offeringLabel}</p>
                  </div>

                  {/* Mini stats */}
                  <div className="hidden sm:flex items-center gap-6 text-sm shrink-0">
                    <div className="text-center">
                      <p className="font-bold text-gray-900">{passedCount}/{lesson.enrolledCount}</p>
                      <p className="text-xs text-gray-400">Completed</p>
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-primary">{pct}%</p>
                      <p className="text-xs text-gray-400">Pass rate</p>
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-gray-900">{avgScore !== null ? `${avgScore.toFixed(1)}%` : '—'}</p>
                      <p className="text-xs text-gray-400">Avg score</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="hidden md:block w-24 shrink-0">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1 text-center">{pct}%</p>
                  </div>

                  <svg
                    className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded: per-student table */}
                {isOpen && (
                  <div className="border-t border-gray-100">
                    {lesson.attempts.length === 0 ? (
                      <p className="px-5 py-6 text-sm text-gray-400 text-center">No attempts yet.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50/80 border-b border-gray-100">
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Student</th>
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Time Spent</th>
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Activity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {lesson.attempts.map(att => (
                            <tr key={att.studentId} className="hover:bg-gray-50/50">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center flex-shrink-0">
                                    {att.studentName.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-medium text-gray-900">{att.studentName}</p>
                                    <p className="text-xs text-gray-400 font-mono">{att.studentNo}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[att.status] ?? STATUS_COLORS['not attempted']}`}>
                                  {att.status}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-gray-700 font-mono text-sm">
                                {att.scoreRaw !== null ? `${att.scoreRaw} / ${att.scoreMax ?? 100}` : '—'}
                              </td>
                              <td className="px-5 py-3 text-gray-500 font-mono text-xs">{att.totalTime}</td>
                              <td className="px-5 py-3 text-gray-400 text-xs">
                                {att.updatedAt ? new Date(att.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
