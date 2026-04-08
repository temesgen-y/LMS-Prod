'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type ProfileData = {
  studentNo     : string | null;
  programName   : string;
  deptName      : string;
  durationYrs   : number;
  yearOfStudy   : number | null;
  degreeLevel   : string | null;
  enrollStatus  : string | null;
  gpa           : number | null;
  cumulativeGpa : number | null;
  creditsEarned : number;
  standing      : string | null;
  firstName     : string;
  lastName      : string;
  email         : string;
};

function yearLabel(y: number): string {
  return ({1: 'Year 1 (Freshman)', 2: 'Year 2 (Sophomore)', 3: 'Year 3 (Junior)', 4: 'Year 4 (Senior)'} as Record<number, string>)[y] ?? `Year ${y}`;
}

function enrollStatusBadge(status: string | null) {
  const map: Record<string, string> = {
    active    : 'bg-green-100 text-green-800',
    on_leave  : 'bg-blue-100 text-blue-800',
    suspended : 'bg-red-100 text-red-800',
    withdrawn : 'bg-gray-100 text-gray-600',
    graduated : 'bg-purple-100 text-purple-800',
  };
  return map[status ?? ''] ?? 'bg-gray-100 text-gray-600';
}

function standingBadge(standing: string | null): { cls: string; icon: string } {
  const map: Record<string, { cls: string; icon: string }> = {
    good       : { cls: 'bg-green-100 text-green-800',  icon: '✅' },
    honors     : { cls: 'bg-yellow-100 text-yellow-800', icon: '🏆' },
    warning    : { cls: 'bg-amber-100 text-amber-800',   icon: '⚠️' },
    probation  : { cls: 'bg-orange-100 text-orange-800', icon: '⚠️' },
    suspension : { cls: 'bg-red-100 text-red-800',       icon: '❌' },
    dismissed  : { cls: 'bg-red-200 text-red-900',       icon: '❌' },
  };
  return map[standing ?? ''] ?? { cls: 'bg-gray-100 text-gray-600', icon: '' };
}

