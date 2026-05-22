import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, attemptId, studentId, imageDataUrl, faceDetected, faceCount, confidenceScore } = body;
    if (!sessionId || !attemptId || !studentId || !imageDataUrl) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Decode base64 image and store in Supabase Storage
    const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const storagePath = `webcam-snapshots/${studentId}/${attemptId}/${Date.now()}.jpg`;

    const { error: upErr } = await supabase.storage
      .from('lms-uploads')
      .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: false });

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const flagged = faceDetected === false || (faceCount !== undefined && faceCount > 1);

    const { error: dbErr } = await supabase.from('webcam_snapshots').insert({
      session_id:       sessionId,
      attempt_id:       attemptId,
      student_id:       studentId,
      storage_path:     storagePath,
      face_detected:    faceDetected ?? null,
      face_count:       faceCount ?? null,
      confidence_score: confidenceScore ?? null,
      flagged,
    });

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, flagged });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
