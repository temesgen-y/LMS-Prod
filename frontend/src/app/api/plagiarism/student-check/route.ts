import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSimilarity } from '@/lib/plagiarism/nativeSimilarity';

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
  if (!assignment_id || !text || text.replace(/<[^>]+>/g, '').trim().length < 50) {
    return NextResponse.json({ similarity_pct: 0, match_count: 0 });
  }

  const plainText = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const { data: others } = await admin
    .from('assignment_submissions')
    .select('id, text_body')
    .eq('assignment_id', assignment_id)
    .neq('student_id', profile.id)
    .not('text_body', 'is', null);

  let maxSimilarity = 0;
  let matchCount = 0;

  for (const other of others ?? []) {
    if (!other.text_body || other.text_body.replace(/<[^>]+>/g, '').trim().length < 50) continue;
    const otherPlain = other.text_body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const result = computeSimilarity(plainText, otherPlain);
    if (result.similarity_pct > 0) {
      matchCount++;
      if (result.similarity_pct > maxSimilarity) maxSimilarity = result.similarity_pct;
    }
  }

  return NextResponse.json({ similarity_pct: maxSimilarity, match_count: matchCount });
}