function getInitials(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

export default function MyProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { setError('Not authenticated'); setLoading(false); return; }

        const { data: currentUser } = await supabase
          .from('users')
          .select('id, first_name, last_name, email')
          .eq('auth_user_id', authUser.id)
          .single();
        if (!currentUser) { setError('User not found'); setLoading(false); return; }

        const u = currentUser as any;

        // Load student profile
        const { data: sp } = await supabase
          .from('student_profiles')
          .select('student_no, program, year_of_study, degree_level, enrollment_status')
          .eq('user_id', u.id)
          .single();

        let programName = (sp as any)?.program ?? '—';
        let deptName    = '—';
        let durationYrs = 4;

        if ((sp as any)?.program) {
          const { data: prog } = await supabase
            .from('academic_programs')
            .select('name, code, duration_years, departments(name)')
            .eq('id', (sp as any).program)
            .maybeSingle();

          if (prog) {
            programName = (prog as any).name;
            deptName    = (prog as any).departments?.name ?? '—';
            durationYrs = (prog as any).duration_years ?? 4;
          }
        }

        // Latest academic standing
        const { data: standing } = await supabase
          .from('academic_standing')
          .select('gpa, cumulative_gpa, standing, credits_earned, credits_attempted')
          .eq('student_id', u.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Completed enrollments for credit count fallback
        const { data: completedEnr } = await supabase
          .from('enrollments')
          .select('final_grade, course_offerings(courses(credit_hours))')
          .eq('student_id', u.id)
          .eq('status', 'completed');

        const creditsEarned = (standing as any)?.credits_earned ??
          ((completedEnr ?? []) as any[]).reduce((sum, e) => {
            const ch = e.course_offerings?.courses?.credit_hours ?? 0;
            return sum + ch;
          }, 0);

        setProfile({
          studentNo     : (sp as any)?.student_no ?? null,
          programName,
          deptName,
          durationYrs,
          yearOfStudy   : (sp as any)?.year_of_study ?? null,
          degreeLevel   : (sp as any)?.degree_level ?? null,
          enrollStatus  : (sp as any)?.enrollment_status ?? null,
          gpa           : (standing as any)?.gpa ?? null,
          cumulativeGpa : (standing as any)?.cumulative_gpa ?? null,
          creditsEarned,
          standing      : (standing as any)?.standing ?? null,
          firstName     : u.first_name ?? '',
          lastName      : u.last_name ?? '',
          email         : u.email ?? '',
        });
      } catch (e: any) {
        setError(e.message ?? 'Failed to load profile');
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
          <div className="grid grid-cols-2 gap-4">
            <div className="h-48 bg-gray-200 rounded-xl" />
            <div className="h-48 bg-gray-200 rounded-xl" />
          </div>
          <div className="h-24 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error || 'Profile not found'}
        </div>
      </div>
    );
  }

  const requiredCredits = profile.durationYrs * 30;
  const progressPct = Math.min(100, Math.round((profile.creditsEarned / requiredCredits) * 100));
  const sb = standingBadge(profile.standing);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/dashboard" className="hover:text-purple-700">Home</Link>
          <span>›</span>
          <span className="text-gray-900 font-medium">My Profile</span>
        </nav>

        {/* Profile Header */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center gap-6">
          <div className="w-20 h-20 bg-[#4c1d95] text-white text-2xl font-bold rounded-full flex items-center justify-center flex-shrink-0">
            {getInitials(profile.firstName, profile.lastName)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">
              {profile.firstName} {profile.lastName}
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">{profile.email}</p>
            <div className="mt-2">
              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium capitalize ${enrollStatusBadge(profile.enrollStatus)}`}>
                {profile.enrollStatus ? profile.enrollStatus.replace('_', ' ') : 'Unknown'}
              </span>
            </div>
          </div>
        </div>

        {/* Two-column info grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Academic Classification */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Academic Classification</h2>
            <div className="space-y-3 text-sm">
              {[
                { label: 'Student No',  value: profile.studentNo ?? '—', mono: true },
                { label: 'Program',     value: profile.programName },
                { label: 'Department',  value: profile.deptName },
                { label: 'Year',        value: profile.yearOfStudy ? yearLabel(profile.yearOfStudy) : '—' },
                { label: 'Degree',      value: profile.degreeLevel ? profile.degreeLevel.charAt(0).toUpperCase() + profile.degreeLevel.slice(1) : '—' },
                { label: 'Status',      value: profile.enrollStatus ? profile.enrollStatus.replace('_', ' ') : '—' },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
                  <span className="text-gray-500">{row.label}</span>
                  <span className={`text-gray-900 font-medium ${row.mono ? 'font-mono text-xs' : ''}`}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Academic Performance */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Academic Performance</h2>
            <div className="space-y-3 text-sm">
              {[
                { label: 'Current GPA',    value: profile.gpa ? profile.gpa.toFixed(2) : '—' },
                { label: 'Cumulative GPA', value: profile.cumulativeGpa ? profile.cumulativeGpa.toFixed(2) : '—' },
                { label: 'Credits Earned', value: String(profile.creditsEarned) },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-500">{row.label}</span>
                  <span className="text-gray-900 font-medium">{row.value}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-500">Standing</span>
                {profile.standing ? (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${sb.cls}`}>
                    {sb.icon} {profile.standing.charAt(0).toUpperCase() + profile.standing.slice(1)}
                  </span>
                ) : (
                  <span className="text-gray-400 text-xs">Not recorded</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Graduation Progress */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Degree Progress</h2>
          <div className="flex items-center gap-4 mb-2">
            <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-[#4c1d95] h-3 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-sm font-bold text-gray-800 w-12 text-right">{progressPct}%</span>
          </div>
          <p className="text-sm text-gray-500">
            {profile.creditsEarned} credits earned of {requiredCredits} required
          </p>
          <Link
            href="/dashboard/degree-progress"
            className="inline-flex items-center gap-1 mt-4 text-sm text-purple-700 hover:underline font-medium"
          >
            View Full Degree Progress →
          </Link>
        </div>

      </div>
    </div>
  );
}
