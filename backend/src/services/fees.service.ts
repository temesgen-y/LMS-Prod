import { supabaseAdmin } from '../lib/supabase';
import { createError } from '../middleware/errorHandler';

export const recordPayment = async (
  studentId: string,
  termId: string,
  feeAccountId: string,
  amount: number,
  paymentMethod: string,
  referenceNo: string | null,
  paymentDate: string,
  notes: string | null,
  recordedById: string,
): Promise<{ newBalance: number; newStatus: string }> => {
  const { data: account } = await supabaseAdmin
    .from('student_fee_accounts')
    .select('total_amount, paid_amount')
    .eq('id', feeAccountId)
    .single();

  if (!account) {
    throw createError('Fee account not found', 404);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acc = account as any;

  await supabaseAdmin.from('payments').insert({
    student_id: studentId,
    term_id: termId,
    amount,
    payment_method: paymentMethod,
    reference_no: referenceNo,
    recorded_by: recordedById,
    payment_date: paymentDate,
    notes,
  });

  const newPaid = acc.paid_amount + amount;
  const newBalance = Math.max(0, acc.total_amount - newPaid);
  const newStatus = newBalance <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

  await supabaseAdmin
    .from('student_fee_accounts')
    .update({
      paid_amount: newPaid,
      balance: newBalance,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', feeAccountId);

  return { newBalance, newStatus };
};
