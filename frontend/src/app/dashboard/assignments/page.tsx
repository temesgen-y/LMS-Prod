'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

type Assignment = {
  id: string;
  title: string;
  brief: string | null;
  due_date: string;
  max_score: number;
  status: string;
  allow_files: boolean;
  allow_text: boolean;
  late_allowed: boolean;
  offering_id: string;
  course_name: string;
  submission_id: string | null;
  submitted_at: string | null;
  submission_status: string | null;
  score: number | null;
};

export default function StudentAssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'submitted' | 'graded'>('all');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();
      if (!profile) return;
      setUserId(profile.id);

      // Get active enrollments
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('id, offering_id')
        .eq('student_id', profile.id)
        .eq('status', 'active');
      if (!enrollments || enrollments.length === 0) { setLoading(false); return; }

      const offeringIds = enrollments.map((e: any) => e.offering_id);
      const enrollmentIds = enrollments.map((e: any) => e.id);

      // Get assignments for those offerings
      const { data: asgns } = await supabase
        .from('assignments')
        .select(`
          id, title, brief, due_date, max_score, status,
          allow_files, allow_text, late_allowed, offering_id,
          course_offerings(
            courses(title)
          )
        `)
        .in('offering_id', offeringIds)
        .eq('status', 'published')
        .order('due_date', { ascending: true });

      if (!asgns) { setLoading(false); return; }

      // Get student's submissions
      const asnIds = asgns.map((a: any) => a.id);
      const { data: submissions } = await supabase
        .from('assignment_submissions')
        .select('id, assignment_id, submitted_at, status')
        .eq('student_id', profile.id)
        .in('assignment_id', asnIds);

      // Get grades from gradebook_items (keyed by enrollment)
      const { data: grades } = await supabase
        .from('gradebook_items')
        .select('assignment_id, raw_score')
        .in('enrollment_id', enrollmentIds)
        .in('assignment_id', asnIds);

      const subMap = new Map((submissions || []).map((s: any) => [s.assignment_id, s]));
      const gradeMap = new Map((grades || []).map((g: any) => [g.assignment_id, g.raw_score]));

      const result: Assignment[] = asgns.map((a: any) => {
        const sub = subMap.get(a.id) as any;
        return {
          id: a.id,
          title: a.title,
          brief: a.brief,
          due_date: a.due_date,
          max_score: a.max_score,
          status: a.status,
          allow_files: a.allow_files,
          allow_text: a.allow_text,
          late_allowed: a.late_allowed,
          offering_id: a.offering_id,
          course_name: a.course_offerings?.courses?.title ?? 'Unknown Course',
          submission_id: sub?.id ?? null,
          submitted_at: sub?.submitted_at ?? null,
          submission_status: sub?.status ?? null,
          score: gradeMap.get(a.id) ?? null,
        };
      });

      setAssignments(result);
      setLoading(false);
    };
    load();
  }, []);

  const now = new Date();

  const filtered = assignments.filter(a => {
    if (filter === 'pending') return !a.submission_id;
    if (filter === 'submitted') return !!a.submission_id && a.score === null;
    if (filter === 'graded') return a.score !== null;
    return true;
  });

  const pendingCount = assignments.filter(a => !a.submission_id).length;
  const submittedCount = assignments.filter(a => !!a.submission_id && a.score === null).length;
  const gradedCount = assignments.filter(a => a.score !== null).length;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const isOverdue = (due: string) => new Date(due) < now;

  const getStatusBadge = (a: Assignment) => {
    if (a.score !== null) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Graded</span>;
    }
    if (a.submission_id) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Submitted</span>;
    }
    if (isOverdue(a.due_date)) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Overdue</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Pending</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#4c1d95] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
        <p className="text-sm text-gray-500 mt-1">All assignments from your enrolled courses</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-amber-600">{pendingCount}</p>
          <p className="text-xs text-amber-700 mt-1 font-medium">Pending</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-600">{submittedCount}</p>
          <p className="text-xs text-blue-700 mt-1 font-medium">Awaiting Grade</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{gradedCount}</p>
          <p className="text-xs text-green-700 mt-1 font-medium">Graded</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 border-b border-gray-200">
        {(['all', 'pending', 'submitted', 'graded'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              filter === f
                ? 'border-[#4c1d95] text-[#4c1d95]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {f === 'all' ? `All (${assignments.length})` : f === 'pending' ? `Pending (${pendingCount})` : f === 'submitted' ? `Submitted (${submittedCount})` : `Graded (${gradedCount})`}
          </button>
        ))}
      </div>

      {/* Assignment list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📝</p>
          <p className="font-medium">No assignments found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => (
            <div
              key={a.id}
              className={`bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow ${
                !a.submission_id && isOverdue(a.due_date) ? 'border-red-200' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-medium text-[#4c1d95] bg-purple-50 px-2 py-0.5 rounded-full">
                      {a.course_name}
                    </span>
                    {getStatusBadge(a)}
                  </div>
                  <Link href={`/dashboard/assignments/${a.id}`} className="font-semibold text-gray-900 text-sm hover:text-[#4c1d95] hover:underline">
                    {a.title}
                  </Link>
                  {a.brief && (
                    <p
                      className="text-xs text-gray-500 mt-1 line-clamp-2"
                      dangerouslySetInnerHTML={{ __html: a.brief }}
                    />
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span className={`flex items-center gap-1 ${!a.submission_id && isOverdue(a.due_date) ? 'text-red-500 font-medium' : ''}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                        <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5V3.75Z" clipRule="evenodd" />
                      </svg>
                      Due {formatDate(a.due_date)}
                    </span>
                    <span>Max: {a.max_score} pts</span>
                    {a.submitted_at && (
                      <span className="text-blue-500">Submitted {formatDate(a.submitted_at)}</span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  {a.score !== null && (
                    <div className="mb-2">
                      <span className="text-lg font-bold text-green-600">{a.score}</span>
                      <span className="text-xs text-gray-400">/{a.max_score}</span>
                    </div>
                  )}
                  <Link
                    href={`/dashboard/assignments/${a.id}`}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      a.submission_id
                        ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        : 'bg-[#4c1d95] text-white hover:bg-[#3b0764]'
                    }`}
                  >
                    {a.submission_id ? 'View' : 'Submit'}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
