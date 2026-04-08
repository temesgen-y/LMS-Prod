'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import ProtectedVideoPlayer from '@/components/student/ProtectedVideoPlayer';
import { preprocessRichTextHtml } from '@/utils/videoUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

type Lesson = {
  id: string;
  title: string;
  type: 'video' | 'document' | 'link' | 'scorm';
  content_url: string | null;
  content_body: string | null;
  duration_mins: number | null;
};

type ProgressStatus = 'not_started' | 'in_progress' | 'completed';

type NavItem = { lessonId: string; title: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m?.[1] ?? null;
}

function DocumentContent({ url, title }: { url: string; title: string }) {
  return (
    <div className="space-y-3">
      <iframe
        src={url}
        className="w-full rounded-lg border border-gray-200"
        style={{ height: '70vh' }}
        title={title}
      />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm text-[#4c1d95] hover:underline"
      >
        📄 Open PDF in new tab
      </a>
    </div>
  );
}

function LinkContent({ url, onOpen }: { url: string; onOpen: () => void }) {
  return (
    <div className="border border-gray-200 rounded-xl p-10 bg-gray-50 text-center">
      <div className="text-5xl mb-4">🔗</div>
      <p className="text-gray-600 text-sm mb-6 max-w-sm mx-auto">
        This lesson links to an external resource that will open in a new tab.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onOpen}
        className="inline-flex items-center gap-2 bg-[#4c1d95] text-white px-6 py-3 rounded-lg text-sm font-semibold hover:bg-[#5b21b6] transition-colors"
      >
        Open External Resource →
      </a>
      <p className="text-xs text-gray-400 mt-3">Opens in a new tab</p>
    </div>
  );
}

