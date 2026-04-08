'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ScheduleEntry {
  id: string;
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  sectionName: string;
  schedule: string | null;
  termName: string;
  enrolledCount: number;
}

export default function MySchedulePage() {
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', authData.user.id)
        .single();
      if (!userData) return;

      const { data, error: fetchError } = await supabase
        .from('course_instructors')
        .select(`
          offering_id,
          is_primary,
          course_offerings (
            id,
            section_name,
            schedule,
            enrolled_count,
            courses ( code, title ),
            academic_terms ( term_name, is_current )
          )
        `)
        .eq('instructor_id', (userData as { id: string }).id);

      if (fetchError) {
        setError('Failed to load schedule.');
        setLoading(false);
        return;
      }

      const entries: ScheduleEntry[] = (data ?? []).map((row: any) => ({
        id: row.offering_id,
        offeringId: row.offering_id,
        courseCode: row.course_offerings?.courses?.code ?? '—',
        courseTitle: row.course_offerings?.courses?.title ?? '—',
        sectionName: row.course_offerings?.section_name ?? '—',
        schedule: row.course_offerings?.schedule ?? null,
        termName: row.course_offerings?.academic_terms?.term_name ?? '—',
        enrolledCount: row.course_offerings?.enrolled_count ?? 0,
        isCurrent: row.course_offerings?.academic_terms?.is_current ?? false,
      }));

      entries.sort((a: any, b: any) => (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0));
      setSchedule(entries);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">My Schedule</h1>
      <p className="text-sm text-gray-500 mb-6">All course assignments across terms</p>

      {loading && (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      )}

      {!loading && !error && schedule.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm">No schedule assignments found.</p>
        </div>
      )}

      {!loading && !error && schedule.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Course</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Section</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Term</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Schedule</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Enrolled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {schedule.map(entry => (
                <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{entry.courseCode}</div>
                    <div className="text-xs text-gray-500">{entry.courseTitle}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{entry.sectionName}</td>
                  <td className="px-4 py-3 text-gray-700">{entry.termName}</td>
                  <td className="px-4 py-3 text-gray-700">{entry.schedule ?? <span className="text-gray-400 italic">Not set</span>}</td>
                  <td className="px-4 py-3 text-gray-700">{entry.enrolledCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
