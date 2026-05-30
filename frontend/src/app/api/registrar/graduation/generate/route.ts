import { NextRequest, NextResponse } from 'next/server';
import { requireRegistrar } from '@/lib/auth/require-registrar';
import {
  computeGraduationCandidates,
  buildGraduationPdf,
  degreeTitle,
  generateGraduationCode,
} from '@/lib/certificates/graduation';

/**
 * POST /api/registrar/graduation/generate
 * Body: { studentIds?: string[], all?: boolean }
 *
 * Auto-generates graduation certificates for eligible students who do not yet
 * have one. With `all: true`, processes every eligible-without-certificate
 * student; otherwise only the given studentIds (still filtered to eligible).
 */
export async function POST(request: NextRequest) {
  const auth = await requireRegistrar();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { actorId, admin } = auth.ctx;

  const body = await request.json().catch(() => ({}));
  const { studentIds, all } = body as { studentIds?: string[]; all?: boolean };
  if (!all && (!Array.isArray(studentIds) || studentIds.length === 0)) {
    return NextResponse.json({ error: 'Provide studentIds or set all=true.' }, { status: 400 });
  }

  const candidates = await computeGraduationCandidates(admin);
  const selected = new Set(studentIds ?? []);
  const targets = candidates.filter(c =>
    c.eligible && !c.certificate && (all || selected.has(c.studentId))
  );

  if (targets.length === 0) {
    return NextResponse.json({ issued: 0, failed: [], message: 'No eligible students to certify.' });
  }

  // Current term (for graduation_term), best-effort.
  const { data: term } = await admin.from('academic_terms').select('id').eq('is_current', true).maybeSingle();
  const graduationTerm = (term as { id: string } | null)?.id ?? null;

  // Ensure storage bucket (shared with course certificates).
  await admin.storage.createBucket('certificates', { public: true, fileSizeLimit: 10 * 1024 * 1024 }).catch(() => {});

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const failed: { studentId: string; name: string; error: string }[] = [];
  let issued = 0;

  for (const c of targets) {
    try {
      const code = generateGraduationCode(c.programCode);
      const pdfBytes = await buildGraduationPdf({
        studentName: c.studentName,
        degreeTitle: degreeTitle(c.degreeLevel),
        programName: c.programName,
        classification: c.classification,
        cgpa: c.cgpa,
        uniqueCode: code,
        issuedAt: new Date().toISOString(),
        appUrl,
      });

      const fileName = `${code}.pdf`;
      const { error: uploadError } = await admin.storage
        .from('certificates')
        .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = admin.storage.from('certificates').getPublicUrl(fileName);

      const { error: insertError } = await admin.from('graduation_certificates').insert({
        student_id: c.studentId,
        program_id: c.programId,
        unique_code: code,
        classification: c.classification,
        cgpa: c.cgpa,
        completed_credits: c.completedCredits,
        graduation_term: graduationTerm,
        pdf_url: urlData.publicUrl,
        issued_by: actorId || null,
      });
      if (insertError) throw new Error(insertError.message);

      // Mark program_progress as completed (best-effort).
      await admin.from('program_progress').upsert({
        student_id: c.studentId,
        program_id: c.programId,
        total_required_credits: c.requiredCredits,
        completed_credits: c.completedCredits,
        completion_percentage: Math.min(100, Math.round((c.completedCredits / c.requiredCredits) * 10000) / 100),
        current_cgpa: c.cgpa,
        graduation_classification: c.classification,
        status: 'completed',
      }, { onConflict: 'student_id,program_id' }).then(() => {}, () => {});

      await admin.from('audit_logs').insert({
        actor_id: actorId || null,
        action: 'graduation.certificate_issued',
        target_type: 'graduation_certificate',
        target_id: c.studentId,
        details: { program: c.programName, code, cgpa: c.cgpa, classification: c.classification },
      }).then(() => {}, () => {});

      issued++;
    } catch (err) {
      failed.push({ studentId: c.studentId, name: c.studentName, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return NextResponse.json({
    issued,
    failed,
    message: `Generated ${issued} certificate${issued === 1 ? '' : 's'}${failed.length ? `, ${failed.length} failed` : ''}.`,
  });
}
