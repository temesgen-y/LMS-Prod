import { supabaseAdmin } from '../lib/supabase';
import { createError } from '../middleware/errorHandler';
import type { PrereqCheckResult } from '../types';

export const approveRegistration = async (
  requestId: string,
  studentId: string,
  offeringId: string,
  registrarId: string,
  isOverride: boolean,
  overrideReason: string,
): Promise<void> => {
  // Check not already enrolled
  const { data: existing } = await supabaseAdmin
    .from('enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('offering_id', offeringId)
    .maybeSingle();

  if (existing) {
    throw createError('Student is already enrolled', 409, 'ALREADY_ENROLLED');
  }

  // Create enrollment
  const { error: enrollErr } = await supabaseAdmin
    .from('enrollments')
    .upsert(
      {
        student_id: studentId,
        offering_id: offeringId,
        status: 'active',
        enrollment_date: new Date().toISOString().split('T')[0],
      },
      { onConflict: 'student_id,offering_id' },
    );

  if (enrollErr) throw enrollErr;

  // Update request
  await supabaseAdmin
    .from('registration_requests')
    .update({
      status: 'approved',
      reviewed_by: registrarId,
      reviewed_at: new Date().toISOString(),
      prereq_override: isOverride,
      override_reason: isOverride ? overrideReason : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  // Notify student
  await supabaseAdmin.from('notifications').insert({
    user_id: studentId,
    title: 'Registration Approved',
    body: 'Your course registration has been approved.',
    type: 'registration',
  });
};

export const rejectRegistration = async (
  requestId: string,
  studentId: string,
  registrarId: string,
  reason: string,
  courseCode?: string,
): Promise<void> => {
  if (!reason.trim() || reason.length < 3) {
    throw createError('Rejection reason required', 400, 'REASON_REQUIRED');
  }

  await supabaseAdmin
    .from('registration_requests')
    .update({
      status: 'rejected',
      reviewed_by: registrarId,
      reviewed_at: new Date().toISOString(),
      rejection_note: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  await supabaseAdmin.from('notifications').insert({
    user_id: studentId,
    title: 'Registration Rejected',
    body: `Your registration${courseCode ? ` for ${courseCode}` : ''} was rejected. Reason: ${reason}`,
    type: 'registration',
  });
};

export const checkPrerequisites = async (
  studentId: string,
  offeringId: string,
): Promise<PrereqCheckResult> => {
  const { data, error } = await supabaseAdmin.rpc('check_student_prerequisites', {
    p_student_id: studentId,
    p_offering_id: offeringId,
  });

  if (error || !data) {
    return { allMet: true, allHardMet: true, results: [], hasPrereqs: false };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = data as any[];
  const allMet = results.every((r) => r.is_met);
  const allHardMet = results.filter((r) => r.prereq_type === 'hard').every((r) => r.is_met);

  return { allMet, allHardMet, results, hasPrereqs: results.length > 0 };
};

export const approveDropRequest = async (
  requestId: string,
  studentId: string,
  offeringId: string,
  registrarId: string,
): Promise<void> => {
  await supabaseAdmin
    .from('enrollments')
    .update({ status: 'dropped', updated_at: new Date().toISOString() })
    .eq('student_id', studentId)
    .eq('offering_id', offeringId);

  await supabaseAdmin
    .from('registration_requests')
    .update({
      status: 'approved',
      reviewed_by: registrarId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  await supabaseAdmin.from('notifications').insert({
    user_id: studentId,
    title: 'Drop Request Approved',
    body: 'Your course drop request has been approved.',
    type: 'registration',
  });
};
