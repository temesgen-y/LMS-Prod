import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { chapaInitialize } from '@/lib/chapa';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { feeAccountId } = await req.json();
    if (!feeAccountId) return NextResponse.json({ error: 'feeAccountId required' }, { status: 400 });

    const admin = createAdminClient();

    // Verify fee account belongs to the authenticated user and load its data
    const { data: currentUser } = await admin
      .from('users')
      .select('id, first_name, last_name, auth_user_id')
      .eq('auth_user_id', authUser.id)
      .single();

    if (!currentUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { data: account, error: accErr } = await admin
      .from('student_fee_accounts')
      .select('id, student_id, term_id, balance, status')
      .eq('id', feeAccountId)
      .eq('student_id', (currentUser as any).id)
      .single();

    if (accErr || !account) return NextResponse.json({ error: 'Fee account not found' }, { status: 404 });

    const acc = account as any;
    if (acc.balance <= 0 || acc.status === 'paid' || acc.status === 'waived') {
      return NextResponse.json({ error: 'No outstanding balance' }, { status: 400 });
    }

    // Get student email from Supabase Auth
    const { data: authData } = await admin.auth.admin.getUserById(authUser.id);
    const email = authData?.user?.email ?? authUser.email ?? '';

    const cu = currentUser as any;
    // tx_ref must be ≤ 50 chars: "lms-" + 8 UUID chars + "-" + 10 timestamp digits = 23 chars
    const shortId  = feeAccountId.replace(/-/g, '').substring(0, 8);
    const shortTs  = Date.now().toString().slice(-10);
    const txRef    = `lms-${shortId}-${shortTs}`;
    const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';

    const chapaRes = await chapaInitialize({
      amount: acc.balance.toString(),
      currency: 'ETB',
      email,
      first_name: cu.first_name ?? 'Student',
      last_name:  cu.last_name  ?? '',
      tx_ref: txRef,
      callback_url: `${appUrl}/api/payments/chapa/webhook`,
      return_url: `${appUrl}/dashboard/fees/payment-success?tx_ref=${encodeURIComponent(txRef)}`,
      'customization[title]': 'University Fee Payment',
      'customization[description]': 'Tuition and fee payment',
    });

    if (chapaRes.status !== 'success') {
      return NextResponse.json({ error: chapaRes.message }, { status: 502 });
    }

    // Insert a pending payment record
    await admin.from('payments').insert({
      student_id: acc.student_id,
      term_id: acc.term_id,
      fee_account_id: feeAccountId,
      amount: acc.balance,
      payment_method: 'online',
      chapa_tx_ref: txRef,
      chapa_status: 'pending',
      recorded_by: acc.student_id,
      payment_date: new Date().toISOString().split('T')[0],
      notes: 'Chapa online payment — pending',
    });

    return NextResponse.json({ checkout_url: chapaRes.data.checkout_url });
  } catch (e: any) {
    console.error('[chapa/initialize]', e);
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 });
  }
}
