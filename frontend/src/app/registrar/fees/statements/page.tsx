'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface FeeStatement {
  id: string;
  student_id: string;
  student_name: string;
  student_no: string;
  term_name: string;
  total_amount: number;
  paid_amount: number;
  balance: number;
  status: string;
  due_date: string | null;
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

export default function FeeStatementsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statements, setStatements] = useState<FeeStatement[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { router.replace('/login'); return; }

        const { data, error: fetchErr } = await supabase
          .from('student_fee_accounts')
          .select(`
            id, student_id, total_amount, paid_amount, balance, status, due_date,
            users!student_id(first_name, last_name, student_profiles!user_id(student_no)),
            academic_terms!term_id(term_name)
          `)
          .order('created_at', { ascending: false });

        if (fetchErr) throw new Error(fetchErr.message);

        setStatements(((data ?? []) as any[]).map(a => ({
          id: a.id,
          student_id: a.student_id,
          student_name: a.users ? `${a.users.first_name || ''} ${a.users.last_name || ''}`.trim() : 'Unknown',
          student_no: a.users?.student_profiles?.student_no ?? '—',
          term_name: a.academic_terms?.term_name ?? '—',
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
    };
    load();
  }, [router]);

  const filtered = statements.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return s.student_name.toLowerCase().includes(q) || s.student_no.toLowerCase().includes(q);
  });

  const totalBilled = filtered.reduce((sum, s) => sum + s.total_amount, 0);
  const totalCollected = filtered.reduce((sum, s) => sum + s.paid_amount, 0);
  const totalOutstanding = filtered.reduce((sum, s) => sum + s.balance, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Fee Statements</h1>
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Billed</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">ETB {totalBilled.toLocaleString()}</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-100 p-4">
          <p className="text-xs text-green-600 uppercase tracking-wide">Total Collected</p>
          <p className="text-2xl font-bold text-green-800 mt-1">ETB {totalCollected.toLocaleString()}</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-100 p-4">
          <p className="text-xs text-red-600 uppercase tracking-wide">Total Outstanding</p>
          <p className="text-2xl font-bold text-red-800 mt-1">ETB {totalOutstanding.toLocaleString()}</p>
        </div>
      </div>

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
            <p className="text-sm">No fee statements found</p>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{s.student_name}</div>
                      {s.student_no && s.student_no !== '—' && (
                        <div className="text-xs text-gray-500">{s.student_no}</div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{s.term_name}</td>
                    <td className="px-5 py-3 text-right text-gray-900">{s.total_amount.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-green-700">{s.paid_amount.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right font-medium text-red-700">{s.balance.toLocaleString()}</td>
                    <td className="px-5 py-3 text-gray-500">{s.due_date ? new Date(s.due_date).toLocaleDateString() : '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(s.status)}`}>
                        {s.status}
                      </span>
                    </td>
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
