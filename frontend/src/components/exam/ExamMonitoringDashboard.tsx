'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type Stats = {
  activeSessions:  number;
  highRiskCount:   number;
  violationsToday: number;
  activeExams:     number;
};

type ActiveExam = {
  assessmentId:    string;
  title:           string;
  type:            string;
  activeSessions:  number;
  maxRisk:         number;
  totalViolations: number;
};

type HighRiskSession = {
  id:               string;
  assessment_id:    string;
  student_id:       string;
  status:           string;
  risk_score:       number;
  tab_switches:     number;
  fullscreen_exits: number;
  focus_losses:     number;
  violationCount:   number;
  started_at:       string;
  last_heartbeat_at: string | null;
  studentName:      string;
  assessmentTitle:  string;
  assessmentType:   string;
};

type RecentViolation = {
  id:              string;
  session_id:      string;
  student_id:      string;
  assessment_id:   string;
  violation_type:  string;
  severity:        string;
  risk_points:     number;
  details:         Record<string, unknown> | null;
  occurred_at:     string;
  studentName:     string;
  assessmentTitle: string;
};

type DashboardData = {
  stats:            Stats;
  activeExams:      ActiveExam[];
  recentViolations: RecentViolation[];
  highRiskSessions: HighRiskSession[];
};

// ─── Violation metadata ───────────────────────────────────────────────────────

const V_META: Record<string, { label: string; icon: string }> = {
  tab_switch:               { label: 'Tab Switch',          icon: '↔️'  },
  visibility_hidden:        { label: 'Page Hidden',         icon: '🙈'  },
  window_blur:              { label: 'Window Blur',         icon: '👁️'  },
  fullscreen_exit:          { label: 'Fullscreen Exit',     icon: '⛶'   },
  copy_attempt:             { label: 'Copy Attempt',        icon: '📋'  },
  paste_attempt:            { label: 'Paste Attempt',       icon: '📋'  },
  right_click:              { label: 'Right Click',         icon: '🖱️'  },
  keyboard_shortcut:        { label: 'Keyboard Shortcut',   icon: '⌨️'  },
  devtools_open:            { label: 'DevTools Opened',     icon: '🔧'  },
  print_attempt:            { label: 'Print Attempt',       icon: '🖨️'  },
  no_face:                  { label: 'No Face Detected',    icon: '👤'  },
  no_face_detected:         { label: 'No Face Detected',    icon: '👤'  },
  multiple_faces:           { label: 'Multiple Faces',      icon: '👥'  },
  looking_away:             { label: 'Looking Away',        icon: '👀'  },
  phone_detected:           { label: 'Phone Detected',      icon: '📱'  },
  voice_detected:           { label: 'Voice Detected',      icon: '🎤'  },
  suspicious_movement:      { label: 'Suspicious Movement', icon: '🚶'  },
  screen_share_detected:    { label: 'Screen Sharing',      icon: '🖥️'  },
  external_display:         { label: 'External Display',    icon: '📺'  },
  remote_software_detected: { label: 'Remote Software',     icon: '🔒'  },
  ip_change:                { label: 'IP Changed',          icon: '🌐'  },
  multiple_sessions:        { label: 'Multiple Sessions',   icon: '🔁'  },
  disconnect:               { label: 'Disconnected',        icon: '🔌'  },
  time_manipulation:        { label: 'Time Manipulation',   icon: '⏱️'  },
  clipboard_access:         { label: 'Clipboard Access',    icon: '📋'  },
};

