'use client';

import { useParams } from 'next/navigation';
import { useState, useMemo } from 'react';

type ViewMode = '1' | '2' | 'all';
type Status = 'Published' | 'Submitted' | 'Active';
type EntryColor = 'blue' | 'orange' | 'green';

interface CalendarEntry {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  color: EntryColor;
  status: Status;
  icon?: 'check' | 'doc';
}

// Demo entries matching the image (Thu Feb 5 - Wed Feb 18)
const DEMO_ENTRIES: CalendarEntry[] = [
  { id: '1', title: 'Topic 4 DQ 1 & DQ 2', date: '2026-02-06', color: 'blue', status: 'Published', icon: 'check' },
  { id: '2', title: 'Activity 7', date: '2026-02-11', color: 'orange', status: 'Published', icon: 'check' },
  { id: '3', title: 'Week 7 Participation', date: '2026-02-11', color: 'green', status: 'Submitted', icon: 'check' },
  { id: '4', title: 'Activity 8', date: '2026-02-11', color: 'orange', status: 'Submitted', icon: 'check' },
  { id: '5', title: 'Capstone: Project/Product Introduction Video', date: '2026-02-11', color: 'orange', status: 'Active', icon: 'doc' },
  { id: '6', title: 'Topic 4 DQ 3 & DQ 4', date: '2026-02-13', color: 'blue', status: 'Published', icon: 'check' },
  { id: '7', title: 'Activity 8', date: '2026-02-18', color: 'orange', status: 'Submitted', icon: 'check' },
  { id: '8', title: 'Capstone: Project/Product Introduction Video', date: '2026-02-18', color: 'orange', status: 'Active', icon: 'doc' },
  { id: '9', title: 'Week 8 Participation', date: '2026-02-18', color: 'green', status: 'Active', icon: 'check' },
];

const TOTAL_WEEKS = 9;
const CURRENT_WEEK = 9;
// Week 1 starts on this Thursday (course start)
const COURSE_START_DATE = new Date(2026, 0, 8); // Jan 8, 2026 = Thursday

