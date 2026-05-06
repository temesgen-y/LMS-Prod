'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type FeeAccount = {
  id          : string;
  totalAmount : number;
  paidAmount  : number;
  balance     : number;
  status      : string;
  dueDate     : string | null;
  termName    : string;
  yearStart   : number | null;
  isCurrent   : boolean;
};

async function initChapaPayment(feeAccountId: string): Promise<string> {
  const res = await fetch('/api/payments/chapa/initialize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feeAccountId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Payment initialization failed');
  return data.checkout_url;
}

type Payment = {
  id            : string;
  amount        : number;
  paymentMethod : string;
  referenceNo   : string | null;
  paymentDate   : string | null;
  notes         : string | null;
  termName      : string;
};

function feeStatusBadge(status: string): string {
  const map: Record<string, string> = {
    paid    : 'bg-green-100 text-green-800',
    unpaid  : 'bg-red-100 text-red-800',
    partial : 'bg-yellow-100 text-yellow-800',
    waived  : 'bg-blue-100 text-blue-800',
    overdue : 'bg-red-200 text-red-900',
  };
  return map[status] ?? 'bg-gray-100 text-gray-600';
}

function paymentMethodLabel(method: string): string {
  const map: Record<string, string> = {
    bank_transfer : '🏦 Bank Transfer',
    cash          : '💵 Cash',
    online        : '💳 Online',
    scholarship   : '🎓 Scholarship',
    waiver        : '✋ Waiver',
    other         : '📋 Other',
  };
  return map[method] ?? method;
}

