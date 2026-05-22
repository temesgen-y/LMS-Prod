import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, riskScore, tabSwitches, fullscreenExits, focusLosses } = await req.json();
    if (!sessionId) return NextResponse.json({ error: 'sessionId required.' }, { status: 400 });

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('exam_sessions')
      .update({
        last_heartbeat_at: new Date().toISOString(),
        ...(riskScore      !== undefined && { risk_score:       riskScore }),
        ...(tabSwitches    !== undefined && { tab_switches:     tabSwitches }),
        ...(fullscreenExits !== undefined && { fullscreen_exits: fullscreenExits }),
        ...(focusLosses    !== undefined && { focus_losses:     focusLosses }),
      })
      .eq('id', sessionId)
      .eq('status', 'active');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
