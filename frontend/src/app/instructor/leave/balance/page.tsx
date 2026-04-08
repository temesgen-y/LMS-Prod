'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface LeaveBalance {
  id: string;
  leave_type: string;
  total_days: number;
  used_days: number;
  remaining_days: number;
  academic_year: string;
}

const LEAVE_COLORS: Record<string, string> = {
  annual: 'bg-green-500',
  sick: 'bg-red-500',
  emergency: 'bg-orange-500',
  maternity: 'bg-pink-500',
  paternity: 'bg-blue-500',
  study: 'bg-purple-500',
  unpaid: 'bg-gray-400',
};

export default function LeaveBalancePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [academicYear, setAcademicYear] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { router.replace('/login'); return; }
        const { data: currentUser } = await supabase.from('users').select('id').eq('auth_user_id', authUser.id).single();
        if (!currentUser) return;
        const userId = (currentUser as any).id;

        const currentYearVal = new Date().getFullYear();
        const academicYearVal = `${currentYearVal}-${currentYearVal + 1}`;
        setAcademicYear(academicYearVal);

        const { data, error: fetchErr } = await supabase
          .from('leave_balances')
          .select('id, leave_type, total_days, used_days, remaining_days, academic_year')
          .eq('user_id', userId)
          .eq('academic_year', academicYearVal)
          .order('leave_type');

        if (fetchErr) throw new Error(fetchErr.message);
        setBalances((data ?? []) as LeaveBalance[]);
      } catch (e: any) {
        setError(e.message ?? 'Failed to load leave balances');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Leave Balance</h1>
        {academicYear && <span className="text-sm text-gray-500">Academic Year: {academicYear}</span>}
      </div>
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>}

      {balances.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="font-medium text-gray-500">No leave balances recorded</p>
          <p className="text-sm mt-1">Contact your department head or HR to set up leave balances.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {balances.map(b => {
            const usedPct = b.total_days > 0 ? (b.used_days / b.total_days) * 100 : 0;
            return (
              <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-gray-900 capitalize">{b.leave_type} Leave</p>
                  <span className="text-sm text-gray-500">{b.remaining_days} left</span>
                </div>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-3xl font-bold text-gray-900">{b.remaining_days}</span>
                  <span className="text-gray-500">/ {b.total_days} days</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className={`${LEAVE_COLORS[b.leave_type] ?? 'bg-purple-500'} h-2 rounded-full transition-all`}
                    style={{ width: `${Math.max(0, 100 - usedPct)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">{b.used_days} used · {b.remaining_days} remaining</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
