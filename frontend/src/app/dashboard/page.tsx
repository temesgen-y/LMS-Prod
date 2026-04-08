'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// ─── Types ──────────────────────────────────────────────────────────────────

type ProfileWidgetData = {
  studentNo  : string | null;
  program    : string | null;
  year       : number | null;
  status     : string | null;
  gpa        : number | null;
  standing   : string | null;
  credits    : number;
  feeBalance : number;
  feeStatus  : string | null;
};

type UserInfo = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  studentNo: string | null;
  program: string | null;
  degreeLevel: string | null;
};

type CourseCard = {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  sectionName: string;
  instructor: string;
  startDate: string;
  endDate: string;
};

type Deadline = {
  id: string;
  title: string;
  due_date: string;
  offering_id: string;
  courseCode: string;
};

type Announcement = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  is_pinned: boolean;
  offering_id: string | null;
  courseCode: string;
};

type LiveSession = {
  id: string;
  title: string;
  scheduled_at: string;
  duration_mins: number;
  platform: string;
  join_url: string;
  offering_id: string;
  courseCode: string;
};

type CalendarEvent = {
  id: string;
  event_name: string;
  event_type: string;
  event_date: string;
  end_date: string | null;
  description: string | null;
  term_name: string;
};

type HomeData = {
  user: UserInfo;
  activeCourseCount: number;
  completedLessons: number;
  deadlineCount: number;
  unreadNotifCount: number;
  courses: CourseCard[];
  deadlines: Deadline[];
  announcements: Announcement[];
  liveSessions: LiveSession[];
  calendarEvents: CalendarEvent[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function greeting(name: string): string {
  const h = new Date().getHours();
  const salut = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return `${salut}, ${name}! 👋`;
}

function daysUntil(dateStr: string): string {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  if (diff < 0) return 'Overdue';
  return `Due in ${diff} days`;
}

function calEventTypeBadge(type: string): string {
  const map: Record<string, string> = {
    registration_start: 'bg-purple-100 text-purple-700',
    registration_end: 'bg-purple-100 text-purple-700',
    classes_start: 'bg-green-100 text-green-700',
    classes_end: 'bg-green-100 text-green-700',
    add_drop_deadline: 'bg-yellow-100 text-yellow-700',
    withdrawal_deadline: 'bg-orange-100 text-orange-700',
    exam_start: 'bg-red-100 text-red-700',
    exam_end: 'bg-red-100 text-red-700',
    grade_submission_deadline: 'bg-pink-100 text-pink-700',
    holiday: 'bg-blue-100 text-blue-700',
    graduation: 'bg-indigo-100 text-indigo-700',
    other: 'bg-gray-100 text-gray-600',
  };
  return map[type] ?? 'bg-gray-100 text-gray-600';
}

function primaryInstructor(
  instructors: Array<{ role: string; users: { first_name: string; last_name: string } | null }> | null
): string {
  if (!instructors || instructors.length === 0) return 'TBA';
  const primary = instructors.find(i => i.role === 'primary') ?? instructors[0];
  if (!primary.users) return 'TBA';
  return `${primary.users.first_name} ${primary.users.last_name}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function StudentHomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileWidget, setProfileWidget] = useState<ProfileWidgetData | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();

      // 1. Auth user
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setLoading(false); return; }

      const { data: appUser } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .eq('auth_user_id', authData.user.id)
        .single();
      if (!appUser) { setLoading(false); return; }

      const userId = (appUser as { id: string; first_name: string | null; last_name: string | null }).id;
      const firstName = (appUser as { first_name: string | null }).first_name ?? '';

      // Student profile
      const { data: studentProfile } = await supabase
        .from('student_profiles')
        .select('student_no, program, degree_level')
        .eq('user_id', userId)
        .single();

      // 2. Active enrollments — scalar only, no FK hints
      const { data: enrollmentRows, error: enrErr2 } = await supabase
        .from('enrollments')
        .select('offering_id')
        .eq('student_id', userId)
        .eq('status', 'active');

      if (enrErr2) console.error('[Home] enrollments:', enrErr2);

      const enrolledOfferingIds = ((enrollmentRows ?? []) as any[]).map(r => r.offering_id as string);

      // Fetch offerings, courses, terms, and instructors separately
      const { data: offeringsData } = enrolledOfferingIds.length > 0
        ? await supabase
            .from('course_offerings')
            .select('id, section_name, enrolled_count, status, course_id, term_id')
            .in('id', enrolledOfferingIds)
        : { data: [] };

      const offCourseIds = [...new Set(((offeringsData ?? []) as any[]).map(o => o.course_id))];
      const offTermIds   = [...new Set(((offeringsData ?? []) as any[]).map(o => o.term_id))];

      const [{ data: coursesData2 }, { data: termsData2 }, { data: instructorsData }] = await Promise.all([
        offCourseIds.length > 0
          ? supabase.from('courses').select('id, code, title').in('id', offCourseIds)
          : Promise.resolve({ data: [] }),
        offTermIds.length > 0
          ? supabase.from('academic_terms').select('id, start_date, end_date').in('id', offTermIds)
          : Promise.resolve({ data: [] }),
        enrolledOfferingIds.length > 0
          ? supabase.from('course_instructors')
              .select('offering_id, role, users(first_name, last_name)')
              .in('offering_id', enrolledOfferingIds)
          : Promise.resolve({ data: [] }),
      ]);

      const courseMap2: Record<string, any> = {};
      ((coursesData2 ?? []) as any[]).forEach(c => { courseMap2[c.id] = c; });
      const termMap2: Record<string, any> = {};
      ((termsData2 ?? []) as any[]).forEach(t => { termMap2[t.id] = t; });
      const instructorsByOffering: Record<string, any[]> = {};
      ((instructorsData ?? []) as any[]).forEach(i => {
        if (!instructorsByOffering[i.offering_id]) instructorsByOffering[i.offering_id] = [];
        instructorsByOffering[i.offering_id].push(i);
      });

      // Rebuild the enrollments shape the rest of the code expects
      const enrollments = ((enrollmentRows ?? []) as any[]).map(r => {
        const off = ((offeringsData ?? []) as any[]).find(o => o.id === r.offering_id) ?? {};
        return {
          offering_id: r.offering_id,
          course_offerings: {
            id: off.id,
            section_name: off.section_name,
            enrolled_count: off.enrolled_count,
            status: off.status,
            courses: courseMap2[off.course_id] ?? null,
            academic_terms: termMap2[off.term_id] ?? null,
            course_instructors: instructorsByOffering[off.id] ?? [],
          },
        };
      });

      const rows = (enrollments ?? []) as any[];
      const activeCourses = rows.filter(r =>
        ['upcoming', 'active'].includes(r.course_offerings?.status ?? '')
      );
      const activeOfferingIds = activeCourses.map(r => r.offering_id as string);

      const courseCards: CourseCard[] = activeCourses.slice(0, 4).map(r => {
        const o = r.course_offerings;
        return {
          offeringId:  o.id,
          courseCode:  o.courses?.code ?? '',
          courseTitle: o.courses?.title ?? '',
          sectionName: o.section_name ?? '',
          instructor:  primaryInstructor(o.course_instructors ?? []),
          startDate:   fmt(o.academic_terms?.start_date),
          endDate:     fmt(o.academic_terms?.end_date),
        };
      });

      // 3. Upcoming deadlines (next 14 days)
      const now = new Date().toISOString();
      const in14 = new Date(Date.now() + 14 * 86400000).toISOString();

      let deadlines: Deadline[] = [];
      let deadlineCount = 0;
      if (activeOfferingIds.length > 0) {
        const { data: assignRows } = await supabase
          .from('assignments')
          .select('id, title, due_date, offering_id')
          .in('offering_id', activeOfferingIds)
          .eq('status', 'published')
          .gte('due_date', now)
          .lte('due_date', in14)
          .order('due_date', { ascending: true })
          .limit(5);

        // Build offering → course code map
        const codeMap: Record<string, string> = {};
        activeCourses.forEach(r => { codeMap[r.offering_id] = r.course_offerings?.courses?.code ?? ''; });

        deadlines = (assignRows ?? []).map((a: any) => ({
          id: a.id,
          title: a.title,
          due_date: a.due_date,
          offering_id: a.offering_id,
          courseCode: codeMap[a.offering_id] ?? '',
        }));
        deadlineCount = deadlines.length;
      }

      // 4. Recent announcements (course + global)
      let announcements: Announcement[] = [];
      if (activeOfferingIds.length > 0) {
        const { data: annRows } = await supabase
          .from('announcements')
          .select('id, title, body, created_at, is_pinned, offering_id')
          .in('offering_id', activeOfferingIds)
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(4);
        const codeMap: Record<string, string> = {};
        activeCourses.forEach(r => { codeMap[r.offering_id] = r.course_offerings?.courses?.code ?? ''; });
        announcements = (annRows ?? []).map((a: any) => ({
          ...a,
          courseCode: a.offering_id ? (codeMap[a.offering_id] ?? '') : 'Institution',
        }));
      }

      // Global announcements (offering_id IS NULL)
      const { data: globalAnns } = await supabase
        .from('announcements')
        .select('id, title, body, created_at, is_pinned, offering_id')
        .is('offering_id', null)
        .order('created_at', { ascending: false })
        .limit(3);
      const globalAnnsMapped = (globalAnns ?? []).map((a: any) => ({ ...a, courseCode: 'Institution' }));

      // Merge, sort by pinned then date, deduplicate, take 4
      const allAnns = [...announcements, ...globalAnnsMapped]
        .sort((a, b) => {
          if (b.is_pinned !== a.is_pinned) return b.is_pinned ? 1 : -1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        })
        .filter((a, i, arr) => arr.findIndex(x => x.id === a.id) === i)
        .slice(0, 4);

      // 5. Upcoming live sessions
      let liveSessions: LiveSession[] = [];
      if (activeOfferingIds.length > 0) {
        const { data: lsRows } = await supabase
          .from('live_sessions')
          .select('id, title, scheduled_at, duration_mins, platform, join_url, offering_id')
          .in('offering_id', activeOfferingIds)
          .in('status', ['scheduled'])
          .gte('scheduled_at', now)
          .order('scheduled_at', { ascending: true })
          .limit(3);
        const codeMap: Record<string, string> = {};
        activeCourses.forEach(r => { codeMap[r.offering_id] = r.course_offerings?.courses?.code ?? ''; });
        liveSessions = (lsRows ?? []).map((s: any) => ({
          ...s,
          courseCode: codeMap[s.offering_id] ?? '',
        }));
      }

      // 6. Upcoming academic calendar events
      const today = new Date().toISOString().slice(0, 10);
      const { data: calRows } = await supabase
        .from('academic_calendar')
        .select('id, event_name, event_type, event_date, end_date, description, term_id')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .limit(5);

      // Fetch term names separately to avoid FK join issues
      const calTermIds = [...new Set(((calRows ?? []) as any[]).map(e => e.term_id).filter(Boolean))];
      const { data: calTermRows } = calTermIds.length > 0
        ? await supabase.from('academic_terms').select('id, term_name').in('id', calTermIds)
        : { data: [] };
      const calTermMap: Record<string, string> = {};
      ((calTermRows ?? []) as any[]).forEach(t => { calTermMap[t.id] = t.term_name; });

      const calendarEvents: CalendarEvent[] = ((calRows ?? []) as any[]).map(e => ({
        id: e.id,
        event_name: e.event_name,
        event_type: e.event_type,
        event_date: e.event_date,
        end_date: e.end_date,
        description: e.description,
        term_name: calTermMap[e.term_id] ?? '—',
      }));

      // 7. Unread notifications count + completed lessons
      const [notifRes, lessonRes] = await Promise.all([
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_read', false),
        supabase
          .from('lesson_progress')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', userId)
          .eq('status', 'completed'),
      ]);

      // Profile widget data
      const [{ data: profileData }, { data: standingData }, { data: feeData }] = await Promise.all([
        supabase
          .from('student_profiles')
          .select('student_no, program, year_of_study, degree_level, enrollment_status')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('academic_standing')
          .select('gpa, cumulative_gpa, standing, credits_earned')
          .eq('student_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('student_fee_accounts')
          .select('balance, status, due_date')
          .eq('student_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      setProfileWidget({
        studentNo  : (profileData as any)?.student_no ?? null,
        program    : (profileData as any)?.program ?? null,
        year       : (profileData as any)?.year_of_study ?? null,
        status     : (profileData as any)?.enrollment_status ?? null,
        gpa        : (standingData as any)?.cumulative_gpa ?? null,
        standing   : (standingData as any)?.standing ?? null,
        credits    : (standingData as any)?.credits_earned ?? 0,
        feeBalance : (feeData as any)?.balance ?? 0,
        feeStatus  : (feeData as any)?.status ?? null,
      });

      setData({
        user: {
          id: userId,
          first_name: (appUser as any).first_name,
          last_name: (appUser as any).last_name,
          studentNo: (studentProfile as any)?.student_no ?? null,
          program: (studentProfile as any)?.program ?? null,
          degreeLevel: (studentProfile as any)?.degree_level ?? null,
        },
        activeCourseCount: activeCourses.length,
        completedLessons: lessonRes.count ?? 0,
        deadlineCount,
        unreadNotifCount: notifRes.count ?? 0,
        courses: courseCards,
        deadlines,
        announcements: allAnns,
        liveSessions,
        calendarEvents,
      });
      setLoading(false);
    };

    load();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto animate-pulse space-y-6">
          <div className="h-28 bg-gray-200 rounded-xl" />
          <div className="grid grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
          </div>
          <div className="grid grid-cols-2 gap-6">
            {[1,2,3,4].map(i => <div key={i} className="h-40 bg-gray-200 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400">Unable to load dashboard.</p>
      </div>
    );
  }

  const firstName = data.user.first_name ?? 'Student';

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* 0 ── Profile Widget */}
        {profileWidget && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Academic Profile card */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">My Academic Profile</h3>
                <a href="/dashboard/profile" className="text-xs text-purple-600 hover:underline">View →</a>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Program</span>
                  <span className="text-gray-800 font-medium truncate max-w-[8rem]">{profileWidget.program ?? '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Year</span>
                  <span className="text-gray-800 font-medium">{profileWidget.year ? `Year ${profileWidget.year}` : '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Student No</span>
                  <span className="text-gray-800 font-medium font-mono text-xs">{profileWidget.studentNo ?? '—'}</span>
                </div>
              </div>
            </div>

            {/* Academic Standing card */}
            <div className={`border rounded-xl p-4 ${
              !profileWidget.standing || profileWidget.standing === 'good'
                ? 'bg-green-50 border-green-200'
                : profileWidget.standing === 'honors'
                ? 'bg-yellow-50 border-yellow-200'
                : profileWidget.standing === 'warning'
                ? 'bg-amber-50 border-amber-200'
                : profileWidget.standing === 'probation'
                ? 'bg-orange-50 border-orange-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Academic Standing</h3>
                <a href="/dashboard/standing" className="text-xs text-purple-600 hover:underline">View →</a>
              </div>
              <div className="text-center py-1">
                <p className="text-2xl font-bold text-gray-800">
                  {profileWidget.gpa ? profileWidget.gpa.toFixed(2) : '—'}
                </p>
                <p className="text-xs text-gray-500 mt-1">Cumulative GPA</p>
                <span className={`inline-block mt-2 text-xs px-3 py-1 rounded-full font-medium ${
                  !profileWidget.standing || profileWidget.standing === 'good'
                    ? 'bg-green-100 text-green-800'
                    : profileWidget.standing === 'honors'
                    ? 'bg-yellow-100 text-yellow-800'
                    : profileWidget.standing === 'warning'
                    ? 'bg-amber-100 text-amber-800'
                    : profileWidget.standing === 'probation'
                    ? 'bg-orange-100 text-orange-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {profileWidget.standing
                    ? profileWidget.standing.charAt(0).toUpperCase() + profileWidget.standing.slice(1)
                    : 'Not recorded'
                  }
                </span>
              </div>
            </div>

            {/* Fee Status card */}
            <div className={`border rounded-xl p-4 ${
              profileWidget.feeStatus === 'paid'
                ? 'bg-green-50 border-green-200'
                : profileWidget.feeStatus === 'overdue'
                ? 'bg-red-50 border-red-200'
                : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Fee Status</h3>
                <a href="/dashboard/fees" className="text-xs text-purple-600 hover:underline">View →</a>
              </div>
              <div className="text-center py-1">
                <p className="text-2xl font-bold text-gray-800">
                  {profileWidget.feeBalance > 0
                    ? `ETB ${profileWidget.feeBalance.toLocaleString()}`
                    : 'Paid'
                  }
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {profileWidget.feeBalance > 0 ? 'Outstanding balance' : 'No outstanding balance'}
                </p>
                {profileWidget.feeStatus === 'overdue' && (
                  <span className="inline-block mt-2 text-xs px-3 py-1 rounded-full font-medium bg-red-100 text-red-800">
                    ⚠️ Overdue
                  </span>
                )}
              </div>
            </div>

          </div>
        )}

        {/* Standing alert banner */}
        {profileWidget?.standing && ['warning', 'probation', 'suspension'].includes(profileWidget.standing) && (
          <div className={`flex items-start gap-3 p-4 rounded-xl border ${
            profileWidget.standing === 'suspension'
              ? 'bg-red-50 border-red-200'
              : profileWidget.standing === 'probation'
              ? 'bg-orange-50 border-orange-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <span className="text-xl flex-shrink-0">
              {profileWidget.standing === 'suspension' ? '❌' : '⚠️'}
            </span>
            <div>
              <p className="font-semibold text-gray-800 text-sm">
                {profileWidget.standing === 'suspension'
                  ? 'Your account is suspended'
                  : profileWidget.standing === 'probation'
                  ? 'You are on academic probation'
                  : 'Academic warning'
                }
              </p>
              <p className="text-sm text-gray-600 mt-0.5">
                {profileWidget.standing === 'suspension'
                  ? 'Contact the registrar office immediately.'
                  : 'Please contact your academic advisor as soon as possible.'
                }
              </p>
            </div>
          </div>
        )}

        {/* 1 ── Welcome Banner */}
        <div className="rounded-2xl bg-gradient-to-r from-[#4c1d95] to-[#7c3aed] text-white px-8 py-7">
          <p className="text-2xl font-bold">{greeting(firstName)}</p>
          <p className="text-white/75 text-sm mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3">
            {data.user.studentNo && (
              <p className="text-white/80 text-xs">Student No: <span className="font-semibold text-white">{data.user.studentNo}</span></p>
            )}
            {data.user.program && (
              <p className="text-white/80 text-xs">Program: <span className="font-semibold text-white">{data.user.program}{data.user.degreeLevel ? ` · ${data.user.degreeLevel}` : ''}</span></p>
            )}
          </div>
          <div className="flex gap-4 mt-5">
            <Link
              href="/dashboard/courses"
              className="px-5 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-colors"
            >
              My Courses →
            </Link>
            <Link
              href="/dashboard/grades"
              className="px-5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
            >
              View Grades →
            </Link>
          </div>
        </div>

        {/* 2 ── Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Enrolled Courses',     value: data.activeCourseCount,  icon: '📚', color: 'text-indigo-600', href: '/dashboard/courses' },
            { label: 'Lessons Completed',    value: data.completedLessons,   icon: '✅', color: 'text-green-600',  href: '/dashboard/courses' },
            { label: 'Pending Assignments',  value: data.deadlineCount,      icon: '📝', color: 'text-amber-600',  href: '/dashboard/courses' },
            { label: 'Unread Notifications', value: data.unreadNotifCount,   icon: '🔔', color: 'text-rose-600',   href: '/dashboard/notifications' },
          ].map(s => (
            <Link key={s.label} href={s.href}
              className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 hover:shadow-md transition-shadow"
            >
              <span className="text-3xl">{s.icon}</span>
              <div>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* 3 ── My Courses */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">My Courses</h2>
            <Link href="/dashboard/courses" className="text-sm text-[#4c1d95] hover:underline">View all →</Link>
          </div>
          {data.courses.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
              No active courses right now.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.courses.map(c => (
                <div key={c.offeringId} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                  <div className="h-2 bg-[#FEF08A]" />
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">{c.courseCode}</span>
                      <span className="text-xs text-gray-500">§{c.sectionName}</span>
                    </div>
                    <h3 className="text-sm font-bold text-gray-900 leading-tight line-clamp-2">{c.courseTitle}</h3>
                    <p className="text-xs text-gray-500 mt-2">🎓 {c.instructor}</p>
                    <p className="text-xs text-gray-500">📅 {c.startDate} – {c.endDate}</p>
                    <Link
                      href={`/dashboard/class/${c.offeringId}/t1`}
                      className="mt-3 inline-flex items-center justify-center w-full py-1.5 rounded-lg bg-[#4c1d95] hover:bg-[#5b21b6] text-white text-xs font-semibold uppercase tracking-wide transition-colors"
                    >
                      Go to Class
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Academic Calendar */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-900">Academic Calendar</h2>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {data.calendarEvents.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">No upcoming academic events.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.calendarEvents.map(e => (
                  <li key={e.id} className="px-4 py-3 flex items-start gap-4">
                    <div className="shrink-0 w-10 text-center">
                      <div className="text-sm font-bold text-gray-900 leading-tight">
                        {new Date(e.event_date + 'T12:00:00').getDate()}
                      </div>
                      <div className="text-[10px] text-gray-500 uppercase">
                        {new Date(e.event_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">{e.event_name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize ${calEventTypeBadge(e.event_type)}`}>
                          {e.event_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{e.term_name}</p>
                      {e.description && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{e.description}</p>
                      )}
                    </div>
                    {e.end_date && e.end_date !== e.event_date && (
                      <span className="shrink-0 text-xs text-gray-400 whitespace-nowrap">
                        → {new Date(e.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Bottom 3-column row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* 4 ── Upcoming Deadlines */}
          <section className="lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-900">Upcoming Deadlines</h2>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {data.deadlines.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">No deadlines in the next 2 weeks. 🎉</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {data.deadlines.map(d => {
                    const urgency = new Date(d.due_date).getTime() - Date.now() < 86400000 * 2;
                    return (
                      <li key={d.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-gray-900 leading-snug line-clamp-1">{d.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{d.courseCode}</p>
                          </div>
                          <span className={`text-xs font-medium whitespace-nowrap ${urgency ? 'text-red-600' : 'text-amber-600'}`}>
                            {daysUntil(d.due_date)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* 5 ── Recent Announcements */}
          <section className="lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-900">Announcements</h2>
              <Link href="/dashboard/announcements" className="text-xs text-[#4c1d95] hover:underline">View all →</Link>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {data.announcements.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">No recent announcements.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {data.announcements.map(a => (
                    <li key={a.id} className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        {a.is_pinned && <span className="text-amber-500 text-xs mt-0.5">📌</span>}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 leading-snug line-clamp-1">{a.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{a.courseCode} · {fmt(a.created_at)}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* 6 ── Upcoming Live Sessions */}
          <section className="lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-900">Live Sessions</h2>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {data.liveSessions.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">No upcoming live sessions.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {data.liveSessions.map(s => {
                    const d = new Date(s.scheduled_at);
                    return (
                      <li key={s.id} className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 line-clamp-1">{s.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{s.courseCode}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <p className="text-xs text-gray-500">
                            📅 {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {' '}{d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </p>
                          <a
                            href={s.join_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-[#4c1d95] hover:underline"
                          >
                            Join →
                          </a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}
