'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { recordPayment } from '@/services/fees.service';

interface FeeAccount {
  id: string;
  student_id: string;
  student_name: string;
  student_no: string;
  term_name: string;
  term_id: string;
  total_amount: number;
  paid_amount: number;
  balance: number;
  status: string;
  due_date: string | null;
}

interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  reference_no: string | null;
  payment_date: string;
  notes: string | null;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    paid: 'bg-green-100 text-green-800',
    unpaid: 'bg-red-100 text-red-800',
    partial: 'bg-yellow-100 text-yellow-800',
    waived: 'bg-blue-100 text-blue-800',
    overdue: 'bg-orange-100 text-orange-800',
  };
  return map[status] ?? 'bg-gray-100 text-gray-600';
}

export default function FeesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [accounts, setAccounts] = useState<FeeAccount[]>([]);
  const [search, setSearch] = useState('');
  const [paymentModal, setPaymentModal] = useState<FeeAccount | null>(null);
  const [statementsModal, setStatementsModal] = useState<FeeAccount | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_method: 'cash', reference_no: '', notes: '' });
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.replace('/login'); return; }
      const { data: currentUser } = await supabase.from('users').select('id').eq('auth_user_id', authUser.id).single();
      if (!currentUser) return;
      setCurrentUserId((currentUser as any).id);

      const { data, error: fetchErr } = await supabase
        .from('student_fee_accounts')
        .select(`
          id, student_id, total_amount, paid_amount, balance, status, due_date,
          users!student_id(first_name, last_name, student_profiles!user_id(student_no)),
          academic_terms!term_id(id, term_name)
        `)
        .order('created_at', { ascending: false });

      if (fetchErr) throw new Error(fetchErr.message);

      setAccounts(((data ?? []) as any[]).map(a => ({
        id: a.id,
        student_id: a.student_id,
        student_name: a.users ? `${a.users.first_name || ''} ${a.users.last_name || ''}`.trim() : 'Unknown',
        student_no: a.users?.student_profiles?.student_no ?? '—',
        term_name: a.academic_terms?.term_name ?? '—',
        term_id: a.academic_terms?.id ?? '',
        total_amount: a.total_amount,
        paid_amount: a.paid_amount,
        balance: a.balance,
        status: a.status,
        due_date: a.due_date,
      })));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadPayments = async (account: FeeAccount) => {
    const supabase = createClient();
    const { data } = await supabase.from('payments')
      .select('id, amount, payment_method, reference_no, payment_date, notes')
      .eq('student_id', account.student_id)
      .eq('term_id', account.term_id)
      .order('payment_date', { ascending: false });
    setPayments((data ?? []) as Payment[]);
    setStatementsModal(account);
  };

  const handleRecordPayment = async () => {
    if (!paymentModal || !paymentForm.amount) return;
    const amount = parseFloat(paymentForm.amount);
    if (isNaN(amount) || amount <= 0) { setPaymentError('Enter a valid amount.'); return; }
    setPaymentLoading(true);
    setPaymentError('');
    try {
      await recordPayment(
        paymentModal.id,
        paymentModal.student_id,
        paymentModal.term_id,
        amount,
        paymentForm.payment_method,
        paymentForm.reference_no || null,
        new Date().toISOString().split('T')[0],
        paymentForm.notes || null,
      );
      setPaymentModal(null);
      setPaymentForm({ amount: '', payment_method: 'cash', reference_no: '', notes: '' });
      loadData();
    } catch (e: any) {
      setPaymentError(e.message ?? 'Payment failed');
    } finally {
      setPaymentLoading(false);
    }
  };

  const filtered = accounts.filter(a => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return a.student_name.toLowerCase().includes(q) || a.student_no.toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Student Fee Accounts</h1>
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>}

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by student name or number..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-80 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-sm">No fee accounts found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Student</th>
                  <th className="px-5 py-3 text-left font-medium">Term</th>
                  <th className="px-5 py-3 text-right font-medium">Total (ETB)</th>
                  <th className="px-5 py-3 text-right font-medium">Paid (ETB)</th>
                  <th className="px-5 py-3 text-right font-medium">Balance (ETB)</th>
                  <th className="px-5 py-3 text-left font-medium">Due Date</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{a.student_name}</div>
                      <div className="text-xs text-gray-500">{a.student_no}</div>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{a.term_name}</td>
                    <td className="px-5 py-3 text-right text-gray-900">{a.total_amount.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-green-700">{a.paid_amount.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right font-medium text-red-700">{a.balance.toLocaleString()}</td>
                    <td className="px-5 py-3 text-gray-500">{a.due_date ? new Date(a.due_date).toLocaleDateString() : '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(a.status)}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => { setPaymentModal(a); setPaymentError(''); setPaymentForm({ amount: '', payment_method: 'cash', reference_no: '', notes: '' }); }} className="text-xs px-2 py-1 rounded bg-purple-100 hover:bg-purple-200 text-purple-700">
                          Record Payment
                        </button>
                        <button type="button" onClick={() => loadPayments(a)} className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">
                          Statement
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      {paymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Record Payment</h2>
              <button type="button" onClick={() => setPaymentModal(null)} className="p-2 rounded hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-700">
                Student: <strong>{paymentModal.student_name}</strong> | Balance: <strong className="text-red-700">ETB {paymentModal.balance.toLocaleString()}</strong>
              </p>
              {paymentError && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{paymentError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (ETB) *</label>
                <input type="number" min="1" value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method *</label>
                <select value={paymentForm.payment_method} onChange={e => setPaymentForm(p => ({ ...p, payment_method: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  {['cash', 'bank_transfer', 'online', 'scholarship', 'waiver', 'other'].map(m => (
                    <option key={m} value={m} className="capitalize">{m.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference No</label>
                <input type="text" value={paymentForm.reference_no} onChange={e => setPaymentForm(p => ({ ...p, reference_no: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input type="text" value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={handleRecordPayment} disabled={paymentLoading} className="flex-1 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {paymentLoading ? 'Processing...' : 'Record Payment'}
                </button>
                <button type="button" onClick={() => setPaymentModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Statement Modal */}
      {statementsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Fee Statement</h2>
              <button type="button" onClick={() => setStatementsModal(null)} className="p-2 rounded hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 text-sm grid grid-cols-2 gap-2">
                <div><span className="text-gray-500">Student:</span> <strong>{statementsModal.student_name}</strong></div>
                <div><span className="text-gray-500">Term:</span> {statementsModal.term_name}</div>
                <div><span className="text-gray-500">Total:</span> ETB {statementsModal.total_amount.toLocaleString()}</div>
                <div><span className="text-gray-500">Paid:</span> ETB {statementsModal.paid_amount.toLocaleString()}</div>
                <div><span className="text-gray-500">Balance:</span> <strong className="text-red-700">ETB {statementsModal.balance.toLocaleString()}</strong></div>
                <div><span className="text-gray-500">Status:</span>
                  <span className={`ml-1 inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(statementsModal.status)}`}>
                    {statementsModal.status}
                  </span>
                </div>
              </div>
              <h3 className="font-semibold text-gray-900">Payment History</h3>
              {payments.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No payments recorded</p>
              ) : (
                <div className="space-y-2">
                  {payments.map(p => (
                    <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 text-sm">
                      <div>
                        <p className="font-medium text-gray-900">ETB {p.amount.toLocaleString()}</p>
                        <p className="text-gray-500 capitalize">{p.payment_method.replace('_', ' ')} {p.reference_no && `· Ref: ${p.reference_no}`}</p>
                      </div>
                      <p className="text-gray-500">{new Date(p.payment_date).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
