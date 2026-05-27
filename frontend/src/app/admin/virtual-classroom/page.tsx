'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

type SessionStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';

type Session = {
  id: string;
  title: string;
  platform: string;
  scheduledAt: string;
  durationMins: number;
  status: SessionStatus;
  courseCode: string;
  courseTitle: string;
  sectionName: string;
  instructorName: string;
  attendeeCount: number;
  enrolledCount: number;
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

const STATUS_COLORS: Record<SessionStatus, string> = {
  live: 'bg-green-100 text-green-700 border border-green-300',
  scheduled: 'bg-blue-50 text-blue-700 border border-blue-200',
  completed: 'bg-gray-100 text-gray-500 border border-gray-200',
  cancelled: 'bg-red-50 text-red-600 border border-red-200',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function isThisWeek(iso: string) {
  const d = new Date(iso).getTime();
  const n = Date.now();
  return d >= n && d <= n + 7 * 86400 * 1000;
}

export default function AdminVirtualClassroomPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'live' | 'today' | 'upcoming'>('live');
  const [search, setSearch] = useState('');

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const { data: raw, error } = await supabase
      .from('live_sessions')
      .select(`
        id, title, platform, scheduled_at, duration_mins, status,
        offering_id, instructor_id,
        course_offerings!fk_live_sessions_offering(
          id, section_name, enrolled_count,
          courses!fk_course_offerings_course(code, title)
        )
      `)
      .order('scheduled_at', { ascending: false })
      .limit(200);

    if (error || !raw) { setLoading(false); return; }

    // Get instructor names
    const instrIds = [...new Set((raw as any[]).map(r => r.instructor_id).filter(Boolean))];
    const { data: instrUsers } = instrIds.length > 0
      ? await supabase.from('users').select('id, first_name, last_name').in('id', instrIds)
      : { data: [] };

    const instrMap: Record<string, string> = {};
    ((instrUsers ?? []) as any[]).forEach((u: any) => {
      instrMap[u.id] = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
    });

    // Get attendance counts per session
    const sessionIds = (raw as any[]).map(r => r.id);
    const { data: attRows } = sessionIds.length > 0
      ? await supabase
          .from('live_session_attendance')
          .select('live_session_id')
          .in('live_session_id', sessionIds)
      : { data: [] };

    const attCountMap: Record<string, number> = {};
    ((attRows ?? []) as any[]).forEach((a: any) => {
      attCountMap[a.live_session_id] = (attCountMap[a.live_session_id] ?? 0) + 1;
    });

    const mapped: Session[] = (raw as any[]).map(r => {
      const co = r.course_offerings ?? {};
      const c = co.courses ?? {};
      return {
        id: r.id,
        title: r.title,
        platform: r.platform,
        scheduledAt: r.scheduled_at,
        durationMins: r.duration_mins,
        status: r.status as SessionStatus,
        courseCode: c.code ?? '',
        courseTitle: c.title ?? '',
        sectionName: co.section_name ?? 'A',
        instructorName: instrMap[r.instructor_id] ?? '—',
        attendeeCount: attCountMap[r.id] ?? 0,
        enrolledCount: co.enrolled_count ?? 0,
      };
    });

    setSessions(mapped);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const liveNow = sessions.filter(s => s.status === 'live');
  const todaySessions = sessions.filter(s => isToday(s.scheduledAt));
  const upcomingSessions = sessions.filter(s => s.status === 'scheduled' && isThisWeek(s.scheduledAt));

  const filtered = sessions.filter(s => {
    const matchFilter =
      filter === 'all' ? true :
      filter === 'live' ? s.status === 'live' :
      filter === 'today' ? isToday(s.scheduledAt) :
      s.status === 'scheduled' && isThisWeek(s.scheduledAt);
    const matchSearch = !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.courseTitle.toLowerCase().includes(search.toLowerCase()) ||
      s.courseCode.toLowerCase().includes(search.toLowerCase()) ||
      s.instructorName.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Virtual Classroom</h2>
        <p className="text-sm text-gray-500 mt-0.5">Monitor live sessions across all courses</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Live Now',
            value: liveNow.length,
            sub: liveNow.length > 0 ? `${liveNow.reduce((a, s) => a + s.attendeeCount, 0)} students in session` : 'No active sessions',
            color: 'text-green-700',
            bg: 'bg-green-50',
            iconColor: 'text-green-600',
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            ),
          },
          {
            label: "Today's Sessions",
            value: todaySessions.length,
            sub: `${todaySessions.filter(s => s.status === 'completed').length} completed`,
            color: 'text-blue-700',
            bg: 'bg-blue-50',
            iconColor: 'text-blue-600',
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            ),
          },
          {
            label: 'Upcoming (7 days)',
            value: upcomingSessions.length,
            sub: 'scheduled sessions',
            color: 'text-amber-700',
            bg: 'bg-amber-50',
            iconColor: 'text-amber-600',
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ),
          },
          {
            label: 'Total Sessions',
            value: sessions.length,
            sub: `${sessions.filter(s => s.status === 'completed').length} completed`,
            color: 'text-purple-700',
            bg: 'bg-purple-50',
            iconColor: 'text-purple-600',
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            ),
          },
        ].map(card => (
          <div key={card.label} className={`rounded-xl border ${card.bg} p-5 flex items-center gap-4`} style={{ borderColor: 'transparent' }}>
            <div className={`w-11 h-11 rounded-lg ${card.bg} flex items-center justify-center flex-shrink-0 border border-current/10 ${card.iconColor}`}>
              {card.icon}
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">{card.label}</p>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {([
              { key: 'live', label: `Live (${liveNow.length})` },
              { key: 'today', label: `Today (${todaySessions.length})` },
              { key: 'upcoming', label: `Upcoming (${upcomingSessions.length})` },
              { key: 'all', label: `All (${sessions.length})` },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filter === tab.key ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 sm:max-w-xs ml-auto">
            <input
              type="search"
              placeholder="Search sessions…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <button onClick={fetchSessions} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition" title="Refresh">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Session</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Platform</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Instructor</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Scheduled</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Attendees</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-3">
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-sm">
                    {filter === 'live' ? 'No live sessions right now.' : 'No sessions match your filters.'}
                  </td>
                </tr>
              ) : filtered.map(s => (
                <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{s.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.courseCode} — {s.courseTitle} · Sec {s.sectionName}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PLATFORM_COLORS[s.platform] ?? 'bg-gray-100 text-gray-700'}`}>
                      {PLATFORM_LABELS[s.platform] ?? s.platform}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{s.instructorName}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(s.scheduledAt)}<br />{s.durationMins} min</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: s.enrolledCount > 0 ? `${Math.min(100, (s.attendeeCount / s.enrolledCount) * 100)}%` : '0%' }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{s.attendeeCount}/{s.enrolledCount}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status]}`}>
                      {s.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                      {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/instructor/virtual-classroom/${s.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
