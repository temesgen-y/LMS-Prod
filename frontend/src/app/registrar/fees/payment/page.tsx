'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Payment {
  id: string;
  student_name: string;
  student_no: string;
  term_name: string;
  amount: number;
  payment_method: string;
  reference_no: string | null;
  payment_date: string;
  recorded_by_name: string;
  notes: string | null;
}

export default function PaymentsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { router.replace('/login'); return; }

        const { data, error: fetchErr } = await supabase
          .from('payments')
          .select(`
            id, amount, payment_method, reference_no, payment_date, notes,
            users!student_id(first_name, last_name, student_profiles!user_id(student_no)),
            academic_terms!term_id(term_name)
          `)
          .order('payment_date', { ascending: false });

        if (fetchErr) throw new Error(fetchErr.message);

        setPayments(((data ?? []) as any[]).map(p => ({
          id: p.id,
          student_name: p.users ? `${p.users.first_name || ''} ${p.users.last_name || ''}`.trim() : 'Unknown',
          student_no: p.users?.student_profiles?.student_no ?? '—',
          term_name: p.academic_terms?.term_name ?? '—',
          amount: p.amount,
          payment_method: p.payment_method,
          reference_no: p.reference_no,
          payment_date: p.payment_date,
          recorded_by_name: 'Staff',
          notes: p.notes,
        })));
      } catch (e: any) {
        setError(e.message ?? 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const filtered = payments.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.student_name.toLowerCase().includes(q) || p.student_no.toLowerCase().includes(q);
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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">All Payments</h1>
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
            <p className="text-sm">No payments recorded</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Student</th>
                  <th className="px-5 py-3 text-left font-medium">Term</th>
                  <th className="px-5 py-3 text-right font-medium">Amount (ETB)</th>
                  <th className="px-5 py-3 text-left font-medium">Method</th>
                  <th className="px-5 py-3 text-left font-medium">Reference</th>
                  <th className="px-5 py-3 text-left font-medium">Date</th>
                  <th className="px-5 py-3 text-left font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{p.student_name}</div>
                      <div className="text-xs text-gray-500">{p.student_no}</div>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{p.term_name}</td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">{p.amount.toLocaleString()}</td>
                    <td className="px-5 py-3 capitalize text-gray-600">{p.payment_method.replace('_', ' ')}</td>
                    <td className="px-5 py-3 text-gray-600 font-mono text-xs">{p.reference_no ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-500">{new Date(p.payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="px-5 py-3 text-gray-500 max-w-32 truncate">{p.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
