'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getGradeColor } from '@/utils/gradeCalculator';

type ClassCard = {
  enrollmentId: string;
  offeringId: string;
  topic: string;
  title: string;
  startDate: string;
  endDate: string;
  instructor: string;
  studentCount: number;
  enrollmentStatus: string;
  finalGrade: string | null;
  finalScore: number | null;
};

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function primaryInstructor(
  instructors: Array<{ role: string; users: { first_name: string; last_name: string } | null }> | null
): string {
  if (!instructors || instructors.length === 0) return 'TBA';
  const primary = instructors.find(i => i.role === 'primary') ?? instructors[0];
  const u = primary.users;
  if (!u) return 'TBA';
  return `${u.first_name} ${u.last_name}`;
}

export default function CoursesPage() {
  const [current, setCurrent] = useState<ClassCard[]>([]);
  const [past, setPast] = useState<ClassCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'current' | 'past'>('current');

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setLoading(false); return; }

      const { data: appUser } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', authData.user.id)
        .single();
      if (!appUser) { setLoading(false); return; }

      const { data: rows } = await supabase
        .from('enrollments')
        .select(`
          id, status, offering_id, final_grade, final_score,
          course_offerings!fk_enrollments_offering(
            id, section_name, enrolled_count, status,
            courses!fk_course_offerings_course(code, title),
            academic_terms!fk_course_offerings_term(term_name, start_date, end_date),
            course_instructors(role, users!fk_course_instructors_instructor(first_name, last_name))
          )
        `)
        .eq('student_id', (appUser as { id: string }).id)
        .order('status', { ascending: true });

      const currentCards: ClassCard[] = [];
      const pastCards: ClassCard[] = [];

      for (const row of (rows ?? []) as any[]) {
        const o = row.course_offerings;
        if (!o) continue;
        const card: ClassCard = {
          enrollmentId:     row.id,
          offeringId:       row.offering_id,
          topic:            `Section ${o.section_name} — ${o.courses?.code ?? ''}`,
          title:            o.courses?.title ?? 'Untitled Course',
          startDate:        fmt(o.academic_terms?.start_date),
          endDate:          fmt(o.academic_terms?.end_date),
          instructor:       primaryInstructor(o.course_instructors ?? []),
          studentCount:     o.enrolled_count ?? 0,
          enrollmentStatus: row.status,
          finalGrade:       row.final_grade ?? null,
          finalScore:       row.final_score ?? null,
        };
        if (row.status === 'active' && ['upcoming', 'active'].includes(o.status)) {
          currentCards.push(card);
        } else {
          pastCards.push(card);
        }
      }

      setCurrent(currentCards);
      setPast(pastCards);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl" aria-hidden>📚</span>
          <h1 className="text-2xl font-bold text-gray-900">My Courses</h1>
        </div>
        <p className="text-gray-500 text-sm mb-6">
          Students will see their classes 3 days before each class&apos;s start date.{' '}
          <Link href="/dashboard/schedule" className="text-[#0078d4] hover:underline">
            Missing a class? View your full schedule.
          </Link>
        </p>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-gray-200 mb-6">
          {(['current', 'past'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab
                  ? 'border-[#4c1d95] text-[#4c1d95]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'current' ? 'CURRENT' : 'PAST'} CLASSES ({loading ? '…' : tab === 'current' ? current.length : past.length})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading your classes…
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {activeTab === 'current' && (
              current.length === 0 ? (
                <p className="text-gray-400 text-sm">You have no current classes.</p>
              ) : current.map(c => (
                <article key={c.enrollmentId} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="h-3 bg-[#FEF08A]" />
                  <div className="px-5 py-4">
                    <p className="text-gray-500 text-sm mb-1">{c.topic}</p>
                    <h2 className="text-lg font-bold text-gray-900 mb-3">{c.title}</h2>
                    <div className="flex flex-wrap gap-5 text-sm text-gray-600 mb-4">
                      <span className="flex items-center gap-1.5"><span aria-hidden>📅</span>{c.startDate} - {c.endDate}</span>
                      <span className="flex items-center gap-1.5"><span aria-hidden>🎓</span>{c.instructor}</span>
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden>👥</span>
                        <span className="text-[#1565C0] font-medium">{c.studentCount} Student{c.studentCount !== 1 ? 's' : ''}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden>📊</span>
                        {c.finalGrade ? (
                          <span className="flex items-center gap-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(c.finalGrade)}`}>{c.finalGrade}</span>
                            {c.finalScore !== null && <span className="text-gray-500 text-xs">{c.finalScore.toFixed(1)}</span>}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">In Progress</span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-center">
                      <Link
                        href={`/dashboard/class/${c.offeringId}/t1`}
                        className="inline-flex items-center justify-center px-8 py-3 rounded-lg bg-[#0078d4] hover:bg-[#106ebe] text-white font-semibold text-sm uppercase tracking-wide"
                      >
                        GO TO CLASS
                      </Link>
                    </div>
                  </div>
                </article>
              ))
            )}

            {activeTab === 'past' && (
              past.length === 0 ? (
                <p className="text-gray-400 text-sm">You have no past classes.</p>
              ) : past.map(c => (
                <article key={c.enrollmentId} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden opacity-90">
                  <div className="h-3 bg-gray-200" />
                  <div className="px-5 py-4">
                    <p className="text-gray-400 text-sm mb-1">{c.topic}</p>
                    <h2 className="text-lg font-bold text-gray-900 mb-3">{c.title}</h2>
                    <div className="flex flex-wrap gap-5 text-sm text-gray-500 mb-4">
                      <span className="flex items-center gap-1.5"><span aria-hidden>📅</span>{c.startDate} - {c.endDate}</span>
                      <span className="flex items-center gap-1.5"><span aria-hidden>🎓</span>{c.instructor}</span>
                      <span className="flex items-center gap-1.5"><span aria-hidden>👥</span>{c.studentCount} Student{c.studentCount !== 1 ? 's' : ''}</span>
                      <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs capitalize">{c.enrollmentStatus}</span>
                      {c.finalGrade ? (
                        <span className="flex items-center gap-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(c.finalGrade)}`}>{c.finalGrade}</span>
                          {c.finalScore !== null && <span className="text-gray-400 text-xs">{c.finalScore.toFixed(1)}</span>}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">In Progress</span>
                      )}
                    </div>
                    <div className="flex justify-center">
                      <Link
                        href={`/dashboard/class/${c.offeringId}/t1`}
                        className="inline-flex items-center justify-center px-8 py-3 rounded-lg bg-gray-400 hover:bg-gray-500 text-white font-semibold text-sm uppercase tracking-wide"
                      >
                        VIEW CLASS
                      </Link>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
