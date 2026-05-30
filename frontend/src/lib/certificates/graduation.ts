import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Minimum cumulative GPA required to graduate. */
export const MIN_GRADUATION_CGPA = 2.0;

const GRADE_POINTS: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
const PASSING_GRADES = new Set(['A', 'B', 'C', 'D']);

const DEGREE_TITLES: Record<string, string> = {
  certificate: 'Certificate',
  diploma: 'Diploma',
  bachelor: "Bachelor's Degree",
  master: "Master's Degree",
  phd: 'Doctor of Philosophy',
};

export function degreeTitle(level: string | null): string {
  return DEGREE_TITLES[level ?? ''] ?? 'Degree';
}

export function classify(cgpa: number): string | null {
  if (cgpa >= 3.75) return 'Great Distinction';
  if (cgpa >= 3.5) return 'Distinction';
  if (cgpa >= 3.0) return 'Very Good';
  if (cgpa >= MIN_GRADUATION_CGPA) return 'Good Standing';
  return null;
}

export function generateGraduationCode(programCode: string): string {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `GRAD-${(programCode || 'PRG').toUpperCase()}-${year}-${rand}`;
}

export type GraduationCandidate = {
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentNo: string | null;
  programId: string;
  programName: string;
  programCode: string;
  degreeLevel: string | null;
  completedCredits: number;
  requiredCredits: number;
  cgpa: number;
  classification: string | null;
  eligible: boolean;
  /** existing graduation certificate, if one has already been issued */
  certificate: {
    id: string;
    unique_code: string;
    pdf_url: string | null;
    issued_at: string;
    revoked_at: string | null;
    revoke_reason: string | null;
  } | null;
};

type EnrollmentRow = {
  student_id: string;
  final_grade: string | null;
  course_offerings: { courses: { credit_hours: number | null } | null } | null;
};

/**
 * Compute degree-completion status for every student who is assigned to an
 * academic program. Credits and CGPA are derived from completed enrollments'
 * final grades (4.0 scale, weighted by course credit hours).
 */
export async function computeGraduationCandidates(
  admin: SupabaseClient
): Promise<GraduationCandidate[]> {
  const { data: profiles } = await admin
    .from('student_profiles')
    .select('user_id, program_id, student_no')
    .not('program_id', 'is', null);

  const profileRows = (profiles ?? []) as { user_id: string; program_id: string; student_no: string | null }[];
  if (profileRows.length === 0) return [];

  const studentIds = [...new Set(profileRows.map(p => p.user_id))];
  const programIds = [...new Set(profileRows.map(p => p.program_id))];

  const [usersRes, programsRes, enrollRes, certsRes] = await Promise.all([
    admin.from('users').select('id, first_name, last_name, email').in('id', studentIds).eq('role', 'student'),
    admin.from('academic_programs').select('id, name, code, degree_level, total_credits').in('id', programIds),
    admin
      .from('enrollments')
      .select('student_id, final_grade, course_offerings!fk_enrollments_offering(courses!fk_course_offerings_course(credit_hours))')
      .in('student_id', studentIds),
    admin
      .from('graduation_certificates')
      .select('id, student_id, program_id, unique_code, pdf_url, issued_at, revoked_at, revoke_reason')
      .in('student_id', studentIds),
  ]);

  const userMap = new Map<string, { first_name: string; last_name: string; email: string }>();
  ((usersRes.data ?? []) as { id: string; first_name: string; last_name: string; email: string }[])
    .forEach(u => userMap.set(u.id, u));

  const programMap = new Map<string, { name: string; code: string; degree_level: string | null; total_credits: number | null }>();
  ((programsRes.data ?? []) as { id: string; name: string; code: string; degree_level: string | null; total_credits: number | null }[])
    .forEach(p => programMap.set(p.id, p));

  // Aggregate credits + quality points per student
  const agg = new Map<string, { completed: number; gpaCredits: number; qualityPoints: number }>();
  ((enrollRes.data ?? []) as unknown as EnrollmentRow[]).forEach(e => {
    const grade = e.final_grade;
    if (!grade || !(grade in GRADE_POINTS)) return; // skip ungraded / 'I'
    const credits = e.course_offerings?.courses?.credit_hours ?? 3;
    const a = agg.get(e.student_id) ?? { completed: 0, gpaCredits: 0, qualityPoints: 0 };
    a.gpaCredits += credits;
    a.qualityPoints += GRADE_POINTS[grade] * credits;
    if (PASSING_GRADES.has(grade)) a.completed += credits;
    agg.set(e.student_id, a);
  });

  const certMap = new Map<string, GraduationCandidate['certificate']>();
  ((certsRes.data ?? []) as { id: string; student_id: string; program_id: string; unique_code: string; pdf_url: string | null; issued_at: string; revoked_at: string | null; revoke_reason: string | null }[])
    .forEach(c => certMap.set(`${c.student_id}:${c.program_id}`, {
      id: c.id, unique_code: c.unique_code, pdf_url: c.pdf_url,
      issued_at: c.issued_at, revoked_at: c.revoked_at, revoke_reason: c.revoke_reason,
    }));

  const candidates: GraduationCandidate[] = [];
  for (const p of profileRows) {
    const user = userMap.get(p.user_id);
    const program = programMap.get(p.program_id);
    if (!user || !program) continue;

    const a = agg.get(p.user_id) ?? { completed: 0, gpaCredits: 0, qualityPoints: 0 };
    const cgpa = a.gpaCredits > 0 ? a.qualityPoints / a.gpaCredits : 0;
    const requiredCredits = Number(program.total_credits ?? 120);
    const cgpaRounded = Math.round(cgpa * 100) / 100;
    const eligible = a.completed >= requiredCredits && cgpaRounded >= MIN_GRADUATION_CGPA;

    candidates.push({
      studentId: p.user_id,
      studentName: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim(),
      studentEmail: user.email,
      studentNo: p.student_no,
      programId: p.program_id,
      programName: program.name,
      programCode: program.code,
      degreeLevel: program.degree_level,
      completedCredits: a.completed,
      requiredCredits,
      cgpa: cgpaRounded,
      classification: classify(cgpaRounded),
      eligible,
      certificate: certMap.get(`${p.user_id}:${p.program_id}`) ?? null,
    });
  }

  // Eligible (no cert) first, then already-issued, then ineligible
  candidates.sort((x, y) => {
    const rank = (c: GraduationCandidate) => (c.eligible && !c.certificate ? 0 : c.certificate ? 1 : 2);
    return rank(x) - rank(y) || x.studentName.localeCompare(y.studentName);
  });

  return candidates;
}

