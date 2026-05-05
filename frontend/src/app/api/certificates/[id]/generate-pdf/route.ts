import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRoleNames } from '@/lib/auth/get-user-roles';
import { getHighestRole, type RoleName } from '@/types/auth';

async function buildCertificatePdf(opts: {
  studentName: string;
  courseTitle: string;
  courseCode: string;
  uniqueCode: string;
  issuedAt: string;
  expiresAt: string | null;
  appUrl: string;
}): Promise<Uint8Array> {
  const { studentName, courseTitle, courseCode, uniqueCode, issuedAt, expiresAt, appUrl } = opts;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([841.89, 595.28]); // A4 landscape
  const { width, height } = page.getSize();

  const timesRoman  = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesBold   = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const timesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const helvetica   = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const gold  = rgb(0.792, 0.647, 0.145);
  const navy  = rgb(0.082, 0.133, 0.286);
  const gray  = rgb(0.45,  0.45,  0.45);
  const cream = rgb(0.993, 0.980, 0.949);

  // Cream background
  page.drawRectangle({ x: 0, y: 0, width, height, color: cream });

  // Outer border (white fill)
  page.drawRectangle({
    x: 18, y: 18, width: width - 36, height: height - 36,
    borderColor: gold, borderWidth: 3,
    color: rgb(1, 1, 1),
  });

  // Inner border
  page.drawRectangle({
    x: 28, y: 28, width: width - 56, height: height - 56,
    borderColor: gold, borderWidth: 0.75,
  });

  // Corner gold squares
  const cs = 6;
  [
    { x: 24,           y: 24 },
    { x: width - 30,   y: 24 },
    { x: 24,           y: height - 30 },
    { x: width - 30,   y: height - 30 },
  ].forEach(({ x, y }) =>
    page.drawRectangle({ x, y, width: cs, height: cs, color: gold })
  );

  // — University header —
  const uniText = 'MULE UNIVERSITY';
  const uniSize = 14;
  const uniW = helveticaBold.widthOfTextAtSize(uniText, uniSize);
  page.drawText(uniText, {
    x: (width - uniW) / 2, y: height - 72,
    size: uniSize, font: helveticaBold, color: navy,
  });

  const tagText = 'Learning Management System';
  const tagSize = 9;
  const tagW = helvetica.widthOfTextAtSize(tagText, tagSize);
  page.drawText(tagText, {
    x: (width - tagW) / 2, y: height - 88,
    size: tagSize, font: helvetica, color: gray,
  });

  page.drawLine({
    start: { x: width / 2 - 120, y: height - 98 },
    end:   { x: width / 2 + 120, y: height - 98 },
    thickness: 0.75, color: gold,
  });

  // — Title —
  const titleText = 'Certificate of Completion';
  const titleSize = 34;
  const titleW = timesBold.widthOfTextAtSize(titleText, titleSize);
  page.drawText(titleText, {
    x: (width - titleW) / 2, y: height - 148,
    size: titleSize, font: timesBold, color: navy,
  });

  // — This certifies that —
  const certifiesText = 'This certifies that';
  const certifiesSize = 12;
  const certifiesW = timesItalic.widthOfTextAtSize(certifiesText, certifiesSize);
  page.drawText(certifiesText, {
    x: (width - certifiesW) / 2, y: height - 188,
    size: certifiesSize, font: timesItalic, color: gray,
  });

  // — Student name (auto-scale) —
  let nameSize = 38;
  let nameW = timesBold.widthOfTextAtSize(studentName, nameSize);
  while (nameW > width - 140 && nameSize > 20) {
    nameSize -= 2;
    nameW = timesBold.widthOfTextAtSize(studentName, nameSize);
  }
  page.drawText(studentName, {
    x: (width - nameW) / 2, y: height - 240,
    size: nameSize, font: timesBold, color: navy,
  });
  page.drawLine({
    start: { x: (width - nameW) / 2 - 20, y: height - 249 },
    end:   { x: (width + nameW) / 2 + 20, y: height - 249 },
    thickness: 0.5, color: gold,
  });

  // — has successfully completed —
  const completedText = 'has successfully completed';
  const completedSize = 12;
  const completedW = timesItalic.widthOfTextAtSize(completedText, completedSize);
  page.drawText(completedText, {
    x: (width - completedW) / 2, y: height - 278,
    size: completedSize, font: timesItalic, color: gray,
  });

  // — Course title (auto-scale) —
  let courseSize = 22;
  let courseTW = timesBold.widthOfTextAtSize(courseTitle, courseSize);
  while (courseTW > width - 120 && courseSize > 14) {
    courseSize -= 1;
    courseTW = timesBold.widthOfTextAtSize(courseTitle, courseSize);
  }
  page.drawText(courseTitle, {
    x: (width - courseTW) / 2, y: height - 316,
    size: courseSize, font: timesBold, color: navy,
  });

  // — Course code —
  const codeStr = `[ ${courseCode} ]`;
  const codeSize = 11;
  const codeW = timesRoman.widthOfTextAtSize(codeStr, codeSize);
  page.drawText(codeStr, {
    x: (width - codeW) / 2, y: height - 343,
    size: codeSize, font: timesRoman, color: gray,
  });

  // — Divider —
  page.drawLine({
    start: { x: 90, y: height - 369 },
    end:   { x: width - 90, y: height - 369 },
    thickness: 0.5, color: gold,
  });

  // — Footer row —
  const footerY   = height - 391;
  const footerSize = 9.5;
  const issuedDate = new Date(issuedAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  page.drawText(`Date of Issue: ${issuedDate}`, {
    x: 90, y: footerY,
    size: footerSize, font: timesRoman, color: gray,
  });

  const certNoStr = `Certificate No. ${uniqueCode}`;
  const certNoW   = timesRoman.widthOfTextAtSize(certNoStr, footerSize);
  page.drawText(certNoStr, {
    x: (width - certNoW) / 2, y: footerY,
    size: footerSize, font: timesRoman, color: gray,
  });

  if (expiresAt) {
    const expDate = new Date(expiresAt).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
    const expStr = `Valid until: ${expDate}`;
    const expW   = timesRoman.widthOfTextAtSize(expStr, footerSize);
    page.drawText(expStr, {
      x: width - 90 - expW, y: footerY,
      size: footerSize, font: timesRoman, color: rgb(0.7, 0.4, 0.1),
    });
  }

  // — Verify URL —
  const verifyStr = `Verify at: ${appUrl}/verify/${uniqueCode}`;
  const verifySize = 8;
  const verifyW = helvetica.widthOfTextAtSize(verifyStr, verifySize);
  page.drawText(verifyStr, {
    x: (width - verifyW) / 2, y: footerY - 18,
    size: verifySize, font: helvetica, color: rgb(0.35, 0.35, 0.75),
  });

  return pdfDoc.save();
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user: authUser }, error: sessionError } = await supabase.auth.getUser();
    if (sessionError || !authUser) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const adminDb    = createAdminClient();
    const roleNames  = await getUserRoleNames(adminDb, authUser.id);
    const role       = getHighestRole(roleNames as RoleName[]);
    if (role !== 'ADMIN' && role !== 'REGISTRAR') {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const { data: cert, error: certError } = await adminDb
      .from('certificates')
      .select(`
        id, unique_code, issued_at, expires_at,
        users!fk_certificates_student(first_name, last_name),
        course_offerings!fk_certificates_offering(
          courses!fk_course_offerings_course(code, title)
        )
      `)
      .eq('id', id)
      .single();

    if (certError || !cert) {
      return NextResponse.json({ error: 'Certificate not found.' }, { status: 404 });
    }

    const c = cert as any;
    const pdfBytes = await buildCertificatePdf({
      studentName: `${c.users.first_name} ${c.users.last_name}`,
      courseTitle:  c.course_offerings.courses.title  ?? '',
      courseCode:   c.course_offerings.courses.code   ?? '',
      uniqueCode:   c.unique_code,
      issuedAt:     c.issued_at,
      expiresAt:    c.expires_at,
      appUrl:       process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001',
    });

    // Ensure the storage bucket exists (ignored if already present)
    await adminDb.storage
      .createBucket('certificates', { public: true, fileSizeLimit: 10 * 1024 * 1024 })
      .catch(() => {});

    const fileName = `${c.unique_code}.pdf`;
    const { error: uploadError } = await adminDb.storage
      .from('certificates')
      .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: urlData } = adminDb.storage.from('certificates').getPublicUrl(fileName);
    const pdfUrl = urlData.publicUrl;

    const { error: updateError } = await adminDb
      .from('certificates')
      .update({ pdf_url: pdfUrl })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ pdfUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
