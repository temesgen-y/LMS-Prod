import { NextResponse } from 'next/server';
import { requireRegistrar } from '@/lib/auth/require-registrar';
import { computeGraduationCandidates } from '@/lib/certificates/graduation';

/**
 * GET /api/registrar/graduation/eligible
 * Returns every program-assigned student's degree-completion status, including
 * whether they are eligible to graduate and whether a certificate already exists.
 */
export async function GET() {
  const auth = await requireRegistrar();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const candidates = await computeGraduationCandidates(auth.ctx.admin);
    return NextResponse.json({
      candidates,
      summary: {
        eligible: candidates.filter(c => c.eligible && !c.certificate).length,
        issued: candidates.filter(c => c.certificate && !c.certificate.revoked_at).length,
        total: candidates.length,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to compute candidates.' }, { status: 500 });
  }
}