function progressBarColor(pct: number): string {
  if (pct >= 100) return 'bg-green-500';
  if (pct >= 50)  return 'bg-blue-500';
  return 'bg-amber-500';
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function FeeAccountPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<FeeAccount[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [allTermsOpen, setAllTermsOpen] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState('');

  const handleChapaPay = async (accountId: string) => {
    setPayLoading(true);
    setPayError('');
    try {
      const checkoutUrl = await initChapaPayment(accountId);
      window.location.href = checkoutUrl;
    } catch (e: any) {
      setPayError(e.message ?? 'Could not start payment');
      setPayLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { setError('Not authenticated'); setLoading(false); return; }

        const { data: currentUser } = await supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', authUser.id)
          .single();
        if (!currentUser) { setError('User not found'); setLoading(false); return; }

        const uid = (currentUser as any).id;

        const [{ data: accData }, { data: payData }] = await Promise.all([
          supabase
            .from('student_fee_accounts')
            .select('id, total_amount, paid_amount, balance, status, due_date, academic_terms(id, term_name, year_start, is_current)')
            .eq('student_id', uid)
            .order('created_at', { ascending: false }),
          supabase
            .from('payments')
            .select('id, amount, payment_method, reference_no, payment_date, notes, academic_terms(term_name, year_start)')
            .eq('student_id', uid)
            .order('payment_date', { ascending: false }),
        ]);

        setAccounts(
          ((accData ?? []) as any[]).map(a => ({
            id          : a.id,
            totalAmount : a.total_amount ?? 0,
            paidAmount  : a.paid_amount  ?? 0,
            balance     : a.balance      ?? 0,
            status      : a.status       ?? 'unpaid',
            dueDate     : a.due_date     ?? null,
            termName    : a.academic_terms?.term_name ?? '—',
            yearStart   : a.academic_terms?.year_start ?? null,
            isCurrent   : a.academic_terms?.is_current ?? false,
          }))
        );

        setPayments(
          ((payData ?? []) as any[]).map(p => ({
            id            : p.id,
            amount        : p.amount        ?? 0,
            paymentMethod : p.payment_method ?? 'other',
            referenceNo   : p.reference_no   ?? null,
            paymentDate   : p.payment_date   ?? null,
            notes         : p.notes          ?? null,
            termName      : p.academic_terms?.term_name ?? '—',
          }))
        );
      } catch (e: any) {
        setError(e.message ?? 'Failed to load fee account');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-48" />
          <div className="h-40 bg-gray-200 rounded-xl" />
          <div className="h-48 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      </div>
    );
  }

  const currentAccount = accounts.find(a => a.isCurrent) ?? accounts[0];
  const isOverdue = currentAccount &&
    (currentAccount.status === 'overdue' ||
     (currentAccount.balance > 0 && currentAccount.dueDate && new Date(currentAccount.dueDate) < new Date()));

  const paidPct = currentAccount && currentAccount.totalAmount > 0
    ? Math.min(100, Math.round((currentAccount.paidAmount / currentAccount.totalAmount) * 100))
    : 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Breadcrumb + Print */}
        <div className="flex items-center justify-between no-print">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-purple-700">Home</Link>
            <span>›</span>
            <Link href="/dashboard/profile" className="hover:text-purple-700">My Profile</Link>
            <span>›</span>
            <span className="text-gray-900 font-medium">Fee Account</span>
          </nav>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#4c1d95] text-white text-sm font-medium rounded-lg hover:bg-[#5b21b6] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            Print Statement
          </button>
        </div>

        <h1 className="text-2xl font-bold text-gray-900">Fee Account</h1>

        {/* Overdue Banner */}
        {isOverdue && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
            ⚠️ Your fee payment is overdue. Please contact the Registrar Office to arrange payment immediately.
          </div>
        )}

        {/* Current Term Fee Card */}
        {currentAccount ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-gray-900">Current Semester Fee Status</h2>
                <p className="text-sm text-gray-500 mt-0.5">{currentAccount.termName}{currentAccount.yearStart ? ` ${currentAccount.yearStart}` : ''}</p>
              </div>
              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium uppercase ${feeStatusBadge(currentAccount.status)}`}>
                {currentAccount.status}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
              {[
                { label: 'Total Fee', value: `ETB ${currentAccount.totalAmount.toLocaleString()}` },
                { label: 'Paid',     value: `ETB ${currentAccount.paidAmount.toLocaleString()}`,  color: 'text-green-700' },
                { label: 'Balance',  value: `ETB ${currentAccount.balance.toLocaleString()}`,     color: currentAccount.balance > 0 ? 'text-red-700' : 'text-gray-900' },
              ].map(s => (
                <div key={s.label}>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className={`text-lg font-bold mt-0.5 ${s.color ?? 'text-gray-900'}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 mb-2">
              <div className="flex-1 bg-gray-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-2.5 rounded-full transition-all ${progressBarColor(paidPct)}`}
                  style={{ width: `${paidPct}%` }}
                />
              </div>
              <span className="text-xs font-medium text-gray-600 w-12 text-right">{paidPct}% paid</span>
            </div>

            {currentAccount.dueDate && (
              <p className="text-xs text-gray-500 mt-2">Due: {fmtDate(currentAccount.dueDate)}</p>
            )}

            {/* Pay with Chapa button */}
            {currentAccount.balance > 0 && currentAccount.status !== 'paid' && currentAccount.status !== 'waived' && (
              <div className="mt-4 pt-4 border-t border-gray-100 no-print">
                {payError && (
                  <p className="text-xs text-red-600 mb-2">{payError}</p>
                )}
                <button
                  type="button"
                  onClick={() => handleChapaPay(currentAccount.id)}
                  disabled={payLoading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0ea5e9] hover:bg-[#0284c7] disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  {payLoading ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      Redirecting to Chapa…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                      Pay ETB {currentAccount.balance.toLocaleString()} with Chapa
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center space-y-2">
            <p className="text-gray-500 font-medium">No fee account assigned yet</p>
            <p className="text-sm text-gray-400">Your fee account will appear here once the Registrar Office assigns it. Please contact the Registrar if you believe this is an error.</p>
          </div>
        )}

        {/* Payment History */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Payment History</h2>
          </div>
          {payments.length === 0 ? (
            <p className="p-6 text-sm text-gray-400 text-center">No payment records found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left">Date</th>
                    <th className="px-6 py-3 text-left">Amount</th>
                    <th className="px-6 py-3 text-left">Method</th>
                    <th className="px-6 py-3 text-left">Reference</th>
                    <th className="px-6 py-3 text-left">Term</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-700">{fmtDate(p.paymentDate)}</td>
                      <td className="px-6 py-3 font-medium text-gray-900">ETB {p.amount.toLocaleString()}</td>
                      <td className="px-6 py-3 text-gray-600">{paymentMethodLabel(p.paymentMethod)}</td>
                      <td className="px-6 py-3 font-mono text-xs text-gray-500">{p.referenceNo ?? '—'}</td>
                      <td className="px-6 py-3 text-gray-500">{p.termName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* All Terms Summary (collapsible) */}
        {accounts.length > 1 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setAllTermsOpen(v => !v)}
              className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50"
            >
              <span className="font-semibold text-gray-900">All Terms Fee Summary</span>
              <svg className={`w-5 h-5 text-gray-400 transition-transform ${allTermsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {allTermsOpen && (
              <div className="overflow-x-auto border-t border-gray-100">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-6 py-3 text-left">Term</th>
                      <th className="px-6 py-3 text-right">Total</th>
                      <th className="px-6 py-3 text-right">Paid</th>
                      <th className="px-6 py-3 text-right">Balance</th>
                      <th className="px-6 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {accounts.map(a => (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-700">{a.termName}</td>
                        <td className="px-6 py-3 text-right text-gray-900">ETB {a.totalAmount.toLocaleString()}</td>
                        <td className="px-6 py-3 text-right text-green-700">ETB {a.paidAmount.toLocaleString()}</td>
                        <td className="px-6 py-3 text-right text-gray-900">ETB {a.balance.toLocaleString()}</td>
                        <td className="px-6 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${feeStatusBadge(a.status)}`}>
                            {a.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Contact info box */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-600 space-y-1 no-print">
          <p className="font-semibold text-gray-800">For payment or fee inquiries:</p>
          <p>Visit the Registrar Office or contact your academic advisor.</p>
        </div>

      </div>
    </div>
  );
}
