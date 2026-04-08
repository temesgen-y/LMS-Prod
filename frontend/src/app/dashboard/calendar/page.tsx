'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface CalendarEvent {
  id: string;
  event_name: string;
  event_type: string;
  event_date: string;
  end_date: string | null;
  description: string | null;
  term_id: string;
  term_name: string;
}

interface Term {
  id: string;
  term_name: string;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  registration_start:       'Registration Start',
  registration_end:         'Registration End',
  classes_start:            'Classes Start',
  classes_end:              'Classes End',
  add_drop_deadline:        'Add/Drop Deadline',
  withdrawal_deadline:      'Withdrawal Deadline',
  exam_start:               'Exam Start',
  exam_end:                 'Exam End',
  grade_submission_deadline:'Grade Submission',
  holiday:                  'Holiday',
  graduation:               'Graduation',
  other:                    'Other',
};

const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  registration_start:       { bg: 'bg-purple-50',  text: 'text-purple-700', dot: 'bg-purple-500' },
  registration_end:         { bg: 'bg-purple-50',  text: 'text-purple-700', dot: 'bg-purple-500' },
  classes_start:            { bg: 'bg-green-50',   text: 'text-green-700',  dot: 'bg-green-500'  },
  classes_end:              { bg: 'bg-green-50',   text: 'text-green-700',  dot: 'bg-green-500'  },
  add_drop_deadline:        { bg: 'bg-yellow-50',  text: 'text-yellow-700', dot: 'bg-yellow-500' },
  withdrawal_deadline:      { bg: 'bg-orange-50',  text: 'text-orange-700', dot: 'bg-orange-500' },
  exam_start:               { bg: 'bg-red-50',     text: 'text-red-700',    dot: 'bg-red-500'    },
  exam_end:                 { bg: 'bg-red-50',     text: 'text-red-700',    dot: 'bg-red-500'    },
  grade_submission_deadline:{ bg: 'bg-pink-50',    text: 'text-pink-700',   dot: 'bg-pink-500'   },
  holiday:                  { bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500'   },
  graduation:               { bg: 'bg-indigo-50',  text: 'text-indigo-700', dot: 'bg-indigo-500' },
  other:                    { bg: 'bg-gray-50',    text: 'text-gray-600',   dot: 'bg-gray-400'   },
};

function fmt(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function daysFromNow(d: string): number {
  const diff = new Date(d + 'T12:00:00').getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function DaysTag({ date }: { date: string }) {
  const days = daysFromNow(date);
  if (days < 0) return <span className="text-xs text-gray-400">Past</span>;
  if (days === 0) return <span className="text-xs font-semibold text-red-600">Today</span>;
  if (days === 1) return <span className="text-xs font-semibold text-orange-600">Tomorrow</span>;
  if (days <= 7)  return <span className="text-xs font-semibold text-amber-600">In {days} days</span>;
  return <span className="text-xs text-gray-400">In {days} days</span>;
}

export default function StudentCalendarPage() {
  const [events, setEvents]           = useState<CalendarEvent[]>([]);
  const [terms, setTerms]             = useState<Term[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [selectedTerm, setSelectedTerm]   = useState('');
  const [selectedType, setSelectedType]   = useState('');
  const [showPast, setShowPast]           = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();

      const [{ data: evtRows, error: evtErr }, { data: termRows }] = await Promise.all([
        supabase
          .from('academic_calendar')
          .select('id, event_name, event_type, event_date, end_date, description, term_id')
          .order('event_date', { ascending: true }),
        supabase
          .from('academic_terms')
          .select('id, term_name')
          .order('start_date', { ascending: false }),
      ]);

      if (evtErr) throw new Error(evtErr.message);

      const termMap: Record<string, string> = {};
      ((termRows ?? []) as any[]).forEach(t => { termMap[t.id] = t.term_name; });

      setEvents(((evtRows ?? []) as any[]).map(e => ({
        id:          e.id,
        event_name:  e.event_name,
        event_type:  e.event_type,
        event_date:  e.event_date,
        end_date:    e.end_date,
        description: e.description,
        term_id:     e.term_id,
        term_name:   termMap[e.term_id] ?? '—',
      })));

      setTerms((termRows ?? []) as Term[]);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);

  const filtered = events.filter(e => {
    if (!showPast && e.event_date < today) return false;
    if (selectedTerm && e.term_id !== selectedTerm) return false;
    if (selectedType && e.event_type !== selectedType) return false;
    return true;
  });

  const upcoming = filtered.filter(e => e.event_date >= today).slice(0, 3);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-56" />
          <div className="h-28 bg-gray-200 rounded-xl" />
          {[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Academic Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">University-wide academic events and deadlines</p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        {/* Upcoming highlights */}
        {upcoming.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {upcoming.map(e => {
              const colors = EVENT_TYPE_COLORS[e.event_type] ?? EVENT_TYPE_COLORS.other;
              return (
                <div key={e.id} className={`rounded-xl border p-4 ${colors.bg} border-current/10`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                    <span className={`text-xs font-semibold uppercase tracking-wide ${colors.text}`}>
                      {EVENT_TYPE_LABELS[e.event_type] ?? e.event_type}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-gray-900 leading-snug">{e.event_name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(e.event_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                  <DaysTag date={e.event_date} />
                </div>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={selectedTerm}
            onChange={e => setSelectedTerm(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">All Terms</option>
            {terms.map(t => <option key={t.id} value={t.id}>{t.term_name}</option>)}
          </select>
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">All Types</option>
            {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showPast}
              onChange={e => setShowPast(e.target.checked)}
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            Show past events
          </label>
          <span className="ml-auto text-sm text-gray-400">{filtered.length} event{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Event list */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
            <div className="text-4xl mb-3">📆</div>
            <p className="text-sm text-gray-500">No academic events found.</p>
            {!showPast && (
              <button
                type="button"
                onClick={() => setShowPast(true)}
                className="mt-2 text-sm text-purple-600 hover:underline"
              >
                Show past events?
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(e => {
              const colors = EVENT_TYPE_COLORS[e.event_type] ?? EVENT_TYPE_COLORS.other;
              const isPast  = e.event_date < today;
              return (
                <div
                  key={e.id}
                  className={`bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4 ${isPast ? 'opacity-60' : ''}`}
                >
                  {/* Date column */}
                  <div className="shrink-0 w-14 text-center">
                    <div className="text-xl font-bold text-gray-900 leading-tight">
                      {new Date(e.event_date + 'T12:00:00').getDate()}
                    </div>
                    <div className="text-xs text-gray-500 uppercase font-medium">
                      {new Date(e.event_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(e.event_date + 'T12:00:00').getFullYear()}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-gray-900">{e.event_name}</span>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                        {EVENT_TYPE_LABELS[e.event_type] ?? e.event_type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{e.term_name}</p>
                    {e.description && (
                      <p className="text-sm text-gray-600 mt-1">{e.description}</p>
                    )}
                    {e.end_date && e.end_date !== e.event_date && (
                      <p className="text-xs text-gray-400 mt-1">
                        Ends: {fmt(e.end_date)}
                      </p>
                    )}
                  </div>

                  {/* Days tag */}
                  <div className="shrink-0 text-right">
                    <DaysTag date={e.event_date} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
