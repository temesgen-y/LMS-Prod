import type { SupabaseClient } from '@supabase/supabase-js';
import { getLetterGrade } from './gradeCalculator';

export interface GradeWeights {
  assessments_weight: number;
  assignments_weight: number;
  attendance_weight: number;
}

export interface CategoryBreakdown {
  assessmentPct: number | null;   // raw % within assessment category
  assignmentPct: number | null;   // raw % within assignment category
  attendancePct: number | null;   // attendance % (present+late / total)
  weightedScore: number;          // 0–100 final weighted score
  coveredWeightPct: number;       // sum of weights for categories with data
}

function r2(n: number) { return Math.round(n * 100) / 100; }

// ─── Pure calculation (no DB) ─────────────────────────────────────────────────

export function computeCategoryBreakdown(
  gbItems: Array<{ raw_score: number | null; total_marks: number; assessment_id: string | null; assignment_id: string | null }>,
  attRows: Array<{ status: string }>,
  weights: GradeWeights,
): CategoryBreakdown {
  // Assessment percentage
  const assessGraded = gbItems.filter(i => i.assessment_id && i.raw_score !== null);
  const assessMaxSum = assessGraded.reduce((s, i) => s + Number(i.total_marks), 0);
  const assessRawSum = assessGraded.reduce((s, i) => s + Number(i.raw_score ?? 0), 0);
  const assessmentPct = assessMaxSum > 0 ? (assessRawSum / assessMaxSum) * 100 : null;

  // Assignment percentage
  const assignGraded = gbItems.filter(i => i.assignment_id && i.raw_score !== null);
  const assignMaxSum = assignGraded.reduce((s, i) => s + Number(i.total_marks), 0);
  const assignRawSum = assignGraded.reduce((s, i) => s + Number(i.raw_score ?? 0), 0);
  const assignmentPct = assignMaxSum > 0 ? (assignRawSum / assignMaxSum) * 100 : null;

  // Attendance percentage (present + late count as attended)
  const attTotal = attRows.length;
  const attPresent = attRows.filter(a => a.status === 'present' || a.status === 'late').length;
  const attendancePct = attTotal > 0 ? (attPresent / attTotal) * 100 : null;

  // Covered weight = sum of weights for categories that have data
  const coveredWeightPct =
    (assessmentPct !== null ? weights.assessments_weight : 0) +
    (assignmentPct !== null ? weights.assignments_weight : 0) +
    (attendancePct !== null ? weights.attendance_weight : 0);

  let weightedScore = 0;
  if (coveredWeightPct > 0) {
    const rawTotal =
      (assessmentPct !== null ? (assessmentPct * weights.assessments_weight) / 100 : 0) +
      (assignmentPct !== null ? (assignmentPct * weights.assignments_weight) / 100 : 0) +
      (attendancePct !== null ? (attendancePct * weights.attendance_weight) / 100 : 0);
    // Normalize to covered weight so missing categories don't drag score down
    weightedScore = (rawTotal / coveredWeightPct) * 100;
  }

  return {
    assessmentPct: assessmentPct !== null ? r2(assessmentPct) : null,
    assignmentPct: assignmentPct !== null ? r2(assignmentPct) : null,
    attendancePct: attendancePct !== null ? r2(attendancePct) : null,
    weightedScore: r2(Math.min(100, weightedScore)),
    coveredWeightPct,
  };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

export async function fetchGradeWeights(
  supabase: SupabaseClient,
  offeringId: string,
): Promise<GradeWeights | null> {
  const { data } = await supabase
    .from('offering_grade_weights')
    .select('assessments_weight, assignments_weight, attendance_weight')
    .eq('offering_id', offeringId)
    .single();
  if (!data) return null;
  return {
    assessments_weight: Number(data.assessments_weight),
    assignments_weight: Number(data.assignments_weight),
    attendance_weight:  Number(data.attendance_weight),
  };
}

export async function saveGradeWeights(
  supabase: SupabaseClient,
  offeringId: string,
  weights: GradeWeights,
): Promise<string | null> {
  const { error } = await supabase
    .from('offering_grade_weights')
    .upsert(
      { offering_id: offeringId, ...weights, updated_at: new Date().toISOString() },
      { onConflict: 'offering_id' },
    );
  return error ? error.message : null;
}

// Recalculate every active enrollment's final_score / final_grade using weights.
// Fetches all gradebook items + attendance in two bulk queries for efficiency.
export async function recalculateAllWithWeights(
  supabase: SupabaseClient,
  offeringId: string,
  weights: GradeWeights,
): Promise<void> {
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('id, student_id')
    .eq('offering_id', offeringId)
    .eq('status', 'active');
  if (!enrollments?.length) return;

  const ids = enrollments.map(e => (e as any).id as string);

  const [{ data: allGb }, { data: allAtt }] = await Promise.all([
    supabase
      .from('gradebook_items')
      .select('enrollment_id, raw_score, total_marks, assessment_id, assignment_id')
      .in('enrollment_id', ids),
    supabase
      .from('attendance')
      .select('enrollment_id, status')
      .in('enrollment_id', ids),
  ]);

  for (const enr of enrollments) {
    const eid = (enr as any).id as string;
    const gbItems = ((allGb ?? []) as any[]).filter(g => g.enrollment_id === eid);
    const attRows = ((allAtt ?? []) as any[]).filter(a => a.enrollment_id === eid);
    const { weightedScore } = computeCategoryBreakdown(gbItems, attRows, weights);
    const finalScore = r2(weightedScore);
    const finalGrade = getLetterGrade(finalScore);
    await supabase
      .from('enrollments')
      .update({ final_score: finalScore, final_grade: finalGrade })
      .eq('id', eid);
  }
}
