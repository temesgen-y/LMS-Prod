'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type AssessmentItem = {
  id: string;
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  termName: string;
  title: string;
  type: string;
  totalMarks: number;
  timeLimitMins: number | null;
  maxAttempts: number;
  availableFrom: string | null;
  availableUntil: string | null;
  attemptCount: number;
  bestScore: number | null;
  isGraded: boolean;
};

type FilterTab = 'all' | 'available' | 'upcoming' | 'submitted';

const TYPE_LABELS: Record<string, string> = {
  quiz: 'Quiz',
  midterm: 'Midterm',
  final_exam: 'Final Exam',
};

const TYPE_COLORS: Record<string, string> = {
  quiz:       'bg-blue-100 text-blue-700',
  midterm:    'bg-purple-100 text-purple-700',
  final_exam: 'bg-red-100 text-red-700',
};

function getStatus(item: AssessmentItem): 'available' | 'upcoming' | 'submitted' | 'graded' | 'closed' {
  const now = new Date();
  if (item.isGraded) return 'graded';
  if (item.attemptCount > 0) return 'submitted';
  if (item.availableUntil && new Date(item.availableUntil) < now) return 'closed';
  if (item.availableFrom && new Date(item.availableFrom) > now) return 'upcoming';
  return 'available';
}

const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  upcoming:  'Upcoming',
  submitted: 'Submitted',
  graded:    'Graded',
  closed:    'Closed',
};

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-100 text-green-700',
  upcoming:  'bg-amber-100 text-amber-700',
  submitted: 'bg-blue-100 text-blue-700',
  graded:    'bg-purple-100 text-purple-700',
  closed:    'bg-gray-100 text-gray-500',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentAssessmentsPage() {
  const [items, setItems]     = useState<AssessmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState<FilterTab>('all');

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      try {
        // ── Auth ──────────────────────────────────────────────────────────
        const { data: authData } = await supabase.auth.getUser();
        if (!authData.user) return;

        const { data: appUser, error: userErr } = await supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', authData.user.id)
          .maybeSingle();

        if (userErr) throw userErr;
        if (!appUser) return;
        const userId = (appUser as any).id;

        // ── Enrollments (active + completed) ──────────────────────────────
        const { data: enrollments, error: enrErr } = await supabase
          .from('enrollments')
          .select('id, offering_id')
          .eq('student_id', userId)
          .in('status', ['active', 'completed']);

        if (enrErr) throw enrErr;
        if (!enrollments?.length) return;

        const offeringIds     = (enrollments as any[]).map(e => e.offering_id);
        const enrollmentIds   = (enrollments as any[]).map(e => e.id);

        // ── Course info for each offering (flat query) ────────────────────
        const { data: offerings, error: offErr } = await supabase
          .from('course_offerings')
          .select('id, section_name, courses!fk_course_offerings_course(code, title), academic_terms!fk_course_offerings_term(term_name)')
          .in('id', offeringIds);

        if (offErr) throw offErr;

        const offeringMap: Record<string, any> = {};
        ((offerings ?? []) as any[]).forEach(o => { offeringMap[o.id] = o; });

        // ── Published assessments ─────────────────────────────────────────
        const { data: assessments, error: assErr } = await supabase
          .from('assessments')
          .select('id, offering_id, title, type, total_marks, time_limit_mins, max_attempts, available_from, available_until')
          .in('offering_id', offeringIds)
          .in('type', ['quiz', 'midterm', 'final_exam'])
          .eq('status', 'published')
          .order('created_at');

        if (assErr) throw assErr;
        if (!assessments?.length) return;

        const assessmentIds = (assessments as any[]).map(a => a.id);

        // ── Student's attempts ────────────────────────────────────────────
        const { data: attempts, error: attErr } = await supabase
          .from('assessment_attempts')
          .select('assessment_id, score, status')
          .eq('student_id', userId)
          .in('assessment_id', assessmentIds)
          .neq('status', 'in_progress');

        if (attErr) throw attErr;

        // ── Graded gradebook items ────────────────────────────────────────
        const { data: gbItems, error: gbErr } = await supabase
          .from('gradebook_items')
          .select('assessment_id, raw_score')
          .in('assessment_id', assessmentIds)
          .in('enrollment_id', enrollmentIds);

        if (gbErr) throw gbErr;

        // ── Build lookups ─────────────────────────────────────────────────
        const attemptsByAssessment: Record<string, number>          = {};
        const bestScoreByAssessment: Record<string, number | null>  = {};

        ((attempts ?? []) as any[]).forEach(a => {
          if (!attemptsByAssessment[a.assessment_id]) {
            attemptsByAssessment[a.assessment_id]  = 0;
            bestScoreByAssessment[a.assessment_id] = null;
          }
          attemptsByAssessment[a.assessment_id]++;
          if (a.score != null) {
            const prev = bestScoreByAssessment[a.assessment_id];
            bestScoreByAssessment[a.assessment_id] = prev == null ? a.score : Math.max(prev, a.score);
          }
        });

        const gradedSet = new Set(((gbItems ?? []) as any[]).map(g => g.assessment_id));

        // ── Map items ─────────────────────────────────────────────────────
        const mapped: AssessmentItem[] = (assessments as any[]).map(a => {
          const o = offeringMap[a.offering_id] ?? {};
          const c = (o.courses as any) ?? {};
          const t = (o.academic_terms as any) ?? {};
          return {
            id:             a.id,
            offeringId:     a.offering_id,
            courseCode:     c.code ?? '—',
            courseTitle:    c.title ?? '—',
            termName:       t.term_name ?? '—',
            title:          a.title ?? '',
            type:           a.type,
            totalMarks:     a.total_marks ?? 100,
            timeLimitMins:  a.time_limit_mins ?? null,
            maxAttempts:    a.max_attempts ?? 1,
            availableFrom:  a.available_from ?? null,
            availableUntil: a.available_until ?? null,
            attemptCount:   attemptsByAssessment[a.id]  ?? 0,
            bestScore:      bestScoreByAssessment[a.id] ?? null,
            isGraded:       gradedSet.has(a.id),
          };
        });

        setItems(mapped);

      } catch (err: any) {
        console.error('StudentAssessmentsPage error:', err);
        setError(err?.message ?? 'Failed to load assessments.');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  const filtered = items.filter(item => {
    const status = getStatus(item);
    if (tab === 'available') return status === 'available';
    if (tab === 'upcoming')  return status === 'upcoming';
    if (tab === 'submitted') return status === 'submitted' || status === 'graded';
    return true;
  });

  const counts = {
    all:       items.length,
    available: items.filter(i => getStatus(i) === 'available').length,
    upcoming:  items.filter(i => getStatus(i) === 'upcoming').length,
    submitted: items.filter(i => ['submitted', 'graded'].includes(getStatus(i))).length,
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl" aria-hidden>📋</span>
          <h1 className="text-2xl font-bold text-gray-900">Assessments</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">Quizzes, midterms, and final exams across all your courses</p>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {(['all', 'available', 'upcoming', 'submitted'] as FilterTab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                tab === t
                  ? 'border-[#4c1d95] text-[#4c1d95]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
              {counts[t] > 0 && (
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                  tab === t ? 'bg-[#4c1d95] text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {counts[t]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        {loading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
            <p className="text-red-700 font-medium text-sm">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <span className="text-4xl block mb-3">📋</span>
            <p className="text-gray-500 font-medium">
              {tab === 'all'
                ? items.length === 0
                  ? 'No published assessments yet for your enrolled courses.'
                  : 'No assessments match this filter.'
                : `No ${tab} assessments.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(item => {
              const status  = getStatus(item);
              const canStart = status === 'available' && item.attemptCount < item.maxAttempts;
              return (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${TYPE_COLORS[item.type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {TYPE_LABELS[item.type] ?? item.type}
                        </span>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${STATUS_COLORS[status]}`}>
                          {STATUS_LABELS[status]}
                        </span>
                      </div>
                      <h2 className="font-semibold text-gray-900 text-base">{item.title}</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {item.courseCode} — {item.courseTitle} · {item.termName}
                      </p>
                      <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-500">
                        <span>{item.totalMarks} marks</span>
                        {item.timeLimitMins && <span>{item.timeLimitMins} min</span>}
                        <span>{item.maxAttempts} attempt{item.maxAttempts !== 1 ? 's' : ''}</span>
                        {item.availableFrom  && <span>Opens {fmtDate(item.availableFrom)}</span>}
                        {item.availableUntil && <span>Closes {fmtDate(item.availableUntil)}</span>}
                        {item.attemptCount > 0 && (
                          <span className="text-blue-600 font-medium">
                            {item.attemptCount}/{item.maxAttempts} attempt{item.maxAttempts !== 1 ? 's' : ''} used
                            {item.isGraded && item.bestScore != null
                              ? ` · Score: ${item.bestScore}/${item.totalMarks}`
                              : ' · Awaiting instructor grade'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {canStart ? (
                        <Link
                          href={`/dashboard/class/${item.offeringId}/assessment/${item.id}`}
                          className="px-4 py-2 rounded-lg bg-[#4c1d95] text-white text-sm font-medium hover:opacity-90"
                        >
                          {item.attemptCount > 0 ? 'Retake' : 'Start'}
                        </Link>
                      ) : status === 'submitted' || status === 'graded' ? (
                        <Link
                          href={`/dashboard/class/${item.offeringId}/assessment/${item.id}`}
                          className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50"
                        >
                          View Result
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
