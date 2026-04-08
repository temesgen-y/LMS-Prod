'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type CourseModule = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  unlock_date: string | null;
};

type ModuleItem = {
  id: string;
  sort_order: number;
  item_type: 'lesson' | 'assessment' | 'assignment' | 'live_session' | 'link';
  is_visible: boolean;
  is_mandatory: boolean;
  item_title: string | null;
  item_url: string | null;
  lesson_id: string | null;
  assessment_id: string | null;
  assignment_id: string | null;
  live_session_id: string | null;
  // Resolved detail
  detail: LessonDetail | AssessmentDetail | AssignmentDetail | LiveSessionDetail | null;
  // Student progress
  progress: ProgressInfo | null;
};

type LessonDetail = {
  kind: 'lesson';
  title: string;
  type: 'video' | 'document' | 'link' | 'scorm';
  content_url: string | null;
  content_body: string | null;
  duration_mins: number | null;
};

type AssessmentDetail = {
  kind: 'assessment';
  title: string;
  type: string;
  total_marks: number;
  time_limit_mins: number | null;
  max_attempts: number;
  available_from: string | null;
  available_until: string | null;
};

type AssignmentDetail = {
  kind: 'assignment';
  title: string;
  brief: string | null;
  max_score: number;
  due_date: string | null;
  late_allowed: boolean;
};

type LiveSessionDetail = {
  kind: 'live_session';
  title: string;
  platform: string;
  join_url: string;
  scheduled_at: string;
  duration_mins: number | null;
  recording_url: string | null;
  status: string;
};

type ProgressInfo =
  | { type: 'lesson'; status: 'not_started' | 'in_progress' | 'completed' }
  | { type: 'assessment'; attempts: number; score_pct: number | null; passed: boolean | null; status: string }
  | { type: 'assignment'; submitted: boolean; graded: boolean; score: number | null; status: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LESSON_ICONS: Record<string, string> = { video: '📹', document: '📄', link: '🔗', scorm: '📦' };

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDatetime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function isWithin15Min(scheduledAt: string): boolean {
  const diff = new Date(scheduledAt).getTime() - Date.now();
  return diff >= -15 * 60 * 1000 && diff <= 15 * 60 * 1000;
}

function assessmentActionLabel(detail: AssessmentDetail, progress: ProgressInfo | null): { label: string; color: string; disabled: boolean } {
  const now = Date.now();
  const fromTs = detail.available_from ? new Date(detail.available_from).getTime() : 0;
  const untilTs = detail.available_until ? new Date(detail.available_until).getTime() : Infinity;
  const inWindow = now >= fromTs && now <= untilTs;

  if (progress?.type === 'assessment') {
    if (progress.status === 'graded') return { label: 'View Result', color: 'bg-green-600 hover:bg-green-700', disabled: false };
    if (progress.status === 'submitted') return { label: 'Pending', color: 'bg-gray-400', disabled: true };
    if (progress.status === 'in_progress') return { label: 'Continue', color: 'bg-amber-500 hover:bg-amber-600', disabled: !inWindow };
  }
  if (!inWindow && now > untilTs) return { label: 'Missed', color: 'bg-red-100 text-red-700', disabled: true };
  if (!inWindow) return { label: 'Upcoming', color: 'bg-blue-100 text-blue-700', disabled: true };
  return { label: 'Start', color: 'bg-[#4c1d95] hover:bg-[#5b21b6]', disabled: false };
}

function assignmentActionLabel(detail: AssignmentDetail, progress: ProgressInfo | null): { label: string; color: string; disabled: boolean } {
  const now = Date.now();
  const dueTs = detail.due_date ? new Date(detail.due_date).getTime() : Infinity;
  const overdue = now > dueTs;

  if (progress?.type === 'assignment') {
    if (progress.graded) return { label: 'View Feedback', color: 'bg-green-600 hover:bg-green-700', disabled: false };
    if (progress.submitted) return { label: 'Submitted', color: 'bg-gray-400', disabled: true };
  }
  if (overdue && !detail.late_allowed) return { label: 'Overdue', color: 'bg-red-100 text-red-700', disabled: true };
  return { label: 'Submit', color: 'bg-[#0078d4] hover:bg-[#106ebe]', disabled: false };
}

// ─── CollapsibleItem ─────────────────────────────────────────────────────────

function AssessmentItem({ item, offeringId }: { item: ModuleItem; offeringId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const detail = item.detail as AssessmentDetail;
  const action = assessmentActionLabel(detail, item.progress);

  function handleAction() {
    if (action.disabled || !item.assessment_id) return;
    router.push(`/dashboard/class/${offeringId}/assessment/${item.assessment_id}`);
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
      {/* Header row */}
      <div className="flex items-center gap-2 px-4 py-3 bg-white">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          <span className={`text-sm transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        </button>
        <span className="text-lg flex-shrink-0">📝</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{detail.title}</p>
          <p className="text-xs text-gray-500 capitalize">{detail.type.replace(/_/g, ' ')}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleAction}
            disabled={action.disabled}
            className={`px-3 py-1.5 rounded text-xs font-semibold ${action.color} ${action.disabled ? 'opacity-70 cursor-default' : 'cursor-pointer'}`}
          >
            {action.label}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {open && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-gray-500 font-medium">Start Date</p>
              <p className="text-gray-800 mt-0.5">{fmt(detail.available_from)}</p>
            </div>
            <div>
              <p className="text-gray-500 font-medium">Due Date</p>
              <p className="text-gray-800 mt-0.5">{fmt(detail.available_until)}</p>
            </div>
            <div>
              <p className="text-gray-500 font-medium">Points</p>
              <p className="text-gray-800 mt-0.5">{detail.total_marks}</p>
            </div>
            <div>
              <p className="text-gray-500 font-medium">Status</p>
              {item.progress?.type === 'assessment' ? (
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mt-0.5 ${
                  item.progress.status === 'graded' ? 'bg-green-100 text-green-700' :
                  item.progress.status === 'submitted' ? 'bg-gray-100 text-gray-600' :
                  'bg-amber-100 text-amber-700'
                }`}>{item.progress.status}</span>
              ) : (
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 mt-0.5">Active</span>
              )}
            </div>
          </div>
          {detail.time_limit_mins && (
            <p className="text-xs text-gray-500">Time limit: {detail.time_limit_mins} minutes · Max attempts: {detail.max_attempts}</p>
          )}
          {item.progress?.type === 'assessment' && item.progress.score_pct != null && (
            <p className="text-xs font-semibold text-green-700">Score: {item.progress.score_pct.toFixed(1)}%{item.progress.passed ? ' ✓ Passed' : ' ✗ Not passed'}</p>
          )}
        </div>
      )}
    </div>
  );
}

