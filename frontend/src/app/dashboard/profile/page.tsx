'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type ProfileData = {
  studentNo     : string | null;
  programName   : string | null;
  deptName      : string | null;
  durationYrs   : number;
  yearOfStudy   : number | null;
  degreeLevel   : string | null;
  enrollStatus  : string | null;
  gpa           : number | null;
  cumulativeGpa : number | null;
  creditsEarned : number | null;
  standing      : string | null;      // enum value (good/honors/…) for badge
  standingText  : string | null;      // free-text fallback (e.g. 'Good Standing')
  firstName     : string;
  lastName      : string;
  email         : string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function yearLabel(y: number): string {
  return ({1: 'Year 1 (Freshman)', 2: 'Year 2 (Sophomore)', 3: 'Year 3 (Junior)', 4: 'Year 4 (Senior)'} as Record<number, string>)[y] ?? `Year ${y}`;
}

function enrollStatusBadge(status: string | null) {
  const map: Record<string, string> = {
    active     : 'bg-green-100 text-green-800',
    inactive   : 'bg-gray-100 text-gray-600',
    on_leave   : 'bg-blue-100 text-blue-800',
    suspended  : 'bg-red-100 text-red-800',
    withdrawn  : 'bg-gray-100 text-gray-600',
    graduated  : 'bg-purple-100 text-purple-800',
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

/** Muted placeholder for genuinely unrecorded data. */
function NotRecorded() {
  return <span className="text-gray-400 text-xs italic">Not recorded</span>;
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

        // Load student profile (only columns that actually exist on the table)
        const { data: sp } = await supabase
          .from('student_profiles')
          .select('student_no, program, program_id, degree_level, profile_status')
          .eq('user_id', u.id)
          .maybeSingle();

        const spd = sp as any;

        // Resolve program → name, department, duration. Prefer the program_id FK,
        // then a UUID stored in the legacy `program` text column, then the raw text.
        let programName: string | null = null;
        let deptName   : string | null = null;
        let durationYrs = 4;

        const lookupId =
          spd?.program_id ?? (typeof spd?.program === 'string' && UUID_RE.test(spd.program) ? spd.program : null);

        if (lookupId) {
          const { data: prog } = await supabase
            .from('academic_programs')
            .select('name, code, duration_years, departments(name)')
            .eq('id', lookupId)
            .maybeSingle();
          if (prog) {
            programName = (prog as any).name ?? null;
            deptName    = (prog as any).departments?.name ?? null;
            durationYrs = (prog as any).duration_years ?? 4;
          }
        }
        // Fall back to the legacy free-text program name when no FK match.
        if (!programName && typeof spd?.program === 'string' && !UUID_RE.test(spd.program)) {
          programName = spd.program;
        }

        // Latest academic standing
        const { data: standing } = await supabase
          .from('academic_standing')
          .select('gpa, cumulative_gpa, standing, credits_earned')
          .eq('student_id', u.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const st = standing as any;

        // Fallback GPA source: latest computed semester GPA record
        const { data: sem } = await supabase
          .from('semester_gpa')
          .select('semester_gpa, cumulative_gpa, cumulative_credit_hours, academic_standing')
          .eq('student_id', u.id)
          .order('calculated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const sg = sem as any;

        // Credits: standing → semester GPA → sum of completed-course credit hours
        let creditsEarned: number | null = st?.credits_earned ?? sg?.cumulative_credit_hours ?? null;
        if (creditsEarned == null) {
          const { data: completedEnr } = await supabase
            .from('enrollments')
            .select('final_grade, course_offerings(courses(credit_hours))')
            .eq('student_id', u.id)
            .eq('status', 'completed');
          if (completedEnr && completedEnr.length > 0) {
            creditsEarned = (completedEnr as any[]).reduce(
              (sum, e) => sum + (e.course_offerings?.courses?.credit_hours ?? 0), 0,
            );
          }
        }

        setProfile({
          studentNo     : spd?.student_no ?? null,
          programName,
          deptName,
          durationYrs,
          yearOfStudy   : null, // not tracked on student_profiles
          degreeLevel   : spd?.degree_level ?? null,
          enrollStatus  : spd?.profile_status ?? null,
          gpa           : st?.gpa ?? sg?.semester_gpa ?? null,
          cumulativeGpa : st?.cumulative_gpa ?? sg?.cumulative_gpa ?? null,
          creditsEarned,
          standing      : st?.standing ?? null,
          standingText  : st?.standing ?? sg?.academic_standing ?? null,
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
  const credits = profile.creditsEarned ?? 0;
  const progressPct = Math.min(100, Math.round((credits / requiredCredits) * 100));
  const sb = standingBadge(profile.standing);

  // Classification rows: value === null renders as "Not recorded"
  const classificationRows: { label: string; value: string | null; mono?: boolean }[] = [
    { label: 'Student No', value: profile.studentNo, mono: true },
    { label: 'Program',    value: profile.programName },
    { label: 'Department', value: profile.deptName },
    { label: 'Year',       value: profile.yearOfStudy != null ? yearLabel(profile.yearOfStudy) : null },
    { label: 'Degree',     value: profile.degreeLevel ? profile.degreeLevel.charAt(0).toUpperCase() + profile.degreeLevel.slice(1) : null },
    { label: 'Status',     value: profile.enrollStatus ? profile.enrollStatus.replace('_', ' ') : null },
  ];

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
              {profile.enrollStatus ? (
                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium capitalize ${enrollStatusBadge(profile.enrollStatus)}`}>
                  {profile.enrollStatus.replace('_', ' ')}
                </span>
              ) : (
                <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 italic">
                  Status not recorded
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Two-column info grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Academic Classification */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Academic Classification</h2>
            <div className="space-y-3 text-sm">
              {classificationRows.map(row => (
                <div key={row.label} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
                  <span className="text-gray-500">{row.label}</span>
                  {row.value != null ? (
                    <span className={`text-gray-900 font-medium ${row.mono ? 'font-mono text-xs' : 'capitalize'}`}>
                      {row.value}
                    </span>
                  ) : (
                    <NotRecorded />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Academic Performance */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Academic Performance</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center py-1 border-b border-gray-50">
                <span className="text-gray-500">Current GPA</span>
                {profile.gpa != null ? <span className="text-gray-900 font-medium">{profile.gpa.toFixed(2)}</span> : <NotRecorded />}
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-50">
                <span className="text-gray-500">Cumulative GPA</span>
                {profile.cumulativeGpa != null ? <span className="text-gray-900 font-medium">{profile.cumulativeGpa.toFixed(2)}</span> : <NotRecorded />}
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-50">
                <span className="text-gray-500">Credits Earned</span>
                {profile.creditsEarned != null ? <span className="text-gray-900 font-medium">{profile.creditsEarned}</span> : <NotRecorded />}
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-500">Standing</span>
                {profile.standing ? (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${sb.cls}`}>
                    {sb.icon} {profile.standing.charAt(0).toUpperCase() + profile.standing.slice(1)}
                  </span>
                ) : profile.standingText ? (
                  <span className="text-gray-900 font-medium">{profile.standingText}</span>
                ) : (
                  <NotRecorded />
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
            {credits} credits earned of {requiredCredits} required
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
