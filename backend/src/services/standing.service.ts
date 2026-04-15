import { supabaseAdmin } from '../lib/supabase';

export const recordAcademicStanding = async (
  studentId: string,
  termId: string,
  gpa: number,
  cumulativeGpa: number,
  standing: string,
  creditsEarned: number,
  creditsAttempted: number,
  notes: string | null,
  recordedBy: string,
): Promise<void> => {
  await supabaseAdmin
    .from('academic_standing')
    .upsert(
      {
        student_id: studentId,
        term_id: termId,
        gpa,
        cumulative_gpa: cumulativeGpa,
        standing,
        credits_earned: creditsEarned,
        credits_attempted: creditsAttempted,
        notes,
        recorded_by: recordedBy,
      },
      { onConflict: 'student_id,term_id' },
    );

  // Notify student for adverse standings
  const messages: Record<string, string> = {
    warning: 'Your academic standing is Warning. Please contact your academic advisor.',
    probation: 'You are on academic probation. Contact your advisor immediately.',
    suspension: 'Your enrollment has been suspended. Contact the registrar office.',
  };

  if (messages[standing]) {
    await supabaseAdmin.from('notifications').insert({
      user_id: studentId,
      title: 'Academic Standing Updated',
      body: messages[standing],
      type: 'announcement',
    });
  }
};
