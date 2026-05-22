'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

type SessionRow = {
  id:               string;
  status:           'active' | 'submitted' | 'timed_out' | 'terminated';
  risk_score:       number;
  tab_switches:     number;
  fullscreen_exits: number;
  focus_losses:     number;
  started_at:       string;
  last_heartbeat_at: string | null;
  ended_at:         string | null;
  ip_address:       string | null;
  student_id:       string;
  attempt_id:       string;
  studentName:      string;
  violationCount:   number;
  latestSnapPath:   string | null;
};

type Assessment = { title: string; type: string; totalMarks: number };

function riskColor(score: number) {
  if (score >= 80) return 'text-red-700 bg-red-100 border-red-300';
  if (score >= 40) return 'text-amber-700 bg-amber-100 border-amber-300';
  return 'text-green-700 bg-green-100 border-green-300';
}

function timeSince(iso: string | null): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function statusBadge(status: SessionRow['status']) {
  const map: Record<string, string> = {
    active:     'bg-green-100 text-green-700',
    submitted:  'bg-blue-100 text-blue-700',
    timed_out:  'bg-amber-100 text-amber-700',
    terminated: 'bg-red-100 text-red-700',
  };
  return `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? 'bg-gray-100 text-gray-600'}`;
}

export default function ExamMonitoringPage() {
  const params       = useParams();
  const router       = useRouter();
  const assessmentId = params?.assessmentId as string;

  const [assessment, setAssessment]   = useState<Assessment | null>(null);
  const [sessions, setSessions]       = useState<SessionRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [terminating, setTerminating] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [violations, setViolations]   = useState<any[]>([]);
  const [snapUrls, setSnapUrls]       = useState<Record<string, string>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAssessment = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('assessments')
      .select('title, type, total_marks')
      .eq('id', assessmentId)
      .maybeSingle();
    if (data) setAssessment({ title: (data as any).title, type: (data as any).type, totalMarks: (data as any).total_marks });
  }, [assessmentId]);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/exam/monitoring/${assessmentId}`);
      const json = await res.json();
      if (json.sessions) setSessions(json.sessions);
    } catch { /* silent */ }
    setLoading(false);
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
    pollRef.current = setInterval(fetchSessions, 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchAssessment, fetchSessions]);

  useEffect(() => {
    if (sessions.length) resolveSnapUrls(sessions);
  }, [sessions, resolveSnapUrls]);

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

  async function openViolations(sessionId: string) {
    setSelectedSession(sessionId);
    const supabase = createClient();
    const { data } = await supabase
      .from('exam_violations')
      .select('violation_type, severity, risk_points, details, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });
    setViolations((data ?? []) as any[]);
  }

  const active    = sessions.filter(s => s.status === 'active');
  const completed = sessions.filter(s => s.status !== 'active');
  const selectedViolSess = sessions.find(s => s.id === selectedSession);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Live Monitoring</p>
          <h1 className="text-2xl font-bold text-gray-900">{assessment?.title ?? 'Loading…'}</h1>
          <p className="text-sm text-gray-500 mt-1">
            <span className="font-semibold text-green-600">{active.length} active</span>
            {' · '}
            <span className="text-gray-500">{completed.length} completed</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchSessions} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Refresh
          </button>
          <Link href={`/instructor/assessments/${assessmentId}/submissions`}
            className="px-4 py-2 rounded-lg bg-[#4c1d95] text-white text-sm font-medium hover:opacity-90">
            Grade Submissions
          </Link>
        </div>
      </div>

      {/* Stats bar */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Active',      value: active.length,    color: 'text-green-700' },
            { label: 'High Risk',   value: sessions.filter(s => s.risk_score >= 80).length, color: 'text-red-700' },
            { label: 'Violations',  value: sessions.reduce((s, r) => s + r.violationCount, 0), color: 'text-amber-700' },
            { label: 'Completed',   value: completed.length, color: 'text-blue-700' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-gray-500 font-medium mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading sessions…</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No sessions yet for this assessment.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {sessions.map(s => {
            const snapUrl = s.latestSnapPath ? snapUrls[s.latestSnapPath] : null;
            return (
              <div key={s.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-shadow hover:shadow-md ${s.risk_score >= 80 ? 'border-red-300' : s.risk_score >= 40 ? 'border-amber-200' : 'border-gray-100'}`}>
                {/* Webcam thumbnail */}
                <div className="w-full h-32 bg-gray-900 relative overflow-hidden">
                  {snapUrl ? (
                    <img src={snapUrl} alt="Webcam" className="w-full h-full object-cover opacity-90" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.361a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute top-2 left-2">
                    <span className={statusBadge(s.status)}>{s.status}</span>
                  </div>
                  <div className="absolute top-2 right-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${riskColor(s.risk_score)}`}>
                      Risk: {s.risk_score}
                    </span>
                  </div>
                </div>

                <div className="p-4">
                  <p className="font-semibold text-gray-900 text-sm truncate">{s.studentName}</p>
                  <p className="text-xs text-gray-400 mb-3">Heartbeat: {timeSince(s.last_heartbeat_at)}</p>

                  <div className="grid grid-cols-3 gap-2 text-center mb-3">
                    {[
                      { label: 'Tab switches', value: s.tab_switches },
                      { label: 'FS exits',     value: s.fullscreen_exits },
                      { label: 'Violations',   value: s.violationCount },
                    ].map(stat => (
                      <div key={stat.label} className="rounded-lg bg-gray-50 border border-gray-100 p-2">
                        <p className="text-sm font-bold text-gray-900">{stat.value}</p>
                        <p className="text-[10px] text-gray-400 leading-tight">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => openViolations(s.id)}
                      className="flex-1 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">
                      View Log
                    </button>
                    {s.status === 'active' && (
                      <button
                        onClick={() => terminateSession(s.id, s.studentName)}
                        disabled={terminating === s.id}
                        className="flex-1 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50">
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

      {/* Violation log drawer */}
      {selectedSession && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSelectedSession(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col">
            <div className="bg-[#4c1d95] px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-purple-300 uppercase tracking-widest">Violation Log</p>
                <h2 className="text-lg font-bold text-white">{selectedViolSess?.studentName}</h2>
              </div>
              <button onClick={() => setSelectedSession(null)} className="p-1.5 text-purple-300 hover:bg-white/10 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {violations.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No violations recorded.</p>
              ) : violations.map((v: any, i) => (
                <div key={i} className={`rounded-lg border px-4 py-3 ${
                  v.severity === 'critical' ? 'bg-red-50 border-red-200' :
                  v.severity === 'high'     ? 'bg-orange-50 border-orange-200' :
                  v.severity === 'medium'   ? 'bg-amber-50 border-amber-200' :
                                              'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-semibold text-gray-900 capitalize">
                      {v.violation_type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs font-bold text-red-600">+{v.risk_points} pts</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium capitalize ${
                      v.severity === 'critical' ? 'text-red-600' :
                      v.severity === 'high'     ? 'text-orange-600' :
                      v.severity === 'medium'   ? 'text-amber-600' : 'text-gray-500'
                    }`}>{v.severity}</span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(v.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  {v.details && Object.keys(v.details).length > 0 && (
                    <p className="text-[10px] text-gray-400 mt-1 font-mono">
                      {JSON.stringify(v.details)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
