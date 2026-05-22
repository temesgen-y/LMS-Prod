import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const { attemptId, studentId, assessmentId, fingerprint } = await req.json();
    if (!attemptId || !studentId || !assessmentId) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Check for existing active session (single-session enforcement)
    const { data: existing } = await supabase
      .from('exam_sessions')
      .select('id, status, session_token')
      .eq('attempt_id', attemptId)
      .maybeSingle();

    if (existing && (existing as any).status === 'active') {
      return NextResponse.json({ sessionId: (existing as any).id, token: (existing as any).session_token, resumed: true });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? null;
    const rawUserAgent = req.headers.get('user-agent') ?? null;

    // Detect assessment security mode for the session record
    const { data: assessRow } = await supabase
      .from('assessments')
      .select('security_mode')
      .eq('id', assessmentId)
      .maybeSingle();

    const deviceMetadata = fingerprint ? {
      browser:    /Chrome/.test(fingerprint.userAgent ?? '') ? 'Chrome' : /Firefox/.test(fingerprint.userAgent ?? '') ? 'Firefox' : 'Other',
      deviceType: /Mobile/.test(fingerprint.userAgent ?? '') ? 'mobile' : 'desktop',
      touchEnabled: false,
      userAgent: rawUserAgent,
    } : null;

    const { data: session, error } = await supabase
      .from('exam_sessions')
      .insert({
        attempt_id:          attemptId,
        student_id:          studentId,
        assessment_id:       assessmentId,
        security_mode:       (assessRow as any)?.security_mode ?? 'standard',
        ip_address:          ip,
        browser_fingerprint: fingerprint ?? null,
        device_metadata:     deviceMetadata,
        last_heartbeat_at:   new Date().toISOString(),
      })
      .select('id, session_token')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sessionId: (session as any).id, token: (session as any).session_token, resumed: false });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
