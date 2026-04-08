'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type ForumThread = {
  id: string;
  title: string;
  is_pinned: boolean;
  is_locked: boolean;
  reply_count: number;
  created_at: string;
  offering_id: string;
  courseCode: string;
  authorName: string;
  authorId: string;
};

const PAGE_SIZE = 20;

function timeAgo(ts: string): string {
  const d = new Date(ts);
  const diffH = (Date.now() - d.getTime()) / 3_600_000;
  if (diffH < 1) return `${Math.floor(diffH * 60)}m ago`;
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  if (diffH < 48) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ForumsPage() {
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [filter, setFilter] = useState<'all' | 'mine' | 'unanswered'>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setLoading(false); return; }

      const { data: appUser } = await supabase
        .from('users').select('id').eq('auth_user_id', authData.user.id).single();
      if (!appUser) { setLoading(false); return; }

      const uid = (appUser as { id: string }).id;
      setUserId(uid);

      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('offering_id, course_offerings!fk_enrollments_offering(status, courses!fk_course_offerings_course(code))')
        .eq('student_id', uid)
        .eq('status', 'active');

      const rows = (enrollments ?? []) as any[];
      const activeOfferingIds = rows
        .filter(r => ['upcoming', 'active'].includes(r.course_offerings?.status ?? ''))
        .map(r => r.offering_id as string);

      const codeMap: Record<string, string> = {};
      rows.forEach(r => { codeMap[r.offering_id] = r.course_offerings?.courses?.code ?? ''; });

      if (activeOfferingIds.length === 0) { setLoading(false); return; }

      const { data: threadRows } = await supabase
        .from('forum_threads')
        .select(`
          id, title, is_pinned, is_locked, reply_count, created_at, offering_id, author_id,
          users!fk_forum_threads_author(first_name, last_name)
        `)
        .in('offering_id', activeOfferingIds)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      setThreads(
        ((threadRows ?? []) as any[]).map(t => ({
          id: t.id,
          title: t.title,
          is_pinned: t.is_pinned,
          is_locked: t.is_locked,
          reply_count: t.reply_count ?? 0,
          created_at: t.created_at,
          offering_id: t.offering_id,
          courseCode: codeMap[t.offering_id] ?? '—',
          authorName: t.users ? `${t.users.first_name} ${t.users.last_name}` : 'Unknown',
          authorId: t.author_id,
        }))
      );
      setLoading(false);
    })();
  }, []);

  const filtered = threads.filter(t => {
    if (filter === 'mine') return t.authorId === userId;
    if (filter === 'unanswered') return t.reply_count === 0;
    return true;
  });

  const pages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>💬</span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Discussion Forums</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {loading ? 'Loading…' : `${filtered.length} thread${filtered.length !== 1 ? 's' : ''} across your courses`}
              </p>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
          {(['all', 'mine', 'unanswered'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => { setFilter(f); setPage(1); }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f === 'all' ? 'All Courses' : f === 'mine' ? 'My Threads' : 'Unanswered'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 bg-gray-200 rounded-xl" />)}
          </div>
        ) : paginated.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <span className="text-5xl block mb-4">💬</span>
            <p className="text-gray-500 font-medium">
              {filter === 'mine' ? 'You have not started any threads yet.'
                : filter === 'unanswered' ? 'All threads have replies!'
                : 'No forum threads found.'}
            </p>
            <p className="text-gray-400 text-sm mt-1">Check back later or visit a course to start a discussion.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Thread', 'Course', 'Posted by', 'Replies', 'Posted'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginated.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 max-w-xs">
                        <div className="flex items-center gap-1.5">
                          {t.is_pinned && <span className="text-amber-500 text-xs flex-shrink-0">📌</span>}
                          {t.is_locked && <span className="text-gray-400 text-xs flex-shrink-0">🔒</span>}
                          <Link
                            href={`/dashboard/class/${t.offering_id}/forums`}
                            className="font-medium text-gray-900 hover:text-[#4c1d95] line-clamp-1"
                          >
                            {t.title}
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-medium">
                          {t.courseCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{t.authorName}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold ${t.reply_count === 0 ? 'text-amber-600' : 'text-gray-600'}`}>
                          💬 {t.reply_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{timeAgo(t.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-gray-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded border border-gray-200 text-sm text-gray-600 disabled:opacity-40 hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded bg-gray-50">
                    {page} / {pages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(pages, p + 1))}
                    disabled={page === pages}
                    className="px-3 py-1.5 rounded border border-gray-200 text-sm text-gray-600 disabled:opacity-40 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
