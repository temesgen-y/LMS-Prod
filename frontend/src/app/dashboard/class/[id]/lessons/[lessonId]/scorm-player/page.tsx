'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Lesson = {
  id: string;
  title: string;
  content_url: string | null;
  duration_mins: number | null;
};

type SCORMStatus = 'not attempted' | 'incomplete' | 'browsed' | 'passed' | 'failed' | 'completed';

type SCORMAttempt = {
  status: SCORMStatus;
  score_raw: number | null;
  score_max: number | null;
  total_time: string;
  lesson_location: string;
  suspend_data: string;
  cmi_data: Record<string, string>;
};

const TERMINAL_STATUSES: SCORMStatus[] = ['passed', 'failed', 'completed'];

const STATUS_COLORS: Record<SCORMStatus, string> = {
  'not attempted': 'bg-gray-100 text-gray-500',
  'incomplete':    'bg-amber-100 text-amber-700',
  'browsed':       'bg-blue-100 text-blue-700',
  'passed':        'bg-green-100 text-green-700',
  'failed':        'bg-red-100 text-red-700',
  'completed':     'bg-green-100 text-green-700',
};

// Add elapsed HH:MM:SS strings
function addTime(a: string, b: string): string {
  const parse = (t: string) => {
    const parts = t.split(':').map(Number);
    return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  };
  const total = parse(a) + parse(b);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function SCORMPlayerPage() {
  const params = useParams();
  const router = useRouter();
  const offeringId  = params?.id as string;
  const lessonId    = params?.lessonId as string;

  const [lesson, setLesson]           = useState<Lesson | null>(null);
  const [attempt, setAttempt]         = useState<SCORMAttempt | null>(null);
  const [userId, setUserId]           = useState<string | null>(null);
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [iframeReady, setIframeReady] = useState(false);
  const [status, setStatus]           = useState<SCORMStatus>('not attempted');
  const [score, setScore]             = useState<number | null>(null);
  const [saving, setSaving]           = useState(false);
  const [topicIndex, setTopicIndex]   = useState(1);

  // Accumulate CMI data as SCORM sets values
  const cmiRef    = useRef<Record<string, string>>({});
  const sessionStart = useRef(Date.now());
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ── Load lesson + existing attempt ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.push('/login'); return; }

      const { data: appUser } = await supabase
        .from('users').select('id, first_name, last_name')
        .eq('auth_user_id', authData.user.id).single();
      if (!appUser) { setLoading(false); return; }
      const uid = (appUser as any).id as string;
      setUserId(uid);

      const [lessonRes, enrollRes] = await Promise.all([
        supabase.from('lessons')
          .select('id, title, content_url, duration_mins')
          .eq('id', lessonId).single(),
        supabase.from('enrollments')
          .select('id').eq('student_id', uid).eq('offering_id', offeringId).single(),
      ]);

      if (!lessonRes.data) { setLoading(false); return; }
      const les = lessonRes.data as Lesson;
      setLesson(les);
      const eid = (enrollRes.data as any)?.id ?? null;
      setEnrollmentId(eid);

      // Load existing SCORM attempt (for resuming)
      const { data: existing } = await supabase
        .from('scorm_attempts')
        .select('status, score_raw, score_max, total_time, lesson_location, suspend_data, cmi_data')
        .eq('lesson_id', lessonId).eq('student_id', uid).maybeSingle();

      let att: SCORMAttempt = {
        status: 'not attempted',
        score_raw: null, score_max: 100,
        total_time: '00:00:00',
        lesson_location: '', suspend_data: '',
        cmi_data: {},
      };
      if (existing) {
        att = {
          status: (existing as any).status ?? 'not attempted',
          score_raw: (existing as any).score_raw ?? null,
          score_max: (existing as any).score_max ?? 100,
          total_time: (existing as any).total_time ?? '00:00:00',
          lesson_location: (existing as any).lesson_location ?? '',
          suspend_data: (existing as any).suspend_data ?? '',
          cmi_data: (existing as any).cmi_data ?? {},
        };
      }
      setAttempt(att);
      setStatus(att.status);
      setScore(att.score_raw);

      // Seed cmiRef with saved data
      cmiRef.current = { ...att.cmi_data };

      // Module index for back link
      const { data: itemRow } = await supabase
        .from('course_module_items').select('module_id')
        .eq('lesson_id', lessonId).eq('offering_id', offeringId).maybeSingle();
      if (itemRow) {
        const { data: allMods } = await supabase
          .from('course_modules').select('id')
          .eq('offering_id', offeringId).eq('is_visible', true)
          .order('sort_order', { ascending: true });
        const idx = ((allMods ?? []) as any[]).findIndex(m => m.id === (itemRow as any).module_id);
        if (idx >= 0) setTopicIndex(idx + 1);
      }

      const u = appUser as any;
      // Pre-populate student name/id so SCORM can display it
      cmiRef.current['cmi.core.student_id']   = uid;
      cmiRef.current['cmi.core.student_name'] = `${u.last_name ?? ''}, ${u.first_name ?? ''}`.trim();
      cmiRef.current['cmi.core.lesson_status'] = att.status === 'not attempted' ? 'not attempted' : att.status;
      if (att.lesson_location) cmiRef.current['cmi.core.lesson_location'] = att.lesson_location;
      if (att.suspend_data)    cmiRef.current['cmi.suspend_data']          = att.suspend_data;
      if (att.total_time)      cmiRef.current['cmi.core.total_time']       = att.total_time;
      if (att.score_raw !== null) cmiRef.current['cmi.core.score.raw'] = String(att.score_raw);

      setLoading(false);
    })();
  }, [offeringId, lessonId, router]);

  // ── Persist SCORM progress to DB ───────────────────────────────────────────
  const saveProgress = useCallback(async (finalCmi: Record<string, string>, isFinal: boolean) => {
    if (!userId || !lessonId) return;
    setSaving(true);

    const rawStatus = (finalCmi['cmi.core.lesson_status'] ?? 'incomplete') as SCORMStatus;
    const scoreRaw  = finalCmi['cmi.core.score.raw'] ? parseFloat(finalCmi['cmi.core.score.raw']) : null;
    const scoreMax  = finalCmi['cmi.core.score.max'] ? parseFloat(finalCmi['cmi.core.score.max']) : 100;

    // Calculate session time and add to total
    const sessionSecs = Math.floor((Date.now() - sessionStart.current) / 1000);
    const sessionTime = `${String(Math.floor(sessionSecs/3600)).padStart(2,'0')}:${String(Math.floor((sessionSecs%3600)/60)).padStart(2,'0')}:${String(sessionSecs%60).padStart(2,'0')}`;
    const prevTotal   = attempt?.total_time ?? '00:00:00';
    const newTotal    = addTime(prevTotal, sessionTime);

    const isTerminal = TERMINAL_STATUSES.includes(rawStatus);
    const supabase = createClient();

    await supabase.from('scorm_attempts').upsert({
      lesson_id:       lessonId,
      student_id:      userId,
      enrollment_id:   enrollmentId,
      status:          rawStatus,
      score_raw:       scoreRaw,
      score_max:       scoreMax,
      total_time:      newTotal,
      lesson_location: finalCmi['cmi.core.lesson_location'] ?? '',
      suspend_data:    finalCmi['cmi.suspend_data'] ?? '',
      cmi_data:        finalCmi,
      ...(isTerminal ? { completed_at: new Date().toISOString() } : {}),
    }, { onConflict: 'lesson_id,student_id' });

    // Mirror into lesson_progress so the course progress bar works
    if (enrollmentId && (isTerminal || rawStatus === 'completed')) {
      await supabase.from('lesson_progress').upsert({
        enrollment_id: enrollmentId,
        lesson_id:     lessonId,
        student_id:    userId,
        status:        'completed',
        completed_at:  new Date().toISOString(),
      }, { onConflict: 'enrollment_id,lesson_id' });
    } else if (enrollmentId && rawStatus === 'incomplete') {
      await supabase.from('lesson_progress').upsert({
        enrollment_id: enrollmentId,
        lesson_id:     lessonId,
        student_id:    userId,
        status:        'in_progress',
      }, { onConflict: 'enrollment_id,lesson_id' });
    }

    setStatus(rawStatus);
    setScore(scoreRaw);
    setSaving(false);
  }, [userId, lessonId, enrollmentId, attempt]);

  // ── postMessage listener — receives SCORM calls from proxied iframe ─────────
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data?.__scorm) return;
      const { type, payload } = e.data;

      if (type === 'ready') {
        // Seed the iframe with saved CMI data
        iframeRef.current?.contentWindow?.postMessage(
          { __scorm_init: true, seed: cmiRef.current }, '*'
        );
        setIframeReady(true);
      } else if (type === 'setvalue') {
        cmiRef.current[payload.element] = payload.value;
        // Update visible status/score reactively
        if (payload.element === 'cmi.core.lesson_status') setStatus(payload.value as SCORMStatus);
        if (payload.element === 'cmi.core.score.raw')     setScore(parseFloat(payload.value) || null);
      } else if (type === 'commit') {
        cmiRef.current = { ...cmiRef.current, ...payload.cmi };
        saveProgress(cmiRef.current, false);
      } else if (type === 'finish') {
        cmiRef.current = { ...cmiRef.current, ...payload.cmi };
        saveProgress(cmiRef.current, true);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [saveProgress]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-screen bg-gray-900">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!lesson?.content_url) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-screen gap-3">
        <p className="text-gray-600">No SCORM content URL configured for this lesson.</p>
        <button onClick={() => router.push(`/dashboard/class/${offeringId}/lessons/${lessonId}`)}
          className="text-[#4c1d95] hover:underline text-sm">← Back to lesson</button>
      </div>
    );
  }

  const proxyUrl = `/api/scorm/proxy?url=${encodeURIComponent(lesson.content_url)}`;

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Slim header bar */}
      <div className="flex items-center justify-between px-4 h-11 bg-[#1e1b2e] text-white shrink-0 gap-3">
        <button
          onClick={() => router.push(`/dashboard/class/${offeringId}/lessons/${lessonId}`)}
          className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0 justify-center">
          <span className="text-sm font-medium truncate text-white/90">{lesson.title}</span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {saving && (
            <span className="text-xs text-white/50 flex items-center gap-1">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Saving…
            </span>
          )}
          {score !== null && (
            <span className="text-xs font-mono bg-white/10 px-2 py-0.5 rounded">
              Score: {score}%
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[status]}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>
      </div>

      {/* SCORM iframe — proxied so window.parent.API works */}
      <div className="flex-1 relative">
        {!iframeReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800 z-10">
            <div className="text-center text-white/60">
              <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">Loading SCORM content…</p>
            </div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={proxyUrl}
          className="w-full h-full border-0"
          title={lesson.title}
          allow="fullscreen"
          onLoad={() => {
            // If the bridge script doesn't fire 'ready' (non-HTML or no postMessage),
            // show the iframe anyway after a short delay.
            setTimeout(() => setIframeReady(true), 1500);
          }}
        />
      </div>

      {/* Footer — manual save for non-communicating packages */}
      <div className="flex items-center justify-between px-4 h-10 bg-[#1e1b2e] text-white/60 text-xs shrink-0">
        <span>SCORM 1.2 · {lesson.duration_mins ? `${lesson.duration_mins} min` : 'Duration not set'}</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => saveProgress(cmiRef.current, true)}
            disabled={saving}
            className="text-white/50 hover:text-white transition disabled:opacity-40 text-xs"
          >
            Save progress
          </button>
          {TERMINAL_STATUSES.includes(status) && (
            <span className="text-green-400 font-medium">✓ Saved</span>
          )}
        </div>
      </div>
    </div>
  );
}
