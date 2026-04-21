import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { chapaVerify } from '@/lib/chapa';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const txRef = req.nextUrl.searchParams.get('tx_ref');
    if (!txRef) return NextResponse.json({ error: 'tx_ref required' }, { status: 400 });

    const admin = createAdminClient();

    // Fetch existing payment record
    const { data: payment, error: payErr } = await admin
      .from('payments')
      .select('id, student_id, fee_account_id, amount, chapa_status')
      .eq('chapa_tx_ref', txRef)
      .single();

    if (payErr || !payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const p = payment as any;

    // Verify ownership
    const { data: currentUser } = await admin
      .from('users')
      .select('id')
      .eq('auth_user_id', authUser.id)
      .single();

    if (!currentUser || p.student_id !== (currentUser as any).id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // If already confirmed, skip re-verification
    if (p.chapa_status === 'success') {
      return NextResponse.json({ status: 'success', amount: p.amount });
    }

    // Verify with Chapa
    const chapaRes = await chapaVerify(txRef);
    const chapaStatus = chapaRes.data?.status === 'success' ? 'success' : 'failed';

    // Update payment record
    await admin.from('payments').update({
      chapa_status: chapaStatus,
      notes: chapaStatus === 'success' ? 'Chapa online payment — confirmed' : 'Chapa online payment — failed',
      reference_no: chapaRes.data?.reference ?? null,
    }).eq('chapa_tx_ref', txRef);

    // If successful, update the fee account
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
        const newStatus = newBalance <= 0 ? 'paid' : 'partial';

        await admin.from('student_fee_accounts').update({
          paid_amount: newPaid,
          balance: newBalance,
          status: newStatus,
        }).eq('id', p.fee_account_id);
      }
    }

    return NextResponse.json({ status: chapaStatus, amount: p.amount });
  } catch (e: any) {
    console.error('[chapa/verify]', e);
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 });
  }
}
