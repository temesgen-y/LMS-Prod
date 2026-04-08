'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

const TYPE_ICONS: Record<string, string> = {
  exam_published:       '📝',
  grade_released:       '📊',
  submission_graded:    '✅',
  assignment_due:       '⏰',
  announcement:         '📢',
  live_session_reminder:'🎥',
  enrollment_confirmed: '🎓',
  grade_override:       '🔄',
};

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filterRead, setFilterRead] = useState<'all' | 'unread' | 'read'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setLoading(false); return; }

    const { data: appUser } = await supabase
      .from('users').select('id').eq('auth_user_id', authData.user.id).single();
    if (!appUser) { setLoading(false); return; }

    const uid = (appUser as { id: string }).id;
    setUserId(uid);

    const { data: rows } = await supabase
      .from('notifications')
      .select('id, type, title, body, link, is_read, read_at, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    setNotifs((rows ?? []) as Notif[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id: string) => {
    if (!userId) return;
    const supabase = createClient();
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    if (!userId) return;
    const supabase = createClient();
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_read', false);
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const handleClick = (n: Notif) => {
    if (!n.is_read) markRead(n.id);
    if (n.link) router.push(n.link);
  };

  const filtered = notifs.filter(n => {
    if (filterRead === 'unread') return !n.is_read;
    if (filterRead === 'read') return n.is_read;
    return true;
  });

  const pages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const unreadCount = notifs.filter(n => !n.is_read).length;

  const fmtTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 3600000;
    if (diffH < 1) return `${Math.floor(diffH * 60)}m ago`;
    if (diffH < 24) return `${Math.floor(diffH)}h ago`;
    if (diffH < 48) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>🔔</span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </p>
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-sm text-[#4c1d95] hover:underline"
            >
              Mark all as read
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
          {(['all', 'unread', 'read'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => { setFilterRead(f); setPage(1); }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                filterRead === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading notifications…</div>
        ) : paginated.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <span className="text-4xl block mb-3">🔔</span>
            <p className="text-gray-400">{filterRead === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}</p>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              {paginated.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  className={`w-full text-left rounded-xl px-4 py-4 transition-colors ${
                    !n.is_read ? 'bg-indigo-50 hover:bg-indigo-100' : 'bg-white hover:bg-gray-50 border border-gray-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl flex-shrink-0 mt-0.5">{TYPE_ICONS[n.type] ?? '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm leading-snug ${!n.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                          {n.title}
                        </p>
                        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">{fmtTime(n.created_at)}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs text-gray-400 capitalize bg-gray-100 px-1.5 py-0.5 rounded">
                          {n.type.replace(/_/g, ' ')}
                        </span>
                        {!n.is_read && (
                          <span className="w-2 h-2 rounded-full bg-[#4c1d95] flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {pages > 1 && (
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded border text-sm disabled:opacity-40">Prev</button>
                <span className="px-3 py-1 text-sm text-gray-600">{page}/{pages}</span>
                <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1 rounded border text-sm disabled:opacity-40">Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
