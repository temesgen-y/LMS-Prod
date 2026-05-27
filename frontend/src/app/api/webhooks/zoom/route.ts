import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

const SECRET = process.env.ZOOM_WEBHOOK_SECRET_TOKEN ?? '';

function verifySignature(rawBody: string, timestamp: string, signature: string): boolean {
  const msg = `v0:${timestamp}:${rawBody}`;
  const expected = 'v0=' + crypto.createHmac('sha256', SECRET).update(msg).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function resolveSessionId(supabase: ReturnType<typeof createAdminClient>, zoomMeetingId: string | number): Promise<string | null> {
  const mid = String(zoomMeetingId);
  const { data } = await supabase
    .from('live_sessions')
    .select('id')
    .eq('meeting_id', mid)
    .maybeSingle();
  return (data as any)?.id ?? null;
}

async function resolveStudentId(supabase: ReturnType<typeof createAdminClient>, email: string): Promise<string | null> {
  if (!email) return null;
  const { data } = await supabase
    .from('users')
    .select('id')
    .ilike('email', email)
    .eq('role', 'student')
    .maybeSingle();
  return (data as any)?.id ?? null;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const timestamp = req.headers.get('x-zm-request-timestamp') ?? '';
  const signature = req.headers.get('x-zm-signature') ?? '';

  // URL validation handshake — Zoom requires this before sending real events
  let body: any;
  try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }

  if (body.event === 'endpoint.url_validation') {
    const plainToken = body.payload?.plainToken ?? '';
    const encryptedToken = crypto.createHmac('sha256', SECRET).update(plainToken).digest('hex');
    return NextResponse.json({ plainToken, encryptedToken });
  }

  // All other events require signature verification
  if (!SECRET || !verifySignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const obj = body.payload?.object ?? {};

  // ── participant joined ────────────────────────────────────────────────────
  if (body.event === 'meeting.participant_joined') {
    const participant = obj.participant ?? {};
    const sessionId = await resolveSessionId(supabase, obj.id);
    if (!sessionId) return NextResponse.json({ ok: true });

    const studentId = await resolveStudentId(supabase, participant.email ?? '');
    if (!studentId) return NextResponse.json({ ok: true });

    const joinedAt = participant.join_time ?? new Date().toISOString();
    await supabase.from('live_session_attendance').upsert(
      {
        live_session_id: sessionId,
        student_id: studentId,
        joined_at: joinedAt,
        source: 'zoom_webhook',
        zoom_participant_id: participant.participant_uuid ?? participant.user_id ?? null,
      },
      { onConflict: 'live_session_id,student_id', ignoreDuplicates: false }
    );
    return NextResponse.json({ ok: true });
  }

  // ── participant left ──────────────────────────────────────────────────────
  if (body.event === 'meeting.participant_left') {
    const participant = obj.participant ?? {};
    const sessionId = await resolveSessionId(supabase, obj.id);
    if (!sessionId) return NextResponse.json({ ok: true });

    const studentId = await resolveStudentId(supabase, participant.email ?? '');
    if (!studentId) return NextResponse.json({ ok: true });

    const leftAt = participant.leave_time ?? new Date().toISOString();
    // duration from Zoom is in seconds; convert to minutes
    const durationMins = participant.duration ? Math.round(participant.duration / 60) : null;

    await supabase.from('live_session_attendance').upsert(
      {
        live_session_id: sessionId,
        student_id: studentId,
        left_at: leftAt,
        ...(durationMins !== null ? { duration_mins: durationMins } : {}),
        source: 'zoom_webhook',
        zoom_participant_id: participant.participant_uuid ?? participant.user_id ?? null,
      },
      { onConflict: 'live_session_id,student_id', ignoreDuplicates: false }
    );
    return NextResponse.json({ ok: true });
  }

  // ── recording completed ───────────────────────────────────────────────────
  if (body.event === 'meeting.recording.completed') {
    const sessionId = await resolveSessionId(supabase, obj.id);
    if (!sessionId) return NextResponse.json({ ok: true });

    // Prefer the first cloud recording share URL
    const files: any[] = obj.recording_files ?? [];
    const mp4 = files.find((f: any) => f.file_type === 'MP4' && f.status === 'completed');
    const recordingUrl = mp4?.play_url ?? mp4?.download_url ?? obj.share_url ?? null;

    if (recordingUrl) {
      await supabase
        .from('live_sessions')
        .update({ recording_url: recordingUrl, status: 'completed' })
        .eq('id', sessionId);
    }
    return NextResponse.json({ ok: true });
  }

  // ── meeting ended — auto-complete the session ─────────────────────────────
  if (body.event === 'meeting.ended') {
    const sessionId = await resolveSessionId(supabase, obj.id);
    if (sessionId) {
      await supabase
        .from('live_sessions')
        .update({ status: 'completed' })
        .eq('id', sessionId)
        .in('status', ['scheduled', 'live']);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
