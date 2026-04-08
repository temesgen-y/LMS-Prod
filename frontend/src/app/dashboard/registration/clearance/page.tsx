'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type ClearanceRequest = {
  id               : string;
  clearanceType    : string;
  status           : string;
  libraryCleared   : boolean;
  deptCleared      : boolean;
  registrarCleared : boolean;
  notes            : string | null;
  createdAt        : string;
  completedAt      : string | null;
};

type PastRequest = {
  id               : string;
  clearanceType    : string;
  status           : string;
  libraryCleared   : boolean;
  deptCleared      : boolean;
  registrarCleared : boolean;
  createdAt        : string;
  completedAt      : string | null;
};

type StudentProfile = {
  studentNo  : string;
  studentId  : string;   // users.id (public UUID)
  firstName  : string;
  lastName   : string;
  email      : string;
  program    : string;
  department : string;
  yearLevel  : string;
};

const TYPES = ['graduation', 'withdrawal', 'transfer', 'annual'] as const;

const STATUS_BADGE: Record<string, string> = {
  pending    : 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  cleared    : 'bg-green-100 text-green-800',
  rejected   : 'bg-red-100 text-red-800',
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ClearanceItem({ label, cleared }: { label: string; cleared: boolean }) {
  return (
    <div className={`flex items-center justify-between p-4 rounded-lg ${cleared ? 'bg-green-50' : 'bg-gray-50'}`}>
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <span className={`flex items-center gap-1.5 text-sm font-semibold ${cleared ? 'text-green-700' : 'text-gray-500'}`}>
        {cleared ? (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Cleared
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Pending
          </>
        )}
      </span>
    </div>
  );
}

// ── PDF generation (no external deps — uses browser print) ───────────────────
function generateClearancePdf(opts: {
  studentName  : string;
  studentNo    : string;
  studentId    : string;
  email        : string;
  program      : string;
  department   : string;
  yearLevel    : string;
  clearanceType: string;
  requestId    : string;
  completedAt  : string | null;
  createdAt    : string;
}) {
  const {
    studentName, studentNo, studentId, email,
    program, department, yearLevel,
    clearanceType, requestId, completedAt, createdAt,
  } = opts;

  const dateStr = completedAt
    ? new Date(completedAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const typeLabel = clearanceType.charAt(0).toUpperCase() + clearanceType.slice(1);
  const shortId  = requestId.split('-')[0].toUpperCase();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Clearance Certificate – ${studentName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      background: #fff;
      color: #1a1a2e;
    }
    @page { size: A4; margin: 0; }
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 16mm 20mm 14mm;
      position: relative;
      background: #fff;
    }
    .border-outer {
      position: absolute;
      inset: 8mm;
      border: 3px solid #4c1d95;
      border-radius: 2mm;
      pointer-events: none;
    }
    .border-inner {
      position: absolute;
      inset: 11.5mm;
      border: 1px solid #7c3aed;
      border-radius: 1mm;
      pointer-events: none;
    }
    /* corner ornaments */
    .corner {
      position: absolute;
      width: 10mm;
      height: 10mm;
      pointer-events: none;
    }
    .corner-tl { top: 14mm; left: 14mm; border-top: 2px solid #7c3aed; border-left: 2px solid #7c3aed; }
    .corner-tr { top: 14mm; right: 14mm; border-top: 2px solid #7c3aed; border-right: 2px solid #7c3aed; }
    .corner-bl { bottom: 14mm; left: 14mm; border-bottom: 2px solid #7c3aed; border-left: 2px solid #7c3aed; }
    .corner-br { bottom: 14mm; right: 14mm; border-bottom: 2px solid #7c3aed; border-right: 2px solid #7c3aed; }

    .content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    /* ── Header ── */
    .header-row {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 4px;
    }
    .logo-circle {
      width: 60px; height: 60px;
      border-radius: 50%;
      background: #4c1d95;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 22px; font-weight: bold; letter-spacing: -1px;
      flex-shrink: 0;
    }
    .university-name {
      font-size: 21px; font-weight: bold;
      color: #4c1d95; letter-spacing: 1.5px; text-transform: uppercase;
      line-height: 1.2;
    }
    .university-sub {
      font-size: 9px; color: #6b21a8;
      letter-spacing: 2px; text-transform: uppercase;
      margin-top: 2px;
    }
    .divider {
      width: 100%; height: 2px;
      background: linear-gradient(to right, transparent, #4c1d95, transparent);
      margin: 7px 0;
    }
    .divider-thin {
      width: 100%; height: 1px;
      background: linear-gradient(to right, transparent, #c4b5fd, transparent);
      margin: 5px 0;
    }

    /* ── Title block ── */
    .cert-title {
      font-size: 27px; font-weight: bold;
      color: #1a1a2e; letter-spacing: 4px; text-transform: uppercase;
      margin: 10px 0 3px;
    }
    .type-badge {
      display: inline-block;
      background: #ede9fe; color: #5b21b6;
      padding: 3px 18px; border-radius: 20px;
      font-size: 10px; font-weight: 700;
      letter-spacing: 2.5px; text-transform: uppercase;
      margin: 4px 0 10px;
    }
    .body-text {
      font-size: 12.5px; color: #374151;
      line-height: 1.85; max-width: 450px;
      margin-bottom: 10px;
    }

    /* ── Student block ── */
    .student-name {
      font-size: 27px; font-weight: bold;
      color: #4c1d95; font-style: italic;
      margin: 4px 0 3px;
      border-bottom: 2px solid #7c3aed;
      padding-bottom: 4px;
    }
    /* Program pill — prominent */
    .program-pill {
      display: inline-block;
      background: #f3f0ff;
      border: 1px solid #c4b5fd;
      color: #4c1d95;
      padding: 4px 20px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin: 8px 0 4px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px 20px;
      width: 100%; max-width: 460px;
      margin: 10px 0;
      text-align: left;
    }
    .meta-item label {
      font-size: 8px; text-transform: uppercase;
      letter-spacing: 1px; color: #9ca3af; display: block;
    }
    .meta-item span {
      font-size: 11.5px; font-weight: 600; color: #1f2937;
    }

    /* ── Approval stamps (checkmark row) ── */
    .approval-section { margin: 8px 0 4px; width: 100%; }
    .approval-label {
      font-size: 9px; color: #6b7280;
      text-transform: uppercase; letter-spacing: 1.5px;
      margin-bottom: 8px;
    }
    .approval-row {
      display: flex; gap: 24px;
      justify-content: center; align-items: flex-start;
    }
    .approval-item {
      display: flex; flex-direction: column;
      align-items: center; gap: 5px;
    }
    .approval-circle {
      width: 48px; height: 48px; border-radius: 50%;
      border: 2.5px solid #16a34a;
      background: #f0fdf4;
      display: flex; align-items: center; justify-content: center;
      color: #16a34a; font-size: 20px; font-weight: bold;
    }
    .approval-name {
      font-size: 8.5px; text-transform: uppercase;
      letter-spacing: 1px; color: #374151; font-weight: 700;
    }

    /* ── Bottom row: sig + stamp ── */
    .bottom-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      width: 100%;
      margin-top: 14px;
      padding: 0 10mm;
    }
    .sig-block { text-align: center; }
    .sig-line {
      width: 120px; height: 1px;
      border-bottom: 1.5px solid #374151;
      margin: 0 auto 4px;
    }
    .sig-name { font-size: 10px; font-weight: 700; color: #1f2937; }
    .sig-title { font-size: 8.5px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.8px; }

    /* ── Official stamp SVG wrapper ── */
    .stamp-wrap { opacity: 0.88; }

    /* ── Footer ── */
    .footer-text {
      font-size: 9px; color: #9ca3af;
      margin-top: 12px; letter-spacing: 0.4px;
      text-align: center;
    }
    .ref-no {
      font-size: 8px; color: #d1d5db;
      margin-top: 3px; font-family: monospace;
      text-align: center;
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">
  <div class="border-outer"></div>
  <div class="border-inner"></div>
  <div class="corner corner-tl"></div>
  <div class="corner corner-tr"></div>
  <div class="corner corner-bl"></div>
  <div class="corner corner-br"></div>

  <div class="content">

    <!-- Header -->
    <div class="header-row">
      <div class="logo-circle">ML</div>
      <div>
        <div class="university-name">Mule University</div>
        <div class="university-sub">Office of the Registrar &nbsp;·&nbsp; Academic Affairs</div>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Title -->
    <div class="cert-title">Clearance Certificate</div>
    <div class="type-badge">${typeLabel} Clearance</div>

    <p class="body-text">
      This is to certify that the student named below has successfully fulfilled all
      clearance requirements and has been officially cleared by the University.
    </p>

    <div class="divider-thin"></div>

    <!-- Student name + program -->
    <div class="student-name">${studentName}</div>
    <div class="program-pill">${program || 'N/A'}</div>

    <!-- Meta info: 3-col grid -->
    <div class="meta-grid">
      <div class="meta-item">
        <label>Student ID</label>
        <span>${studentNo || (studentId ? studentId.split('-')[0].toUpperCase() : 'N/A')}</span>
      </div>
      <div class="meta-item">
        <label>Email Address</label>
        <span>${email}</span>
      </div>
      <div class="meta-item">
        <label>Program</label>
        <span>${program || 'N/A'}</span>
      </div>
      <div class="meta-item">
        <label>Department</label>
        <span>${department || 'N/A'}</span>
      </div>
      <div class="meta-item">
        <label>Level / Year</label>
        <span>${yearLevel || 'N/A'}</span>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Approval stamps row -->
    <div class="approval-section">
      <div class="approval-label">Clearance Approvals</div>
      <div class="approval-row">
        <div class="approval-item">
          <div class="approval-circle">&#10003;</div>
          <div class="approval-name">Library</div>
        </div>
        <div class="approval-item">
          <div class="approval-circle">&#10003;</div>
          <div class="approval-name">Department</div>
        </div>
        <div class="approval-item">
          <div class="approval-circle">&#10003;</div>
          <div class="approval-name">Registrar</div>
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Signature row + stamp -->
    <div class="bottom-row">

      <!-- University Registrar signature block -->
      <div class="sig-block">
        <!-- cursive SVG signature -->
        <svg viewBox="0 0 160 48" width="160" height="48" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto 2px;">
          <!-- main cursive stroke -->
          <path d="M 6,36 C 10,18 18,8 24,20 C 28,30 26,16 32,22 C 38,28 36,12 42,20 L 48,28 C 52,33 54,18 60,22 C 66,26 64,14 70,20 L 76,26 C 80,20 84,28 90,24 C 96,20 100,28 108,22 C 112,18 116,26 124,22 C 128,19 132,24 140,20" stroke="#1a365d" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <!-- period dot after initial -->
          <circle cx="36" cy="33" r="1.8" fill="#1a365d"/>
          <!-- underline flourish -->
          <path d="M 4,42 C 40,45 100,46 148,41" stroke="#1a365d" stroke-width="1" fill="none" stroke-linecap="round"/>
        </svg>
        <div class="sig-line"></div>
        <div class="sig-name">University Registrar</div>
        <div class="sig-title">Office of the Registrar</div>
      </div>

      <!-- University official stamp (SVG) -->
      <div class="stamp-wrap">
        <svg width="116" height="116" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
          <circle cx="60" cy="60" r="56" fill="none" stroke="#4c1d95" stroke-width="3"/>
          <circle cx="60" cy="60" r="50" fill="none" stroke="#4c1d95" stroke-width="1"/>
          <circle cx="60" cy="60" r="38" fill="none" stroke="#7c3aed" stroke-width="1.5"/>
          <circle cx="60" cy="60" r="37" fill="#f5f3ff"/>
          <text x="60" y="54" text-anchor="middle" font-size="22" fill="#4c1d95" font-family="Georgia,serif" font-weight="bold">&#9733;</text>
          <text x="60" y="68" text-anchor="middle" font-size="8" fill="#5b21b6" font-family="Georgia,serif" font-weight="bold" letter-spacing="1">MULE UNIV.</text>
          <text x="60" y="78" text-anchor="middle" font-size="6.5" fill="#7c3aed" font-family="Georgia,serif" letter-spacing="0.5">Est. 2020</text>
          <path id="top-arc" d="M 10,60 A 50,50 0 0,1 110,60" fill="none"/>
          <text font-size="8.5" font-family="Georgia,serif" fill="#4c1d95" font-weight="bold" letter-spacing="2">
            <textPath href="#top-arc" startOffset="8%">MULE UNIVERSITY</textPath>
          </text>
          <path id="bot-arc" d="M 10,60 A 50,50 0 0,0 110,60" fill="none"/>
          <text font-size="7.5" font-family="Georgia,serif" fill="#6b21a8" letter-spacing="2.5">
            <textPath href="#bot-arc" startOffset="12%">OFFICIAL SEAL</textPath>
          </text>
          <circle cx="60" cy="4"   r="2" fill="#7c3aed"/>
          <circle cx="60" cy="116" r="2" fill="#7c3aed"/>
          <circle cx="4"  cy="60"  r="2" fill="#7c3aed"/>
          <circle cx="116" cy="60" r="2" fill="#7c3aed"/>
        </svg>
      </div>

      <!-- Department Head signature block -->
      <div class="sig-block">
        <!-- cursive SVG signature (T-bar style for "Prof.") -->
        <svg viewBox="0 0 160 48" width="160" height="48" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto 2px;">
          <!-- T crossbar -->
          <path d="M 6,16 L 38,16" stroke="#1a365d" stroke-width="1.7" fill="none" stroke-linecap="round"/>
          <!-- vertical stem + flowing body -->
          <path d="M 22,16 C 22,24 24,38 28,28 C 32,18 34,32 40,26 C 46,20 44,32 50,26 L 56,22 C 62,16 66,26 72,30 C 76,33 78,22 86,26 C 92,29 96,20 104,24 C 108,27 112,20 120,22 C 126,24 130,30 138,26 C 142,24 146,28 152,24" stroke="#1a365d" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <!-- period dot -->
          <circle cx="32" cy="34" r="1.8" fill="#1a365d"/>
          <!-- underline flourish -->
          <path d="M 4,42 C 40,45 100,46 148,41" stroke="#1a365d" stroke-width="1" fill="none" stroke-linecap="round"/>
        </svg>
        <div class="sig-line"></div>
        <div class="sig-name">Department Head</div>
        <div class="sig-title">Academic Department</div>
      </div>

    </div>

    <!-- Footer -->
    <p class="footer-text">
      This certificate is issued by Mule University and is valid for official university purposes only.
      &nbsp;·&nbsp; Issued on: ${dateStr}
    </p>
    <p class="ref-no">Reference No: CLR-${shortId} &nbsp;|&nbsp; Submitted: ${new Date(createdAt).toLocaleDateString()}</p>

  </div>
</div>
<script>
  window.onload = function() { window.print(); };
</script>
</body>
</html>`;

  const blob   = new Blob([html], { type: 'text/html' });
  const url    = URL.createObjectURL(blob);
  const win    = window.open(url, '_blank');
  if (win) {
    win.onafterprint = () => {
      URL.revokeObjectURL(url);
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ClearanceRequestPage() {
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');
  const [studentId, setStudentId]     = useState('');
  const [profile, setProfile]         = useState<StudentProfile | null>(null);
  const [active, setActive]           = useState<ClearanceRequest | null>(null);
  const [past, setPast]               = useState<PastRequest[]>([]);
  const [typeInput, setTypeInput]     = useState('');
  const [notes, setNotes]             = useState('');
  const [submitting, setSubmitting]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data: currentUser } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .eq('auth_user_id', authUser.id)
        .single();
      if (!currentUser) return;

      const sid = (currentUser as any).id as string;
      setStudentId(sid);

      // Load student profile for PDF
      // `program` and `degree_level` are plain-text columns on student_profiles
      const { data: sp } = await supabase
        .from('student_profiles')
        .select('student_no, program, degree_level')
        .eq('user_id', sid)
        .maybeSingle();

      const programName = (sp as any)?.program ?? '';

      // Try to resolve department from academic_programs (case-insensitive),
      // then fall back to the student's enrolled course department.
      let departmentName = '';
      if (programName) {
        const { data: prog } = await supabase
          .from('academic_programs')
          .select('departments(name)')
          .ilike('name', `%${programName}%`)
          .maybeSingle();
        departmentName = (prog as any)?.departments?.name ?? '';
      }
      if (!departmentName && sid) {
        const { data: enr } = await supabase
          .from('enrollments')
          .select('course_offerings(courses(departments(name)))')
          .eq('student_id', sid)
          .limit(1)
          .maybeSingle();
        departmentName = (enr as any)?.course_offerings?.courses?.departments?.name ?? '';
      }

      const rawLevel: string = (sp as any)?.degree_level ?? '';
      const LEVEL_LABELS: Record<string, string> = {
        certificate: 'Certificate',
        diploma    : 'Diploma',
        bachelor   : "Bachelor's Degree",
        master     : "Master's Degree",
        phd        : 'PhD / Doctorate',
      };
      const yearLevelLabel = LEVEL_LABELS[rawLevel.toLowerCase()] ?? rawLevel;

      setProfile({
        studentNo  : (sp as any)?.student_no ?? '',
        studentId  : sid,
        firstName  : (currentUser as any).first_name ?? '',
        lastName   : (currentUser as any).last_name ?? '',
        email      : (currentUser as any).email ?? '',
        program    : programName,
        department : departmentName,
        yearLevel  : yearLevelLabel,
      });

      // Active request (pending or in_progress)
      const { data: activeData } = await supabase
        .from('clearance_requests')
        .select('id, clearance_type, status, library_cleared, dept_cleared, registrar_cleared, notes, created_at, completed_at')
        .eq('student_id', sid)
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setActive(activeData ? {
        id:               (activeData as any).id,
        clearanceType:    (activeData as any).clearance_type,
        status:           (activeData as any).status,
        libraryCleared:   (activeData as any).library_cleared,
        deptCleared:      (activeData as any).dept_cleared,
        registrarCleared: (activeData as any).registrar_cleared,
        notes:            (activeData as any).notes,
        createdAt:        (activeData as any).created_at,
        completedAt:      (activeData as any).completed_at,
      } : null);

      // Past completed/rejected — include cleared flags for PDF
      const { data: pastData } = await supabase
        .from('clearance_requests')
        .select('id, clearance_type, status, library_cleared, dept_cleared, registrar_cleared, created_at, completed_at')
        .eq('student_id', sid)
        .in('status', ['cleared', 'rejected'])
        .order('created_at', { ascending: false });

      setPast(((pastData ?? []) as any[]).map((r: any) => ({
        id:               r.id,
        clearanceType:    r.clearance_type,
        status:           r.status,
        libraryCleared:   r.library_cleared,
        deptCleared:      r.dept_cleared,
        registrarCleared: r.registrar_cleared,
        createdAt:        r.created_at,
        completedAt:      r.completed_at,
      })));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!typeInput) return;
    setSubmitting(true);
    setError(''); setSuccess('');
    try {
      const supabase = createClient();
      const { data: dup } = await supabase
        .from('clearance_requests').select('id')
        .eq('student_id', studentId)
        .in('status', ['pending', 'in_progress']).maybeSingle();
      if (dup) { setError('You already have an active clearance request.'); setSubmitting(false); return; }

      const { error: insErr } = await supabase.from('clearance_requests').insert({
        student_id:        studentId,
        clearance_type:    typeInput,
        // Library is approved automatically; dept & registrar still pending
        status:            'in_progress',
        notes:             notes.trim() || null,
        library_cleared:   true,
        dept_cleared:      false,
        registrar_cleared: false,
      });
      if (insErr) throw insErr;
      setSuccess('Clearance request submitted. Library clearance has been approved automatically. Awaiting Department and Registrar approval.');
      setTypeInput(''); setNotes('');
      load();
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const canDownload = (req: { deptCleared: boolean; registrarCleared: boolean }) =>
    req.deptCleared && req.registrarCleared;

  const handleDownload = (req: ClearanceRequest | PastRequest) => {
    if (!profile) return;
    generateClearancePdf({
      studentName:   `${profile.firstName} ${profile.lastName}`.trim(),
      studentNo:     profile.studentNo,
      studentId:     profile.studentId,
      email:         profile.email,
      program:       profile.program,
      department:    profile.department,
      yearLevel:     profile.yearLevel,
      clearanceType: req.clearanceType,
      requestId:     req.id,
      completedAt:   req.completedAt,
      createdAt:     req.createdAt,
    });
  };

  const overallLabel = (req: ClearanceRequest) => {
    if (req.status === 'cleared') return { label: 'Cleared', cls: 'text-green-700 bg-green-50' };
    if (req.libraryCleared || req.deptCleared || req.registrarCleared) return { label: 'In Progress', cls: 'text-blue-700 bg-blue-50' };
    return { label: 'Pending', cls: 'text-yellow-700 bg-yellow-50' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4c1d95]" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Clearance Request</h1>
        <p className="text-sm text-gray-500 mt-1">Request clearance for graduation, withdrawal, transfer, or annual purposes.</p>
      </div>

      {error   && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}

      {/* ── Active Request Status ─────────────────────────────────────────── */}
      {active ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Your Active Clearance Request</h2>
              <p className="text-sm text-gray-500 mt-0.5 capitalize">
                Type: {active.clearanceType} · Submitted: {fmtDate(active.createdAt)}
              </p>
            </div>
            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_BADGE[active.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {active.status.replace('_', ' ')}
            </span>
          </div>

          <div className="space-y-3 mb-5">
            <ClearanceItem label="Library" cleared={active.libraryCleared} />
            <ClearanceItem label="Department" cleared={active.deptCleared} />
            <ClearanceItem label="Registrar Office" cleared={active.registrarCleared} />
          </div>

          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${overallLabel(active).cls}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Overall Status: {overallLabel(active).label}
          </div>

          {active.notes && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
              <span className="font-medium">Notes: </span>{active.notes}
            </div>
          )}

          {/* Download button — only when dept + registrar both approved */}
          {canDownload(active) ? (
            <button
              type="button"
              onClick={() => handleDownload(active)}
              className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-[#4c1d95] hover:bg-[#5b21b6] text-white rounded-lg text-sm font-semibold transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Clearance Certificate (PDF)
            </button>
          ) : (
            <div className="mt-5 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              PDF download will be available once both Department and Registrar have approved your request.
            </div>
          )}
        </div>
      ) : (
        /* ── Submit Form ─────────────────────────────────────────────────── */
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-2">New Clearance Request</h2>
          <p className="text-xs text-gray-500 mb-5 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Library clearance is pre-approved. You will need Department and Registrar approval to download your certificate.
          </p>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Clearance Type *</label>
              <select
                value={typeInput}
                onChange={e => setTypeInput(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]"
              >
                <option value="">Select clearance type</option>
                {TYPES.map(t => (
                  <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Any additional information..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95] resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !typeInput}
              className="w-full py-2.5 bg-[#4c1d95] hover:bg-[#5b21b6] text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Clearance Request'}
            </button>
          </form>
        </div>
      )}

      {/* ── Past Requests ─────────────────────────────────────────────────── */}
      {past.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Past Clearance Requests</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Type</th>
                    <th className="px-5 py-3 text-left font-medium">Submitted</th>
                    <th className="px-5 py-3 text-left font-medium">Status</th>
                    <th className="px-5 py-3 text-left font-medium">Completed</th>
                    <th className="px-5 py-3 text-left font-medium">Certificate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {past.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 capitalize font-medium text-gray-900">{r.clearanceType}</td>
                      <td className="px-5 py-3 text-gray-500">{fmtDate(r.createdAt)}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{fmtDate(r.completedAt)}</td>
                      <td className="px-5 py-3">
                        {canDownload(r) ? (
                          <button
                            type="button"
                            onClick={() => handleDownload(r)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4c1d95] hover:bg-[#5b21b6] text-white rounded-lg text-xs font-semibold transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Download PDF
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
