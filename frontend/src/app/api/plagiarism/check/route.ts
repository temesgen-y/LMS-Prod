import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeSimilarity } from '@/lib/plagiarism/nativeSimilarity';
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

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single();
  if (!profile || !['instructor', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { submission_id, provider = 'native' } = body as {
    submission_id: string;
    provider?: 'native' | 'copyleaks' | 'turnitin';
  };

  if (!submission_id) {
    return NextResponse.json({ error: 'submission_id required' }, { status: 400 });
  }

  // Fetch the target submission
  const { data: sub, error: subErr } = await supabase
    .from('assignment_submissions')
    .select('id, assignment_id, student_id, text_body, file_urls')
    .eq('id', submission_id)
    .single();
  if (subErr || !sub) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }

  // Upsert report in pending/processing state
  const { data: report, error: insertErr } = await supabase
    .from('plagiarism_reports')
    .upsert(
      {
        submission_id,
        assignment_id: sub.assignment_id,
        student_id: sub.student_id,
        requested_by: profile.id,
        status: 'processing',
        provider,
        requested_at: new Date().toISOString(),
        completed_at: null,
        error_message: null,
      },
      { onConflict: 'submission_id,provider' }
    )
    .select('id')
    .single();

  if (insertErr || !report) {
    return NextResponse.json({ error: 'Failed to create report' }, { status: 500 });
  }

  if (provider === 'turnitin') {
    return handleTurnitin(supabase, report.id, sub, profile.id);
  }

  // ── Copyleaks ──────────────────────────────────────────────────────────────
  if (provider === 'copyleaks') {
    const email = process.env.COPYLEAKS_API_EMAIL;
    const key   = process.env.COPYLEAKS_API_KEY;
    if (!email || !key) {
      await supabase.from('plagiarism_reports').update({ status: 'failed', error_message: 'COPYLEAKS_API_EMAIL and COPYLEAKS_API_KEY not configured.', completed_at: new Date().toISOString() }).eq('id', report.id);
      return NextResponse.json({ error: 'Copyleaks credentials not configured on the server.' }, { status: 503 });
    }
    if (!sub.text_body || sub.text_body.trim().length < 20) {
      await supabase.from('plagiarism_reports').update({ status: 'failed', error_message: 'No text content to check.', completed_at: new Date().toISOString() }).eq('id', report.id);
      return NextResponse.json({ error: 'Submission has no text content to check.' }, { status: 422 });
    }
    const scanId = crypto.randomUUID();
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001').replace(/\/$/, '');
    try {
      const token = await copyleaksLogin();
      const uploadRes = await fetch(`https://api.copyleaks.com/v3/education/submit/file/${scanId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: Buffer.from(sub.text_body, 'utf-8').toString('base64'),
          filename: `submission-${submission_id}.txt`,
          properties: {
            webhooks: { status: `${appUrl}/api/webhooks/copyleaks/{STATUS}/{SCAN_ID}` },
            sensitiveDataProtection: { shouldProtect: false },
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!uploadRes.ok) throw new Error(`Copyleaks submit failed: ${uploadRes.status} ${await uploadRes.text()}`);
      await supabase.from('plagiarism_reports').update({ status: 'pending', provider_scan_id: scanId }).eq('id', report.id);
      return NextResponse.json({ report_id: report.id, message: 'Copyleaks scan submitted. Results will appear via webhook.' });
    } catch (err: any) {
      const msg = err?.message ?? 'Copyleaks error';
      await supabase.from('plagiarism_reports').update({ status: 'failed', error_message: msg, completed_at: new Date().toISOString() }).eq('id', report.id);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  // Native similarity: compare against all other text_body submissions for the same assignment
  if (!sub.text_body || sub.text_body.trim().length < 50) {
    await supabase
      .from('plagiarism_reports')
      .update({
        status: 'completed',
        similarity_pct: 0,
        source_matches: [],
        completed_at: new Date().toISOString(),
      })
      .eq('id', report.id);

    return NextResponse.json({ report_id: report.id, similarity_pct: 0, source_matches: [] });
  }

  // Fetch all other submissions with text for this assignment
  const { data: others } = await supabase
    .from('assignment_submissions')
    .select('id, student_id, text_body')
    .eq('assignment_id', sub.assignment_id)
    .neq('id', submission_id)
    .not('text_body', 'is', null);

  const sourceMatches: Array<{
    submission_id: string;
    student_id: string;
    similarity_pct: number;
    matched_passages: Array<{ text: string; startWord: number }>;
  }> = [];

  for (const other of others ?? []) {
    if (!other.text_body || other.text_body.trim().length < 50) continue;
    const result = computeSimilarity(sub.text_body, other.text_body);
    if (result.similarity_pct > 0) {
      sourceMatches.push({
        submission_id: other.id,
        student_id: other.student_id,
        similarity_pct: result.similarity_pct,
        matched_passages: result.matched_passages,
      });
    }
  }

  // Sort by highest similarity first
  sourceMatches.sort((a, b) => b.similarity_pct - a.similarity_pct);

  // Overall similarity = highest match found (or 0)
  const overallSimilarity = sourceMatches.length > 0 ? sourceMatches[0].similarity_pct : 0;

  await supabase
    .from('plagiarism_reports')
    .update({
      status: 'completed',
      similarity_pct: overallSimilarity,
      source_matches: sourceMatches,
      completed_at: new Date().toISOString(),
    })
    .eq('id', report.id);

  return NextResponse.json({
    report_id: report.id,
    similarity_pct: overallSimilarity,
    source_matches: sourceMatches,
  });
}

async function handleTurnitin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reportId: string,
  sub: { id: string; text_body: string | null },
  requestedBy: string,
) {
  const apiKey = process.env.TURNITIN_API_KEY;
  const baseUrl = process.env.TURNITIN_BASE_URL;
  const integrationName = process.env.TURNITIN_INTEGRATION_NAME ?? 'MuleLMS';

  if (!apiKey || !baseUrl) {
    await supabase
      .from('plagiarism_reports')
      .update({
        status: 'failed',
        error_message: 'Turnitin is not configured. Set TURNITIN_API_KEY and TURNITIN_BASE_URL.',
        completed_at: new Date().toISOString(),
      })
      .eq('id', reportId);

    return NextResponse.json(
      { error: 'Turnitin integration not configured on this server.' },
      { status: 503 }
    );
  }

  try {
    // Step 1: Create a Turnitin submission
    const createRes = await fetch(`${baseUrl}/api/v1/submissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Turnitin-Integration-Name': integrationName,
        'X-Turnitin-Integration-Version': '1.0',
      },
      body: JSON.stringify({
        owner: requestedBy,
        title: `Submission ${sub.id}`,
        extract_text_only: true,
      }),
    });

    if (!createRes.ok) {
      throw new Error(`Turnitin create failed: ${createRes.status}`);
    }
    const createData = await createRes.json();
    const turnitinId: string = createData.id;

    // Step 2: Upload content
    if (sub.text_body) {
      const uploadRes = await fetch(`${baseUrl}/api/v1/submissions/${turnitinId}/original`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'text/plain',
          'Content-Disposition': 'inline; filename="submission.txt"',
          'X-Turnitin-Integration-Name': integrationName,
          'X-Turnitin-Integration-Version': '1.0',
        },
        body: sub.text_body,
      });
      if (!uploadRes.ok) {
        throw new Error(`Turnitin upload failed: ${uploadRes.status}`);
      }
    }

    // Step 3: Request similarity report generation
    await fetch(`${baseUrl}/api/v1/submissions/${turnitinId}/similarity`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Turnitin-Integration-Name': integrationName,
        'X-Turnitin-Integration-Version': '1.0',
      },
      body: JSON.stringify({
        generation_settings: {
          search_repositories: ['INTERNET', 'SUBMITTED_WORK', 'PUBLICATION'],
          auto_exclude_self_matching_scope: 'ALL',
        },
      }),
    });

    // Mark as pending — results come via webhook
    await supabase
      .from('plagiarism_reports')
      .update({
        status: 'pending',
        provider_report_url: `${baseUrl}/submissions/${turnitinId}/report`,
      })
      .eq('id', reportId);

    return NextResponse.json({
      report_id: reportId,
      turnitin_id: turnitinId,
      message: 'Turnitin analysis in progress. Results will be available via webhook.',
    });
  } catch (err: any) {
    await supabase
      .from('plagiarism_reports')
      .update({
        status: 'failed',
        error_message: err?.message ?? 'Unknown Turnitin error',
        completed_at: new Date().toISOString(),
      })
      .eq('id', reportId);
    return NextResponse.json({ error: err?.message ?? 'Turnitin error' }, { status: 500 });
  }
}
