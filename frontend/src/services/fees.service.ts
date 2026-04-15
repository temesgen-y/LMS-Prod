import { api } from '@/lib/api';

export const recordPayment = async (
  feeAccountId: string,
  studentId: string,
  termId: string,
  amount: number,
  paymentMethod: string,
  referenceNo: string | null,
  paymentDate: string,
  notes: string | null,
) =>
  api.post('/fees/payment', {
    feeAccountId,
    studentId,
    termId,
    amount,
    paymentMethod,
    referenceNo,
    paymentDate,
    notes,
  });
