import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const { attemptId } = await params;
  if (!attemptId) return NextResponse.json({ error: 'attemptId required.' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('exam_sessions')
    .select('id, status, risk_score, tab_switches, fullscreen_exits, focus_losses, last_heartbeat_at')
    .eq('attempt_id', attemptId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const { attemptId } = await params;
  const { status } = await req.json();
  if (!attemptId || !status) return NextResponse.json({ error: 'Missing fields.' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('exam_sessions')
    .update({ status, ended_at: new Date().toISOString() })
    .eq('attempt_id', attemptId)
    .eq('status', 'active');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
