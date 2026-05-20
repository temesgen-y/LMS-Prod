import { supabaseAdmin } from '../lib/supabase';

// ─── Ethiopian grade scale fallback ──────────────────────────────────────────

const DEFAULT_SCALE: Array<{ letterGrade: string; gradePoint: number; countsInGpa: boolean; isPassing: boolean }> = [
  { letterGrade: 'A',  gradePoint: 4.00, countsInGpa: true,  isPassing: true  },
  { letterGrade: 'A-', gradePoint: 3.75, countsInGpa: true,  isPassing: true  },
  { letterGrade: 'B+', gradePoint: 3.50, countsInGpa: true,  isPassing: true  },
  { letterGrade: 'B',  gradePoint: 3.00, countsInGpa: true,  isPassing: true  },
  { letterGrade: 'B-', gradePoint: 2.75, countsInGpa: true,  isPassing: true  },
  { letterGrade: 'C+', gradePoint: 2.50, countsInGpa: true,  isPassing: true  },
  { letterGrade: 'C',  gradePoint: 2.00, countsInGpa: true,  isPassing: true  },
  { letterGrade: 'C-', gradePoint: 1.75, countsInGpa: true,  isPassing: true  },
  { letterGrade: 'D',  gradePoint: 1.00, countsInGpa: true,  isPassing: true  },
  { letterGrade: 'F',  gradePoint: 0.00, countsInGpa: true,  isPassing: false },
  { letterGrade: 'I',  gradePoint: 0.00, countsInGpa: false, isPassing: false },
  { letterGrade: 'W',  gradePoint: 0.00, countsInGpa: false, isPassing: false },
  { letterGrade: 'NG', gradePoint: 0.00, countsInGpa: false, isPassing: false },
];

type ScaleEntry = { gradePoint: number; countsInGpa: boolean; isPassing: boolean };

async function loadGradeScale(): Promise<Map<string, ScaleEntry>> {
  const { data } = await supabaseAdmin
    .from('grade_scale')
    .select('letter_grade, grade_point, counts_in_gpa, is_passing')
    .order('sort_order');

  const rows = (data ?? []) as any[];
  const src  = rows.length > 0
    ? rows.map(r => ({
        letterGrade: r.letter_grade as string,
        gradePoint:  parseFloat(r.grade_point),
        countsInGpa: r.counts_in_gpa as boolean,
        isPassing:   r.is_passing   as boolean,
      }))
    : DEFAULT_SCALE;

  const map = new Map<string, ScaleEntry>();
  for (const e of src) map.set(e.letterGrade, e);
  return map;
}

function r2(n: number): number { return Math.round(n * 100) / 100; }

// ─── Standing helpers ─────────────────────────────────────────────────────────

export function determineAcademicStanding(semGpa: number): string {
  if (semGpa >= 3.50) return "Dean's List";
  if (semGpa >= 2.00) return 'Good Standing';
  if (semGpa >= 1.50) return 'Academic Probation';
  return 'Dismissal Warning';
}

function standingToDb(s: string): string {
  if (s === "Dean's List")        return 'honors';
  if (s === 'Good Standing')      return 'good';
  if (s === 'Academic Probation') return 'probation';
  return 'warning';
}

export function determineGraduationClassification(cgpa: number): string | null {
  if (cgpa >= 3.75) return 'Great Distinction';
  if (cgpa >= 3.50) return 'Distinction';
  if (cgpa >= 3.00) return 'Very Great Credit';
  if (cgpa >= 2.75) return 'Great Credit';
  if (cgpa >= 2.00) return 'Credit';
  return null;
}

