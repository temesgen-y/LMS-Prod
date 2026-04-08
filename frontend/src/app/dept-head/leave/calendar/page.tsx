'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDeptIdForHead } from '@/utils/getDeptForHead';

interface ApprovedLeave {
  id: string;
  requester_id: string;
  requester_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
}

const LEAVE_COLORS: Record<string, string> = {
  annual: 'bg-green-200 text-green-900',
  sick: 'bg-red-200 text-red-900',
  emergency: 'bg-orange-200 text-orange-900',
  maternity: 'bg-pink-200 text-pink-900',
  paternity: 'bg-blue-200 text-blue-900',
  study: 'bg-purple-200 text-purple-900',
  unpaid: 'bg-gray-200 text-gray-700',
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function LeaveCalendarPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvedLeaves, setApprovedLeaves] = useState<ApprovedLeave[]>([]);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { router.replace('/login'); return; }
        const { data: currentUser } = await supabase.from('users').select('id').eq('auth_user_id', authUser.id).single();
        if (!currentUser) return;
        const userId = (currentUser as any).id;

        const deptId = await getDeptIdForHead(supabase, userId);
        if (!deptId) { setLoading(false); return; }

        const { data: deptRow } = await supabase.from('departments').select('name').eq('id', deptId).maybeSingle();
        const deptName = (deptRow as any)?.name ?? '';
        const [q1, q2, q3] = await Promise.all([
          supabase.from('instructor_profiles').select('user_id').eq('department_id', deptId),
          supabase.from('instructor_profiles').select('user_id').eq('department', deptId),
          deptName ? supabase.from('instructor_profiles').select('user_id').ilike('department', deptName) : Promise.resolve({ data: [] as any[] }),
        ]);
        const profileSet = new Map<string, string>();
        for (const p of [...(q1.data ?? []), ...(q2.data ?? []), ...(q3.data ?? [])]) profileSet.set((p as any).user_id, (p as any).user_id);
        const instrProfiles = Array.from(profileSet.values()).map(uid => ({ user_id: uid }));
        const instrUserIds = (instrProfiles ?? []).map((p: any) => p.user_id);
        if (instrUserIds.length === 0) { setLoading(false); return; }

        const { data, error: fetchErr } = await supabase
          .from('leave_requests')
          .select('id, requester_id, leave_type, start_date, end_date')
          .in('requester_id', instrUserIds)
          .eq('status', 'approved');

        if (fetchErr) throw new Error(fetchErr.message);

        // Fetch requester names separately to avoid FK ambiguity
        const rIds = [...new Set((data ?? []).map((l: any) => l.requester_id))];
        let nameMap: Record<string, string> = {};
        if (rIds.length > 0) {
          const { data: uData } = await supabase
            .from('users').select('id, first_name, last_name').in('id', rIds);
          for (const u of uData ?? []) {
            nameMap[u.id] = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown';
          }
        }

        setApprovedLeaves(((data ?? []) as any[]).map(l => ({
          id: l.id,
          requester_id: l.requester_id,
          requester_name: nameMap[l.requester_id] ?? 'Unknown',
          leave_type: l.leave_type,
          start_date: l.start_date,
          end_date: l.end_date,
        })));
      } catch (e: any) {
        setError(e.message ?? 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const getDayLeaves = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return approvedLeaves.filter(l => l.start_date <= dateStr && l.end_date >= dateStr);
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Leave Calendar</h1>
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>}

      {/* Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={prevMonth} className="p-2 rounded hover:bg-gray-100">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">{MONTH_NAMES[month]} {year}</h2>
          <button type="button" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }} className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600">
            Today
          </button>
        </div>
        <button type="button" onClick={nextMonth} className="p-2 rounded hover:bg-gray-100">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-200">
          {DAY_NAMES.map(d => (
            <div key={d} className="text-center text-xs font-semibold text-gray-500 uppercase py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-24 border-b border-r border-gray-100 bg-gray-50" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayLeaves = getDayLeaves(day);
            const isToday = dateStr === todayStr;
            return (
              <div key={day} className={`min-h-24 border-b border-r border-gray-100 p-1 ${isToday ? 'bg-purple-50' : 'bg-white'}`}>
                <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-purple-700 text-white' : 'text-gray-700'}`}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {dayLeaves.slice(0, 3).map(l => (
                    <div key={l.id} className={`text-[10px] px-1 py-0.5 rounded truncate font-medium ${LEAVE_COLORS[l.leave_type] ?? 'bg-gray-200 text-gray-700'}`}>
                      {l.requester_name.split(' ')[0]}
                    </div>
                  ))}
                  {dayLeaves.length > 3 && (
                    <div className="text-[10px] text-gray-500 px-1">+{dayLeaves.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3">
        {Object.entries(LEAVE_COLORS).map(([type, cls]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full ${cls.split(' ')[0]}`} />
            <span className="text-xs text-gray-600 capitalize">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
