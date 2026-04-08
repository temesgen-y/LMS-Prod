'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type StandingRecord = {
  id               : string;
  termName         : string;
  yearStart        : number | null;
  gpa              : number;
  cumulativeGpa    : number;
  standing         : string;
  creditsEarned    : number;
  creditsAttempted : number;
  notes            : string | null;
  createdAt        : string;
};

function standingBadgeClass(standing: string): string {
  const map: Record<string, string> = {
    good       : 'bg-green-100 text-green-800',
    honors     : 'bg-yellow-100 text-yellow-800',
    warning    : 'bg-amber-100 text-amber-800',
    probation  : 'bg-orange-100 text-orange-800',
    suspension : 'bg-red-100 text-red-800',
    dismissed  : 'bg-red-200 text-red-900',
  };
  return map[standing] ?? 'bg-gray-100 text-gray-600';
}

function bannerColors(standing: string): string {
  const map: Record<string, string> = {
    good       : 'bg-green-50 border-green-200',
    honors     : 'bg-yellow-50 border-yellow-200',
    warning    : 'bg-amber-50 border-amber-200',
    probation  : 'bg-orange-50 border-orange-200',
    suspension : 'bg-red-50 border-red-200',
  };
  return map[standing] ?? 'bg-gray-50 border-gray-200';
}

function bannerMessage(standing: string): string {
  const map: Record<string, string> = {
    good      : 'You are on track. Keep up the great work!',
    honors    : "Outstanding! You are on the Dean's List.",
    warning   : 'Your GPA has dropped below 2.0. Contact your academic advisor.',
    probation : 'You must improve your GPA this semester to avoid suspension.',
    suspension: 'You cannot register for courses. Contact the registrar office.',
  };
  return map[standing] ?? '';
}

function bannerIcon(standing: string): string {
  const map: Record<string, string> = {
    good: '✅', honors: '🏆', warning: '⚠️', probation: '⚠️', suspension: '❌',
  };
  return map[standing] ?? 'ℹ️';
}

export default function AcademicStandingPage() {
  const [standings, setStandings] = useState<StandingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accordionOpen, setAccordionOpen] = useState(false);

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

        const { data, error: dbErr } = await supabase
          .from('academic_standing')
          .select('id, gpa, cumulative_gpa, standing, credits_earned, credits_attempted, notes, created_at, academic_terms(id, term_name, year_start)')
          .eq('student_id', (currentUser as any).id)
          .order('created_at', { ascending: false });

        if (dbErr) throw dbErr;

        setStandings(
          ((data ?? []) as any[]).map(s => ({
            id               : s.id,
            termName         : s.academic_terms?.term_name ?? '—',
            yearStart        : s.academic_terms?.year_start ?? null,
            gpa              : s.gpa,
            cumulativeGpa    : s.cumulative_gpa,
            standing         : s.standing,
            creditsEarned    : s.credits_earned,
            creditsAttempted : s.credits_attempted,
            notes            : s.notes ?? null,
            createdAt        : s.created_at,
          }))
        );
      } catch (e: any) {
        setError(e.message ?? 'Failed to load standing');
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
          <div className="h-32 bg-gray-200 rounded-xl" />
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

  const current = standings[0];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/dashboard" className="hover:text-purple-700">Home</Link>
          <span>›</span>
          <span className="text-gray-900 font-medium">Academic Standing</span>
        </nav>

        <h1 className="text-2xl font-bold text-gray-900">Academic Standing</h1>

        {/* Current Standing Banner */}
        {current ? (
          <div className={`rounded-xl border p-6 ${bannerColors(current.standing)}`}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">{bannerIcon(current.standing)}</span>
              <div>
                <p className="text-xl font-bold text-gray-900 capitalize">{current.standing.replace('_', ' ')}</p>
                <p className="text-sm text-gray-600">Cumulative GPA: <strong>{current.cumulativeGpa.toFixed(2)}</strong></p>
              </div>
            </div>
            {bannerMessage(current.standing) && (
              <p className="text-sm text-gray-700 mt-2 ml-12">{bannerMessage(current.standing)}</p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
            <p className="text-gray-500 text-sm">Academic standing not yet recorded.</p>
            <p className="text-gray-400 text-xs mt-1">Your standing will be updated after each semester's grades are finalized.</p>
          </div>
        )}

        {/* Standing History Table */}
        {standings.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Standing History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left">Term</th>
                    <th className="px-6 py-3 text-left">GPA</th>
                    <th className="px-6 py-3 text-left">Cumulative GPA</th>
                    <th className="px-6 py-3 text-left">Credits</th>
                    <th className="px-6 py-3 text-left">Standing</th>
                    <th className="px-6 py-3 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {standings.map((s, i) => (
                    <tr key={s.id} className={`hover:bg-gray-50 ${i === 0 ? 'bg-purple-50 border-l-2 border-purple-500' : ''}`}>
                      <td className={`px-6 py-3 ${i === 0 ? 'font-medium text-gray-900' : 'text-gray-700'}`}>{s.termName}</td>
                      <td className="px-6 py-3 font-medium text-gray-900">{s.gpa.toFixed(2)}</td>
                      <td className="px-6 py-3 text-gray-700">{s.cumulativeGpa.toFixed(2)}</td>
                      <td className="px-6 py-3 text-gray-600">{s.creditsEarned}/{s.creditsAttempted}</td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${standingBadgeClass(s.standing)}`}>
                          {s.standing}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-500 text-xs">{s.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Understanding Academic Standing (collapsible) */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setAccordionOpen(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
          >
            <span className="font-semibold text-gray-900">Understanding Academic Standing</span>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${accordionOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {accordionOpen && (
            <div className="px-6 pb-6 divide-y divide-gray-100">
              {[
                { icon: '✅', title: 'Good Standing',     desc: 'GPA ≥ 2.0 · Full registration access' },
                { icon: '🏆', title: "Honors / Dean's List", desc: 'GPA ≥ 3.5 · Special recognition · Priority registration' },
                { icon: '⚠️', title: 'Academic Warning',  desc: 'GPA 1.5 – 1.99 · Advisor meeting required' },
                { icon: '⚠️', title: 'Academic Probation',desc: 'GPA 1.0 – 1.49 · Restricted registration · Conditions apply' },
                { icon: '❌', title: 'Suspension',        desc: 'GPA below 1.0 · Cannot register · Must apply for readmission' },
              ].map(row => (
                <div key={row.title} className="py-3 flex items-start gap-3">
                  <span className="text-lg flex-shrink-0">{row.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{row.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{row.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
