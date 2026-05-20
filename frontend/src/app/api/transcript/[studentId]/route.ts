import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb, RGB } from 'pdf-lib';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRoleNames } from '@/lib/auth/get-user-roles';
import { getHighestRole, type RoleName } from '@/types/auth';

// ─── Ethiopian grade scale ────────────────────────────────────────────────────

const SCALE: Record<string, { gradePoint: number; countsInGpa: boolean; isPassing: boolean }> = {
  'A':  { gradePoint: 4.00, countsInGpa: true,  isPassing: true  },
  'A-': { gradePoint: 3.75, countsInGpa: true,  isPassing: true  },
  'B+': { gradePoint: 3.50, countsInGpa: true,  isPassing: true  },
  'B':  { gradePoint: 3.00, countsInGpa: true,  isPassing: true  },
  'B-': { gradePoint: 2.75, countsInGpa: true,  isPassing: true  },
  'C+': { gradePoint: 2.50, countsInGpa: true,  isPassing: true  },
  'C':  { gradePoint: 2.00, countsInGpa: true,  isPassing: true  },
  'C-': { gradePoint: 1.75, countsInGpa: true,  isPassing: true  },
  'D':  { gradePoint: 1.00, countsInGpa: true,  isPassing: true  },
  'F':  { gradePoint: 0.00, countsInGpa: true,  isPassing: false },
  'I':  { gradePoint: 0.00, countsInGpa: false, isPassing: false },
  'W':  { gradePoint: 0.00, countsInGpa: false, isPassing: false },
  'NG': { gradePoint: 0.00, countsInGpa: false, isPassing: false },
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function getClassification(cgpa: number): string | null {
  if (cgpa >= 3.75) return 'Great Distinction';
  if (cgpa >= 3.50) return 'Distinction';
  if (cgpa >= 3.00) return 'Very Great Credit';
  if (cgpa >= 2.75) return 'Great Credit';
  if (cgpa >= 2.00) return 'Credit';
  return null;
}

function getStandingLabel(gpa: number): string {
  if (gpa >= 3.50) return "Dean's List";
  if (gpa >= 2.00) return 'Good Standing';
  if (gpa >= 1.50) return 'Academic Probation';
  return 'Dismissal Warning';
}

// ─── Fetch data from Supabase ─────────────────────────────────────────────────

async function fetchTranscriptData(db: ReturnType<typeof createAdminClient>, studentId: string) {
  const [userRes, spRes, enrollRes] = await Promise.all([
    db.from('users').select('first_name, last_name, email, created_at').eq('id', studentId).single(),
    db.from('student_profiles').select('student_no, program_id, program').eq('user_id', studentId).maybeSingle(),
    db.from('enrollments')
      .select('id, status, final_grade, final_score, course_offerings(courses(id, code, title, credit_hours), academic_terms(id, term_name, year_start))')
      .eq('student_id', studentId)
      .order('enrolled_at', { ascending: true }),
  ]);

  const u  = userRes.data  as any;
  const sp = spRes.data    as any;

  let programName = sp?.program ?? '—';
  const programId = sp?.program_id ?? sp?.program;
  if (programId) {
    const { data: prog } = await db.from('academic_programs').select('name').eq('id', programId).maybeSingle();
    if (prog) programName = (prog as any).name ?? programName;
  }

  // Build term map
  const termMap = new Map<string, { termId: string; termName: string; termYear: number; courses: any[] }>();
  ((enrollRes.data ?? []) as any[]).forEach(e => {
    const co     = e.course_offerings;
    const course = Array.isArray(co?.courses)        ? co.courses[0]        : co?.courses;
    const term   = Array.isArray(co?.academic_terms) ? co.academic_terms[0] : co?.academic_terms;
    if (!term || !course) return;
    if (!termMap.has(term.id)) termMap.set(term.id, { termId: term.id, termName: term.term_name, termYear: term.year_start ?? 0, courses: [] });
    termMap.get(term.id)!.courses.push({ courseId: course.id, code: course.code, title: course.title, credits: course.credit_hours ?? 3, grade: e.final_grade, finalScore: e.final_score, status: e.status });
  });

  const sortedTerms = [...termMap.values()].sort((a, b) => a.termYear - b.termYear);

  // Retake detection
  const latestByCourse = new Map<string, string>();
  sortedTerms.forEach((t, ti) => t.courses.forEach(c => { if (c.status !== 'withdrawn') latestByCourse.set(c.courseId, `${ti}`); }));

  let cumCr = 0, cumQP = 0;
  const terms = sortedTerms.map((t, ti) => {
    let semCr = 0, semQP = 0;
    const courses = t.courses.map(c => {
      const isLatest = latestByCourse.get(c.courseId) === String(ti);
      const isRetaken = !isLatest && c.status !== 'withdrawn';
      const e = SCALE[c.grade ?? ''];
      const qp = (e?.gradePoint ?? 0) * c.credits;
      if (isLatest && e?.countsInGpa && c.status !== 'withdrawn' && c.grade) { semCr += c.credits; semQP += qp; }
      return { ...c, gradePoint: isLatest ? (e?.gradePoint ?? 0) : 0, qualityPoints: isLatest ? r2(qp) : 0, countsInGpa: isLatest ? (e?.countsInGpa ?? false) : false, isPassing: e?.isPassing ?? false, isRetaken };
    });
    const semGpa = semCr > 0 ? r2(semQP / semCr) : 0;
    cumCr += semCr; cumQP += semQP;
    const cumGpa = cumCr > 0 ? r2(cumQP / cumCr) : 0;
    return { termId: t.termId, termName: t.termName, termYear: t.termYear, courses, semCredits: semCr, semQPs: r2(semQP), semGpa, cumCredits: cumCr, cumQPs: r2(cumQP), cumGpa, standing: semCr > 0 ? getStandingLabel(semGpa) : 'Good Standing' };
  });

  return {
    student: { firstName: u?.first_name ?? '', lastName: u?.last_name ?? '', email: u?.email ?? '', studentNo: sp?.student_no ?? null, program: programName, admissionYear: u?.created_at ? new Date(u.created_at).getFullYear() : null },
    terms,
  };
}

// ─── PDF generation ───────────────────────────────────────────────────────────

const navy  = rgb(0.082, 0.133, 0.286);
const gold  = rgb(0.792, 0.647, 0.145);
const gray  = rgb(0.45,  0.45,  0.45);
const lgray = rgb(0.85,  0.85,  0.85);
const red   = rgb(0.85,  0.15,  0.15);
const green = rgb(0.12,  0.55,  0.12);
const black = rgb(0,     0,     0);

async function buildTranscriptPdf(data: Awaited<ReturnType<typeof fetchTranscriptData>>): Promise<Uint8Array> {
  const { student, terms } = data;
  const PW = 595.28, PH = 841.89;
  const ML = 50, MR = 50, MT = 50, MB = 50;
  const CW = PW - ML - MR;

  const pdfDoc = await PDFDocument.create();
  const [bold, regular, italic] = await Promise.all([
    pdfDoc.embedFont(StandardFonts.HelveticaBold),
    pdfDoc.embedFont(StandardFonts.Helvetica),
    pdfDoc.embedFont(StandardFonts.HelveticaOblique),
  ]);

  let page = pdfDoc.addPage([PW, PH]);
  let y    = PH - MT;

  const addPage = () => {
    // Footer on current page before flipping
    drawFooter(page, PW, PH, ML, regular, gray);
    page = pdfDoc.addPage([PW, PH]);
    y    = PH - MT;
  };

  const ensureSpace = (needed: number) => { if (y - needed < MB + 40) addPage(); };

  // ── Header (first page) ─────────────────────────────────────────────────────
  // University name
  const uniText = 'MULE UNIVERSITY';
  const uniW    = bold.widthOfTextAtSize(uniText, 16);
  page.drawText(uniText, { x: (PW - uniW) / 2, y, size: 16, font: bold, color: navy });
  y -= 18;
  const subText = 'Learning Management System';
  const subW    = regular.widthOfTextAtSize(subText, 9);
  page.drawText(subText, { x: (PW - subW) / 2, y, size: 9, font: regular, color: gray });
  y -= 10;
  page.drawLine({ start: { x: ML, y }, end: { x: PW - MR, y }, thickness: 1.5, color: navy });
  y -= 14;
  const titleText = 'OFFICIAL ACADEMIC TRANSCRIPT';
  const titleW    = bold.widthOfTextAtSize(titleText, 11);
  page.drawText(titleText, { x: (PW - titleW) / 2, y, size: 11, font: bold, color: navy });
  y -= 10;
  page.drawLine({ start: { x: ML, y }, end: { x: PW - MR, y }, thickness: 0.5, color: lgray });
  y -= 16;

  // ── Student info block ──────────────────────────────────────────────────────
  const infoItems: [string, string][] = [
    ['Student Name', `${student.firstName} ${student.lastName}`],
    ['Student No.',   student.studentNo ?? '—'],
    ['Program',       student.program],
    ['Admission Year',student.admissionYear ? String(student.admissionYear) : '—'],
    ['Email',         student.email],
    ['Date Printed',  new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })],
  ];
  const half = Math.ceil(infoItems.length / 2);
  const col2X = ML + CW / 2 + 10;
  const startY = y;
  infoItems.forEach((item, idx) => {
    const x   = idx < half ? ML : col2X;
    const iy  = startY - (idx % half) * 14;
    page.drawText(item[0] + ':', { x, y: iy, size: 8, font: bold, color: gray });
    page.drawText(item[1], { x: x + regular.widthOfTextAtSize(item[0] + ': ', 8), y: iy, size: 8, font: regular, color: black });
  });
  y = startY - half * 14 - 12;
  page.drawLine({ start: { x: ML, y }, end: { x: PW - MR, y }, thickness: 0.5, color: lgray });
  y -= 14;

  // ── Table column widths ─────────────────────────────────────────────────────
  // #(20) | Code(55) | Title(flex) | Cr(25) | Grade(30) | Pts(30) | QP(30) | Status(35)
  const COL = { no: 20, code: 55, cr: 25, grade: 32, pts: 32, qp: 32, st: 40 };
  const titleW2 = CW - COL.no - COL.code - COL.cr - COL.grade - COL.pts - COL.qp - COL.st;
  const xNo    = ML;
  const xCode  = xNo   + COL.no;
  const xTitle = xCode + COL.code;
  const xCr    = xTitle + titleW2;
  const xGrade = xCr   + COL.cr;
  const xPts   = xGrade + COL.grade;
  const xQP    = xPts   + COL.pts;
  const xSt    = xQP    + COL.qp;

  const drawTableHeader = () => {
    page.drawRectangle({ x: ML, y: y - 14, width: CW, height: 15, color: rgb(0.20, 0.08, 0.38) });
    [
      [xNo,    '#',      'left'],
      [xCode,  'Code',   'left'],
      [xTitle, 'Course Title', 'left'],
      [xCr + COL.cr - 2, 'Cr.', 'right'],
      [xGrade + COL.grade - 2, 'Grade', 'right'],
      [xPts + COL.pts - 2, 'Pts', 'right'],
      [xQP + COL.qp - 2, 'QP', 'right'],
      [xSt + COL.st - 2, 'Status', 'right'],
    ].forEach(([x, text, align]) => {
      const sz = 7.5;
      const tw = bold.widthOfTextAtSize(String(text), sz);
      const tx = align === 'right' ? (Number(x) - tw) : Number(x) + 2;
      page.drawText(String(text), { x: tx, y: y - 11, size: sz, font: bold, color: rgb(1,1,1) });
    });
    y -= 14;
  };

  // ── Terms ───────────────────────────────────────────────────────────────────
  for (const term of terms) {
    ensureSpace(50);

    // Term header bar
    page.drawRectangle({ x: ML, y: y - 16, width: CW, height: 17, color: navy });
    page.drawText(`${term.termName} ${term.termYear ? '(' + term.termYear + ')' : ''}`, { x: ML + 4, y: y - 13, size: 9, font: bold, color: rgb(1,1,1) });
    if (term.semCredits > 0) {
      const sLabel = `Standing: ${term.standing}`;
      const sW     = regular.widthOfTextAtSize(sLabel, 7.5);
      page.drawText(sLabel, { x: PW - MR - sW - 4, y: y - 13, size: 7.5, font: regular, color: rgb(0.9, 0.85, 0.6) });
    }
    y -= 16;

    drawTableHeader();

    let rowIdx = 0;
    for (const c of term.courses) {
      ensureSpace(18);
      const rowColor = c.isRetaken ? rgb(0.94, 0.94, 0.94) : c.grade === 'F' ? rgb(1, 0.93, 0.93) : rowIdx % 2 === 0 ? rgb(1,1,1) : rgb(0.97, 0.97, 0.97);
      page.drawRectangle({ x: ML, y: y - 14, width: CW, height: 14, color: rowColor });

      const txtColor: RGB = c.isRetaken ? gray : c.grade === 'F' ? red : black;
      const sz = 7.5;

      const drawL = (x: number, text: string, col?: RGB) =>
        page.drawText(text, { x: x + 2, y: y - 11, size: sz, font: regular, color: col ?? txtColor });
      const drawR = (x: number, w: number, text: string, col?: RGB) => {
        const tw = regular.widthOfTextAtSize(text, sz);
        page.drawText(text, { x: x + w - tw - 2, y: y - 11, size: sz, font: regular, color: col ?? txtColor });
      };

      drawL(xNo,   String(rowIdx + 1));
      drawL(xCode, c.code.substring(0, 9));

      // Title truncation
      const maxTitleW = titleW2 - 6;
      let title = c.title;
      while (title.length > 3 && regular.widthOfTextAtSize(title, sz) > maxTitleW) title = title.slice(0, -1);
      if (title !== c.title) title = title.slice(0, -1) + '…';
      drawL(xTitle, title);

      drawR(xCr,    COL.cr,    String(c.credits));
      drawR(xGrade, COL.grade, c.grade ?? (c.status === 'withdrawn' ? 'W' : '—'),
        c.grade === 'F' ? red : c.isPassing ? green : black);
      drawR(xPts,   COL.pts,   c.isRetaken ? '—' : c.gradePoint.toFixed(2));
      drawR(xQP,    COL.qp,    c.isRetaken || !c.countsInGpa ? '—' : c.qualityPoints.toFixed(2));
      drawR(xSt,    COL.st,    c.isRetaken ? 'Retaken' : c.status === 'withdrawn' || c.grade === 'W' ? 'Withdrawn' : c.grade === 'F' ? 'Failed' : c.isPassing ? 'Pass' : '—',
        c.grade === 'F' ? red : c.isPassing ? green : gray);

      y -= 14;
      rowIdx++;
    }

    // Term summary row
    ensureSpace(22);
    page.drawRectangle({ x: ML, y: y - 16, width: CW, height: 16, color: rgb(0.93, 0.90, 0.98) });
    const summaryParts: string[] = [
      `Credits: ${term.semCredits}`,
      `Quality Pts: ${term.semQPs.toFixed(2)}`,
      ...(term.semCredits > 0 ? [`Sem. GPA: ${term.semGpa.toFixed(2)}`] : []),
      `Cum. GPA: ${term.cumGpa.toFixed(2)}`,
    ];
    page.drawText(summaryParts.join('   ·   '), { x: ML + 4, y: y - 12, size: 8, font: bold, color: navy });
    y -= 16;
    y -= 8;
  }

  // ── Final totals ─────────────────────────────────────────────────────────────
  const last = terms[terms.length - 1];
  if (last) {
    ensureSpace(80);
    y -= 6;
    page.drawLine({ start: { x: ML, y }, end: { x: PW - MR, y }, thickness: 1, color: navy });
    y -= 14;
    page.drawText('TRANSCRIPT TOTALS', { x: ML, y, size: 10, font: bold, color: navy });
    y -= 14;

    const totals: [string, string][] = [
      ['Total Credit Hours',   String(last.cumCredits)],
      ['Total Quality Points', last.cumQPs.toFixed(2)],
      ['Cumulative GPA',       `${last.cumGpa.toFixed(2)} / 4.00`],
      ['Academic Standing',    last.semCredits > 0 ? getStandingLabel(last.semGpa) : '—'],
    ];
    const classification = getClassification(last.cumGpa);
    if (classification) totals.push(['Graduation Classification', classification]);

    for (const [label, val] of totals) {
      page.drawText(label + ':', { x: ML,      y, size: 9, font: regular, color: gray });
      page.drawText(val,         { x: ML + 180, y, size: 9, font: bold,    color: black });
      y -= 13;
    }
  }

  // Footer on last page
  drawFooter(page, PW, PH, ML, regular, gray);

  return pdfDoc.save();
}

