'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface EnrollmentRow { course_code: string; course_title: string; section: string; term_name: string; instructor: string; enrolled: number; capacity: number; fill_pct: number; }
interface WithdrawalRow { course_code: string; course_title: string; term_name: string; count: number; top_reason: string; }
interface StandingRow { standing: string; count: number; pct: number; }

export default function ReportsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'enrollment' | 'withdrawal' | 'standing'>('enrollment');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [enrollmentData, setEnrollmentData] = useState<EnrollmentRow[]>([]);
  const [withdrawalData, setWithdrawalData] = useState<WithdrawalRow[]>([]);
  const [standingData, setStandingData] = useState<StandingRow[]>([]);

  const loadEnrollment = async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { data, error: fetchErr } = await supabase
        .from('course_offerings')
        .select(`
          id, section_name, enrolled_count,
          courses(code, title),
          academic_terms(term_name),
          course_instructors(
            users!instructor_id(first_name, last_name)
          )
        `)
        .order('created_at', { ascending: false });

      if (fetchErr) throw new Error(fetchErr.message);

      setEnrollmentData(((data ?? []) as any[]).map(o => ({
        course_code: o.courses?.code ?? '—',
        course_title: o.courses?.title ?? '—',
        section: o.section_name ?? '—',
        term_name: o.academic_terms?.term_name ?? '—',
        instructor: o.course_instructors?.[0]?.users
          ? `${o.course_instructors[0].users.first_name || ''} ${o.course_instructors[0].users.last_name || ''}`.trim()
          : 'Unassigned',
        enrolled: o.enrolled_count ?? 0,
        capacity: 40,
        fill_pct: Math.round(((o.enrolled_count ?? 0) / 40) * 100),
      })));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const loadWithdrawal = async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { data, error: fetchErr } = await supabase
        .from('withdrawal_requests')
        .select(`
          reason_category, status,
          course_offerings!offering_id(courses(code, title), academic_terms(term_name))
        `)
        .eq('status', 'approved');

      if (fetchErr) throw new Error(fetchErr.message);

      const grouped: Record<string, any> = {};
      ((data ?? []) as any[]).forEach(w => {
        const key = `${w.course_offerings?.courses?.code}__${w.course_offerings?.academic_terms?.term_name}`;
        if (!grouped[key]) {
          grouped[key] = {
            course_code: w.course_offerings?.courses?.code ?? '—',
            course_title: w.course_offerings?.courses?.title ?? '—',
            term_name: w.course_offerings?.academic_terms?.term_name ?? '—',
            count: 0,
            reasons: {} as Record<string, number>,
          };
        }
        grouped[key].count++;
        const cat = w.reason_category || 'other';
        grouped[key].reasons[cat] = (grouped[key].reasons[cat] || 0) + 1;
      });

      setWithdrawalData(Object.values(grouped).map((g: any) => ({
        ...g,
        top_reason: Object.entries(g.reasons as Record<string, number>).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
      })));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const loadStanding = async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { data, error: fetchErr } = await supabase.from('academic_standing').select('standing');
      if (fetchErr) throw new Error(fetchErr.message);

      const counts: Record<string, number> = {};
      ((data ?? []) as any[]).forEach(s => { counts[s.standing] = (counts[s.standing] || 0) + 1; });
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      setStandingData(Object.entries(counts).map(([standing, count]) => ({
        standing,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      })).sort((a, b) => b.count - a.count));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.replace('/login'); return; }
      loadEnrollment();
    };
    init();
  }, [router]);

  const handleTabChange = (tab: 'enrollment' | 'withdrawal' | 'standing') => {
    setActiveTab(tab);
    if (tab === 'enrollment' && enrollmentData.length === 0) loadEnrollment();
    if (tab === 'withdrawal' && withdrawalData.length === 0) loadWithdrawal();
    if (tab === 'standing' && standingData.length === 0) loadStanding();
  };

  const exportCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const rows = data.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const standingColors: Record<string, string> = {
    good: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    probation: 'bg-orange-100 text-orange-800',
    suspension: 'bg-red-100 text-red-800',
    dismissed: 'bg-red-900 text-white',
    honors: 'bg-blue-100 text-blue-800',
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Enrollment Reports</h1>
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>}

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['enrollment', 'withdrawal', 'standing'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => handleTabChange(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg -mb-px capitalize ${
              activeTab === tab ? 'bg-white border border-b-white border-gray-200 text-purple-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'enrollment' ? 'Enrollment Summary' : tab === 'withdrawal' ? 'Withdrawal Report' : 'Academic Standing'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
        </div>
      ) : (
        <>
          {activeTab === 'enrollment' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <span className="font-semibold text-gray-900">Course Enrollment Summary</span>
                <button type="button" onClick={() => exportCSV(enrollmentData, 'enrollment_report.csv')} className="text-xs px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">
                  Export CSV
                </button>
              </div>
              {enrollmentData.length === 0 ? (
                <p className="p-6 text-sm text-gray-400 text-center">No data</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="px-5 py-3 text-left">Course</th>
                        <th className="px-5 py-3 text-left">Section</th>
                        <th className="px-5 py-3 text-left">Term</th>
                        <th className="px-5 py-3 text-left">Instructor</th>
                        <th className="px-5 py-3 text-right">Enrolled</th>
                        <th className="px-5 py-3 text-right">Capacity</th>
                        <th className="px-5 py-3 text-right">Fill %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {enrollmentData.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-900">{r.course_code} — {r.course_title}</td>
                          <td className="px-5 py-3 text-gray-600">{r.section}</td>
                          <td className="px-5 py-3 text-gray-600">{r.term_name}</td>
                          <td className="px-5 py-3 text-gray-600">{r.instructor}</td>
                          <td className="px-5 py-3 text-right text-gray-900">{r.enrolled}</td>
                          <td className="px-5 py-3 text-right text-gray-600">{r.capacity}</td>
                          <td className="px-5 py-3 text-right">
                            <span className={`font-medium ${r.fill_pct >= 90 ? 'text-red-600' : r.fill_pct >= 70 ? 'text-yellow-600' : 'text-green-600'}`}>
                              {r.fill_pct}%
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

          {activeTab === 'withdrawal' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <span className="font-semibold text-gray-900">Withdrawal Report (Approved)</span>
                <button type="button" onClick={() => exportCSV(withdrawalData, 'withdrawal_report.csv')} className="text-xs px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">
                  Export CSV
                </button>
              </div>
              {withdrawalData.length === 0 ? (
                <p className="p-6 text-sm text-gray-400 text-center">No approved withdrawals</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="px-5 py-3 text-left">Course</th>
                        <th className="px-5 py-3 text-left">Term</th>
                        <th className="px-5 py-3 text-right">Count</th>
                        <th className="px-5 py-3 text-left">Top Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {withdrawalData.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-900">{r.course_code} — {r.course_title}</td>
                          <td className="px-5 py-3 text-gray-600">{r.term_name}</td>
                          <td className="px-5 py-3 text-right font-medium text-gray-900">{r.count}</td>
                          <td className="px-5 py-3 capitalize text-gray-600">{r.top_reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'standing' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <span className="font-semibold text-gray-900">Academic Standing Distribution</span>
                <button type="button" onClick={() => exportCSV(standingData, 'standing_report.csv')} className="text-xs px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">
                  Export CSV
                </button>
              </div>
              {standingData.length === 0 ? (
                <p className="p-6 text-sm text-gray-400 text-center">No standing records</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="px-5 py-3 text-left">Standing</th>
                        <th className="px-5 py-3 text-right">Count</th>
                        <th className="px-5 py-3 text-right">Percentage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {standingData.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-5 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${standingColors[r.standing] ?? 'bg-gray-100 text-gray-600'}`}>
                              {r.standing}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right font-medium text-gray-900">{r.count}</td>
                          <td className="px-5 py-3 text-right text-gray-600">{r.pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
