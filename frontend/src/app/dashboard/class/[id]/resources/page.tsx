'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Lesson = {
  id: string;
  title: string;
  type: 'video' | 'document' | 'link' | 'scorm';
  contentUrl: string | null;
  durationMins: number | null;
  progressStatus: 'not_started' | 'in_progress' | 'completed' | null;
};

const LESSON_ICONS: Record<string, string> = {
  video: '📹',
  document: '📄',
  link: '🔗',
  scorm: '📦',
};

const PROGRESS_STYLES = {
  not_started: { label: 'Not Started', cls: 'bg-gray-100 text-gray-500' },
  in_progress:  { label: 'In Progress',  cls: 'bg-amber-100 text-amber-700' },
  completed:    { label: '✓ Completed',  cls: 'bg-green-100 text-green-700' },
};

export default function ClassResourcesPage() {
  const params = useParams();
  const offeringId = params?.id as string;

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    if (!offeringId) return;
    (async () => {
      const supabase = createClient();

      // Get user + enrollment
      const { data: authData } = await supabase.auth.getUser();
      let enrollmentId: string | null = null;
      if (authData.user) {
        const { data: appUser } = await supabase
          .from('users').select('id').eq('auth_user_id', authData.user.id).single();
        if (appUser) {
          const { data: enr } = await supabase
            .from('enrollments')
            .select('id')
            .eq('student_id', (appUser as { id: string }).id)
            .eq('offering_id', offeringId)
            .single();
          enrollmentId = (enr as any)?.id ?? null;
        }
      }

      // Fetch visible lessons for this offering
      const { data: lessonRows } = await supabase
        .from('lessons')
        .select('id, title, type, content_url, duration_mins')
        .eq('offering_id', offeringId)
        .eq('is_visible', true)
        .order('title', { ascending: true });

      const lessonData = (lessonRows ?? []) as any[];
      const lessonIds = lessonData.map(l => l.id);

      // Fetch lesson progress if enrolled
      let progressMap: Record<string, string> = {};
      if (enrollmentId && lessonIds.length > 0) {
        const { data: progRows } = await supabase
          .from('lesson_progress')
          .select('lesson_id, status')
          .eq('enrollment_id', enrollmentId)
          .in('lesson_id', lessonIds);
        ((progRows ?? []) as any[]).forEach(p => { progressMap[p.lesson_id] = p.status; });
      }

      setLessons(
        lessonData.map(l => ({
          id: l.id,
          title: l.title,
          type: l.type,
          contentUrl: l.content_url,
          durationMins: l.duration_mins,
          progressStatus: (progressMap[l.id] ?? 'not_started') as 'completed' | 'in_progress' | 'not_started' | null,
        }))
      );
      setLoading(false);
    })();
  }, [offeringId]);

  const types = [...new Set(lessons.map(l => l.type))];
  const filtered = typeFilter ? lessons.filter(l => l.type === typeFilter) : lessons;

  return (
    <div className="w-full min-w-0">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl" aria-hidden>📚</span>
        <h1 className="text-2xl font-bold text-gray-900">Class Resources</h1>
      </div>
      <div className="border-t border-gray-200 mb-6" />

      {loading ? (
        <div className="animate-pulse grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
        </div>
      ) : lessons.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <span className="text-5xl block mb-4">📚</span>
          <p className="text-gray-500 font-medium">No resources yet</p>
          <p className="text-gray-400 text-sm mt-1">Your instructor has not published any resources for this course yet.</p>
        </div>
      ) : (
        <>
          {/* Type filters */}
          {types.length > 1 && (
            <div className="flex gap-2 mb-5 flex-wrap">
              <button
                type="button"
                onClick={() => setTypeFilter('')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  !typeFilter ? 'bg-[#4c1d95] text-white border-[#4c1d95]' : 'border-gray-300 text-gray-600 hover:border-[#4c1d95]'
                }`}
              >
                All ({lessons.length})
              </button>
              {types.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1 ${
                    typeFilter === t ? 'bg-[#4c1d95] text-white border-[#4c1d95]' : 'border-gray-300 text-gray-600 hover:border-[#4c1d95]'
                  }`}
                >
                  {LESSON_ICONS[t] ?? '📄'} {t.charAt(0).toUpperCase() + t.slice(1)} ({lessons.filter(l => l.type === t).length})
                </button>
              ))}
            </div>
          )}

          {/* Resource cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map(l => {
              const prog = l.progressStatus ?? 'not_started';
              const progStyle = PROGRESS_STYLES[prog];
              return (
                <div
                  key={l.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3 hover:shadow-sm transition-shadow"
                >
                  <span className="text-3xl flex-shrink-0">{LESSON_ICONS[l.type] ?? '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{l.title}</h3>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${progStyle.cls}`}>
                        {progStyle.label}
                      </span>
                      <span className="text-xs text-gray-400 capitalize">{l.type}</span>
                      {l.durationMins && (
                        <span className="text-xs text-gray-400">{l.durationMins} min</span>
                      )}
                    </div>
                    {l.contentUrl && (
                      <a
                        href={l.contentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#4c1d95] hover:underline"
                      >
                        Open {l.type === 'video' ? 'Video' : l.type === 'document' ? 'Document' : 'Link'} →
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No {typeFilter} resources found.</p>
          )}
        </>
      )}
    </div>
  );
}