function getDaysForWeeks(start: Date, numWeeks: number): Date[] {
  const days: Date[] = [];
  const end = new Date(start);
  end.setDate(end.getDate() + numWeeks * 7);
  const d = new Date(start);
  while (d < end) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function getStartDateForWeek(weekNumber: number): Date {
  const d = new Date(COURSE_START_DATE);
  d.setDate(d.getDate() + (weekNumber - 1) * 7);
  return d;
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isToday(d: Date): boolean {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function formatDayShort(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function formatDayWithOrdinal(d: Date): { label: string; suffix: string } {
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const day = d.getDate();
  const suffix = getOrdinalSuffix(day);
  return { label: `${weekday}, ${month} ${day}`, suffix };
}

export default function ClassCalendarPage() {
  const params = useParams();
  const id = params?.id as string;
  const [viewMode, setViewMode] = useState<ViewMode>('2');
  const [selectedWeek, setSelectedWeek] = useState(1);

  const startDate = useMemo(() => {
    if (viewMode === 'all') return getStartDateForWeek(1);
    return getStartDateForWeek(selectedWeek);
  }, [viewMode, selectedWeek]);
  const weeksToShow = viewMode === '1' ? 1 : viewMode === '2' ? 2 : TOTAL_WEEKS;
  const days = useMemo(() => getDaysForWeeks(startDate, weeksToShow), [startDate, weeksToShow]);

  const goPrevWeek = () => setSelectedWeek((w) => Math.max(1, w - 1));
  const goNextWeek = () => setSelectedWeek((w) => Math.min(TOTAL_WEEKS, w + 1));
  const goToCurrentWeek = () => setSelectedWeek(CURRENT_WEEK);

  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

  const entriesByDate = useMemo(() => {
    const map: Record<string, CalendarEntry[]> = {};
    DEMO_ENTRIES.forEach((e) => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, []);

  const colorClasses: Record<EntryColor, string> = {
    blue: 'bg-blue-500/90 text-white',
    orange: 'bg-orange-500/90 text-white',
    green: 'bg-green-600/90 text-white',
  };

  return (
    <div className="w-full min-w-0">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl" aria-hidden>📅</span>
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
      </div>
      <div className="border-t border-gray-200 mb-6" />

      {/* Wrapper border around all calendar section (Weeks + Show + all week blocks) */}
      <div className="border border-gray-300 rounded-lg p-4 bg-white">
        {/* Week navigation + Show on far right */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Weeks</span>
              <button
                type="button"
                onClick={goPrevWeek}
                disabled={selectedWeek <= 1}
                className="p-1.5 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:pointer-events-none"
                aria-label="Previous week"
              >
                ‹
              </button>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setSelectedWeek(w)}
                    className={`w-8 h-8 rounded text-sm font-medium ${
                      w === selectedWeek ? 'bg-[#0078d4] text-white' : 'bg-transparent text-[#0078d4] hover:bg-blue-50'
                    }`}
                  >
                    {w}
                  </button>
                ))}
                {TOTAL_WEEKS > 6 && <span className="px-1 text-gray-400 text-sm">...</span>}
                {TOTAL_WEEKS > 6 && (
                  <button
                    type="button"
                    onClick={() => setSelectedWeek(TOTAL_WEEKS)}
                    className={`w-8 h-8 rounded text-sm font-medium ${
                      TOTAL_WEEKS === selectedWeek ? 'bg-[#0078d4] text-white' : 'bg-transparent text-[#0078d4] hover:bg-blue-50'
                    }`}
                  >
                    {TOTAL_WEEKS}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={goNextWeek}
                disabled={selectedWeek >= TOTAL_WEEKS}
                className="p-1.5 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:pointer-events-none"
                aria-label="Next week"
              >
                ›
              </button>
            </div>
            <button
              type="button"
              onClick={goToCurrentWeek}
              className="px-3 py-1.5 rounded border-2 border-[#0078d4] text-[#0078d4] text-sm font-medium hover:bg-[#0078d4] hover:text-white transition-colors"
            >
              CURRENT (WEEK {CURRENT_WEEK})
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Show</span>
            <div className="flex gap-1">
              {(['1', '2', 'all'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 rounded text-sm font-medium ${
                    viewMode === mode ? 'bg-[#0078d4] text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {mode === 'all' ? 'ALL' : `${mode} WEEK${mode === '1' ? '' : 'S'}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Calendar: each week as a block stacked vertically; for 2 WEEKS show Week 2 on top, then Week 1 */}
        <div className="flex flex-col gap-4">
        {(viewMode === '2' && weeks.length === 2 ? [weeks[1], weeks[0]] : weeks).map((weekDays, weekIndex) => (
          <div key={weekIndex} className="border border-gray-200 rounded-lg overflow-x-hidden">
            <div
              className="grid gap-px bg-gray-200 w-full min-w-0"
              style={{
                gridTemplateColumns: `0.5rem repeat(7, minmax(0, 1fr))`,
              }}
            >
              {/* Row 1: empty corner + day labels (dark gray, white bold, ordinal suffix bold) */}
              <div className="bg-gray-100 p-2 min-h-[44px]" />
              {weekDays.map((d) => {
                const { label, suffix } = formatDayWithOrdinal(d);
                return (
                  <div
                    key={d.toISOString()}
                    className={`p-2 text-center text-xs min-h-[44px] flex items-center justify-center truncate min-w-0 font-semibold ${
                      isToday(d) ? 'bg-purple-600 text-white' : 'bg-gray-600 text-white'
                    }`}
                    title={formatDayShort(d)}
                  >
                    {label}
                    <span className="font-bold">{suffix}</span>
                  </div>
                );
              })}
              {/* Row 2: empty + one cell per day with entries */}
              <div className="bg-gray-50 min-h-[200px]" />
              {weekDays.map((d) => {
                const dateKey = toYMD(d);
                const entries = entriesByDate[dateKey] || [];
                return (
                  <div
                    key={dateKey}
                    className={`min-h-[200px] p-2 space-y-1.5 overflow-y-auto ${
                      isToday(d) ? 'bg-purple-50/70' : 'bg-white'
                    }`}
                  >
                    {entries.map((e) => (
                      <div
                        key={e.id}
                        className={`rounded px-2 py-1.5 text-xs font-medium flex items-start justify-between gap-1 ${colorClasses[e.color]}`}
                      >
                        <span className="truncate flex-1 min-w-0" title={e.title}>
                          {e.title}
                        </span>
                        <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] opacity-90">
                          {e.icon === 'check' && <span aria-hidden>✓</span>}
                          {e.icon === 'doc' && <span aria-hidden>📄</span>}
                          {e.status}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        </div>
      </div>

      {/* Legend hint */}
      <p className="text-xs text-gray-500 mt-4">
        Blue: Discussion; Orange: Activity / Capstone; Green: Participation. Published / Submitted / Active indicate status.
      </p>
    </div>
  );
}
