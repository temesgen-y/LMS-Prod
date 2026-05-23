import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: userRow } = await admin
    .from('users')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const instructorId = (userRow as any).id;
  const role = (userRow as any).role;

  // Admin sees all; instructor sees only their courses
  let assessmentIds: string[] = [];
  const assessmentMap: Record<string, { title: string; type: string; offeringId: string }> = {};

  if (role === 'admin') {
    const { data: allAssessments } = await admin
      .from('assessments')
      .select('id, title, type, offering_id');
    (allAssessments ?? []).forEach((a: any) => {
      assessmentMap[a.id] = { title: a.title, type: a.type, offeringId: a.offering_id };
    });
    assessmentIds = (allAssessments ?? []).map((a: any) => a.id);
  } else {
    const { data: courseInstructors } = await admin
      .from('course_instructors')
      .select('offering_id')
      .eq('instructor_id', instructorId);

    const offeringIds = (courseInstructors ?? []).map((ci: any) => ci.offering_id);
    if (offeringIds.length === 0) {
      return NextResponse.json({
        stats: { activeSessions: 0, highRiskCount: 0, violationsToday: 0, activeExams: 0 },
        activeExams: [],
        recentViolations: [],
        highRiskSessions: [],
      });
    }

    const { data: assessments } = await admin
      .from('assessments')
      .select('id, title, type, offering_id')
      .in('offering_id', offeringIds);

    (assessments ?? []).forEach((a: any) => {
      assessmentMap[a.id] = { title: a.title, type: a.type, offeringId: a.offering_id };
    });
    assessmentIds = (assessments ?? []).map((a: any) => a.id);
  }

  if (assessmentIds.length === 0) {
    return NextResponse.json({
      stats: { activeSessions: 0, highRiskCount: 0, violationsToday: 0, activeExams: 0 },
      activeExams: [],
      recentViolations: [],
      highRiskSessions: [],
    });
  }

  // Sessions started in the last 24 hours
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: sessions } = await admin
    .from('exam_sessions')
    .select('id, assessment_id, student_id, status, risk_score, tab_switches, fullscreen_exits, focus_losses, started_at, last_heartbeat_at, ip_address, ended_at')
    .in('assessment_id', assessmentIds)
    .gte('started_at', since24h)
    .order('risk_score', { ascending: false });

  // Student names
  const studentIds = [...new Set((sessions ?? []).map((s: any) => s.student_id))];
  const nameMap: Record<string, string> = {};
  if (studentIds.length > 0) {
    const { data: users } = await admin
      .from('users')
      .select('id, first_name, last_name')
      .in('id', studentIds);
    (users ?? []).forEach((u: any) => {
      nameMap[u.id] = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || '—';
    });
  }

  // Violation counts per session
  const sessionIds = (sessions ?? []).map((s: any) => s.id);
  const violationCounts: Record<string, number> = {};
  if (sessionIds.length > 0) {
    const { data: viol } = await admin
      .from('exam_violations')
      .select('session_id')
      .in('session_id', sessionIds);
    (viol ?? []).forEach((v: any) => {
      violationCounts[v.session_id] = (violationCounts[v.session_id] ?? 0) + 1;
    });
  }

  // Today's violation count
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count: violationsToday } = await admin
    .from('exam_violations')
    .select('id', { count: 'exact', head: true })
    .in('assessment_id', assessmentIds)
    .gte('occurred_at', todayStart.toISOString());

  // Recent violations (last 60) with student names + assessment titles
  const { data: recentViolations } = await admin
    .from('exam_violations')
    .select('id, session_id, student_id, assessment_id, violation_type, severity, risk_points, details, occurred_at')
    .in('assessment_id', assessmentIds)
    .order('occurred_at', { ascending: false })
    .limit(60);

  const enrichedViolations = (recentViolations ?? []).map((v: any) => ({
    ...v,
    studentName:     nameMap[v.student_id] ?? '—',
    assessmentTitle: assessmentMap[v.assessment_id]?.title ?? '—',
  }));

  // Enrich sessions
  const enrichedSessions = (sessions ?? []).map((s: any) => ({
    ...s,
    studentName:      nameMap[s.student_id] ?? '—',
    violationCount:   violationCounts[s.id] ?? 0,
    assessmentTitle:  assessmentMap[s.assessment_id]?.title ?? '—',
    assessmentType:   assessmentMap[s.assessment_id]?.type ?? '—',
  }));

  const activeSessions  = enrichedSessions.filter((s: any) => s.status === 'active');
  const highRiskSessions = enrichedSessions
    .filter((s: any) => s.risk_score >= 40)
    .sort((a: any, b: any) => b.risk_score - a.risk_score)
    .slice(0, 15);

  // Group active sessions by assessment
  const activeExamMap: Record<string, {
    assessmentId: string; title: string; type: string;
    activeSessions: number; maxRisk: number; totalViolations: number;
  }> = {};
  activeSessions.forEach((s: any) => {
    if (!activeExamMap[s.assessment_id]) {
      activeExamMap[s.assessment_id] = {
        assessmentId: s.assessment_id,
        title: assessmentMap[s.assessment_id]?.title ?? '—',
        type: assessmentMap[s.assessment_id]?.type ?? '—',
        activeSessions: 0,
        maxRisk: 0,
        totalViolations: 0,
      };
    }
    activeExamMap[s.assessment_id].activeSessions++;
    activeExamMap[s.assessment_id].maxRisk = Math.max(activeExamMap[s.assessment_id].maxRisk, s.risk_score);
    activeExamMap[s.assessment_id].totalViolations += s.violationCount;
  });

  return NextResponse.json({
    stats: {
      activeSessions:  activeSessions.length,
      highRiskCount:   highRiskSessions.length,
      violationsToday: violationsToday ?? 0,
      activeExams:     Object.keys(activeExamMap).length,
    },
    activeExams:     Object.values(activeExamMap),
    recentViolations: enrichedViolations,
    highRiskSessions,
  });
}