function vMeta(type: string) {
  return V_META[type] ?? { label: type.replace(/_/g, ' '), icon: '⚠️' };
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

function riskTextColor(score: number) {
  if (score >= 80) return 'text-red-600 font-bold';
  if (score >= 40) return 'text-amber-600 font-semibold';
  return 'text-green-600';
}

function severityBadge(severity: string) {
  const map: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high:     'bg-orange-100 text-orange-700 border-orange-200',
    warning:  'bg-amber-100 text-amber-700 border-amber-200',
    medium:   'bg-amber-100 text-amber-700 border-amber-200',
    info:     'bg-gray-100 text-gray-600 border-gray-200',
    low:      'bg-gray-100 text-gray-500 border-gray-200',
  };
  return `inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border uppercase ${map[severity] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active:     'bg-green-100 text-green-700',
    submitted:  'bg-blue-100 text-blue-700',
    timed_out:  'bg-amber-100 text-amber-700',
    terminated: 'bg-red-100 text-red-700',
    completed:  'bg-blue-100 text-blue-700',
  };
  return `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? 'bg-gray-100 text-gray-600'}`;
}

function typeBadge(type: string) {
  const map: Record<string, string> = {
    final_exam: 'bg-red-100 text-red-700',
    midterm:    'bg-orange-100 text-orange-700',
    quiz:       'bg-blue-100 text-blue-700',
    practice:   'bg-gray-100 text-gray-600',
  };
  return `text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${map[type] ?? 'bg-gray-100 text-gray-600'}`;
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

const EMPTY: DashboardData = {
  stats:            { activeSessions: 0, highRiskCount: 0, violationsToday: 0, activeExams: 0 },
  activeExams:      [],
  recentViolations: [],
  highRiskSessions: [],
};

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  /** Portal base path — controls where "Monitor" links point, e.g. "/instructor" or "/dept-head" */
  linkBase?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExamMonitoringDashboard({ linkBase = '/instructor' }: Props) {
  const [data, setData]           = useState<DashboardData>(EMPTY);
  const [loading, setLoading]     = useState(true);
  const [countdown, setCountdown] = useState(15);
  const [activeTab, setActiveTab] = useState<'violations' | 'high-risk'>('violations');
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res  = await fetch('/api/exam/monitoring/dashboard');
      const json = await res.json();
      if (json.stats) setData(json as DashboardData);
    } catch {
      toast.error('Failed to refresh dashboard data.');
    }
    setLoading(false);
    setCountdown(15);
  }, []);

  useEffect(() => {
    fetchData();
    pollRef.current  = setInterval(fetchData, 15_000);
    countRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => {
      if (pollRef.current)  clearInterval(pollRef.current);
      if (countRef.current) clearInterval(countRef.current);
    };
  }, [fetchData]);

  const { stats, activeExams, recentViolations, highRiskSessions } = data;

  const monitorHref = (assessmentId: string) =>
    `${linkBase}/assessments/${assessmentId}/monitoring`;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">Dashboard</p>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <svg className="w-7 h-7 text-[#4c1d95]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Exam Violations Monitor
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Live view of all exam sessions across your courses &nbsp;·&nbsp;
            <span className="text-gray-400 text-xs">Auto-refresh in {countdown}s</span>
          </p>
        </div>
        <button
          onClick={() => { fetchData(); setCountdown(15); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh Now
        </button>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Active Sessions',
            value: stats.activeSessions,
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M8.464 15.536a5 5 0 010-7.072m7.072 0a5 5 0 010 7.072M12 12h.01" />
              </svg>
            ),
            color: 'text-emerald-700', bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', pulse: stats.activeSessions > 0,
          },
          {
            label: 'High-Risk Students',
            value: stats.highRiskCount,
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ),
            color: 'text-red-700', bg: 'bg-red-50', iconBg: 'bg-red-100', pulse: stats.highRiskCount > 0,
          },
          {
            label: 'Violations Today',
            value: stats.violationsToday,
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            ),
            color: 'text-amber-700', bg: 'bg-amber-50', iconBg: 'bg-amber-100', pulse: false,
          },
          {
            label: 'Active Exams',
            value: stats.activeExams,
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            ),
            color: 'text-blue-700', bg: 'bg-blue-50', iconBg: 'bg-blue-100', pulse: false,
          },
        ].map(stat => (
          <div key={stat.label} className={`${stat.bg} rounded-xl border border-white/80 shadow-sm p-5 flex items-center gap-4`}>
            <div className={`${stat.iconBg} rounded-xl p-3 flex-shrink-0 relative`}>
              <span className={stat.color}>{stat.icon}</span>
              {stat.pulse && (
                <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-current animate-ping opacity-75" style={{ color: 'inherit' }} />
              )}
            </div>
            <div>
              <p className={`text-2xl font-bold ${stat.color}`}>{loading ? '—' : stat.value}</p>
              <p className="text-xs text-gray-500 font-medium leading-tight mt-0.5">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Active Exams ────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
            Active Exams
          </h2>
          <Link href={`${linkBase}/assessments`} className="text-xs text-[#4c1d95] hover:underline">
            All Assessments →
          </Link>
        </div>

        {loading ? (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-8 text-center text-sm text-gray-400 animate-pulse">
            Loading active exams…
          </div>
        ) : activeExams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm font-medium text-gray-400">No exams running right now</p>
            <p className="text-xs text-gray-400 mt-1">Active sessions will appear here in real time</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeExams.map(exam => (
              <div key={exam.assessmentId} className={`bg-white rounded-xl border shadow-sm p-5 flex flex-col gap-4 ${
                exam.maxRisk >= 80 ? 'border-red-300' : exam.maxRisk >= 40 ? 'border-amber-200' : 'border-emerald-200'
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <span className={typeBadge(exam.type)}>{exam.type.replace('_', ' ')}</span>
                    <p className="font-semibold text-gray-900 text-sm mt-1.5 truncate" title={exam.title}>{exam.title}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${riskColor(exam.maxRisk)}`}>
                    Risk {exam.maxRisk}
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>Max risk score</span>
                    <span className={riskTextColor(exam.maxRisk)}>{exam.maxRisk}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${riskBarColor(exam.maxRisk)}`}
                      style={{ width: `${Math.min(100, exam.maxRisk)}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: 'Active',     value: exam.activeSessions,  warn: false },
                    { label: 'Violations', value: exam.totalViolations, warn: exam.totalViolations >= 5 },
                    { label: 'Peak Risk',  value: exam.maxRisk,         warn: exam.maxRisk >= 40 },
                  ].map(s => (
                    <div key={s.label} className={`rounded-lg border p-2 ${s.warn ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                      <p className={`text-sm font-bold ${s.warn ? 'text-red-600' : 'text-gray-900'}`}>{s.value}</p>
                      <p className="text-[10px] text-gray-400 leading-tight">{s.label}</p>
                    </div>
                  ))}
                </div>

                <Link
                  href={monitorHref(exam.assessmentId)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#4c1d95] text-white text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Open Live Monitor
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Bottom panels ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Tab bar */}
        <div className="flex border-b border-gray-100">
          {([
            { key: 'violations', label: `Recent Violations (${recentViolations.length})` },
            { key: 'high-risk',  label: `High-Risk Students (${highRiskSessions.length})` },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-[#4c1d95] text-[#4c1d95] bg-[#4c1d95]/5'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Recent Violations tab ──────────────────────────────────────────── */}
        {activeTab === 'violations' && (
          <div>
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-400 animate-pulse">Loading violations…</div>
            ) : recentViolations.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-3xl mb-2">✅</p>
                <p className="text-sm font-medium text-gray-400">No violations recorded yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-[460px] overflow-y-auto">
                {recentViolations.map((v) => {
                  const meta = vMeta(v.violation_type);
                  return (
                    <div key={v.id} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50/70 transition-colors">
                      <span className="text-lg flex-shrink-0 leading-none mt-0.5">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{meta.label}</span>
                          <span className={severityBadge(v.severity)}>{v.severity}</span>
                          <span className="text-xs font-bold text-red-500">+{v.risk_points} pts</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          <span className="font-medium text-gray-700">{v.studentName}</span>
                          {' · '}
                          <span className="truncate">{v.assessmentTitle}</span>
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-400 font-mono">{fmtTime(v.occurred_at)}</p>
                        <Link
                          href={monitorHref(v.assessment_id)}
                          className="text-[10px] text-[#4c1d95] hover:underline"
                        >
                          Monitor →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── High-Risk Students tab ────────────────────────────────────────── */}
        {activeTab === 'high-risk' && (
          <div>
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-400 animate-pulse">Loading…</div>
            ) : highRiskSessions.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-3xl mb-2">✅</p>
                <p className="text-sm font-medium text-gray-400">No high-risk sessions (risk ≥ 40) in the last 24 hours</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Student', 'Exam', 'Risk Score', 'Violations', 'Tab Switches', 'Status', 'Heartbeat', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {highRiskSessions.map(s => (
                      <tr key={s.id} className={`hover:bg-gray-50/80 transition-colors ${s.risk_score >= 80 ? 'bg-red-50/30' : s.risk_score >= 60 ? 'bg-amber-50/30' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900 whitespace-nowrap">{s.studentName}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-gray-700 max-w-[180px] truncate" title={s.assessmentTitle}>{s.assessmentTitle}</p>
                          <span className={`${typeBadge(s.assessmentType)} mt-0.5 inline-block`}>{s.assessmentType.replace('_', ' ')}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                              <div
                                className={`h-full rounded-full ${riskBarColor(s.risk_score)}`}
                                style={{ width: `${Math.min(100, s.risk_score)}%` }}
                              />
                            </div>
                            <span className={`text-sm font-bold ${riskTextColor(s.risk_score)}`}>{s.risk_score}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold ${(s.violationCount ?? 0) >= 5 ? 'text-red-600' : 'text-gray-700'}`}>
                            {s.violationCount ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold ${s.tab_switches >= 3 ? 'text-red-600' : 'text-gray-700'}`}>
                            {s.tab_switches}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={statusBadge(s.status)}>{s.status.replace('_', ' ')}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-400">{timeSince(s.last_heartbeat_at)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={monitorHref(s.assessment_id)}
                            className="text-xs font-semibold text-[#4c1d95] hover:underline whitespace-nowrap"
                          >
                            Monitor →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Violation type legend ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Violation Types Reference</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {Object.entries(V_META).slice(0, 18).map(([type, meta]) => (
            <div key={type} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 text-xs">
              <span className="text-base flex-shrink-0">{meta.icon}</span>
              <span className="text-gray-600 truncate">{meta.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
