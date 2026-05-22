'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionRow = {
  id:                string;
  status:            'active' | 'submitted' | 'timed_out' | 'terminated' | 'completed';
  risk_score:        number;
  tab_switches:      number;
  fullscreen_exits:  number;
  focus_losses:      number;
  started_at:        string;
  last_heartbeat_at: string | null;
  ended_at:          string | null;
  ip_address:        string | null;
  student_id:        string;
  attempt_id:        string;
  studentName:       string;
  violationCount:    number;
  latestSnapPath:    string | null;
};

type Violation = {
  violation_type: string;
  severity:       string;
  risk_points:    number;
  details:        Record<string, unknown> | null;
  occurred_at:    string;
};

type IdentityVerif = {
  status:     string;
  selfie_path: string | null;
  created_at: string;
};

type Assessment = { title: string; type: string; totalMarks: number };

// ─── Violation metadata ───────────────────────────────────────────────────────

const V_META: Record<string, { label: string; icon: string; severityColor: string }> = {
  tab_switch:               { label: 'Tab Switch',          icon: '↔️',  severityColor: 'amber'  },
  visibility_hidden:        { label: 'Page Hidden',         icon: '🙈',  severityColor: 'amber'  },
  window_blur:              { label: 'Window Blur',         icon: '👁️',  severityColor: 'gray'   },
  fullscreen_exit:          { label: 'Fullscreen Exit',     icon: '⛶',   severityColor: 'amber'  },
  copy_attempt:             { label: 'Copy Attempt',        icon: '📋',  severityColor: 'yellow' },
  paste_attempt:            { label: 'Paste Attempt',       icon: '📋',  severityColor: 'yellow' },
  right_click:              { label: 'Right Click',         icon: '🖱️',  severityColor: 'gray'   },
  keyboard_shortcut:        { label: 'Keyboard Shortcut',   icon: '⌨️',  severityColor: 'gray'   },
  devtools_open:            { label: 'DevTools Opened',     icon: '🔧',  severityColor: 'red'    },
  print_attempt:            { label: 'Print Attempt',       icon: '🖨️',  severityColor: 'yellow' },
  no_face:                  { label: 'No Face Detected',    icon: '👤',  severityColor: 'orange' },
  no_face_detected:         { label: 'No Face Detected',    icon: '👤',  severityColor: 'orange' },
  multiple_faces:           { label: 'Multiple Faces',      icon: '👥',  severityColor: 'red'    },
  looking_away:             { label: 'Looking Away',        icon: '👀',  severityColor: 'orange' },
  phone_detected:           { label: 'Phone Detected',      icon: '📱',  severityColor: 'red'    },
  voice_detected:           { label: 'Voice Detected',      icon: '🎤',  severityColor: 'orange' },
  suspicious_movement:      { label: 'Suspicious Movement', icon: '🚶',  severityColor: 'orange' },
  screen_share_detected:    { label: 'Screen Sharing',      icon: '🖥️',  severityColor: 'red'    },
  external_display:         { label: 'External Display',    icon: '📺',  severityColor: 'amber'  },
  remote_software_detected: { label: 'Remote Software',     icon: '🔒',  severityColor: 'red'    },
  ip_change:                { label: 'IP Changed',          icon: '🌐',  severityColor: 'orange' },
  multiple_sessions:        { label: 'Multiple Sessions',   icon: '🔁',  severityColor: 'red'    },
  disconnect:               { label: 'Disconnected',        icon: '🔌',  severityColor: 'amber'  },
  time_manipulation:        { label: 'Time Manipulation',   icon: '⏱️',  severityColor: 'red'    },
  clipboard_access:         { label: 'Clipboard Access',    icon: '📋',  severityColor: 'yellow' },
};

