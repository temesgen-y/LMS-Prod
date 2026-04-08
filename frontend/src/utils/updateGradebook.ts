import { SupabaseClient } from '@supabase/supabase-js';
import { getLetterGrade } from './gradeCalculator';

// ─────────────────────────────────────────────────────────────────────────────
// upsertGradebookItem
//
// Called after EVERY grading action.
// No weight_pct — just raw_score and total_marks per item.
// final_score = SUM(raw_scores) / SUM(total_marks) * 100
// ─────────────────────────────────────────────────────────────────────────────
export const upsertGradebookItem = async (
  supabase     : SupabaseClient,
  enrollmentId : string,
  itemId       : string,
  itemType     : 'assessment' | 'assignment',
  rawScore     : number,
  totalMarks   : number,
  instructorId : string = '',
  isOverride   : boolean = false,
  overrideNote : string  = '',
): Promise<void> => {
  if (totalMarks <= 0) {
    console.error('upsertGradebookItem: totalMarks must be > 0');
    throw new Error('Invalid total marks');
  }
  if (rawScore < 0 || rawScore > totalMarks) {
    throw new Error(`Score ${rawScore} is out of range 0–${totalMarks}`);
  }

  const payload: Record<string, unknown> = {
    enrollment_id : enrollmentId,
    assessment_id : itemType === 'assessment' ? itemId : null,
    assignment_id : itemType === 'assignment'  ? itemId : null,
    raw_score     : rawScore,
    total_marks   : totalMarks,
    updated_at    : new Date().toISOString(),
  };

  if (isOverride) {
    payload.is_overridden = true;
    payload.override_by   = instructorId;
    payload.override_note = overrideNote;
  }

  const { error } = await supabase
    .from('gradebook_items')
    .upsert(payload, {
      onConflict: itemType === 'assessment'
        ? 'enrollment_id,assessment_id'
        : 'enrollment_id,assignment_id',
    });

  if (error) {
    console.error('upsertGradebookItem error:', error);
    throw new Error(error.message);
  }

  await recalculateFinalGrade(supabase, enrollmentId);
};

// Backward-compatible alias used by older call sites
export const updateGradebookItem = async (
  supabase     : SupabaseClient,
  enrollmentId : string,
  _studentId   : string,   // kept for call-site compatibility, unused
  itemId       : string,
  itemType     : 'assessment' | 'assignment',
  rawScore     : number,
  totalMarks   : number,
  _weightPct   : number,   // kept for call-site compatibility, unused
): Promise<void> => {
  await upsertGradebookItem(supabase, enrollmentId, itemId, itemType, rawScore, totalMarks);
};

// ─────────────────────────────────────────────────────────────────────────────
// recalculateFinalGrade
// final_score = SUM(raw_score) / SUM(total_marks) * 100
// letter grade from that percentage
// updates enrollments.final_score and final_grade
// ─────────────────────────────────────────────────────────────────────────────
export const recalculateFinalGrade = async (
  supabase     : SupabaseClient,
  enrollmentId : string,
): Promise<void> => {
  const { data: items, error } = await supabase
    .from('gradebook_items')
    .select('raw_score, total_marks')
    .eq('enrollment_id', enrollmentId);

  if (error || !items || items.length === 0) return;

  const totalScored   = items.reduce((sum, i) => sum + (i.raw_score   ?? 0), 0);
  const totalPossible = items.reduce((sum, i) => sum + (i.total_marks ?? 0), 0);

  if (totalPossible === 0) return;

  const finalScore = Math.round((totalScored / totalPossible) * 100 * 100) / 100;
  const finalGrade = getLetterGrade(finalScore);

  const { error: updateError } = await supabase
    .from('enrollments')
    .update({
      final_score : finalScore,
      final_grade : finalGrade,
      updated_at  : new Date().toISOString(),
    })
    .eq('id', enrollmentId);

  if (updateError) {
    console.error('recalculateFinalGrade error:', updateError);
    throw new Error(updateError.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getEnrollmentGradebook
// fetches full grade breakdown for one enrollment
// ─────────────────────────────────────────────────────────────────────────────
export const getEnrollmentGradebook = async (
  supabase     : SupabaseClient,
  enrollmentId : string,
) => {
  const { data, error } = await supabase
    .from('gradebook_items')
    .select(`
      id,
      assessment_id,
      assignment_id,
      raw_score,
      total_marks,
      is_overridden,
      override_note,
      recorded_at,
      updated_at,
      assessments (
        id, title, type, total_marks
      ),
      assignments (
        id, title, max_score
      )
    `)
    .eq('enrollment_id', enrollmentId)
    .order('recorded_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
};