function drawFooter(page: any, PW: number, _PH: number, ML: number, regular: any, gray: RGB) {
  const footY = 35;
  page.drawLine({ start: { x: ML, y: footY + 12 }, end: { x: PW - ML, y: footY + 12 }, thickness: 0.5, color: gray });
  const footText = `This is an official document of Mule University  ·  Generated ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}  ·  For verification contact the Registrar Office`;
  const tw = regular.widthOfTextAtSize(footText, 7);
  page.drawText(footText, { x: (PW - tw) / 2, y: footY, size: 7, font: regular, color: gray });
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const { studentId } = await params;

    const supabase   = await createClient();
    const { data: { user: authUser }, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !authUser) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const adminDb   = createAdminClient();
    const roleNames = await getUserRoleNames(adminDb, authUser.id);
    const role      = getHighestRole(roleNames as RoleName[]);

    // Students may only download their own transcript
    if (role === 'STUDENT') {
      const { data: appUser } = await adminDb.from('users').select('id').eq('auth_user_id', authUser.id).single();
      if (!appUser || (appUser as any).id !== studentId) {
        return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
      }
    } else if (!['ADMIN','REGISTRAR','ACADEMIC_ADVISOR','DEPARTMENT_HEAD','INSTRUCTOR'].includes(role ?? '')) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const data     = await fetchTranscriptData(adminDb, studentId);
    const pdfBytes = await buildTranscriptPdf(data);

    const studentName = `${data.student.firstName}-${data.student.lastName}`.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename   = `transcript-${studentName}-${data.student.studentNo ?? studentId}-${new Date().toISOString().slice(0,10)}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length':      String(pdfBytes.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
