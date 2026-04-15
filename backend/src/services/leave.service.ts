import { supabaseAdmin } from '../lib/supabase';
import { createError } from '../middleware/errorHandler';

export const approveLeave = async (
  requestId: string,
  deptHeadId: string,
  reviewNote: string,
): Promise<void> => {
  const { data: request } = await supabaseAdmin
    .from('leave_requests')
    .select('requester_id, leave_type, total_days, start_date, end_date')
    .eq('id', requestId)
    .single();

  if (!request) {
    throw createError('Leave request not found', 404);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req = request as any;

  await supabaseAdmin
    .from('leave_requests')
    .update({
      status: 'approved',
      reviewed_by: deptHeadId,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  // Determine academic year (matching frontend format: "2025-2026")
  const now = new Date();
  const year = now.getFullYear();
  const academicYear = `${year}-${year + 1}`;

  const { data: balance } = await supabaseAdmin
    .from('leave_balances')
    .select('id, used_days, remaining_days')
    .eq('user_id', req.requester_id)
    .eq('leave_type', req.leave_type)
    .eq('academic_year', academicYear)
    .maybeSingle();

  if (balance) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = balance as any;
    await supabaseAdmin
      .from('leave_balances')
      .update({
        used_days: b.used_days + req.total_days,
        remaining_days: Math.max(0, b.remaining_days - req.total_days),
        updated_at: new Date().toISOString(),
      })
      .eq('id', b.id);
  }

  await supabaseAdmin.from('notifications').insert({
    user_id: req.requester_id,
    title: 'Leave Request Approved',
    body:
      `Your ${req.leave_type} leave request has been approved.` +
      (reviewNote ? ` Note: ${reviewNote}` : ''),
    type: 'leave',
  });
};

export const rejectLeave = async (
  requestId: string,
  deptHeadId: string,
  reason: string,
): Promise<void> => {
  if (!reason.trim() || reason.length < 5) {
    throw createError('Rejection reason required (min 5 characters)', 400, 'REASON_TOO_SHORT');
  }

  const { data: request } = await supabaseAdmin
    .from('leave_requests')
    .select('requester_id, leave_type, start_date, end_date')
    .eq('id', requestId)
    .single();

  if (!request) {
    throw createError('Leave request not found', 404);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req = request as any;

  await supabaseAdmin
    .from('leave_requests')
    .update({
      status: 'rejected',
      reviewed_by: deptHeadId,
      reviewed_at: new Date().toISOString(),
      review_note: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  await supabaseAdmin.from('notifications').insert({
    user_id: req.requester_id,
    title: 'Leave Request Rejected',
    body: `Your ${req.leave_type} leave request was rejected. Reason: ${reason}`,
    type: 'leave',
  });
};
