import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Handles: POST /api/webhooks/copyleaks/completed/{scanId}
//          POST /api/webhooks/copyleaks/error/{scanId}
//          POST /api/webhooks/copyleaks/credits-checked/{scanId}
export async function POST(
  req: NextRequest,
  { params }: { params: { segments: string[] } }
) {
  const segments = params.segments ?? [];
  const status  = segments[0] ?? '';
  const scanId  = segments[1] ?? '';

  if (!scanId) return NextResponse.json({ ok: true });

  const supabase = createAdminClient();

  if (status === 'error') {
    let errorMsg = 'Copyleaks scan error';
    try { const b = await req.json(); errorMsg = b?.developerPayload ?? errorMsg; } catch { /* ignore */ }
    await supabase
      .from('plagiarism_reports')
      .update({ status: 'failed', error_message: errorMsg, completed_at: new Date().toISOString() })
      .eq('provider_scan_id', scanId)
      .eq('provider', 'copyleaks');
    return NextResponse.json({ ok: true });
  }

  if (status !== 'completed') return NextResponse.json({ ok: true });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true }); }

  // aggregatedScore is the overall similarity % (0–100)
  const score: any = body?.results?.score ?? {};
  const similarityPct: number = Math.round(score.aggregatedScore ?? 0);

  // Build source matches from internet + database results
  type CopyleaksSource = { id: string; url?: string; title?: string; similarity: number; matchedWords?: number };
  const internetMatches: CopyleaksSource[] = body?.results?.internet ?? [];
  const dbMatches: CopyleaksSource[] = body?.results?.database ?? [];
  const allSources = [...internetMatches, ...dbMatches];

  const sourceMatches = allSources
    .filter((s: CopyleaksSource) => s.similarity > 0)
    .sort((a: CopyleaksSource, b: CopyleaksSource) => b.similarity - a.similarity)
    .slice(0, 10)
    .map((s: CopyleaksSource) => ({
      submission_id: '',
      student_id: '',
      similarity_pct: Math.round((s.similarity ?? 0) * 100),
      matched_passages: [{ text: s.title ?? s.url ?? 'External source', startWord: 0 }],
      source_url: s.url ?? '',
      source_title: s.title ?? s.url ?? 'External source',
    }));

  await supabase
    .from('plagiarism_reports')
    .update({
      status: 'completed',
      similarity_pct: similarityPct,
      source_matches: sourceMatches,
      completed_at: new Date().toISOString(),
    })
    .eq('provider_scan_id', scanId)
    .eq('provider', 'copyleaks');

  return NextResponse.json({ ok: true });
}
