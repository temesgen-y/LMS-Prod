import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Turnitin sends a POST when similarity report is ready
export async function POST(req: NextRequest) {
  const signingKey = process.env.TURNITIN_SIGNING_KEY;

  // Optional: verify Turnitin HMAC signature header
  if (signingKey) {
    const signature = req.headers.get('X-Turnitin-Signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }
    // Production: verify HMAC-SHA256 of body against signingKey
  }

  const body = await req.json();
  const { submission_id: turnitinId, overall_match_percentage, status } = body as {
    submission_id?: string;
    overall_match_percentage?: number;
    status?: string;
  };

  if (!turnitinId) {
    return NextResponse.json({ error: 'No submission_id in payload' }, { status: 400 });
  }

  const supabase = await createClient();

  // Find report by provider_report_url containing the turnitin submission id
  const { data: report } = await supabase
    .from('plagiarism_reports')
    .select('id')
    .ilike('provider_report_url', `%${turnitinId}%`)
    .maybeSingle();

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  if (status === 'COMPLETE') {
    await supabase
      .from('plagiarism_reports')
      .update({
        status: 'completed',
        similarity_pct: Math.round(overall_match_percentage ?? 0),
        completed_at: new Date().toISOString(),
      })
      .eq('id', report.id);
  } else if (status === 'ERROR') {
    await supabase
      .from('plagiarism_reports')
      .update({
        status: 'failed',
        error_message: 'Turnitin processing error',
        completed_at: new Date().toISOString(),
      })
      .eq('id', report.id);
  }

  return NextResponse.json({ received: true });
}
