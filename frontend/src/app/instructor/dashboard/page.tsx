import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import DashboardSearch, { type SearchOffering } from './DashboardSearch';

const COURSE_COLORS = [
  'bg-[#1e3a5f]',
  'bg-[#d97706]',
  'bg-[#2563eb]',
  'bg-[#16a34a]',
  'bg-[#7c3aed]',
  'bg-[#dc2626]',
];

const COURSE_BAR_COLORS = [
  'bg-[#1e3a5f]',
  'bg-[#d97706]',
  'bg-[#2563eb]',
  'bg-[#16a34a]',
  'bg-[#7c3aed]',
  'bg-[#dc2626]',
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getTermProgress(startDate: string | null, endDate: string | null): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const now = Date.now();
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

function getActivityInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-purple-500',
  'bg-red-500',
  'bg-green-500',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatRelativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} days ago`;
}

function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default async function InstructorDashboardPage() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) redirect('/login');

  const { data: appUser } = await supabase
    .from('users')
    .select('id, first_name, last_name')
    .eq('auth_user_id', authUser.id)
    .single();

  const instructorName = appUser
    ? [appUser.first_name, appUser.last_name].filter(Boolean).join(' ').trim() || 'Instructor'
    : 'Instructor';

  // All course offerings for this instructor
  const { data: assignments } = await supabase
    .from('course_instructors')
    .select(`
      offering_id,
      course_offerings (
        id, enrolled_count, section_name,
        courses ( code, title ),
        academic_terms ( term_name, is_current, start_date, end_date )
      )
    `)
    .eq('instructor_id', appUser?.id ?? '');

  type Offering = {
    id: string;
    enrolled_count: number;
    section_name: string | null;
    courses: { code: string; title: string } | null;
    academic_terms: { term_name: string; is_current: boolean; start_date: string | null; end_date: string | null } | null;
  };

  const offerings: Offering[] = (assignments ?? [])
    .map((a: any) => a.course_offerings)
    .filter(Boolean) as Offering[];

  const offeringIds = offerings.map((o) => o.id);

  // Stats
  const totalStudents = offerings.reduce((s, o) => s + (o.enrolled_count ?? 0), 0);
  const activeCourses = offerings.filter((o) => o.academic_terms?.is_current).length || offerings.length;

  // Pending reviews
  let pendingReviews = 0;
  let pendingDueToday = 0;
  const allAssignmentIds: string[] = [];

  if (offeringIds.length > 0) {
    const { data: assignRows } = await supabase
      .from('assignments')
      .select('id, due_date')
      .in('offering_id', offeringIds);

    if (assignRows && assignRows.length > 0) {
      const ids = (assignRows as any[]).map((a) => a.id);
      allAssignmentIds.push(...ids);

      const { count } = await supabase
        .from('assignment_submissions')
        .select('id', { count: 'exact', head: true })
        .in('assignment_id', ids)
        .eq('status', 'submitted');
      pendingReviews = count ?? 0;

      // Count due today
      const todayStr = new Date().toISOString().slice(0, 10);
      pendingDueToday = (assignRows as any[]).filter((a) => {
        if (!a.due_date) return false;
        return a.due_date.slice(0, 10) === todayStr;
      }).length;
    }
  }

  // Recent activity: latest assignment submissions
  type Activity = {
    id: string;
    studentName: string;
    action: string;
    detail: string;
    course: string;
    createdAt: string;
  };

  const recentActivity: Activity[] = [];

  if (allAssignmentIds.length > 0) {
    const { data: subs } = await supabase
      .from('assignment_submissions')
      .select(`
        id, created_at, status,
        assignments ( title, offering_id,
          course_offerings ( courses ( code ) )
        ),
        students:users!assignment_submissions_student_id_fkey ( first_name, last_name )
      `)
      .in('assignment_id', allAssignmentIds)
      .order('created_at', { ascending: false })
      .limit(5);

    if (subs) {
      for (const sub of subs as any[]) {
        const studentName = [sub.students?.first_name, sub.students?.last_name].filter(Boolean).join(' ') || 'A student';
        const assignTitle = sub.assignments?.title ?? 'an assignment';
        const courseCode = sub.assignments?.course_offerings?.courses?.code ?? '';
        recentActivity.push({
          id: sub.id,
          studentName,
          action: sub.status === 'submitted' ? 'submitted' : 'updated submission for',
          detail: assignTitle,
          course: courseCode,
          createdAt: sub.created_at,
        });
      }
    }
  }

  // Upcoming tasks: assignments due in next 7 days
  type Task = {
    id: string;
    title: string;
    dueDate: string;
    priority: 'high' | 'medium' | 'low';
    courseCode: string;
    type: 'assignment' | 'assessment';
  };

  const upcomingTasks: Task[] = [];

  if (offeringIds.length > 0) {
    const now = new Date().toISOString();
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: upcomingAssignments } = await supabase
      .from('assignments')
      .select(`
        id, title, due_date,
        course_offerings ( courses ( code ) )
      `)
      .in('offering_id', offeringIds)
      .gte('due_date', now)
      .lte('due_date', nextWeek)
      .order('due_date', { ascending: true })
      .limit(5);

    if (upcomingAssignments) {
      for (const a of upcomingAssignments as any[]) {
        const daysUntil = (new Date(a.due_date).getTime() - Date.now()) / 86400000;
        upcomingTasks.push({
          id: a.id,
          title: `Grade ${a.title}`,
          dueDate: a.due_date,
          priority: daysUntil <= 1 ? 'high' : daysUntil <= 3 ? 'medium' : 'low',
          courseCode: a.course_offerings?.courses?.code ?? '',
          type: 'assignment',
        });
      }
    }

    const { data: upcomingAssessments } = await supabase
      .from('assessments')
      .select(`
        id, title, due_date,
        course_offerings ( courses ( code ) )
      `)
      .in('offering_id', offeringIds)
      .gte('due_date', now)
      .lte('due_date', nextWeek)
      .order('due_date', { ascending: true })
      .limit(3);

    if (upcomingAssessments) {
      for (const a of upcomingAssessments as any[]) {
        const daysUntil = (new Date(a.due_date).getTime() - Date.now()) / 86400000;
        upcomingTasks.push({
          id: a.id,
          title: `Review ${a.title}`,
          dueDate: a.due_date,
          priority: daysUntil <= 1 ? 'high' : daysUntil <= 3 ? 'medium' : 'low',
          courseCode: a.course_offerings?.courses?.code ?? '',
          type: 'assessment',
        });
      }
    }

    upcomingTasks.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }

  const priorityColors = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-green-100 text-green-700',
  };

  // Academic calendar events
  const calToday = new Date().toISOString().slice(0, 10);
  const { data: calRows } = await supabase
    .from('academic_calendar')
    .select('id, event_name, event_type, event_date, end_date, description, term_id')
    .gte('event_date', calToday)
    .order('event_date', { ascending: true })
    .limit(5);

  // Fetch term names separately to avoid FK join issues
  const calTermIds = [...new Set(((calRows ?? []) as any[]).map((e: any) => e.term_id).filter(Boolean))];
  const { data: calTermRows } = calTermIds.length > 0
    ? await supabase.from('academic_terms').select('id, term_name').in('id', calTermIds)
    : { data: [] };
  const calTermMap: Record<string, string> = {};
  ((calTermRows ?? []) as any[]).forEach((t: any) => { calTermMap[t.id] = t.term_name; });

  type CalEvent = {
    id: string; event_name: string; event_type: string;
    event_date: string; end_date: string | null;
    description: string | null; term_name: string;
  };
  const calendarEvents: CalEvent[] = ((calRows ?? []) as any[]).map((e: any) => ({
    id: e.id,
    event_name: e.event_name,
    event_type: e.event_type,
    event_date: e.event_date,
    end_date: e.end_date,
    description: e.description,
    term_name: calTermMap[e.term_id] ?? '—',
  }));

  const calEventBadge = (type: string) => {
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
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {getGreeting()}, {instructorName.split(' ')[0] ? `${instructorName.split(' ')[0].startsWith('Dr') ? '' : 'Dr. '}${instructorName}` : instructorName}
        </h1>
        <p className="text-gray-500 mt-1">Here&apos;s what&apos;s happening across your courses today.</p>
      </div>

      {/* Search */}
      <DashboardSearch
        offerings={offerings.map((o): SearchOffering => ({
          id: o.id,
          courseCode: o.courses?.code ?? '',
          courseTitle: o.courses?.title ?? '',
          termName: o.academic_terms?.term_name ?? '',
          enrolledCount: o.enrolled_count ?? 0,
        }))}
      />

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium">Total Students</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{totalStudents}</p>
            <p className="text-xs text-green-600 mt-1">across all courses</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium">Active Courses</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{activeCourses}</p>
            <p className="text-xs text-gray-500 mt-1">this semester</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium">Pending Reviews</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{pendingReviews}</p>
            {pendingDueToday > 0 && (
              <p className="text-xs text-red-500 mt-1">{pendingDueToday} due today</p>
            )}
          </div>
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium">Avg. Grade</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">—</p>
            <p className="text-xs text-gray-400 mt-1">no data yet</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        </div>
      </div>

      {/* My Courses */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">My Courses</h2>
        {offerings.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
            No courses assigned yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {offerings.map((offering, idx) => {
              const progress = getTermProgress(
                offering.academic_terms?.start_date ?? null,
                offering.academic_terms?.end_date ?? null,
              );
              const colorClass = COURSE_COLORS[idx % COURSE_COLORS.length];
              const barColorClass = COURSE_BAR_COLORS[idx % COURSE_BAR_COLORS.length];
              const gradebookHref = `/instructor/courses/${offering.id}/gradebook`;
              return (
                <Link
                  key={offering.id}
                  href={gradebookHref}
                  className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className={`h-2 w-full ${colorClass}`} />
                  <div className="p-4">
                    <span className="inline-block text-xs font-semibold text-gray-500 bg-gray-100 rounded px-2 py-0.5 mb-2">
                      {offering.courses?.code ?? '—'}
                    </span>
                    <h3 className="text-sm font-bold text-gray-900 leading-snug mb-3">
                      {offering.courses?.title ?? 'Untitled Course'}
                    </h3>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs text-gray-500">Course Progress</span>
                      <span className="text-xs font-semibold text-gray-700">{progress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mb-3">
                      <div
                        className={`h-1.5 rounded-full ${barColorClass}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {offering.enrolled_count ?? 0} students
                      </span>
                      <span className="text-gray-400">{offering.academic_terms?.term_name ?? ''}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Academic Calendar */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Academic Calendar</h2>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {calendarEvents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No upcoming academic events.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {calendarEvents.map(e => (
                <li key={e.id} className="px-5 py-3 flex items-start gap-4">
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
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize ${calEventBadge(e.event_type)}`}>
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
      </div>

      {/* Bottom row: Recent Activity + Upcoming Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Recent Activity</h2>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No recent activity yet.</p>
          ) : (
            <div className="space-y-4">
              {recentActivity.map((act) => (
                <div key={act.id} className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${avatarColor(act.studentName)}`}
                  >
                    {getActivityInitials(act.studentName)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{act.studentName}</span>
                      {' '}{act.action}{' '}
                      <span className="font-medium">{act.detail}</span>
                      {act.course && (
                        <span className="text-gray-500"> {act.course}</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatRelativeTime(act.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Tasks */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Upcoming Tasks</h2>
          {upcomingTasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No upcoming tasks this week.</p>
          ) : (
            <div className="space-y-3">
              {upcomingTasks.slice(0, 5).map((task) => (
                <div key={task.id} className="flex items-start gap-3">
                  <div className="mt-0.5 w-4 h-4 rounded-full border-2 border-gray-300 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-gray-500">{formatDueDate(task.dueDate)}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${priorityColors[task.priority]}`}>
                        {task.priority}
                      </span>
                      {task.courseCode && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                          {task.courseCode}
                        </span>
                      )}
                    </div>
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
