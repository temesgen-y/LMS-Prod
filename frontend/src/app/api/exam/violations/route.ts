import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type ViolationEvent = {
  violationType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  riskPoints: number;
  details?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  try {
    const { sessionId, attemptId, studentId, assessmentId, violations } = await req.json();
    if (!sessionId || !attemptId || !studentId || !assessmentId || !Array.isArray(violations)) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const rows = (violations as ViolationEvent[]).map(v => ({
      session_id:     sessionId,
      attempt_id:     attemptId,
      student_id:     studentId,
      assessment_id:  assessmentId,
      violation_type: v.violationType,
      severity:       v.severity,
      risk_points:    v.riskPoints,
      details:        v.details ?? null,
    }));

    const { error: insErr } = await supabase.from('exam_violations').insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    // Accumulate total risk points for this session
    const totalNewPoints = rows.reduce((s, r) => s + r.risk_points, 0);
    if (totalNewPoints > 0) {
      // Increment risk_score on the session
      const { data: sess } = await supabase
        .from('exam_sessions')
        .select('risk_score')
        .eq('id', sessionId)
        .maybeSingle();
      const current = (sess as any)?.risk_score ?? 0;
      await supabase
        .from('exam_sessions')
        .update({ risk_score: current + totalNewPoints })
        .eq('id', sessionId);
    }

    return NextResponse.json({ ok: true, recorded: rows.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
