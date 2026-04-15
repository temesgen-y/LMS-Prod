import { supabaseAdmin } from '../lib/supabase';
import { createError } from '../middleware/errorHandler';

const getLetterGrade = (scorePct: number): string => {
  if (scorePct >= 93) return 'A';
  if (scorePct >= 90) return 'A-';
  if (scorePct >= 87) return 'B+';
  if (scorePct >= 83) return 'B';
  if (scorePct >= 80) return 'B-';
  if (scorePct >= 77) return 'C+';
  if (scorePct >= 73) return 'C';
  if (scorePct >= 60) return 'D';
  return 'F';
};

export const upsertGradebookItem = async (
  enrollmentId: string,
  itemId: string,
  itemType: 'assessment' | 'assignment',
  rawScore: number,
  totalMarks: number,
  instructorId = '',
  isOverride = false,
  overrideNote = '',
): Promise<void> => {
  if (totalMarks <= 0) {
    throw createError('Invalid total marks — must be greater than 0', 400);
  }
  if (rawScore < 0 || rawScore > totalMarks) {
    throw createError(`Score ${rawScore} is out of range 0–${totalMarks}`, 400);
  }

  const payload: Record<string, unknown> = {
    enrollment_id: enrollmentId,
    assessment_id: itemType === 'assessment' ? itemId : null,
    assignment_id: itemType === 'assignment' ? itemId : null,
    raw_score: rawScore,
    total_marks: totalMarks,
    updated_at: new Date().toISOString(),
  };

  if (isOverride) {
    payload.is_overridden = true;
    payload.override_by = instructorId;
    payload.override_note = overrideNote;
  }

  const { error } = await supabaseAdmin.from('gradebook_items').upsert(payload, {
    onConflict:
      itemType === 'assessment' ? 'enrollment_id,assessment_id' : 'enrollment_id,assignment_id',
  });

  if (error) throw new Error(error.message);

  await recalculateFinalGrade(enrollmentId);
};

export const recalculateFinalGrade = async (enrollmentId: string): Promise<void> => {
  const { data: items, error } = await supabaseAdmin
    .from('gradebook_items')
    .select('raw_score, total_marks')
    .eq('enrollment_id', enrollmentId);

  if (error || !items || items.length === 0) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalScored = (items as any[]).reduce((sum, i) => sum + (i.raw_score ?? 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPossible = (items as any[]).reduce((sum, i) => sum + (i.total_marks ?? 0), 0);

  if (totalPossible === 0) return;

  const finalScore = Math.round((totalScored / totalPossible) * 100 * 100) / 100;
  const finalGrade = getLetterGrade(finalScore);

  await supabaseAdmin
    .from('enrollments')
    .update({
      final_score: finalScore,
      final_grade: finalGrade,
      updated_at: new Date().toISOString(),
    })
    .eq('id', enrollmentId);
};
