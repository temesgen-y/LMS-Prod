import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import crypto from 'crypto';

async function copyleaksLogin(): Promise<string> {
  const res = await fetch('https://id.copyleaks.com/v3/account/login/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.COPYLEAKS_API_EMAIL, key: process.env.COPYLEAKS_API_KEY }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Copyleaks login failed: ${res.status}`);
  return (await res.json()).access_token as string;
}

// Pre-submission internet (Copyleaks) check for students.
// Creates/uses a draft submission so the scan has a stable FK, submits the text
// to Copyleaks, and stores a pending report. Results arrive via the webhook.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('users')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single();
  if (!profile || profile.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { assignment_id, text } = await req.json() as { assignment_id: string; text: string };
  const plainText = (text ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!assignment_id || plainText.length < 20) {
    return NextResponse.json({ error: 'Write at least 20 characters to check against the internet.' }, { status: 422 });
  }

  const email = process.env.COPYLEAKS_API_EMAIL;
  const key   = process.env.COPYLEAKS_API_KEY;
  if (!email || !key) {
    return NextResponse.json({ error: 'Copyleaks credentials not configured on the server.' }, { status: 503 });
  }

  const { data: asgn } = await admin
    .from('assignments')
    .select('id, offering_id')
    .eq('id', assignment_id)
    .single();
  if (!asgn) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

  // Find an existing submission (draft or submitted) for this student + assignment
  let { data: sub } = await admin
    .from('assignment_submissions')
    .select('id')
    .eq('assignment_id', assignment_id)
    .eq('student_id', profile.id)
    .maybeSingle();

  // Create a draft submission if none exists (gives the report a stable FK)
  if (!sub) {
    const { data: enrollment } = await admin
      .from('enrollments')
      .select('id')
      .eq('student_id', profile.id)
      .eq('offering_id', asgn.offering_id)
      .eq('status', 'active')
      .maybeSingle();
    const { data: created, error: createErr } = await admin
      .from('assignment_submissions')
      .insert({
        assignment_id,
        student_id: profile.id,
        enrollment_id: enrollment?.id ?? null,
        draft_text: text,
        draft_saved_at: new Date().toISOString(),
        status: 'draft',
        is_late: false,
      })
      .select('id')
      .single();
    if (createErr || !created) {
      return NextResponse.json({ error: 'Could not prepare submission for checking.' }, { status: 500 });
    }
    sub = created;
  }

  const submissionId = sub.id;

  const { data: report, error: reportErr } = await admin
    .from('plagiarism_reports')
    .upsert(
      {
        submission_id: submissionId,
        assignment_id,
        student_id: profile.id,
        requested_by: profile.id,
        status: 'processing',
        provider: 'copyleaks',
        requested_at: new Date().toISOString(),
        completed_at: null,
        error_message: null,
      },
      { onConflict: 'submission_id,provider' }
    )
    .select('id')
    .single();
  if (reportErr || !report) {
    return NextResponse.json({ error: 'Failed to create report: ' + reportErr?.message }, { status: 500 });
  }

  const scanId = crypto.randomUUID();
  const appUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001').replace(/\/$/, '');
  try {
    const token = await copyleaksLogin();
    const uploadRes = await fetch(`https://api.copyleaks.com/v3/education/submit/file/${scanId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64: Buffer.from(plainText, 'utf-8').toString('base64'),
        filename: `precheck-${submissionId}.txt`,
        properties: {
          webhooks: { status: `${appUrl}/api/webhooks/copyleaks/{STATUS}/{SCAN_ID}` },
          sensitiveDataProtection: { shouldProtect: false },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!uploadRes.ok) {
      const errBody = await uploadRes.text().catch(() => '');
      throw new Error(`Copyleaks submit failed: ${uploadRes.status} — ${errBody}`);
    }
    await admin.from('plagiarism_reports').update({ status: 'pending', provider_scan_id: scanId }).eq('id', report.id);
    return NextResponse.json({ submission_id: submissionId, report_id: report.id, status: 'pending' });
  } catch (err: any) {
    const msg = err?.message ?? 'Copyleaks error';
    await admin.from('plagiarism_reports').update({ status: 'failed', error_message: msg, completed_at: new Date().toISOString() }).eq('id', report.id);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
