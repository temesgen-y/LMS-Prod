import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Handles: POST /api/webhooks/copyleaks/completed/{scanId}
//          POST /api/webhooks/copyleaks/error/{scanId}
//          POST /api/webhooks/copyleaks/credits-checked/{scanId}
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> }
) {
  const { segments } = await params;
  const status  = segments?.[0] ?? '';
  const scanId  = segments?.[1] ?? '';

  if (!scanId) return NextResponse.json({ ok: true });

  const supabase = createAdminClient();

  if (status === 'error') {
    let errorMsg = 'Copyleaks scan error';
    try { const b = await req.json(); errorMsg = b?.error?.message ?? b?.developerPayload ?? errorMsg; } catch { /* ignore */ }
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

  // Copyleaks returns aggregatedScore as a fraction (0–1). Multiply to a percentage.
  // Defensive: if a value > 1 is ever sent, treat it as already-percent.
  const score: any = body?.results?.score ?? {};
  const rawScore: number = score.aggregatedScore ?? 0;
  const similarityPct: number = Math.round(rawScore <= 1 ? rawScore * 100 : rawScore);

  // Internet/database sources expose matchedWords (a count), not a similarity ratio.
  const totalWords: number = body?.scannedDocument?.totalWords ?? body?.results?.score?.identicalWords ?? 0;
  type CopyleaksSource = { id?: string; url?: string; title?: string; matchedWords?: number };
  const internetMatches: CopyleaksSource[] = body?.results?.internet ?? [];
  const dbMatches: CopyleaksSource[] = body?.results?.database ?? [];
  const allSources = [...internetMatches, ...dbMatches];

  const sourceMatches = allSources
    .map((s: CopyleaksSource) => ({
      matchedWords: s.matchedWords ?? 0,
      url: s.url ?? '',
      title: s.title ?? s.url ?? 'External source',
    }))
    .filter(s => s.matchedWords > 0)
    .sort((a, b) => b.matchedWords - a.matchedWords)
    .slice(0, 10)
    .map(s => ({
      submission_id: '',
      student_id: '',
      similarity_pct: totalWords > 0 ? Math.round((s.matchedWords / totalWords) * 100) : 0,
      matched_passages: [{ text: s.title, startWord: 0 }],
      source_url: s.url,
      source_title: s.title,
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
