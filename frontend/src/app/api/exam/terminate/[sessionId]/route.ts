import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const { reason } = await req.json().catch(() => ({ reason: 'Terminated by instructor' }));
  if (!sessionId) return NextResponse.json({ error: 'sessionId required.' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: session, error: fetchErr } = await supabase
    .from('exam_sessions')
    .select('attempt_id, student_id, assessment_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (fetchErr || !session) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });

  // Mark session terminated
  await supabase
    .from('exam_sessions')
    .update({ status: 'terminated', ended_at: new Date().toISOString() })
    .eq('id', sessionId);

  // Force-submit the attempt
  await supabase
    .from('assessment_attempts')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', (session as any).attempt_id)
    .eq('status', 'in_progress');

  // Log a critical violation
  await supabase.from('exam_violations').insert({
    session_id:     sessionId,
    attempt_id:     (session as any).attempt_id,
    student_id:     (session as any).student_id,
    assessment_id:  (session as any).assessment_id,
    violation_type: 'instructor_terminated',
    severity:       'critical',
    risk_points:    0,
    details:        { reason },
  });

  return NextResponse.json({ ok: true });
}
