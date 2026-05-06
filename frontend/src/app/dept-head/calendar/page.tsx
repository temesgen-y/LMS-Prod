'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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

interface Term { id: string; term_name: string; }

const EVENT_TYPE_LABELS: Record<string, string> = {
  registration_start: 'Registration Start', registration_end: 'Registration End',
  classes_start: 'Classes Start', classes_end: 'Classes End',
  add_drop_deadline: 'Add/Drop Deadline', withdrawal_deadline: 'Withdrawal Deadline',
  exam_start: 'Exam Start', exam_end: 'Exam End',
  grade_submission_deadline: 'Grade Submission', holiday: 'Holiday',
  graduation: 'Graduation', other: 'Other',
};

const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  registration_start:        { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  registration_end:          { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  classes_start:             { bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500'  },
  classes_end:               { bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500'  },
  add_drop_deadline:         { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  withdrawal_deadline:       { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  exam_start:                { bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500'    },
  exam_end:                  { bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500'    },
  grade_submission_deadline: { bg: 'bg-pink-50',   text: 'text-pink-700',   dot: 'bg-pink-500'   },
  holiday:                   { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  graduation:                { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  other:                     { bg: 'bg-gray-50',   text: 'text-gray-600',   dot: 'bg-gray-400'   },
};

function fmt(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function daysFromNow(d: string): number {
  return Math.ceil((new Date(d + 'T12:00:00').getTime() - Date.now()) / 86400000);
}
function DaysTag({ date }: { date: string }) {
  const days = daysFromNow(date);
  if (days < 0) return <span className="text-xs text-gray-400">Past</span>;
  if (days === 0) return <span className="text-xs font-semibold text-red-600">Today</span>;
  if (days === 1) return <span className="text-xs font-semibold text-orange-600">Tomorrow</span>;
  if (days <= 7) return <span className="text-xs font-semibold text-amber-600">In {days} days</span>;
  return <span className="text-xs text-gray-400">In {days} days</span>;
}

function MonthGrid({ year, month, events, selectedDate, onSelectDate }: {
  year: number; month: number; events: CalendarEvent[];
  selectedDate: string | null; onSelectDate: (d: string) => void;
}) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach(e => {
      if (!map[e.event_date]) map[e.event_date] = [];
      map[e.event_date].push(e);
      if (e.end_date && e.end_date !== e.event_date) {
        const cur = new Date(e.event_date + 'T12:00:00');
        const end = new Date(e.end_date + 'T12:00:00');
        cur.setDate(cur.getDate() + 1);
        while (cur <= end) { const ds = cur.toISOString().slice(0, 10); if (!map[ds]) map[ds] = []; map[ds].push(e); cur.setDate(cur.getDate() + 1); }
      }
    });
    return map;
  }, [events]);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-100">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(w => (
          <div key={w} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} className="min-h-[80px] border-b border-r border-gray-50 bg-gray-50/50" />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayEvents = eventsByDate[dateStr] ?? [];
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          return (
            <button key={dateStr} type="button" onClick={() => onSelectDate(dateStr)}
              className={`min-h-[80px] p-1.5 border-b border-r border-gray-50 text-left transition-colors hover:bg-indigo-50/50 ${isSelected ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-400' : ''}`}>
              <div className="mb-0.5">
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${isToday ? 'bg-indigo-600 text-white' : 'text-gray-700'}`}>{day}</span>
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((e, ei) => {
                  const c = EVENT_TYPE_COLORS[e.event_type] ?? EVENT_TYPE_COLORS.other;
                  return <div key={`${e.id}-${ei}`} className={`text-[10px] leading-tight truncate px-1 py-0.5 rounded ${c.bg} ${c.text} font-medium`}>{e.event_name}</div>;
                })}
                {dayEvents.length > 3 && <div className="text-[10px] text-gray-400 px-1">+{dayEvents.length - 3} more</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type ViewMode = 'month' | 'list';

export default function DeptHeadCalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };
  const goToday = () => { const t = new Date(); setViewYear(t.getFullYear()); setViewMonth(t.getMonth()); setSelectedDate(null); };
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const supabase = createClient();
      const [{ data: evtRows, error: evtErr }, { data: termRows }] = await Promise.all([
        supabase.from('academic_calendar').select('id, event_name, event_type, event_date, end_date, description, term_id').order('event_date', { ascending: true }),
        supabase.from('academic_terms').select('id, term_name').order('start_date', { ascending: false }),
      ]);
      if (evtErr) throw new Error(evtErr.message);
      const termMap: Record<string, string> = {};
      ((termRows ?? []) as any[]).forEach(t => { termMap[t.id] = t.term_name; });
      setEvents(((evtRows ?? []) as any[]).map(e => ({ id: e.id, event_name: e.event_name, event_type: e.event_type, event_date: e.event_date, end_date: e.end_date, description: e.description, term_id: e.term_id, term_name: termMap[e.term_id] ?? '—' })));
      setTerms((termRows ?? []) as Term[]);
    } catch (e: any) { setError(e.message ?? 'Failed to load calendar'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const today = new Date().toISOString().slice(0, 10);

  const monthEvents = useMemo(() => {
    const ms = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const me = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(new Date(viewYear, viewMonth + 1, 0).getDate()).padStart(2, '0')}`;
    return events.filter(e => {
      if (selectedTerm && e.term_id !== selectedTerm) return false;
      if (selectedType && e.event_type !== selectedType) return false;
      return e.event_date <= me && (e.end_date || e.event_date) >= ms;
    });
  }, [events, viewYear, viewMonth, selectedTerm, selectedType]);

  const dateEvents = useMemo(() => {
    if (!selectedDate) return [];
    return events.filter(e => {
      if (selectedTerm && e.term_id !== selectedTerm) return false;
      if (selectedType && e.event_type !== selectedType) return false;
      return e.event_date <= selectedDate && (e.end_date || e.event_date) >= selectedDate;
    });
  }, [events, selectedDate, selectedTerm, selectedType]);

  const listFiltered = useMemo(() => events.filter(e => {
    if (!showPast && e.event_date < today) return false;
    if (selectedTerm && e.term_id !== selectedTerm) return false;
    if (selectedType && e.event_type !== selectedType) return false;
    return true;
  }), [events, showPast, today, selectedTerm, selectedType]);

  const upcoming = listFiltered.filter(e => e.event_date >= today).slice(0, 3);

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-56" />
        <div className="h-28 bg-gray-200 rounded-xl" />
        <div className="h-96 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Academic Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">University-wide academic events and deadlines</p>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button type="button" onClick={() => setViewMode('month')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${viewMode === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Month</button>
          <button type="button" onClick={() => setViewMode('list')} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>List</button>
        </div>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {upcoming.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {upcoming.map(e => {
            const c = EVENT_TYPE_COLORS[e.event_type] ?? EVENT_TYPE_COLORS.other;
            return (
              <div key={e.id} className={`rounded-xl border p-4 ${c.bg}`} style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                  <span className={`text-xs font-semibold uppercase tracking-wide ${c.text}`}>{EVENT_TYPE_LABELS[e.event_type] ?? e.event_type}</span>
                </div>
                <p className="text-sm font-bold text-gray-900 leading-snug">{e.event_name}</p>
                <p className="text-xs text-gray-500 mt-1">{new Date(e.event_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                <DaysTag date={e.event_date} />
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="">All Terms</option>
          {terms.map(t => <option key={t.id} value={t.id}>{t.term_name}</option>)}
        </select>
        <select value={selectedType} onChange={e => setSelectedType(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="">All Types</option>
          {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {viewMode === 'list' && (
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
            Show past events
          </label>
        )}
        <span className="ml-auto text-sm text-gray-400">{viewMode === 'list' ? `${listFiltered.length} event${listFiltered.length !== 1 ? 's' : ''}` : `${monthEvents.length} this month`}</span>
      </div>

      {viewMode === 'month' && (
        <>
          <div className="flex items-center gap-2">
            <button type="button" onClick={prevMonth} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h2 className="text-lg font-bold text-gray-900 min-w-[180px] text-center">{monthLabel}</h2>
            <button type="button" onClick={nextMonth} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
            <button type="button" onClick={goToday} className="px-3 py-1.5 text-xs font-semibold text-purple-600 border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors ml-1">Today</button>
          </div>
          <MonthGrid year={viewYear} month={viewMonth} events={monthEvents} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          {selectedDate && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-semibold text-gray-900 text-sm">Events on {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h3>
                <button type="button" onClick={() => setSelectedDate(null)} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
              </div>
              {dateEvents.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-400">No events on this date</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {dateEvents.map(e => {
                    const c = EVENT_TYPE_COLORS[e.event_type] ?? EVENT_TYPE_COLORS.other;
                    return (
                      <div key={e.id} className="px-5 py-3 flex items-start gap-3">
                        <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">{e.event_name}</span>
                            <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>{EVENT_TYPE_LABELS[e.event_type] ?? e.event_type}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{e.term_name}</p>
                          {e.description && <p className="text-sm text-gray-600 mt-1">{e.description}</p>}
                          {e.end_date && e.end_date !== e.event_date && <p className="text-xs text-gray-400 mt-1">{fmt(e.event_date)} — {fmt(e.end_date)}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {viewMode === 'list' && (
        listFiltered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
            <div className="text-4xl mb-3">📆</div>
            <p className="text-sm text-gray-500">No academic events found.</p>
            {!showPast && <button type="button" onClick={() => setShowPast(true)} className="mt-2 text-sm text-purple-600 hover:underline">Show past events?</button>}
          </div>
        ) : (
          <div className="space-y-2">
            {listFiltered.map(e => {
              const c = EVENT_TYPE_COLORS[e.event_type] ?? EVENT_TYPE_COLORS.other;
              const isPast = e.event_date < today;
              return (
                <div key={e.id} className={`bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4 ${isPast ? 'opacity-60' : ''}`}>
                  <div className="shrink-0 w-14 text-center">
                    <div className="text-xl font-bold text-gray-900 leading-tight">{new Date(e.event_date + 'T12:00:00').getDate()}</div>
                    <div className="text-xs text-gray-500 uppercase font-medium">{new Date(e.event_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}</div>
                    <div className="text-xs text-gray-400">{new Date(e.event_date + 'T12:00:00').getFullYear()}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-gray-900">{e.event_name}</span>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />{EVENT_TYPE_LABELS[e.event_type] ?? e.event_type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{e.term_name}</p>
                    {e.description && <p className="text-sm text-gray-600 mt-1">{e.description}</p>}
                    {e.end_date && e.end_date !== e.event_date && <p className="text-xs text-gray-400 mt-1">Ends: {fmt(e.end_date)}</p>}
                  </div>
                  <div className="shrink-0"><DaysTag date={e.event_date} /></div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