function AssignmentItem({ item }: { item: ModuleItem }) {
  const [open, setOpen] = useState(false);
  const detail = item.detail as AssignmentDetail;
  const action = assignmentActionLabel(detail, item.progress);
  const now = Date.now();
  const dueTs = detail.due_date ? new Date(detail.due_date).getTime() : Infinity;
  const overdue = now > dueTs;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
      <div className="flex items-center gap-2 px-4 py-3 bg-white">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <span className={`text-sm transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        </button>
        <span className="text-lg flex-shrink-0">📋</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{detail.title}</p>
          <p className={`text-xs mt-0.5 ${overdue ? 'text-red-500' : 'text-gray-500'}`}>
            Due: {fmt(detail.due_date)}{overdue ? ' (overdue)' : ''}
          </p>
        </div>
        <div className="flex-shrink-0">
          <span className={`px-3 py-1.5 rounded text-white text-xs font-semibold ${action.color} ${action.disabled ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}>
            {action.label}
          </span>
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-gray-500 font-medium">Due Date</p>
              <p className="text-gray-800 mt-0.5">{fmt(detail.due_date)}</p>
            </div>
            <div>
              <p className="text-gray-500 font-medium">Max Score</p>
              <p className="text-gray-800 mt-0.5">{detail.max_score}</p>
            </div>
          </div>
          {detail.brief && (
            <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{detail.brief}</p>
          )}
          {item.progress?.type === 'assignment' && item.progress.graded && item.progress.score != null && (
            <p className="text-xs font-semibold text-green-700">Score: {item.progress.score} / {detail.max_score}</p>
          )}
        </div>
      )}
    </div>
  );
}

