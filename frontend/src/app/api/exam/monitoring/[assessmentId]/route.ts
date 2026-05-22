import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ assessmentId: string }> }
) {
  const { assessmentId } = await params;
  if (!assessmentId) return NextResponse.json({ error: 'assessmentId required.' }, { status: 400 });

  const supabase = createAdminClient();

  // Active + recent sessions for this assessment
  const { data: sessions, error } = await supabase
    .from('exam_sessions')
    .select(`
      id, status, risk_score, tab_switches, fullscreen_exits, focus_losses,
      started_at, last_heartbeat_at, ended_at, ip_address,
      student_id,
      attempt_id
    `)
    .eq('assessment_id', assessmentId)
    .in('status', ['active', 'submitted', 'timed_out', 'terminated'])
    .order('started_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pull student names
  const studentIds = [...new Set((sessions ?? []).map((s: any) => s.student_id))];
  const nameMap: Record<string, string> = {};
  if (studentIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .in('id', studentIds);
    (users ?? []).forEach((u: any) => {
      nameMap[u.id] = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || '—';
    });
  }

  // Pull violation counts per session
  const sessionIds = (sessions ?? []).map((s: any) => s.id);
  const violationCounts: Record<string, number> = {};
  if (sessionIds.length > 0) {
    const { data: viol } = await supabase
      .from('exam_violations')
      .select('session_id')
      .in('session_id', sessionIds);
    (viol ?? []).forEach((v: any) => {
      violationCounts[v.session_id] = (violationCounts[v.session_id] ?? 0) + 1;
    });
  }

  // Pull latest webcam snapshot per session
  const latestSnaps: Record<string, string | null> = {};
  if (sessionIds.length > 0) {
    const { data: snaps } = await supabase
      .from('webcam_snapshots')
      .select('session_id, storage_path, created_at')
      .in('session_id', sessionIds)
      .order('created_at', { ascending: false });
    (snaps ?? []).forEach((s: any) => {
      if (!latestSnaps[s.session_id]) latestSnaps[s.session_id] = s.storage_path;
    });
  }

  const enriched = (sessions ?? []).map((s: any) => ({
    ...s,
    studentName:     nameMap[s.student_id] ?? '—',
    violationCount:  violationCounts[s.id] ?? 0,
    latestSnapPath:  latestSnaps[s.id] ?? null,
  }));

  return NextResponse.json({ sessions: enriched });
}