function RichContent({ html }: { html: string }) {
  // Preprocess the HTML string on the client before rendering.
  // This rewrites YouTube iframes to nocookie URLs and wraps them
  // with black overlay divs — all baked into the HTML, so there are
  // no timing issues and no z-index battles with iframe compositing.
  const safeHtml = useMemo(() => preprocessRichTextHtml(html), [html]);

  return (
    <div
      className="prose prose-sm max-w-none text-gray-700"
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}

function ScormContent({ url, title }: { url: string; title: string }) {
  return (
    <iframe
      src={url}
      className="w-full rounded-lg border border-gray-200"
      style={{ height: '80vh' }}
      title={title}
    />
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const LESSON_ICONS: Record<string, string> = {
  video: '📹', document: '📄', link: '🔗', scorm: '📦',
};

export default function LessonDetailPage() {
  const params = useParams();
  const router = useRouter();
  const offeringId = params?.id as string;
  const lessonId = params?.lessonId as string;

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [progress, setProgress] = useState<ProgressStatus>('not_started');
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [topicIndex, setTopicIndex] = useState(1);
  const [moduleTitle, setModuleTitle] = useState('');
  const [prev, setPrev] = useState<NavItem | null>(null);
  const [next, setNext] = useState<NavItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [markingComplete, setMarkingComplete] = useState(false);

  const markComplete = useCallback(async (eid?: string | null, uid?: string | null) => {
    const eidToUse = eid ?? enrollmentId;
    const uidToUse = uid ?? userId;
    if (!eidToUse || markingComplete) return;
    setMarkingComplete(true);
    const supabase = createClient();
    const { error } = await supabase.from('lesson_progress').upsert({
      enrollment_id: eidToUse,
      lesson_id: lessonId,
      student_id: uidToUse,
      status: 'completed',
      completed_at: new Date().toISOString(),
    }, { onConflict: 'enrollment_id,lesson_id' });
    if (!error) setProgress('completed');
    setMarkingComplete(false);
  }, [enrollmentId, userId, lessonId, markingComplete]);

  useEffect(() => {
    if (!offeringId || !lessonId) return;
    (async () => {
      const supabase = createClient();

      // Auth
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setLoading(false); return; }
      const { data: appUser } = await supabase.from('users').select('id').eq('auth_user_id', authData.user.id).single();
      if (!appUser) { setLoading(false); return; }
      const uid = (appUser as any).id as string;
      setUserId(uid);

      // Parallel: enrollment + lesson
      const [enrollRes, lessonRes] = await Promise.all([
        supabase.from('enrollments').select('id').eq('student_id', uid).eq('offering_id', offeringId).single(),
        supabase.from('lessons').select('id, title, type, content_url, content_body, duration_mins').eq('id', lessonId).single(),
      ]);

      const eid = (enrollRes.data as any)?.id ?? null;
      setEnrollmentId(eid);

      if (!lessonRes.data) { setLoading(false); return; }
      setLesson(lessonRes.data as Lesson);

      // Parallel: progress + module item
      const [progressRes, itemRes] = await Promise.all([
        eid
          ? supabase.from('lesson_progress').select('status').eq('enrollment_id', eid).eq('lesson_id', lessonId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('course_module_items').select('module_id, sort_order').eq('lesson_id', lessonId).eq('offering_id', offeringId).maybeSingle(),
      ]);

      const currentStatus: ProgressStatus = (progressRes.data as any)?.status ?? 'not_started';
      setProgress(currentStatus);

      // Mark as in_progress on open (if not already further)
      if (eid && currentStatus === 'not_started') {
        await supabase.from('lesson_progress').upsert({
          enrollment_id: eid,
          lesson_id: lessonId,
          student_id: uid,
          status: 'in_progress',
        }, { onConflict: 'enrollment_id,lesson_id' });
        setProgress('in_progress');
      }

      const modId = (itemRes.data as any)?.module_id ?? null;

      if (modId) {
        // Parallel: module info + lesson siblings + all modules (for T-number)
        const [moduleRes, siblingsRes, allModsRes] = await Promise.all([
          supabase.from('course_modules').select('id, title').eq('id', modId).single(),
          supabase.from('course_module_items')
            .select('lesson_id, sort_order')
            .eq('module_id', modId)
            .eq('item_type', 'lesson')
            .eq('is_visible', true)
            .order('sort_order', { ascending: true }),
          supabase.from('course_modules')
            .select('id')
            .eq('offering_id', offeringId)
            .eq('is_visible', true)
            .order('sort_order', { ascending: true }),
        ]);

        setModuleTitle((moduleRes.data as any)?.title ?? '');

        const allMods = (allModsRes.data ?? []) as any[];
        const tidx = allMods.findIndex(m => m.id === modId);
        setTopicIndex(tidx >= 0 ? tidx + 1 : 1);

        // Find prev/next
        const siblings = (siblingsRes.data ?? []) as any[];
        const curIdx = siblings.findIndex(s => s.lesson_id === lessonId);
        const idsToFetch: string[] = [];
        if (curIdx > 0) idsToFetch.push(siblings[curIdx - 1].lesson_id);
        if (curIdx < siblings.length - 1) idsToFetch.push(siblings[curIdx + 1].lesson_id);

        if (idsToFetch.length > 0) {
          const { data: navLessons } = await supabase.from('lessons').select('id, title').in('id', idsToFetch);
          const navMap: Record<string, string> = {};
          ((navLessons ?? []) as any[]).forEach(l => { navMap[l.id] = l.title; });
          if (curIdx > 0) {
            const pid = siblings[curIdx - 1].lesson_id;
            setPrev({ lessonId: pid, title: navMap[pid] ?? 'Previous' });
          }
          if (curIdx < siblings.length - 1) {
            const nid = siblings[curIdx + 1].lesson_id;
            setNext({ lessonId: nid, title: navMap[nid] ?? 'Next' });
          }
        }
      }

      setLoading(false);
    })();
  }, [offeringId, lessonId]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6 max-w-4xl">
        <div className="h-4 bg-gray-200 rounded w-1/4" />
        <div className="h-8 bg-gray-200 rounded w-2/3" />
        <div className="aspect-video bg-gray-200 rounded-lg" />
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="py-16 text-center">
        <span className="text-5xl block mb-4">📭</span>
        <p className="text-gray-500">Lesson not found.</p>
        <Link href={`/dashboard/class/${offeringId}`} className="text-sm text-[#4c1d95] hover:underline mt-2 block">
          ← Back to course
        </Link>
      </div>
    );
  }

  const progColors: Record<ProgressStatus, string> = {
    not_started: 'bg-gray-100 text-gray-500',
    in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-green-100 text-green-700',
  };
  const progLabels: Record<ProgressStatus, string> = {
    not_started: 'Not Started',
    in_progress: 'In Progress',
    completed: '✓ Completed',
  };

  return (
    <div className="w-full min-w-0 max-w-4xl">
      {/* Back link */}
      <Link
        href={`/dashboard/class/${offeringId}/t${topicIndex}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-5"
      >
        ← T{topicIndex} {moduleTitle}
      </Link>

      {/* Lesson header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-2xl">{LESSON_ICONS[lesson.type] ?? '📄'}</span>
          <span className="text-xs text-gray-500 font-medium capitalize">{lesson.type}</span>
          {lesson.duration_mins && (
            <span className="text-xs text-gray-400">· {lesson.duration_mins} min</span>
          )}
          <span className={`ml-auto text-xs px-2.5 py-0.5 rounded font-medium ${progColors[progress]}`}>
            {progLabels[progress]}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{lesson.title}</h1>
      </div>

      <div className="border-t border-gray-200 mb-6" />

      {/* Content */}
      {lesson.content_url ? (
        <div className="mb-8">
          {lesson.type === 'video' && (
            (() => {
              const vimeoId = extractVimeoId(lesson.content_url);
              if (vimeoId) {
                return (
                  <div className="aspect-video rounded-lg overflow-hidden bg-black">
                    <iframe
                      src={`https://player.vimeo.com/video/${vimeoId}`}
                      className="w-full h-full"
                      allowFullScreen
                      title="Video lesson"
                    />
                  </div>
                );
              }
              return (
                <ProtectedVideoPlayer
                  url={lesson.content_url!}
                  title={lesson.title}
                  onEnded={() => markComplete()}
                />
              );
            })()
          )}
          {lesson.type === 'document' && (
            <DocumentContent url={lesson.content_url} title={lesson.title} />
          )}
          {lesson.type === 'link' && (
            <LinkContent url={lesson.content_url} onOpen={() => markComplete()} />
          )}
          {lesson.type === 'scorm' && (
            <ScormContent url={lesson.content_url} title={lesson.title} />
          )}
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8 text-sm text-amber-700">
          ⚠️ No content has been added to this lesson yet.
        </div>
      )}

      {/* WYSIWYG description */}
      {lesson.content_body && (
        <div className="mb-8">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Description</h2>
          <RichContent html={lesson.content_body} />
        </div>
      )}

      {/* Footer nav */}
      <div className="border-t border-gray-200 pt-6 flex items-center justify-between gap-4">
        {/* Previous */}
        <div className="flex-1">
          {prev ? (
            <button
              type="button"
              onClick={() => router.push(`/dashboard/class/${offeringId}/lessons/${prev.lessonId}`)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <span>←</span>
              <span className="truncate max-w-[150px]">{prev.title}</span>
            </button>
          ) : <div />}
        </div>

        {/* Mark Complete */}
        <button
          type="button"
          onClick={() => markComplete()}
          disabled={progress === 'completed' || markingComplete || !enrollmentId}
          className={`flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            progress === 'completed'
              ? 'bg-green-100 text-green-700 cursor-default'
              : 'bg-[#4c1d95] text-white hover:bg-[#5b21b6] disabled:opacity-50'
          }`}
        >
          {markingComplete ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            progress === 'completed' ? '✓ Completed' : 'Mark Complete'
          )}
        </button>

        {/* Next */}
        <div className="flex-1 text-right">
          {next ? (
            <button
              type="button"
              onClick={() => router.push(`/dashboard/class/${offeringId}/lessons/${next.lessonId}`)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 ml-auto"
            >
              <span className="truncate max-w-[150px]">{next.title}</span>
              <span>→</span>
            </button>
          ) : <div />}
        </div>
      </div>
    </div>
  );
}