function LiveSessionItem({ item }: { item: ModuleItem }) {
  const detail = item.detail as LiveSessionDetail;
  const canJoin = detail.status === 'live' || (detail.status === 'scheduled' && isWithin15Min(detail.scheduled_at));
  const hasRecording = detail.status === 'completed' && !!detail.recording_url;

  const PLATFORM_COLORS: Record<string, string> = {
    zoom: 'bg-blue-100 text-blue-700',
    google_meet: 'bg-green-100 text-green-700',
    teams: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="border border-gray-200 rounded-lg px-4 py-3 mb-3 bg-white flex items-center gap-3">
      <span className="text-xl flex-shrink-0">🎥</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm">{detail.title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{fmtDatetime(detail.scheduled_at)}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PLATFORM_COLORS[detail.platform] ?? 'bg-gray-100 text-gray-600'}`}>
            {detail.platform.replace(/_/g, ' ').toUpperCase()}
          </span>
          {detail.duration_mins && <span className="text-xs text-gray-400">{detail.duration_mins} min</span>}
        </div>
      </div>
      <div className="flex-shrink-0">
        {canJoin && (
          <a href={detail.join_url} target="_blank" rel="noopener noreferrer"
            className={`inline-block px-3 py-1.5 rounded text-white text-xs font-semibold ${detail.status === 'live' ? 'bg-green-600 animate-pulse' : 'bg-[#4c1d95]'}`}>
            Join Now
          </a>
        )}
        {hasRecording && (
          <a href={detail.recording_url!} target="_blank" rel="noopener noreferrer"
            className="inline-block px-3 py-1.5 rounded bg-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-300">
            Watch Recording
          </a>
        )}
        {!canJoin && !hasRecording && (
          <span className="text-xs text-gray-400 capitalize">{detail.status === 'cancelled' ? '🚫 Cancelled' : '⏳ Upcoming'}</span>
        )}
      </div>
    </div>
  );
}

// ─── LessonItem ───────────────────────────────────────────────────────────────

