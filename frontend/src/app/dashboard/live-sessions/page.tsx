'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

type RsvpStatus = 'yes' | 'no' | 'maybe';

type LiveSession = {
  id:           string;
  offeringId:   string;
  courseCode:   string;
  courseTitle:  string;
  title:        string;
  platform:     string;
  joinUrl:      string;
  scheduledAt:  string;
  durationMins: number;
  recordingUrl: string | null;
  status:       'scheduled' | 'live' | 'completed' | 'cancelled';
  attended:     boolean;
  rsvp:         RsvpStatus | null;
};

const PLATFORM_LABEL: Record<string, string> = {
  zoom: 'Zoom', google_meet: 'Google Meet', teams: 'Microsoft Teams', other: 'Other',
};

const STATUS_STYLE: Record<LiveSession['status'], string> = {
  scheduled: 'bg-blue-50 text-blue-700',
  live:      'bg-green-100 text-green-700 animate-pulse',
  completed: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-50 text-red-500',
};

const RSVP_BADGE: Record<RsvpStatus, string> = {
  yes:   'bg-green-50 text-green-700 border-green-200',
  maybe: 'bg-amber-50 text-amber-700 border-amber-200',
  no:    'bg-red-50 text-red-600 border-red-200',
};
const RSVP_LABEL: Record<RsvpStatus, string> = { yes: '✓ Going', maybe: '? Maybe', no: '✕ Not going' };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function LiveSessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed'>('upcoming');
  const [userId, setUserId] = useState<string | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setLoading(false); return; }

    const { data: appUser } = await supabase.from('users').select('id').eq('auth_user_id', authData.user.id).single();
    if (!appUser) { setLoading(false); return; }
    const uid = (appUser as any).id;
    setUserId(uid);

    const { data: enrollRows } = await supabase.from('enrollments').select('offering_id').eq('student_id', uid).in('status', ['active', 'completed']);
    if (!enrollRows || enrollRows.length === 0) { setLoading(false); return; }
    const offeringIds = (enrollRows as any[]).map(e => e.offering_id);

    const { data: sessionRows, error: sessErr } = await supabase
      .from('live_sessions')
      .select('id, offering_id, title, platform, join_url, scheduled_at, duration_mins, recording_url, status')
      .in('offering_id', offeringIds).neq('status', 'cancelled')
      .order('scheduled_at', { ascending: false });
    if (sessErr || !sessionRows || sessionRows.length === 0) { setLoading(false); return; }

    const sessionIds = (sessionRows as any[]).map(s => s.id);
    const uniqueOfferingIds = [...new Set((sessionRows as any[]).map(s => s.offering_id))];

    const [offeringRes, attRes, rsvpRes] = await Promise.all([
      supabase.from('course_offerings').select('id, course_id').in('id', uniqueOfferingIds),
      supabase.from('live_session_attendance').select('live_session_id').eq('student_id', uid).in('live_session_id', sessionIds),
      supabase.from('live_session_rsvps').select('live_session_id, rsvp_status').eq('student_id', uid).in('live_session_id', sessionIds),
    ]);

    const courseIds = [...new Set(((offeringRes.data ?? []) as any[]).map(o => o.course_id))];
    const { data: courseRows } = await supabase.from('courses').select('id, code, title').in('id', courseIds);

    const offeringMap: Record<string, any> = {};
    ((offeringRes.data ?? []) as any[]).forEach(o => { offeringMap[o.id] = o; });
    const courseMap: Record<string, any> = {};
    ((courseRows ?? []) as any[]).forEach(c => { courseMap[c.id] = c; });
    const attendedSet = new Set(((attRes.data ?? []) as any[]).map(a => a.live_session_id));
    const rsvpMap: Record<string, RsvpStatus> = {};
    ((rsvpRes.data ?? []) as any[]).forEach(r => { rsvpMap[r.live_session_id] = r.rsvp_status; });

    setSessions((sessionRows as any[]).map(s => {
      const offering = offeringMap[s.offering_id] ?? {};
      const course = courseMap[offering.course_id ?? ''] ?? {};
      return {
        id: s.id, offeringId: s.offering_id,
        courseCode: course.code ?? '—', courseTitle: course.title ?? '—',
        title: s.title, platform: s.platform, joinUrl: s.join_url,
        scheduledAt: s.scheduled_at, durationMins: s.duration_mins,
        recordingUrl: s.recording_url ?? null, status: s.status,
        attended: attendedSet.has(s.id),
        rsvp: rsvpMap[s.id] ?? null,
      };
    }));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRsvp = async (sessionId: string, current: RsvpStatus | null, next: RsvpStatus) => {
    if (!userId) return;
    setRsvpLoading(sessionId);
    const supabase = createClient();
    const newStatus = current === next ? null : next;
    if (newStatus === null) {
      await supabase.from('live_session_rsvps').delete().eq('live_session_id', sessionId).eq('student_id', userId);
    } else {
      await supabase.from('live_session_rsvps').upsert(
        { live_session_id: sessionId, student_id: userId, rsvp_status: newStatus },
        { onConflict: 'live_session_id,student_id' }
      );
    }
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, rsvp: newStatus } : s));
    toast.success(newStatus ? `RSVP: ${RSVP_LABEL[newStatus]}` : 'RSVP removed');
    setRsvpLoading(null);
  };

  const now = new Date();
  const filtered = sessions.filter(s => {
    if (filter === 'upcoming') return s.status === 'scheduled' || s.status === 'live';
    if (filter === 'completed') return s.status === 'completed';
    return true;
  });
  const upcomingCount = sessions.filter(s => s.status === 'scheduled' || s.status === 'live').length;
  const completedCount = sessions.filter(s => s.status === 'completed').length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl" aria-hidden>🎥</span>
          <h1 className="text-2xl font-bold text-gray-900">Live Sessions</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">Virtual classes scheduled by your instructors</p>

        {!loading && sessions.length > 0 && (
          <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
            {([
              { key: 'upcoming',  label: `Upcoming (${upcomingCount})` },
              { key: 'completed', label: `Completed (${completedCount})` },
              { key: 'all',       label: `All (${sessions.length})` },
            ] as const).map(tab => (
              <button key={tab.key} onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === tab.key ? 'bg-white text-[#4c1d95] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="animate-pulse space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}</div>
        ) : sessions.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <span className="text-4xl block mb-3">🎥</span>
            <p className="text-gray-400 font-medium">No live sessions scheduled yet.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <span className="text-4xl block mb-3">📭</span>
            <p className="text-gray-400 font-medium">No {filter} sessions.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(session => {
              const isLive = session.status === 'live';
              const isUpcoming = session.status === 'scheduled' || session.status === 'live';
              return (
                <div key={session.id} className={`bg-white rounded-xl border p-5 flex gap-4 items-start ${isLive ? 'border-green-300 shadow-sm' : 'border-gray-200'}`}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-lg ${isLive ? 'bg-green-100' : 'bg-gray-100'}`}>
                    {session.platform === 'zoom' ? '🔵' : session.platform === 'google_meet' ? '🟢' : session.platform === 'teams' ? '🟣' : '📡'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-semibold text-gray-900">{session.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{session.courseTitle}<span className="text-gray-300 mx-1">·</span>{session.courseCode}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                        {session.rsvp && (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${RSVP_BADGE[session.rsvp]}`}>
                            {RSVP_LABEL[session.rsvp]}
                          </span>
                        )}
                        {session.attended && session.status === 'completed' && (
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">Attended</span>
                        )}
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLE[session.status]}`}>
                          {isLive ? '🔴 Live Now' : session.status}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        {formatDate(session.scheduledAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {formatTime(session.scheduledAt)} · {session.durationMins} min
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                        {PLATFORM_LABEL[session.platform] ?? session.platform}
                      </span>
                    </div>

                    {/* RSVP inline buttons for upcoming sessions */}
                    {isUpcoming && (
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <span className="text-xs text-gray-400">RSVP:</span>
                        {(['yes', 'maybe', 'no'] as const).map(opt => (
                          <button
                            key={opt}
                            type="button"
                            disabled={rsvpLoading === session.id}
                            onClick={() => handleRsvp(session.id, session.rsvp, opt)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors disabled:opacity-50 ${
                              session.rsvp === opt
                                ? opt === 'yes' ? 'bg-green-100 border-green-400 text-green-800'
                                  : opt === 'maybe' ? 'bg-amber-100 border-amber-400 text-amber-800'
                                  : 'bg-red-100 border-red-400 text-red-800'
                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            {opt === 'yes' ? '✓ Yes' : opt === 'maybe' ? '? Maybe' : '✕ No'}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 mt-3 flex-wrap">
                      <button
                        onClick={() => router.push(`/dashboard/virtual-classroom/${session.id}`)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                          isLive ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-[#4c1d95] text-white hover:bg-[#3b1677]'
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                        {isLive ? 'Enter Classroom' : session.status === 'completed' ? 'View Session' : 'Enter Classroom'}
                      </button>
                      {session.recordingUrl && (
                        <a href={session.recordingUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Watch Recording
                        </a>
                      )}
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
