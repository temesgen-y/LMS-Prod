'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

type SessionStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';
type RsvpStatus = 'yes' | 'no' | 'maybe' | null;

type Session = {
  id: string;
  title: string;
  platform: string;
  joinUrl: string;
  meetingId: string;
  passcode: string;
  scheduledAt: string;
  durationMins: number;
  recordingUrl: string | null;
  status: SessionStatus;
  courseCode: string;
  courseTitle: string;
  sectionName: string;
  instructorName: string;
};

type MyAttendance = {
  joinedAt: string | null;
  leftAt: string | null;
  durationMins: number | null;
  source: string;
} | null;

const PLATFORM_LABELS: Record<string, string> = {
  zoom: 'Zoom',
  google_meet: 'Google Meet',
  teams: 'Microsoft Teams',
  other: 'Other',
};

const PLATFORM_ICONS: Record<string, string> = {
  zoom: '🔵',
  google_meet: '🟢',
  teams: '🟣',
  other: '📡',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
function fmtTimestamp(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function Countdown({ to }: { to: string }) {
  const [diff, setDiff] = useState(0);
  useEffect(() => {
    const update = () => { const ms = new Date(to).getTime() - Date.now(); setDiff(Math.max(0, Math.floor(ms / 1000))); };
    update(); const id = setInterval(update, 1000); return () => clearInterval(id);
  }, [to]);
  const d = Math.floor(diff / 86400), h = Math.floor((diff % 86400) / 3600), m = Math.floor((diff % 3600) / 60), s = diff % 60;
  if (diff === 0) return <span className="font-mono text-xl font-bold text-green-600">Starting now…</span>;
  return (
    <div className="flex items-end gap-3 justify-center">
      {d > 0 && <div className="text-center"><p className="font-mono text-4xl font-bold text-gray-900">{d}</p><p className="text-xs text-gray-500 mt-1">day{d !== 1 ? 's' : ''}</p></div>}
      <div className="text-center"><p className="font-mono text-4xl font-bold text-gray-900">{String(h).padStart(2, '0')}</p><p className="text-xs text-gray-500 mt-1">hr</p></div>
      <p className="font-mono text-4xl font-bold text-gray-400 mb-5">:</p>
      <div className="text-center"><p className="font-mono text-4xl font-bold text-gray-900">{String(m).padStart(2, '0')}</p><p className="text-xs text-gray-500 mt-1">min</p></div>
      <p className="font-mono text-4xl font-bold text-gray-400 mb-5">:</p>
      <div className="text-center"><p className="font-mono text-4xl font-bold text-gray-900">{String(s).padStart(2, '0')}</p><p className="text-xs text-gray-500 mt-1">sec</p></div>
    </div>
  );
}

const RSVP_OPTIONS: { value: RsvpStatus; label: string; color: string; active: string }[] = [
  { value: 'yes',   label: 'Yes, I\'ll attend', color: 'border-green-200 text-green-700 hover:bg-green-50',  active: 'bg-green-100 border-green-400 text-green-800 font-semibold' },
  { value: 'maybe', label: 'Maybe',              color: 'border-amber-200 text-amber-700 hover:bg-amber-50',   active: 'bg-amber-100 border-amber-400 text-amber-800 font-semibold' },
  { value: 'no',    label: 'No, I can\'t',       color: 'border-red-200 text-red-600 hover:bg-red-50',         active: 'bg-red-100 border-red-400 text-red-800 font-semibold' },
];

export default function StudentVirtualClassroomPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [myAttendance, setMyAttendance] = useState<MyAttendance>(null);
  const [rsvp, setRsvp] = useState<RsvpStatus>(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [selfReporting, setSelfReporting] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [notEnrolled, setNotEnrolled] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { router.push('/login'); return; }

    const { data: appUser } = await supabase.from('users').select('id').eq('auth_user_id', authData.user.id).single();
    if (!appUser) { setLoading(false); return; }
    const uid = (appUser as any).id;
    setStudentId(uid);

    const { data: raw, error } = await supabase
      .from('live_sessions')
      .select(`id, title, platform, join_url, meeting_id, passcode, scheduled_at, duration_mins, recording_url, status, offering_id, instructor_id,
        course_offerings!fk_live_sessions_offering(id, section_name, courses!fk_course_offerings_course(code, title))`)
      .eq('id', sessionId).single();

    if (error || !raw) { setLoading(false); return; }

    const { data: enrollment } = await supabase.from('enrollments').select('id')
      .eq('student_id', uid).eq('offering_id', (raw as any).offering_id).in('status', ['active', 'completed']).maybeSingle();
    if (!enrollment) { setNotEnrolled(true); setLoading(false); return; }

    const { data: instrUser } = await supabase.from('users').select('first_name, last_name').eq('id', (raw as any).instructor_id).single();

    const co = (raw as any).course_offerings ?? {};
    const c = co.courses ?? {};
    const instr = instrUser as any;

    setSession({
      id: raw.id, title: raw.title, platform: raw.platform,
      joinUrl: raw.join_url ?? '', meetingId: raw.meeting_id ?? '',
      passcode: raw.passcode ?? '', scheduledAt: raw.scheduled_at,
      durationMins: raw.duration_mins, recordingUrl: raw.recording_url ?? null,
      status: raw.status as SessionStatus,
      courseCode: c.code ?? '', courseTitle: c.title ?? '',
      sectionName: co.section_name ?? 'A',
      instructorName: instr ? `${instr.first_name ?? ''} ${instr.last_name ?? ''}`.trim() : 'Instructor',
    });

    // Attendance
    const { data: att } = await supabase.from('live_session_attendance')
      .select('joined_at, left_at, duration_mins, source').eq('live_session_id', sessionId).eq('student_id', uid).maybeSingle();
    if (att) setMyAttendance({ joinedAt: (att as any).joined_at, leftAt: (att as any).left_at, durationMins: (att as any).duration_mins ?? null, source: (att as any).source ?? 'manual' });

    // RSVP
    const { data: rsvpRow } = await supabase.from('live_session_rsvps')
      .select('rsvp_status').eq('live_session_id', sessionId).eq('student_id', uid).maybeSingle();
    if (rsvpRow) setRsvp((rsvpRow as any).rsvp_status as RsvpStatus);

    setLoading(false);
  }, [sessionId, router]);

  useEffect(() => { load(); }, [load]);

  const handleRsvp = async (status: RsvpStatus) => {
    if (!studentId || !status) return;
    setRsvpLoading(true);
    const supabase = createClient();
    const newStatus = rsvp === status ? null : status;
    if (newStatus === null) {
      await supabase.from('live_session_rsvps').delete().eq('live_session_id', sessionId).eq('student_id', studentId);
      setRsvp(null);
      toast.success('RSVP removed.');
    } else {
      await supabase.from('live_session_rsvps').upsert(
        { live_session_id: sessionId, student_id: studentId, rsvp_status: newStatus },
        { onConflict: 'live_session_id,student_id' }
      );
      setRsvp(newStatus);
      toast.success(`RSVP updated: ${newStatus === 'yes' ? "You're attending" : newStatus === 'maybe' ? "Maybe attending" : "Not attending"}`);
    }
    setRsvpLoading(false);
  };

  const handleJoin = async () => {
    if (!session || !studentId) return;
    setJoining(true);
    const supabase = createClient();
    const now = new Date().toISOString();
    await supabase.from('live_session_attendance').upsert(
      { live_session_id: sessionId, student_id: studentId, joined_at: now, source: 'manual' },
      { onConflict: 'live_session_id,student_id', ignoreDuplicates: true }
    );
    if (!myAttendance?.joinedAt) setMyAttendance({ joinedAt: now, leftAt: null, durationMins: null, source: 'manual' });
    window.open(session.joinUrl, '_blank', 'noopener,noreferrer');
    setJoining(false);
  };

  const handleSelfReport = async () => {
    if (!studentId) return;
    setSelfReporting(true);
    const supabase = createClient();
    const now = new Date().toISOString();
    await supabase.from('live_session_attendance').upsert(
      { live_session_id: sessionId, student_id: studentId, joined_at: now, source: 'self_reported' },
      { onConflict: 'live_session_id,student_id' }
    );
    setMyAttendance({ joinedAt: now, leftAt: null, durationMins: null, source: 'self_reported' });
    toast.success('Attendance self-reported.');
    setSelfReporting(false);
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-[#4c1d95] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (notEnrolled) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20">
      <p className="text-gray-600 font-semibold">You are not enrolled in this course.</p>
      <button onClick={() => router.push('/dashboard/live-sessions')} className="text-[#4c1d95] hover:underline text-sm">Back to Live Sessions</button>
    </div>
  );

  if (!session) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20">
      <p className="text-gray-600 font-semibold">Session not found.</p>
      <button onClick={() => router.push('/dashboard/live-sessions')} className="text-[#4c1d95] hover:underline text-sm">Back to Live Sessions</button>
    </div>
  );

  const isLive = session.status === 'live';
  const isScheduled = session.status === 'scheduled';
  const isCompleted = session.status === 'completed';
  const isCancelled = session.status === 'cancelled';
  const minsUntil = (new Date(session.scheduledAt).getTime() - Date.now()) / 60000;
  const canJoin = isLive || (isScheduled && minsUntil <= 15);
  const isZoom = session.platform === 'zoom';

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        <button onClick={() => router.push('/dashboard/live-sessions')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to Live Sessions
        </button>

        {/* Session card */}
        <div className={`bg-white rounded-2xl border shadow-sm p-6 ${isLive ? 'border-green-300' : 'border-gray-200'}`}>
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${isLive ? 'bg-green-100' : 'bg-gray-100'}`}>
              {PLATFORM_ICONS[session.platform] ?? '📡'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-gray-900">{session.title}</h1>
                {isLive && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Live Now</span>}
                {isCompleted && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">Completed</span>}
                {isCancelled && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600">Cancelled</span>}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{session.courseCode} — {session.courseTitle}</p>
              <p className="text-xs text-gray-400 mt-0.5">Instructor: {session.instructorName} · {PLATFORM_LABELS[session.platform] ?? session.platform} · {session.durationMins} min</p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4 text-sm text-gray-500 border-t border-gray-100 pt-4">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              {fmtDate(session.scheduledAt)}
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {fmtTime(session.scheduledAt)}
            </span>
          </div>
        </div>

        {/* RSVP section — only for upcoming sessions */}
        {(isScheduled || isLive) && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">Will you attend?</p>
            <div className="flex gap-2 flex-wrap">
              {RSVP_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleRsvp(opt.value)}
                  disabled={rsvpLoading}
                  className={`px-4 py-2 rounded-lg border text-sm transition-colors disabled:opacity-50 ${
                    rsvp === opt.value ? opt.active : `bg-white ${opt.color}`
                  }`}
                >
                  {opt.value === 'yes' && '✓ '}{opt.value === 'maybe' && '? '}{opt.value === 'no' && '✕ '}
                  {opt.label}
                </button>
              ))}
            </div>
            {rsvp && (
              <p className="text-xs text-gray-400 mt-2">
                Click again to remove your RSVP.
              </p>
            )}
          </div>
        )}

        {/* Cancelled */}
        {isCancelled && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
            <svg className="w-12 h-12 mx-auto text-red-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-red-700 font-semibold">This session has been cancelled.</p>
            <p className="text-red-500 text-sm mt-1">Contact your instructor for more information.</p>
          </div>
        )}

        {/* Countdown */}
        {isScheduled && !canJoin && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center space-y-4">
            <p className="text-sm font-medium text-gray-500">Session starts in</p>
            <Countdown to={session.scheduledAt} />
            <p className="text-xs text-gray-400">The join button will appear 15 minutes before the session starts.</p>
          </div>
        )}

        {/* Join section */}
        {canJoin && !isCompleted && (
          <div className={`rounded-2xl border p-8 text-center space-y-4 ${isLive ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
            {isLive ? (
              <div className="flex items-center justify-center gap-2 text-green-700 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                Session is Live!
              </div>
            ) : (
              <p className="text-blue-700 font-semibold">Session starting soon</p>
            )}
            {isZoom && (
              <p className="text-xs text-gray-500">
                Zoom attendance is tracked automatically — no need to do anything extra.
              </p>
            )}
            <button
              onClick={handleJoin}
              disabled={joining || !session.joinUrl}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-sm transition disabled:opacity-60 ${
                isLive ? 'bg-green-600 hover:bg-green-700' : 'bg-[#4c1d95] hover:bg-[#3b1677]'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
              {joining ? 'Opening…' : isLive ? 'Join Now' : 'Join Session'}
            </button>
            {myAttendance?.joinedAt && (
              <p className="text-xs text-gray-500">Joined at {fmtTimestamp(myAttendance.joinedAt)}</p>
            )}
            {session.meetingId && (
              <div className="flex items-center justify-center gap-4 text-xs text-gray-500 pt-2">
                <span>Meeting ID: <span className="font-mono font-medium text-gray-700">{session.meetingId}</span></span>
                {session.passcode && <span>Passcode: <span className="font-mono font-medium text-gray-700">{session.passcode}</span></span>}
              </div>
            )}
          </div>
        )}

        {/* Completed */}
        {isCompleted && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center space-y-4">
            <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-gray-700 font-semibold">Session Completed</p>

            {myAttendance?.joinedAt ? (
              <div className="space-y-1">
                <p className="text-sm text-green-600">You attended this session.</p>
                {myAttendance.durationMins && (
                  <p className="text-xs text-gray-400">Duration: {myAttendance.durationMins} min</p>
                )}
                {myAttendance.source === 'zoom_webhook' && (
                  <p className="text-xs text-blue-500">Attendance captured automatically via Zoom</p>
                )}
                {myAttendance.source === 'self_reported' && (
                  <p className="text-xs text-amber-600">Self-reported attendance</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-400">No attendance record found for you.</p>
                {!isZoom && (
                  <button
                    onClick={handleSelfReport}
                    disabled={selfReporting}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-300 text-amber-700 bg-amber-50 text-sm font-medium hover:bg-amber-100 disabled:opacity-60 transition"
                  >
                    {selfReporting ? 'Saving…' : 'I attended this session'}
                  </button>
                )}
                {isZoom && (
                  <p className="text-xs text-gray-400">Attendance for Zoom sessions is captured automatically. If you attended, contact your instructor.</p>
                )}
              </div>
            )}

            {session.recordingUrl ? (
              <a
                href={session.recordingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#4c1d95] text-white font-semibold text-sm hover:bg-[#3b1677] transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Watch Recording
              </a>
            ) : (
              <p className="text-xs text-gray-400">Recording not yet available. Check back later.</p>
            )}
          </div>
        )}

        {/* Connection info */}
        {!isCompleted && !isCancelled && (session.meetingId || session.passcode) && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Connection Info</p>
            <div className="grid grid-cols-2 gap-3">
              {session.meetingId && (
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-400">Meeting ID</p>
                  <p className="font-mono font-semibold text-sm text-gray-900 mt-0.5">{session.meetingId}</p>
                </div>
              )}
              {session.passcode && (
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-400">Passcode</p>
                  <p className="font-mono font-semibold text-sm text-gray-900 mt-0.5">{session.passcode}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