export function getLetterGradeFromPercentage(pct: number): string {
  if (pct >= 90) return 'A';
  if (pct >= 85) return 'A-';
  if (pct >= 80) return 'B+';
  if (pct >= 75) return 'B';
  if (pct >= 70) return 'B-';
  if (pct >= 65) return 'C+';
  if (pct >= 60) return 'C';
  if (pct >= 55) return 'C-';
  if (pct >= 45) return 'D';
  return 'F';
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawEnr {
  enrollmentId: string;
  courseId:     string;
  courseCode:   string;
  courseTitle:  string;
  creditHours:  number;
  termId:       string;
  termName:     string;
  termYear:     number;
  finalGrade:   string | null;
  finalScore:   number | null;
  status:       string;
}

export interface TranscriptCourse {
  enrollmentId:  string;
  courseCode:    string;
  courseTitle:   string;
  creditHours:   number;
  finalGrade:    string | null;
  finalScore:    number | null;
  gradePoint:    number;
  qualityPoints: number;
  countsInGpa:   boolean;
  isPassing:     boolean;
  status:        string;
  isRetaken:     boolean;
}

export interface TranscriptTerm {
  termId:                  string;
  termName:                string;
  termYear:                number;
  courses:                 TranscriptCourse[];
  totalCreditHours:        number;
  totalQualityPoints:      number;
  semesterGpa:             number;
  cumulativeCreditHours:   number;
  cumulativeQualityPoints: number;
  cumulativeGpa:           number;
  academicStanding:        string;
  coursesTaken:            number;
  coursesPassed:           number;
  coursesFailed:           number;
}

// ─── Fetch enrollments ────────────────────────────────────────────────────────

async function fetchEnrollments(studentId: string): Promise<RawEnr[]> {
  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .select(`
      id, status, final_grade, final_score,
      course_offerings(
        courses(id, code, title, credit_hours),
        academic_terms(id, term_name, year_start)
      )
    `)
    .eq('student_id', studentId)
    .in('status', ['completed', 'active', 'withdrawn']);

  if (error) throw new Error(error.message);

  return ((data ?? []) as any[]).map(e => {
    const co     = e.course_offerings;
    const course = Array.isArray(co?.courses) ? co.courses[0] : co?.courses;
    const term   = Array.isArray(co?.academic_terms) ? co.academic_terms[0] : co?.academic_terms;
    if (!course?.id || !term?.id) return null;
    return {
      enrollmentId: e.id,
      courseId:     course.id,
      courseCode:   course.code  ?? '',
      courseTitle:  course.title ?? '',
      creditHours:  course.credit_hours ?? 3,
      termId:       term.id,
      termName:     term.term_name ?? '',
      termYear:     term.year_start ?? 0,
      finalGrade:   e.final_grade,
      finalScore:   e.final_score,
      status:       e.status,
    } as RawEnr;
  }).filter(Boolean) as RawEnr[];
}

// ─── Core calculation ─────────────────────────────────────────────────────────

export async function calculateTranscript(studentId: string): Promise<TranscriptTerm[]> {
  const [enrollments, scale] = await Promise.all([
    fetchEnrollments(studentId),
    loadGradeScale(),
  ]);

  const termMap = new Map<string, RawEnr[]>();
  for (const e of enrollments) {
    if (!termMap.has(e.termId)) termMap.set(e.termId, []);
    termMap.get(e.termId)!.push(e);
  }

  const sortedTermIds = [...termMap.keys()].sort((a, b) => {
    return (termMap.get(a)![0].termYear) - (termMap.get(b)![0].termYear);
  });

  // Latest enrollment per course (retake: later term wins)
  const latestByCourse = new Map<string, string>();
  for (const tid of sortedTermIds) {
    for (const e of termMap.get(tid)!) {
      if (e.status !== 'withdrawn') latestByCourse.set(e.courseId, e.enrollmentId);
    }
  }

  let cumCredits = 0;
  let cumQPs     = 0;
  const result: TranscriptTerm[] = [];

  for (const termId of sortedTermIds) {
    const rows     = termMap.get(termId)!;
    const termName = rows[0].termName;
    const termYear = rows[0].termYear;

    let termCredits = 0;
    let termQPs     = 0;
    let taken = 0, passed = 0, failed = 0;

    const courses: TranscriptCourse[] = rows.map(e => {
      const entry     = scale.get(e.finalGrade ?? '') ?? { gradePoint: 0, countsInGpa: false, isPassing: false };
      const isLatest  = latestByCourse.get(e.courseId) === e.enrollmentId;
      const isRetaken = !isLatest && e.status !== 'withdrawn';
      const qp        = entry.gradePoint * e.creditHours;

      if (isLatest && entry.countsInGpa && e.status !== 'withdrawn' && e.finalGrade) {
        termCredits += e.creditHours;
        termQPs     += qp;
      }
      if (isLatest && e.status !== 'withdrawn' && e.finalGrade) {
        taken++;
        if (entry.isPassing) passed++; else failed++;
      }

      return {
        enrollmentId:  e.enrollmentId,
        courseCode:    e.courseCode,
        courseTitle:   e.courseTitle,
        creditHours:   e.creditHours,
        finalGrade:    e.finalGrade,
        finalScore:    e.finalScore,
        gradePoint:    isLatest ? entry.gradePoint : 0,
        qualityPoints: isLatest ? r2(qp) : 0,
        countsInGpa:   isLatest ? entry.countsInGpa : false,
        isPassing:     entry.isPassing,
        status:        e.status,
        isRetaken,
      };
    });

    const semGpa = termCredits > 0 ? r2(termQPs / termCredits) : 0;
    cumCredits  += termCredits;
    cumQPs      += termQPs;
    const cumGpa = cumCredits > 0 ? r2(cumQPs / cumCredits) : 0;

    result.push({
      termId, termName, termYear, courses,
      totalCreditHours:        termCredits,
      totalQualityPoints:      r2(termQPs),
      semesterGpa:             semGpa,
      cumulativeCreditHours:   cumCredits,
      cumulativeQualityPoints: r2(cumQPs),
      cumulativeGpa:           cumGpa,
      academicStanding:        termCredits > 0 ? determineAcademicStanding(semGpa) : 'Good Standing',
      coursesTaken:  taken,
      coursesPassed: passed,
      coursesFailed: failed,
    });
  }

  return result;
}

// ─── Persist to DB ────────────────────────────────────────────────────────────

export async function recalculateStudentGPA(studentId: string): Promise<void> {
  const transcript = await calculateTranscript(studentId);

  for (const term of transcript) {
    const allCreds  = term.courses.reduce((s, c) => c.status !== 'withdrawn' ? s + c.creditHours : s, 0);
    const earnCreds = term.courses.reduce((s, c) =>
      c.isPassing && c.status !== 'withdrawn' && !c.isRetaken ? s + c.creditHours : s, 0);

    await supabaseAdmin.from('semester_gpa').upsert({
      student_id:                studentId,
      term_id:                   term.termId,
      total_credit_hours:        term.totalCreditHours,
      total_quality_points:      term.totalQualityPoints,
      semester_gpa:              term.semesterGpa,
      cumulative_credit_hours:   term.cumulativeCreditHours,
      cumulative_quality_points: term.cumulativeQualityPoints,
      cumulative_gpa:            term.cumulativeGpa,
      academic_standing:         term.academicStanding,
      courses_taken:             term.coursesTaken,
      courses_passed:            term.coursesPassed,
      courses_failed:            term.coursesFailed,
      calculated_at:             new Date().toISOString(),
    }, { onConflict: 'student_id,term_id' });

    await supabaseAdmin.from('academic_standing').upsert({
      student_id:        studentId,
      term_id:           term.termId,
      gpa:               term.semesterGpa,
      cumulative_gpa:    term.cumulativeGpa,
      standing:          standingToDb(term.academicStanding),
      credits_earned:    earnCreds,
      credits_attempted: allCreds,
    }, { onConflict: 'student_id,term_id' });
  }

  const latest = transcript[transcript.length - 1];
  if (latest && latest.totalCreditHours > 0) {
    const s = latest.academicStanding;
    if (s === 'Academic Probation' || s === 'Dismissal Warning') {
      await supabaseAdmin.from('notifications').insert({
        user_id: studentId,
        title:   'Academic Standing Updated',
        body:    s === 'Academic Probation'
          ? 'You are on academic probation. Contact your advisor immediately.'
          : 'Your GPA is critically low. Dismissal warning issued. Contact the registrar.',
        type: 'announcement',
      });
    }
  }
}

export async function recalculateOfferingGPAs(offeringId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('enrollments')
    .select('student_id')
    .eq('offering_id', offeringId);

  const ids = [...new Set(((data ?? []) as any[]).map(e => e.student_id as string))];
  await Promise.all(ids.map(id => recalculateStudentGPA(id)));
  return ids.length;
}

export async function getStudentGPARecords(studentId: string) {
  const { data } = await supabaseAdmin
    .from('semester_gpa')
    .select('*, academic_terms!term_id(term_name, year_start)')
    .eq('student_id', studentId)
    .order('calculated_at', { ascending: true });
  return (data ?? []) as any[];
}

export async function getGradeScaleFromDb() {
  const { data } = await supabaseAdmin
    .from('grade_scale')
    .select('*')
    .order('sort_order');
  return (data ?? []) as any[];
}

export async function updateProgramProgress(studentId: string, programId: string): Promise<void> {
  const [transcript, prog] = await Promise.all([
    calculateTranscript(studentId),
    supabaseAdmin.from('academic_programs').select('total_credits').eq('id', programId).maybeSingle(),
  ]);

  const totalRequired = (prog.data as any)?.total_credits ?? 120;
  const latest        = transcript[transcript.length - 1];
  const cgpa          = latest?.cumulativeGpa ?? 0;
  const cumCredits    = latest?.cumulativeCreditHours ?? 0;
  const pct           = totalRequired > 0 ? r2(Math.min(100, (cumCredits / totalRequired) * 100)) : 0;
  const graduation    = cumCredits >= totalRequired && cgpa >= 2.00 ? determineGraduationClassification(cgpa) : null;

  await supabaseAdmin.from('program_progress').upsert({
    student_id:                studentId,
    program_id:                programId,
    total_required_credits:    totalRequired,
    completed_credits:         cumCredits,
    completion_percentage:     pct,
    current_cgpa:              cgpa,
    graduation_classification: graduation,
    status:                    cumCredits >= totalRequired && cgpa >= 2.00 ? 'completed' : 'in_progress',
    updated_at:                new Date().toISOString(),
  }, { onConflict: 'student_id,program_id' });
}

export async function getProgramProgress(studentId: string) {
  const { data } = await supabaseAdmin
    .from('program_progress')
    .select('*, academic_programs!program_id(name, total_credits)')
    .eq('student_id', studentId)
    .maybeSingle();
  return data;
}
