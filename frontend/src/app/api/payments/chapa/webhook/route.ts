import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { chapaVerify } from '@/lib/chapa';

// Chapa sends a POST to this URL when a transaction completes.
// We verify the transaction server-side before trusting it.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const txRef: string | undefined = body.tx_ref ?? body.trx_ref;

    if (!txRef) return NextResponse.json({ received: true });

    const admin = createAdminClient();

    const { data: payment } = await admin
      .from('payments')
      .select('id, fee_account_id, amount, chapa_status')
      .eq('chapa_tx_ref', txRef)
      .single();

    if (!payment || (payment as any).chapa_status === 'success') {
      return NextResponse.json({ received: true });
    }

    const chapaRes = await chapaVerify(txRef);
    const chapaStatus = chapaRes.data?.status === 'success' ? 'success' : 'failed';
    const p = payment as any;

    await admin.from('payments').update({
      chapa_status: chapaStatus,
      notes: chapaStatus === 'success' ? 'Chapa online payment — confirmed' : 'Chapa online payment — failed',
      reference_no: chapaRes.data?.reference ?? null,
    }).eq('chapa_tx_ref', txRef);

    if (chapaStatus === 'success' && p.fee_account_id) {
      const { data: acc } = await admin
        .from('student_fee_accounts')
        .select('total_amount, paid_amount, balance')
        .eq('id', p.fee_account_id)
        .single();

      if (acc) {
        const a = acc as any;
        const newPaid = a.paid_amount + p.amount;
        const newBalance = Math.max(0, a.total_amount - newPaid);
        await admin.from('student_fee_accounts').update({
          paid_amount: newPaid,
          balance: newBalance,
          status: newBalance <= 0 ? 'paid' : 'partial',
        }).eq('id', p.fee_account_id);
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error('[chapa/webhook]', e);
    return NextResponse.json({ received: true });
  }
}
