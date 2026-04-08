'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Announcement = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  is_pinned: boolean;
  offering_id: string | null;
  status: string;
  courseCode: string;
  courseTitle: string;
  instructorName: string;
  instructorInitials: string;
};

function getInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function fmtPostedDate(ts: string): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function AnnouncementsPage() {
  const [all, setAll] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'inactive'>('active');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const [collapseAll, setCollapseAll] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setLoading(false); return; }

      const { data: appUser } = await supabase
        .from('users').select('id').eq('auth_user_id', authData.user.id).single();
      if (!appUser) { setLoading(false); return; }

      const userId = (appUser as { id: string }).id;

      // Mark all unread announcement notifications as read
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('type', 'announcement')
        .eq('is_read', false);

      // Get enrollments with course info
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('offering_id, course_offerings!fk_enrollments_offering(status, courses!fk_course_offerings_course(code, title))')
        .eq('student_id', userId)
        .eq('status', 'active');

      const activeRows = (enrollments ?? []) as any[];
      const activeOfferingIds = activeRows
        .filter(r => ['upcoming', 'active'].includes(r.course_offerings?.status ?? ''))
        .map(r => r.offering_id as string);

      const codeMap: Record<string, { code: string; title: string }> = {};
      activeRows.forEach(r => {
        codeMap[r.offering_id] = {
          code: r.course_offerings?.courses?.code ?? '',
          title: r.course_offerings?.courses?.title ?? '',
        };
      });

      // Fetch primary instructor names for each offering
      const instructorMap: Record<string, string> = {};
      if (activeOfferingIds.length > 0) {
        const { data: ciRows } = await supabase
          .from('course_instructors')
          .select('offering_id, users!fk_course_instructors_instructor(first_name, last_name)')
          .in('offering_id', activeOfferingIds)
          .eq('role', 'primary');

        (ciRows ?? []).forEach((ci: any) => {
          const u = ci.users;
          instructorMap[ci.offering_id] = u
            ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Instructor'
            : 'Instructor';
        });
      }

      const results: Announcement[] = [];

      // Course announcements (active + inactive)
      if (activeOfferingIds.length > 0) {
        const { data: courseAnns } = await supabase
          .from('announcements')
          .select('id, title, body, created_at, is_pinned, offering_id, status')
          .in('offering_id', activeOfferingIds)
          .in('status', ['active', 'inactive'])
          .order('created_at', { ascending: false });

        (courseAnns ?? []).forEach((a: any) => {
          const instrName = instructorMap[a.offering_id] ?? 'Instructor';
          results.push({
            ...a,
            courseCode: codeMap[a.offering_id]?.code ?? '—',
            courseTitle: codeMap[a.offering_id]?.title ?? '—',
            instructorName: instrName,
            instructorInitials: getInitials(instrName),
          });
        });
      }

      // Global announcements
      const { data: globalAnns } = await supabase
        .from('announcements')
        .select('id, title, body, created_at, is_pinned, offering_id, status')
        .is('offering_id', null)
        .in('status', ['active', 'inactive'])
        .order('created_at', { ascending: false });

      (globalAnns ?? []).forEach((a: any) => {
        results.push({
          ...a,
          courseCode: 'Institution',
          courseTitle: 'Institution-Wide',
          instructorName: 'Admin',
          instructorInitials: 'AD',
        });
      });

      // Deduplicate, pinned first then latest
      const seen = new Set<string>();
      const deduped = results.filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; });
      deduped.sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setAll(deduped);
      setLoading(false);
    };
    load();
  }, []);

  const listed = all.filter(a => a.status === activeTab);
  const activeCount = all.filter(a => a.status === 'active').length;
  const inactiveCount = all.filter(a => a.status === 'inactive').length;

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setCollapseAll(false);
  };

  const handleCollapseAll = () => {
    setCollapseAll(true);
    setExpandedIds(new Set());
  };

  const handleExpandAll = () => {
    setCollapseAll(false);
    setExpandedIds(new Set(listed.map(a => a.id)));
  };

  const isExpanded = (id: string) => expandedIds.has(id);

  const acknowledge = (id: string) => {
    setAcknowledgedIds(prev => new Set(prev).add(id));
  };

  const TABS = [
    { key: 'active' as const,   label: 'ACTIVE',   count: activeCount   },
    { key: 'inactive' as const, label: 'INACTIVE', count: inactiveCount },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-white min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-gray-700 flex-shrink-0">
            <path d="M16.881 4.345A23.112 23.112 0 0 1 8.25 6H7.5a5.25 5.25 0 0 0-.88 10.427 21.593 21.593 0 0 0 1.378 3.94c.464 1.004 1.674 1.32 2.582.796l.657-.379c.88-.508 1.165-1.593.772-2.468a17.116 17.116 0 0 1-.628-1.607c1.918.258 3.76.75 5.5 1.446A21.727 21.727 0 0 0 18 11.25c0-2.414-.393-4.735-1.119-6.905ZM18.26 3.74a23.22 23.22 0 0 1 1.24 7.51 23.22 23.22 0 0 1-1.24 7.51c-.055.161-.111.322-.17.482a.75.75 0 1 0 1.409.516 24.555 24.555 0 0 0 0-16.016.75.75 0 1 0-1.409.516c.059.16.115.32.17.482Z" />
          </svg>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="border-b border-gray-200 mb-6">
          <div className="flex gap-6">
            {TABS.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`pb-3 text-sm font-semibold tracking-wide transition-colors border-b-2 -mb-px ${
                  activeTab === tab.key
                    ? 'border-[#4c1d95] text-[#4c1d95]'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading announcements…</div>
        ) : listed.length === 0 ? (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            No {activeTab} announcements.
          </div>
        ) : (
          <>
            {/* ── Info bar ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 bg-purple-50 border-l-4 border-[#4c1d95] px-3 py-1.5 rounded-r-lg">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-[#4c1d95] flex-shrink-0">
                  <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-[#4c1d95] font-medium">
                  {activeTab === 'active' ? 'Current announcements.' : 'Past announcements.'}
                </span>
              </div>
              <button
                type="button"
                onClick={expandedIds.size === listed.length && expandedIds.size > 0 ? handleCollapseAll : (collapseAll ? handleExpandAll : handleCollapseAll)}
                className="flex items-center gap-1 text-sm text-[#4c1d95] hover:underline font-medium"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                  className={`w-4 h-4 transition-transform ${expandedIds.size > 0 && !collapseAll ? 'rotate-180' : ''}`}>
                  <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
                {expandedIds.size > 0 && !collapseAll ? 'Collapse All' : 'Expand All'}
              </button>
            </div>

            {/* ── Announcement cards ────────────────────────────────────── */}
            <div className="space-y-3">
              {listed.map(a => {
                const expanded = isExpanded(a.id);
                const acked = acknowledgedIds.has(a.id);
                return (
                  <div key={a.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">

                    {/* Card header: chevron + title + acknowledge */}
                    <div className="flex items-center justify-between px-4 py-3 bg-white">
                      <button
                        type="button"
                        onClick={() => toggleExpand(a.id)}
                        className="flex items-center gap-2 text-left flex-1 min-w-0 group"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                          className={`w-4 h-4 flex-shrink-0 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}>
                          <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                        </svg>
                        <div className="flex items-center gap-2 min-w-0">
                          {a.is_pinned && (
                            <span className="text-amber-500 text-xs flex-shrink-0" title="Pinned">📌</span>
                          )}
                          <span className="font-semibold text-gray-900 text-base leading-snug group-hover:text-[#4c1d95] transition-colors">
                            {a.title}
                          </span>
                        </div>
                      </button>
                      {!acked && activeTab === 'active' && (
                        <button
                          type="button"
                          onClick={() => acknowledge(a.id)}
                          className="ml-4 flex-shrink-0 bg-amber-400 hover:bg-amber-500 text-gray-900 font-bold text-sm px-5 py-1.5 rounded transition-colors"
                        >
                          Acknowledge
                        </button>
                      )}
                      {acked && (
                        <span className="ml-4 flex-shrink-0 flex items-center gap-1 text-green-600 text-sm font-medium">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                          </svg>
                          Acknowledged
                        </span>
                      )}
                    </div>

                    {/* Meta row: instructor + course + posted date */}
                    <div className="flex items-center gap-4 px-4 pb-3 bg-gray-50 border-t border-gray-100">
                      <div className="flex items-center gap-2 flex-1 min-w-0 pt-3">
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-full bg-purple-100 border border-purple-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-[#4c1d95]">{a.instructorInitials}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 leading-tight truncate">{a.instructorName}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-gray-500 truncate">{a.courseCode === 'Institution' ? 'Institution-Wide' : a.courseCode}</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right pt-3">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Posted Date</p>
                        <p className="text-xs text-gray-600 font-medium mt-0.5">{fmtPostedDate(a.created_at)}</p>
                      </div>
                    </div>

                    {/* Expanded body */}
                    {expanded && (
                      <div className="px-5 pb-5 pt-4 border-t border-gray-100 bg-white">
                        <div
                          className="announcement-body text-sm text-gray-700 leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: a.body }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