function LessonItem({ item, offeringId }: { item: ModuleItem; offeringId: string }) {
  const router = useRouter();
  const detail = item.detail as LessonDetail;
  const prog = item.progress?.type === 'lesson' ? item.progress.status : 'not_started';
  const progColors = { not_started: 'bg-gray-100 text-gray-500', in_progress: 'bg-amber-100 text-amber-700', completed: 'bg-green-100 text-green-700' };
  const progLabels = { not_started: 'Not Started', in_progress: 'In Progress', completed: '✓ Completed' };

  return (
    <div
      className="border border-gray-200 rounded-lg px-4 py-3 bg-white flex items-center gap-3 hover:bg-purple-50 hover:border-purple-200 cursor-pointer transition-colors group"
      onClick={() => router.push(`/dashboard/class/${offeringId}/lessons/${item.lesson_id}`)}
    >
      <span className="text-xl flex-shrink-0">{LESSON_ICONS[detail.type] ?? '📄'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 group-hover:text-purple-700">{detail.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${progColors[prog]}`}>
            {progLabels[prog]}
          </span>
          {detail.duration_mins && <span className="text-xs text-gray-400">{detail.duration_mins} min</span>}
          {item.is_mandatory && <span className="text-[10px] font-semibold text-red-600">Required</span>}
        </div>
      </div>
      <span className="text-sm font-medium text-purple-600 group-hover:underline flex-shrink-0">Open →</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TopicContent({ topicIndex }: { topicIndex: number }) {
  const params = useParams();
  const offeringId = params?.id as string;

  const [module, setModule] = useState<CourseModule | null>(null);
  const [items, setItems] = useState<ModuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!offeringId) return;
    (async () => {
      const supabase = createClient();

      // Get auth user
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setLoading(false); return; }
      const { data: appUser } = await supabase
        .from('users').select('id').eq('auth_user_id', authData.user.id).single();
      if (!appUser) { setLoading(false); return; }
      const userId = (appUser as { id: string }).id;

      // Get enrollment
      const { data: enrollment } = await supabase
        .from('enrollments')
        .select('id')
        .eq('student_id', userId)
        .eq('offering_id', offeringId)
        .single();
      const enrollmentId = (enrollment as any)?.id ?? null;

      // Get the Nth module (topicIndex is 1-based)
      const { data: modules } = await supabase
        .from('course_modules')
        .select('id, title, description, sort_order, unlock_date')
        .eq('offering_id', offeringId)
        .eq('is_visible', true)
        .order('sort_order', { ascending: true })
        .limit(topicIndex);

      const mods = (modules ?? []) as CourseModule[];
      if (mods.length < topicIndex) { setNotFound(true); setLoading(false); return; }
      const mod = mods[topicIndex - 1];
      setModule(mod);

      // Get module items
      const { data: moduleItems } = await supabase
        .from('course_module_items')
        .select('id, sort_order, item_type, is_visible, is_mandatory, item_title, item_url, lesson_id, assessment_id, assignment_id, live_session_id')
        .eq('module_id', mod.id)
        .eq('is_visible', true)
        .order('sort_order', { ascending: true });

      const rawItems = (moduleItems ?? []) as any[];

      // Collect IDs to batch-fetch
      const lessonIds    = rawItems.filter(i => i.lesson_id).map(i => i.lesson_id as string);
      const assessIds    = rawItems.filter(i => i.assessment_id).map(i => i.assessment_id as string);
      const assignIds    = rawItems.filter(i => i.assignment_id).map(i => i.assignment_id as string);
      const lsIds        = rawItems.filter(i => i.live_session_id).map(i => i.live_session_id as string);

      const [lessonsRes, assessRes, assignRes, lsRes, progressRes, attemptsRes, subsRes] = await Promise.all([
        lessonIds.length ? supabase.from('lessons').select('id, title, type, content_url, content_body, duration_mins').in('id', lessonIds) : Promise.resolve({ data: [] }),
        assessIds.length ? supabase.from('assessments').select('id, title, type, total_marks, time_limit_mins, max_attempts, available_from, available_until').in('id', assessIds) : Promise.resolve({ data: [] }),
        assignIds.length ? supabase.from('assignments').select('id, title, brief, max_score, due_date, late_allowed').in('id', assignIds) : Promise.resolve({ data: [] }),
        lsIds.length ? supabase.from('live_sessions').select('id, title, platform, join_url, scheduled_at, duration_mins, recording_url, status').in('id', lsIds) : Promise.resolve({ data: [] }),
        // lesson_progress
        (lessonIds.length && enrollmentId) ? supabase.from('lesson_progress').select('lesson_id, status').eq('enrollment_id', enrollmentId).in('lesson_id', lessonIds) : Promise.resolve({ data: [] }),
        // assessment_attempts (latest per assessment)
        (assessIds.length) ? supabase.from('assessment_attempts').select('assessment_id, status, score_pct, passed, attempt_number').eq('student_id', userId).in('assessment_id', assessIds).order('attempt_number', { ascending: false }) : Promise.resolve({ data: [] }),
        // assignment_submissions
        (assignIds.length) ? supabase.from('assignment_submissions').select('assignment_id, status, score').eq('student_id', userId).in('assignment_id', assignIds) : Promise.resolve({ data: [] }),
      ]);

      // Build lookup maps
      const lessonMap: Record<string, any> = {};
      ((lessonsRes.data ?? []) as any[]).forEach(l => { lessonMap[l.id] = l; });
      const assessMap: Record<string, any> = {};
      ((assessRes.data ?? []) as any[]).forEach(a => { assessMap[a.id] = a; });
      const assignMap: Record<string, any> = {};
      ((assignRes.data ?? []) as any[]).forEach(a => { assignMap[a.id] = a; });
      const lsMap: Record<string, any> = {};
      ((lsRes.data ?? []) as any[]).forEach(s => { lsMap[s.id] = s; });
      const progressMap: Record<string, any> = {};
      ((progressRes.data ?? []) as any[]).forEach(p => { progressMap[p.lesson_id] = p; });
      const attemptsMap: Record<string, any> = {};
      ((attemptsRes.data ?? []) as any[]).forEach(a => {
        if (!attemptsMap[a.assessment_id]) attemptsMap[a.assessment_id] = a; // already ordered desc
      });
      const subsMap: Record<string, any> = {};
      ((subsRes.data ?? []) as any[]).forEach(s => { subsMap[s.assignment_id] = s; });

      const resolved: ModuleItem[] = rawItems.map(raw => {
        let detail: ModuleItem['detail'] = null;
        let progress: ProgressInfo | null = null;

        if (raw.item_type === 'lesson' && raw.lesson_id && lessonMap[raw.lesson_id]) {
          const l = lessonMap[raw.lesson_id];
          detail = { kind: 'lesson', title: l.title, type: l.type, content_url: l.content_url, content_body: l.content_body ?? null, duration_mins: l.duration_mins };
          const p = progressMap[raw.lesson_id];
          if (p) progress = { type: 'lesson', status: p.status };
          else progress = { type: 'lesson', status: 'not_started' };
        } else if (raw.item_type === 'assessment' && raw.assessment_id && assessMap[raw.assessment_id]) {
          const a = assessMap[raw.assessment_id];
          detail = { kind: 'assessment', title: a.title, type: a.type, total_marks: a.total_marks, time_limit_mins: a.time_limit_mins, max_attempts: a.max_attempts, available_from: a.available_from, available_until: a.available_until };
          const att = attemptsMap[raw.assessment_id];
          if (att) progress = { type: 'assessment', attempts: att.attempt_number, score_pct: att.score_pct, passed: att.passed, status: att.status };
        } else if (raw.item_type === 'assignment' && raw.assignment_id && assignMap[raw.assignment_id]) {
          const a = assignMap[raw.assignment_id];
          detail = { kind: 'assignment', title: a.title, brief: a.brief, max_score: a.max_score, due_date: a.due_date, late_allowed: a.late_allowed };
          const sub = subsMap[raw.assignment_id];
          if (sub) progress = { type: 'assignment', submitted: true, graded: sub.status === 'graded', score: sub.score, status: sub.status };
          else progress = { type: 'assignment', submitted: false, graded: false, score: null, status: 'not_submitted' };
        } else if (raw.item_type === 'live_session' && raw.live_session_id && lsMap[raw.live_session_id]) {
          const s = lsMap[raw.live_session_id];
          detail = { kind: 'live_session', title: s.title, platform: s.platform, join_url: s.join_url, scheduled_at: s.scheduled_at, duration_mins: s.duration_mins, recording_url: s.recording_url, status: s.status };
        } else if (raw.item_type === 'link') {
          detail = null; // link uses item_title + item_url directly
        }

        return {
          id: raw.id,
          sort_order: raw.sort_order,
          item_type: raw.item_type,
          is_visible: raw.is_visible,
          is_mandatory: raw.is_mandatory,
          item_title: raw.item_title,
          item_url: raw.item_url,
          lesson_id: raw.lesson_id,
          assessment_id: raw.assessment_id,
          assignment_id: raw.assignment_id,
          live_session_id: raw.live_session_id,
          detail,
          progress,
        };
      });

      setItems(resolved);
      setLoading(false);
    })();
  }, [offeringId, topicIndex]);

  const lessonItems = items.filter(i => ['lesson', 'link'].includes(i.item_type));
  const activityItems = items.filter(i => ['assessment', 'assignment', 'live_session'].includes(i.item_type));

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-20 bg-gray-200 rounded" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (notFound || !module) {
    return (
      <div className="py-16 text-center">
        <span className="text-5xl block mb-4">📭</span>
        <p className="text-gray-500 font-medium">Topic {topicIndex} not found.</p>
        <p className="text-gray-400 text-sm mt-1">This module may not be available yet.</p>
      </div>
    );
  }

  const isLocked = !!module.unlock_date && new Date(module.unlock_date) > new Date();

  return (
    <div className="w-full min-w-0">
      {/* Topic header */}
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-2xl font-bold text-gray-900">T{topicIndex} {module.title}</h1>
        {isLocked && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded flex-shrink-0">
            🔒 Available from {fmt(module.unlock_date)}
          </span>
        )}
      </div>
      <div className="border-t border-gray-200 mb-6" />

      {/* Module description / objectives */}
      {module.description && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-2">Objectives:</p>
          <div
            className="prose prose-sm max-w-none text-gray-600"
            dangerouslySetInnerHTML={{ __html: module.description }}
          />
        </div>
      )}

      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">📭</span>
          <p className="text-gray-400">No items in this topic yet.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* ── Lessons & Links ──────────────────────────────── */}
          {lessonItems.length > 0 && (
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-3">Lessons</h2>
              <div className="space-y-3">
                {lessonItems.map(item => {
                  if (item.item_type === 'link') {
                    return (
                      <div key={item.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center gap-3">
                        <span className="text-xl flex-shrink-0">🔗</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{item.item_title ?? 'Resource'}</p>
                        </div>
                        {item.item_url && (
                          <a href={item.item_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-[#4c1d95] hover:underline font-medium flex-shrink-0">
                            Open →
                          </a>
                        )}
                      </div>
                    );
                  }
                  if (item.item_type === 'lesson' && item.detail?.kind === 'lesson') {
                    return <LessonItem key={item.id} item={item} offeringId={offeringId} />;
                  }
                  return null;
                })}
              </div>
            </div>
          )}

          {/* ── Assessments & Activities ─────────────────────── */}
          {activityItems.length > 0 && (
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-3">Assessments</h2>
              {activityItems.map(item => {
                if (item.item_type === 'assessment' && item.detail?.kind === 'assessment') {
                  return <AssessmentItem key={item.id} item={item} offeringId={offeringId} />;
                }
                if (item.item_type === 'assignment' && item.detail?.kind === 'assignment') {
                  return <AssignmentItem key={item.id} item={item} />;
                }
                if (item.item_type === 'live_session' && item.detail?.kind === 'live_session') {
                  return <LiveSessionItem key={item.id} item={item} />;
                }
                return null;
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