export async function buildGraduationPdf(opts: {
  studentName: string;
  degreeTitle: string;
  programName: string;
  classification: string | null;
  cgpa: number;
  uniqueCode: string;
  issuedAt: string;
  appUrl: string;
}): Promise<Uint8Array> {
  const { studentName, degreeTitle: degree, programName, classification, cgpa, uniqueCode, issuedAt, appUrl } = opts;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([841.89, 595.28]); // A4 landscape
  const { width, height } = page.getSize();

  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const timesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const gold = rgb(0.792, 0.647, 0.145);
  const navy = rgb(0.082, 0.133, 0.286);
  const gray = rgb(0.45, 0.45, 0.45);
  const cream = rgb(0.993, 0.980, 0.949);

  page.drawRectangle({ x: 0, y: 0, width, height, color: cream });
  page.drawRectangle({ x: 18, y: 18, width: width - 36, height: height - 36, borderColor: gold, borderWidth: 3, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 28, y: 28, width: width - 56, height: height - 56, borderColor: gold, borderWidth: 0.75 });

  const cs = 6;
  [
    { x: 24, y: 24 }, { x: width - 30, y: 24 },
    { x: 24, y: height - 30 }, { x: width - 30, y: height - 30 },
  ].forEach(({ x, y }) => page.drawRectangle({ x, y, width: cs, height: cs, color: gold }));

  const center = (text: string, font: typeof timesRoman, size: number, y: number, color = navy) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font, color });
    return w;
  };

  center('MULE UNIVERSITY', helveticaBold, 14, height - 72, navy);
  center('Learning Management System', helvetica, 9, height - 88, gray);
  page.drawLine({ start: { x: width / 2 - 120, y: height - 98 }, end: { x: width / 2 + 120, y: height - 98 }, thickness: 0.75, color: gold });

  center('Certificate of Graduation', timesBold, 34, height - 148, navy);
  center('This is to certify that', timesItalic, 12, height - 188, gray);

  // Student name (auto-scale)
  let nameSize = 38;
  let nameW = timesBold.widthOfTextAtSize(studentName, nameSize);
  while (nameW > width - 140 && nameSize > 20) { nameSize -= 2; nameW = timesBold.widthOfTextAtSize(studentName, nameSize); }
  center(studentName, timesBold, nameSize, height - 240, navy);
  page.drawLine({ start: { x: (width - nameW) / 2 - 20, y: height - 249 }, end: { x: (width + nameW) / 2 + 20, y: height - 249 }, thickness: 0.5, color: gold });

  center('having fulfilled all the requirements is hereby awarded the', timesItalic, 12, height - 278, gray);

  // Degree + program (auto-scale)
  const degreeLine = `${degree} in ${programName}`;
  let degSize = 22;
  let degW = timesBold.widthOfTextAtSize(degreeLine, degSize);
  while (degW > width - 120 && degSize > 13) { degSize -= 1; degW = timesBold.widthOfTextAtSize(degreeLine, degSize); }
  center(degreeLine, timesBold, degSize, height - 316, navy);

  if (classification) {
    center(`with ${classification}`, timesItalic, 12, height - 342, gray);
  }

  page.drawLine({ start: { x: 90, y: height - 366 }, end: { x: width - 90, y: height - 366 }, thickness: 0.5, color: gold });

  const footerY = height - 388;
  const footerSize = 9.5;
  const issuedDate = new Date(issuedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  page.drawText(`Date Conferred: ${issuedDate}`, { x: 90, y: footerY, size: footerSize, font: timesRoman, color: gray });

  const cgpaStr = `CGPA: ${cgpa.toFixed(2)}`;
  const cgpaW = timesRoman.widthOfTextAtSize(cgpaStr, footerSize);
  page.drawText(cgpaStr, { x: width - 90 - cgpaW, y: footerY, size: footerSize, font: timesRoman, color: gray });

  center(`Certificate No. ${uniqueCode}`, timesRoman, footerSize, footerY);
  center(`Verify at: ${appUrl}/verify/${uniqueCode}`, helvetica, 8, footerY - 18, rgb(0.35, 0.35, 0.75));

  return pdfDoc.save();
}