function vMeta(type: string) {
  return V_META[type] ?? { label: type.replace(/_/g, ' '), icon: '⚠️', severityColor: 'gray' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskColor(score: number) {
  if (score >= 80) return 'text-red-700 bg-red-100 border-red-300';
  if (score >= 40) return 'text-amber-700 bg-amber-100 border-amber-300';
  return 'text-green-700 bg-green-100 border-green-300';
}

function riskBarColor(score: number) {
  if (score >= 80) return 'bg-red-500';
  if (score >= 40) return 'bg-amber-400';
  return 'bg-green-400';
}

function severityRowCls(severity: string) {
  if (severity === 'critical') return 'bg-red-50 border-red-200';
  if (severity === 'high')     return 'bg-orange-50 border-orange-200';
  if (severity === 'warning' || severity === 'medium') return 'bg-amber-50 border-amber-200';
  return 'bg-gray-50 border-gray-200';
}

function severityTextCls(severity: string) {
  if (severity === 'critical') return 'text-red-600';
  if (severity === 'high')     return 'text-orange-600';
  if (severity === 'warning' || severity === 'medium') return 'text-amber-600';
  return 'text-gray-400';
}

function timeSince(iso: string | null): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function statusBadge(status: SessionRow['status']) {
  const map: Record<string, string> = {
    active:     'bg-green-100 text-green-700',
    submitted:  'bg-blue-100 text-blue-700',
    timed_out:  'bg-amber-100 text-amber-700',
    terminated: 'bg-red-100 text-red-700',
    completed:  'bg-blue-100 text-blue-700',
  };
  return `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? 'bg-gray-100 text-gray-600'}`;
}

function formatDetails(type: string, details: Record<string, unknown> | null): string | null {
  if (!details || Object.keys(details).length === 0) return null;
  // Human-readable formatting for known types
  if (type === 'voice_detected') {
    const level = details.level as number;
    return level ? `Audio level: ${level}/255` : null;
  }
  if (type === 'remote_software_detected') {
    const flags = [];
    if (details.isWebDriver)      flags.push('WebDriver');
    if (details.isHeadless)       flags.push('Headless browser');
    if (details.hasSelenium)      flags.push('Selenium');
    if (details.hasNightmare)     flags.push('Nightmare');
    if (details.hasPlaywright)    flags.push('Playwright');
    if (details.hasCypress)       flags.push('Cypress');
    if (details.suspiciousDisplay) flags.push('Virtual display');
    if (details.hasPhantom)       flags.push('PhantomJS');
    return flags.length ? flags.join(', ') : null;
  }
  if (type === 'devtools_open') {
    const w = details.wDiff as number;
    const h = details.hDiff as number;
    if (w || h) return `Size delta: ${w ?? 0}×${h ?? 0}px`;
  }
  if (type === 'keyboard_shortcut' || type === 'copy_attempt') {
    return details.key ? `Key: ${details.key}` : null;
  }
  if (type === 'external_display') return 'Extended screen detected';
  if (type === 'no_face' || type === 'no_face_detected') {
    return details.faceCount !== undefined ? `Faces visible: ${details.faceCount}` : null;
  }
  if (type === 'multiple_faces') {
    return details.faceCount ? `Faces detected: ${details.faceCount}` : null;
  }
  // Generic fallback for unknown types
  const simple = Object.entries(details)
    .filter(([, v]) => typeof v !== 'object' && v !== false)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
  return simple || null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExamMonitoringPage() {
  const params       = useParams();
  const router       = useRouter();
  const assessmentId = params?.assessmentId as string;

  const [assessment, setAssessment]     = useState<Assessment | null>(null);
  const [sessions, setSessions]         = useState<SessionRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [terminating, setTerminating]   = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [violations, setViolations]     = useState<Violation[]>([]);
  const [identityVerif, setIdentityVerif] = useState<IdentityVerif | null>(null);
  const [identityPhotoUrl, setIdentityPhotoUrl] = useState<string | null>(null);
  const [snapUrls, setSnapUrls]         = useState<Record<string, string>>({});
  const [drawerTab, setDrawerTab]       = useState<'timeline' | 'summary' | 'identity'>('timeline');
  const [countdown, setCountdown]       = useState(10);
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAssessment = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('assessments')
      .select('title, type, total_marks')
      .eq('id', assessmentId)
      .maybeSingle();
    if (data) setAssessment({
      title:      (data as any).title,
      type:       (data as any).type,
      totalMarks: (data as any).total_marks,
    });
  }, [assessmentId]);

  const fetchSessions = useCallback(async () => {
    try {
      const res  = await fetch(`/api/exam/monitoring/${assessmentId}`);
      const json = await res.json();
      if (json.sessions) setSessions(json.sessions);
    } catch { /* silent */ }
    setLoading(false);
    setCountdown(10);
  }, [assessmentId]);

  const resolveSnapUrls = useCallback(async (rows: SessionRow[]) => {
    const supabase = createClient();
    const paths = rows.map(r => r.latestSnapPath).filter((p): p is string => !!p);
    const newUrls: Record<string, string> = {};
    for (const path of paths) {
      if (snapUrls[path]) continue;
      const { data } = supabase.storage.from('lms-uploads').getPublicUrl(path);
      if (data?.publicUrl) newUrls[path] = data.publicUrl;
    }
    if (Object.keys(newUrls).length) setSnapUrls(prev => ({ ...prev, ...newUrls }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchAssessment();
    fetchSessions();
    pollRef.current  = setInterval(fetchSessions, 10_000);
    countRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => {
      if (pollRef.current)  clearInterval(pollRef.current);
      if (countRef.current) clearInterval(countRef.current);
    };
  }, [fetchAssessment, fetchSessions]);

  useEffect(() => {
    if (sessions.length) resolveSnapUrls(sessions);
  }, [sessions, resolveSnapUrls]);

  async function openSessionDetail(sessionId: string) {
    setSelectedSession(sessionId);
    setViolations([]);
    setIdentityVerif(null);
    setIdentityPhotoUrl(null);
    setDrawerTab('timeline');
    const supabase = createClient();

    // Load violations
    const { data: vData } = await supabase
      .from('exam_violations')
      .select('violation_type, severity, risk_points, details, occurred_at')
      .eq('session_id', sessionId)
      .order('occurred_at', { ascending: false });
    setViolations((vData ?? []) as Violation[]);

    // Load identity verification if any
    const { data: idData } = await supabase
      .from('identity_verifications')
      .select('status, selfie_path, created_at')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (idData) {
      const iv = idData as IdentityVerif;
      setIdentityVerif(iv);
      if (iv.selfie_path) {
        const { data: urlData } = supabase.storage.from('lms-uploads').getPublicUrl(iv.selfie_path);
        if (urlData?.publicUrl) setIdentityPhotoUrl(urlData.publicUrl);
      }
    }
  }

  async function terminateSession(sessionId: string, studentName: string) {
    if (!confirm(`Terminate ${studentName}'s exam? This will force-submit their attempt.`)) return;
    setTerminating(sessionId);
    try {
      const res = await fetch(`/api/exam/terminate/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Terminated by instructor via monitoring dashboard' }),
      });
      if (res.ok) { toast.success(`${studentName}'s exam terminated.`); fetchSessions(); }
      else toast.error('Failed to terminate session.');
    } catch { toast.error('Network error.'); }
    setTerminating(null);
  }

  // Grouped violations for summary tab
  const groupedViolations = violations.reduce<Record<string, { count: number; points: number; severity: string }>>((acc, v) => {
    const key = v.violation_type;
    if (!acc[key]) acc[key] = { count: 0, points: 0, severity: v.severity };
    acc[key].count++;
    acc[key].points += v.risk_points;
    return acc;
  }, {});
  const sortedGroups = Object.entries(groupedViolations).sort((a, b) => b[1].points - a[1].points);

  const active    = sessions.filter(s => s.status === 'active');
  const completed = sessions.filter(s => s.status !== 'active');
  const selectedSess = sessions.find(s => s.id === selectedSession);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Live Monitoring</p>
          <h1 className="text-2xl font-bold text-gray-900">{assessment?.title ?? 'Loading…'}</h1>
          <p className="text-sm text-gray-500 mt-1">
            <span className="font-semibold text-green-600">{active.length} active</span>
            {' · '}
            <span className="text-gray-500">{completed.length} completed</span>
            {' · '}
            <span className="text-gray-400 text-xs">Auto-refresh in {countdown}s</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchSessions(); setCountdown(10); }}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <Link href={`/instructor/assessments/${assessmentId}/submissions`}
            className="px-4 py-2 rounded-lg bg-[#4c1d95] text-white text-sm font-medium hover:opacity-90">
            Grade Submissions
          </Link>
        </div>
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Active',        value: active.length,                                            color: 'text-green-700',  bg: 'bg-green-50'  },
            { label: 'High Risk',     value: sessions.filter(s => s.risk_score >= 80).length,          color: 'text-red-700',    bg: 'bg-red-50'    },
            { label: 'Total Violations', value: sessions.reduce((s, r) => s + r.violationCount, 0),   color: 'text-amber-700',  bg: 'bg-amber-50'  },
            { label: 'Completed',     value: completed.length,                                         color: 'text-blue-700',   bg: 'bg-blue-50'   },
          ].map(stat => (
            <div key={stat.label} className={`${stat.bg} rounded-xl border border-gray-100 shadow-sm p-4 text-center`}>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-gray-500 font-medium mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Session grid ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm animate-pulse">Loading sessions…</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No sessions yet for this assessment.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {sessions.map(s => {
            const snapUrl    = s.latestSnapPath ? snapUrls[s.latestSnapPath] : null;
            const riskPct    = Math.min(100, s.risk_score);
            const isSelected = selectedSession === s.id;
            return (
              <div
                key={s.id}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${
                  isSelected ? 'ring-2 ring-[#4c1d95]' :
                  s.risk_score >= 80 ? 'border-red-300' :
                  s.risk_score >= 40 ? 'border-amber-200' : 'border-gray-100'
                }`}
              >
                {/* Webcam thumbnail */}
                <div className="w-full h-32 bg-gray-900 relative overflow-hidden">
                  {snapUrl ? (
                    <img src={snapUrl} alt="Webcam" className="w-full h-full object-cover opacity-90" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                      <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.361a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span className="text-[10px] text-gray-500">No webcam</span>
                    </div>
                  )}
                  <div className="absolute top-2 left-2">
                    <span className={statusBadge(s.status)}>{s.status.replace('_', ' ')}</span>
                  </div>
                  <div className="absolute top-2 right-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${riskColor(s.risk_score)}`}>
                      Risk {s.risk_score}
                    </span>
                  </div>
                  {/* Risk bar at bottom of thumbnail */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                    <div className={`h-full transition-all ${riskBarColor(s.risk_score)}`} style={{ width: `${riskPct}%` }} />
                  </div>
                </div>

                <div className="p-4">
                  <p className="font-semibold text-gray-900 text-sm truncate">{s.studentName}</p>
                  <p className="text-xs text-gray-400 mb-3">
                    {s.ip_address && <span className="font-mono">{s.ip_address} · </span>}
                    Heartbeat: {timeSince(s.last_heartbeat_at)}
                  </p>

                  {/* Violation counters */}
                  <div className="grid grid-cols-3 gap-2 text-center mb-3">
                    {[
                      { label: 'Tab switches',  value: s.tab_switches,     warn: s.tab_switches >= 3    },
                      { label: 'FS exits',      value: s.fullscreen_exits, warn: s.fullscreen_exits >= 2 },
                      { label: 'Violations',    value: s.violationCount,   warn: s.violationCount >= 5   },
                    ].map(stat => (
                      <div key={stat.label} className={`rounded-lg border p-2 ${stat.warn ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                        <p className={`text-sm font-bold ${stat.warn ? 'text-red-600' : 'text-gray-900'}`}>{stat.value}</p>
                        <p className="text-[10px] text-gray-400 leading-tight">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => openSessionDetail(s.id)}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        isSelected
                          ? 'border-[#4c1d95] bg-[#4c1d95] text-white'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {isSelected ? '✓ Viewing Log' : 'View Log'}
                    </button>
                    {s.status === 'active' && (
                      <button
                        onClick={() => terminateSession(s.id, s.studentName)}
                        disabled={terminating === s.id}
                        className="flex-1 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
                      >
                        {terminating === s.id ? '…' : 'Terminate'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Violation / detail drawer ──────────────────────────────────────── */}
      {selectedSession && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSelectedSession(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-white shadow-2xl flex flex-col">

            {/* Drawer header */}
            <div className="bg-[#4c1d95] px-6 py-4 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[10px] text-purple-300 uppercase tracking-widest">Session Detail</p>
                  <h2 className="text-lg font-bold text-white leading-tight">{selectedSess?.studentName}</h2>
                </div>
                <button onClick={() => setSelectedSession(null)} className="p-1.5 text-purple-300 hover:bg-white/10 rounded-lg flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'Risk Score',  value: selectedSess?.risk_score ?? 0 },
                  { label: 'Violations',  value: violations.length },
                  { label: 'Tab Switches', value: selectedSess?.tab_switches ?? 0 },
                ].map(st => (
                  <div key={st.label} className="bg-white/10 rounded-lg py-1.5">
                    <p className="text-base font-bold text-white">{st.value}</p>
                    <p className="text-[10px] text-purple-300">{st.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 flex-shrink-0 bg-white">
              {([
                { key: 'timeline', label: `Timeline (${violations.length})` },
                { key: 'summary',  label: `Summary (${sortedGroups.length} types)` },
                { key: 'identity', label: 'Identity' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setDrawerTab(tab.key)}
                  className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                    drawerTab === tab.key
                      ? 'border-[#4c1d95] text-[#4c1d95]'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto">

              {/* ── Timeline tab ─────────────────────────────────────────── */}
              {drawerTab === 'timeline' && (
                <div className="p-4 space-y-2">
                  {violations.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-2xl mb-2">✅</p>
                      <p className="text-sm text-gray-400 font-medium">No violations recorded</p>
                    </div>
                  ) : violations.map((v, i) => {
                    const meta    = vMeta(v.violation_type);
                    const detail  = formatDetails(v.violation_type, v.details);
                    return (
                      <div key={i} className={`rounded-xl border px-4 py-3 ${severityRowCls(v.severity)}`}>
                        <div className="flex items-start gap-3">
                          <span className="text-xl flex-shrink-0 leading-none mt-0.5">{meta.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <span className="text-sm font-semibold text-gray-900">{meta.label}</span>
                              <span className="text-xs font-bold text-red-600 flex-shrink-0">+{v.risk_points} pts</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className={`text-xs font-medium capitalize ${severityTextCls(v.severity)}`}>
                                {v.severity}
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono">{fmtTime(v.occurred_at)}</span>
                            </div>
                            {detail && (
                              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{detail}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Summary tab ──────────────────────────────────────────── */}
              {drawerTab === 'summary' && (
                <div className="p-4 space-y-3">
                  {sortedGroups.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-2xl mb-2">✅</p>
                      <p className="text-sm text-gray-400 font-medium">No violations to summarize</p>
                    </div>
                  ) : (
                    <>
                      {/* Risk score bar */}
                      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-600">Total Risk Score</span>
                          <span className={`text-sm font-bold ${
                            (selectedSess?.risk_score ?? 0) >= 80 ? 'text-red-600' :
                            (selectedSess?.risk_score ?? 0) >= 40 ? 'text-amber-600' : 'text-green-600'
                          }`}>{selectedSess?.risk_score ?? 0} / 100</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${riskBarColor(selectedSess?.risk_score ?? 0)}`}
                            style={{ width: `${Math.min(100, selectedSess?.risk_score ?? 0)}%` }}
                          />
                        </div>
                      </div>

                      {sortedGroups.map(([type, data]) => {
                        const meta = vMeta(type);
                        return (
                          <div key={type} className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-200">
                            <span className="text-xl flex-shrink-0">{meta.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
                              <p className="text-xs text-gray-400">{data.count} occurrence{data.count !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold text-red-600">+{data.points} pts</p>
                              <p className={`text-[10px] font-medium capitalize ${severityTextCls(data.severity)}`}>{data.severity}</p>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}

              {/* ── Identity tab ─────────────────────────────────────────── */}
              {drawerTab === 'identity' && (
                <div className="p-4 space-y-4">
                  {!identityVerif ? (
                    <div className="text-center py-12">
                      <p className="text-2xl mb-2">🪪</p>
                      <p className="text-sm text-gray-400 font-medium">No identity verification recorded</p>
                      <p className="text-xs text-gray-400 mt-1">Identity verification was not required or not completed for this session.</p>
                    </div>
                  ) : (
                    <>
                      {/* Status badge */}
                      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                        identityVerif.status === 'verified'
                          ? 'bg-green-50 border-green-200'
                          : identityVerif.status === 'failed'
                          ? 'bg-red-50 border-red-200'
                          : 'bg-amber-50 border-amber-200'
                      }`}>
                        <span className="text-2xl">
                          {identityVerif.status === 'verified' ? '✅' : identityVerif.status === 'failed' ? '❌' : '⏳'}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 capitalize">{identityVerif.status}</p>
                          <p className="text-xs text-gray-500">
                            Captured at {fmtTime(identityVerif.created_at)}
                          </p>
                        </div>
                        {/* Instructor can mark as verified/failed */}
                        {identityVerif.status === 'pending' && (
                          <div className="ml-auto flex gap-2">
                            <button
                              onClick={async () => {
                                const supabase = createClient();
                                await supabase.from('identity_verifications')
                                  .update({ status: 'verified', verified_at: new Date().toISOString() })
                                  .eq('session_id', selectedSession);
                                setIdentityVerif(v => v ? { ...v, status: 'verified' } : v);
                                toast.success('Identity marked as verified.');
                              }}
                              className="px-3 py-1 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700"
                            >
                              ✓ Verify
                            </button>
                            <button
                              onClick={async () => {
                                const supabase = createClient();
                                await supabase.from('identity_verifications')
                                  .update({ status: 'failed' })
                                  .eq('session_id', selectedSession);
                                setIdentityVerif(v => v ? { ...v, status: 'failed' } : v);
                                toast.error('Identity marked as failed.');
                              }}
                              className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
                            >
                              ✗ Reject
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Selfie photo */}
                      {identityPhotoUrl ? (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Student Selfie</p>
                          <img
                            src={identityPhotoUrl}
                            alt="Student identity selfie"
                            className="w-full rounded-xl border border-gray-200 object-cover"
                          />
                        </div>
                      ) : (
                        <div className="text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                          <p className="text-sm text-gray-400">Photo not available</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
