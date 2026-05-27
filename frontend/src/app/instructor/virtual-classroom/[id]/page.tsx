'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

type SessionStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';

type Session = {
  id: string;
  title: string;
  platform: string;
  joinUrl: string;
  meetingId: string;
  passcode: string;
  scheduledAt: string;
  durationMins: number;
  recordingUrl: string;
  status: SessionStatus;
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  sectionName: string;
  termLabel: string;
  instructorId: string;
};

type Student = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  studentNo: string;
};

type Attendance = {
  studentId: string;
  joinedAt: string | null;
  leftAt: string | null;
  durationMins: number | null;
};

const PLATFORM_LABELS: Record<string, string> = {
  zoom: 'Zoom',
  google_meet: 'Google Meet',
  teams: 'Microsoft Teams',
  other: 'Other',
};

const PLATFORM_COLORS: Record<string, string> = {
  zoom: 'bg-blue-100 text-blue-700',
  google_meet: 'bg-green-100 text-green-700',
  teams: 'bg-purple-100 text-purple-700',
  other: 'bg-gray-100 text-gray-700',
};

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function ElapsedTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const base = Date.now() - new Date(since).getTime();
    setElapsed(Math.max(0, Math.floor(base / 1000)));
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [since]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return (
    <span className="font-mono text-sm font-semibold text-green-700">
      {h > 0 ? `${h}:` : ''}{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}

export default function InstructorVirtualClassroomPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [activeTab, setActiveTab] = useState<'attendees' | 'details' | 'recording'>('attendees');

  const [statusLoading, setStatusLoading] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState('');
  const [savingRecording, setSavingRecording] = useState(false);
  const [markingStudentId, setMarkingStudentId] = useState<string | null>(null);

  const attendanceMap = Object.fromEntries(attendance.map(a => [a.studentId, a]));

  const fetchAll = useCallback(async () => {
    const supabase = createClient();

    const { data: raw, error } = await supabase
      .from('live_sessions')
      .select(`
        id, title, platform, join_url, meeting_id, passcode,
        scheduled_at, duration_mins, recording_url, status,
        offering_id, instructor_id,
        course_offerings!fk_live_sessions_offering(
          id, section_name,
          courses!fk_course_offerings_course(code, title),
          academic_terms!fk_course_offerings_term(academic_year_label, term_name, term_code)
        )
      `)
      .eq('id', sessionId)
      .single();

    if (error || !raw) {
      toast.error('Session not found.');
      setLoading(false);
      return;
    }

    const co = (raw as any).course_offerings ?? {};
    const c = co.courses ?? {};
    const t = co.academic_terms ?? {};
    const sess: Session = {
      id: raw.id,
      title: raw.title,
      platform: raw.platform,
      joinUrl: raw.join_url ?? '',
      meetingId: raw.meeting_id ?? '',
      passcode: raw.passcode ?? '',
      scheduledAt: raw.scheduled_at,
      durationMins: raw.duration_mins,
      recordingUrl: raw.recording_url ?? '',
      status: raw.status as SessionStatus,
      offeringId: raw.offering_id,
      courseCode: c.code ?? '',
      courseTitle: c.title ?? '',
      sectionName: co.section_name ?? 'A',
      termLabel: [t.academic_year_label, t.term_name ?? t.term_code].filter(Boolean).join(' · '),
      instructorId: raw.instructor_id,
    };
    setSession(sess);
    setRecordingUrl(sess.recordingUrl);

    // Enrolled students
    const { data: enrollRows } = await supabase
      .from('enrollments')
      .select('student_id')
      .eq('offering_id', sess.offeringId)
      .in('status', ['active', 'completed']);

    const studentIds = ((enrollRows ?? []) as any[]).map(e => e.student_id);

    if (studentIds.length > 0) {
      const { data: userRows } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .in('id', studentIds);

      const { data: profileRows } = await supabase
        .from('student_profiles')
        .select('user_id, student_no')
        .in('user_id', studentIds);

      const profileMap: Record<string, string> = {};
      ((profileRows ?? []) as any[]).forEach((p: any) => {
        profileMap[p.user_id] = p.student_no ?? '';
      });

      setStudents(
        ((userRows ?? []) as any[]).map((u: any) => ({
          id: u.id,
          firstName: u.first_name ?? '',
          lastName: u.last_name ?? '',
          email: u.email ?? '',
          studentNo: profileMap[u.id] ?? '',
        }))
      );
    }

    // Attendance records
    const { data: attRows } = await supabase
      .from('live_session_attendance')
      .select('student_id, joined_at, left_at, duration_mins')
      .eq('live_session_id', sessionId);

    setAttendance(
      ((attRows ?? []) as any[]).map((a: any) => ({
        studentId: a.student_id,
        joinedAt: a.joined_at,
        leftAt: a.left_at,
        durationMins: a.duration_mins,
      }))
    );

    setLoading(false);
  }, [sessionId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const changeStatus = async (newStatus: SessionStatus) => {
    if (!session) return;
    setStatusLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('live_sessions')
      .update({ status: newStatus })
      .eq('id', session.id);
    if (error) { toast.error('Failed to update status.'); }
    else {
      setSession(s => s ? { ...s, status: newStatus } : s);
      toast.success(
        newStatus === 'live' ? 'Session is now Live!' :
        newStatus === 'completed' ? 'Session ended.' :
        'Session cancelled.'
      );
    }
    setStatusLoading(false);
  };

  const saveRecording = async () => {
    if (!session) return;
    setSavingRecording(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('live_sessions')
      .update({ recording_url: recordingUrl.trim() || null })
      .eq('id', session.id);
    if (error) toast.error('Failed to save recording URL.');
    else {
      setSession(s => s ? { ...s, recordingUrl: recordingUrl.trim() } : s);
      toast.success('Recording URL saved.');
    }
    setSavingRecording(false);
  };

  const markAttendance = async (studentId: string, present: boolean) => {
    setMarkingStudentId(studentId);
    const supabase = createClient();
    if (present) {
      const now = new Date().toISOString();
      await supabase.from('live_session_attendance').upsert(
        { live_session_id: sessionId, student_id: studentId, joined_at: now },
        { onConflict: 'live_session_id,student_id' }
      );
      setAttendance(prev => {
        const existing = prev.find(a => a.studentId === studentId);
        if (existing) return prev.map(a => a.studentId === studentId ? { ...a, joinedAt: now } : a);
        return [...prev, { studentId, joinedAt: now, leftAt: null, durationMins: null }];
      });
      toast.success('Attendance marked.');
    } else {
      await supabase.from('live_session_attendance')
        .delete()
        .eq('live_session_id', sessionId)
        .eq('student_id', studentId);
      setAttendance(prev => prev.filter(a => a.studentId !== studentId));
      toast.success('Attendance removed.');
    }
    setMarkingStudentId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <p className="text-lg font-semibold">Session not found.</p>
        <button onClick={() => router.push('/instructor/live-sessions')} className="mt-3 text-primary hover:underline text-sm">Back to Live Sessions</button>
      </div>
    );
  }

  const isLive = session.status === 'live';
  const isScheduled = session.status === 'scheduled';
  const isCompleted = session.status === 'completed';
  const attendedCount = attendance.filter(a => a.joinedAt).length;

  return (
    <div className="space-y-4 max-w-6xl mx-auto p-4">

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <button
            onClick={() => router.push('/instructor/live-sessions')}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 self-start"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Live Sessions
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-lg font-bold text-gray-900 truncate">{session.title}</h1>
              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${PLATFORM_COLORS[session.platform] ?? 'bg-gray-100 text-gray-700'}`}>
                {PLATFORM_LABELS[session.platform] ?? session.platform}
              </span>
              {isLive && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Live — <ElapsedTimer since={session.scheduledAt} />
                </span>
              )}
              {isScheduled && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">Scheduled</span>
              )}
              {isCompleted && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">Completed</span>
              )}
              {session.status === 'cancelled' && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-600">Cancelled</span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {session.courseCode} — {session.courseTitle} · Sec {session.sectionName} · {session.termLabel}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {fmtDate(session.scheduledAt)} · {session.durationMins} min
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {session.joinUrl && !isCompleted && session.status !== 'cancelled' && (
              <a
                href={session.joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
                Join Meeting
              </a>
            )}
            {isScheduled && (
              <button
                onClick={() => changeStatus('live')}
                disabled={statusLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Start Session
              </button>
            )}
            {isLive && (
              <button
                onClick={() => changeStatus('completed')}
                disabled={statusLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10h6v4H9z" />
                </svg>
                End Session
              </button>
            )}
            {isScheduled && (
              <button
                onClick={() => changeStatus('cancelled')}
                disabled={statusLoading}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60 transition"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Enrolled', value: students.length, color: 'text-gray-900', bg: 'bg-white' },
          { label: 'Attended', value: attendedCount, color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
          { label: 'Absent', value: students.length - attendedCount, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
          { label: 'Attendance %', value: students.length > 0 ? `${Math.round((attendedCount / students.length) * 100)}%` : '—', color: 'text-primary', bg: 'bg-purple-50 border-purple-200' },
        ].map(stat => (
          <div key={stat.label} className={`rounded-xl border p-4 text-center ${stat.bg}`}>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs + Content */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex border-b border-gray-100">
          {(['attendees', 'details', 'recording'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium transition-colors capitalize ${activeTab === tab ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-800'}`}
            >
              {tab === 'attendees' ? `Attendees (${students.length})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Attendees */}
        {activeTab === 'attendees' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Student</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Student No.</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined At</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Duration</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  {!isCompleted && (
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mark</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-gray-400 text-sm">No enrolled students.</td>
                  </tr>
                ) : students.map(st => {
                  const att = attendanceMap[st.id];
                  const attended = !!att?.joinedAt;
                  return (
                    <tr key={st.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center flex-shrink-0">
                            {(st.firstName[0] ?? '') + (st.lastName[0] ?? '')}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{st.firstName} {st.lastName}</p>
                            <p className="text-xs text-gray-400">{st.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-500 font-mono text-xs">{st.studentNo || '—'}</td>
                      <td className="px-5 py-3 text-gray-500">{fmt(att?.joinedAt ?? null)}</td>
                      <td className="px-5 py-3 text-gray-500">{att?.durationMins ? `${att.durationMins} min` : '—'}</td>
                      <td className="px-5 py-3">
                        {attended ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Present
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
                            Absent
                          </span>
                        )}
                      </td>
                      {!isCompleted && (
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => markAttendance(st.id, !attended)}
                            disabled={markingStudentId === st.id}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
                              attended
                                ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                                : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                            }`}
                          >
                            {attended ? 'Mark Absent' : 'Mark Present'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Details */}
        {activeTab === 'details' && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Platform', value: PLATFORM_LABELS[session.platform] ?? session.platform },
                { label: 'Scheduled At', value: fmtDate(session.scheduledAt) },
                { label: 'Duration', value: `${session.durationMins} minutes` },
                { label: 'Status', value: session.status.charAt(0).toUpperCase() + session.status.slice(1) },
                { label: 'Meeting ID', value: session.meetingId || '—' },
                { label: 'Passcode', value: session.passcode || '—' },
              ].map(row => (
                <div key={row.label} className="bg-gray-50 rounded-lg px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">{row.label}</p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5 font-mono">{row.value}</p>
                </div>
              ))}
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Join URL</p>
              <a href={session.joinUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">
                {session.joinUrl || '—'}
              </a>
            </div>
          </div>
        )}

        {/* Recording */}
        {activeTab === 'recording' && (
          <div className="p-5 space-y-4 max-w-lg">
            <p className="text-sm text-gray-600">
              Add a recording URL after the session ends. Students will see a "Watch Recording" button on their live sessions page.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Recording URL</label>
              <input
                type="url"
                value={recordingUrl}
                onChange={e => setRecordingUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            {session.recordingUrl && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Recording currently saved.
                <a href={session.recordingUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-green-700 hover:underline text-xs">Preview</a>
              </div>
            )}
            <button
              onClick={saveRecording}
              disabled={savingRecording}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-60 transition"
            >
              {savingRecording ? 'Saving…' : 'Save Recording URL'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
