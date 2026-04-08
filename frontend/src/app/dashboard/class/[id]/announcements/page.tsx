'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Ann = {
  id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  authorName: string;
  authorInitials: string;
};

function timeAgo(ts: string): string {
  const d = new Date(ts);
  const diffH = (Date.now() - d.getTime()) / 3_600_000;
  if (diffH < 1) return `${Math.floor(diffH * 60)}m ago`;
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  if (diffH < 48) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function ClassAnnouncementsPage() {
  const params = useParams();
  const offeringId = params?.id as string;

  const [anns, setAnns] = useState<Ann[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!offeringId) return;
    (async () => {
      const supabase = createClient();
      const { data: rows } = await supabase
        .from('announcements')
        .select(`
          id, title, body, is_pinned, created_at,
          users!fk_announcements_author(first_name, last_name)
        `)
        .eq('offering_id', offeringId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      setAnns(
        ((rows ?? []) as any[]).map(a => {
          const name = a.users
            ? `${a.users.first_name ?? ''} ${a.users.last_name ?? ''}`.trim()
            : 'Instructor';
          return {
            id: a.id,
            title: a.title,
            body: a.body,
            is_pinned: a.is_pinned,
            created_at: a.created_at,
            authorName: name || 'Instructor',
            authorInitials: initials(name || 'IN'),
          };
        })
      );
      setLoading(false);
    })();
  }, [offeringId]);

  return (
    <div className="w-full min-w-0">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl" aria-hidden>📢</span>
        <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
      </div>
      <div className="border-t border-gray-200 mb-6" />

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-gray-200 rounded-xl" />)}
        </div>
      ) : anns.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <span className="text-5xl block mb-4">📢</span>
          <p className="text-gray-500 font-medium">No announcements yet</p>
          <p className="text-gray-400 text-sm mt-1">Your instructor has not posted any announcements for this course.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {anns.map(a => (
            <article
              key={a.id}
              className={`bg-white rounded-xl border overflow-hidden shadow-sm ${
                a.is_pinned ? 'border-amber-200' : 'border-gray-200'
              }`}
            >
              {a.is_pinned && <div className="h-1 bg-gradient-to-r from-amber-400 to-yellow-300" />}
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {a.is_pinned && (
                      <span className="text-amber-500 flex-shrink-0" aria-label="Pinned">📌</span>
                    )}
                    <h3 className="font-bold text-gray-900 text-base leading-snug">{a.title}</h3>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">{timeAgo(a.created_at)}</span>
                </div>

                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{a.body}</p>

                <div className="flex items-center gap-2 pt-4 mt-4 border-t border-gray-100">
                  <span className="w-8 h-8 rounded-full bg-[#4c1d95] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {a.authorInitials}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-gray-700">{a.authorName}</p>
                    <p className="text-xs text-gray-400">Instructor</p>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
