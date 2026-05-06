'use client';

import { useEffect, useState, useId } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getGpaPoints } from '@/utils/gradeCalculator';

// ─── Types ────────────────────────────────────────────────────────────────────

type SimCourse = {
  id: string;
  title: string;
  credits: number;
  whatIfGrade: string; // '' = not set yet
};

type FutureCourse = {
  id: string;
  label: string;
  credits: number;
  whatIfGrade: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const GRADE_OPTIONS = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'F'];
const DEFAULT_CREDITS = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gpaColor(gpa: number): string {
  if (gpa >= 3.7) return 'text-green-400';
  if (gpa >= 3.0) return 'text-blue-300';
  if (gpa >= 2.0) return 'text-amber-300';
  return 'text-red-400';
}

function standingLabel(gpa: number): string {
  if (gpa >= 3.7) return "Dean's List";
  if (gpa >= 3.5) return 'Honors';
  if (gpa >= 3.0) return 'Good Standing';
  if (gpa >= 2.0) return 'Satisfactory';
  if (gpa >= 1.0) return 'Academic Warning';
  return 'Academic Probation';
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GpaCalculatorPage() {
  const [baseGpa, setBaseGpa]       = useState<number | null>(null);
  const [baseCredits, setBaseCredits] = useState<number>(0);
  const [currentCourses, setCurrentCourses] = useState<SimCourse[]>([]);
  const [futureCourses, setFutureCourses]   = useState<FutureCourse[]>([]);
  const [targetGpa, setTargetGpa]   = useState('');
  const [loading, setLoading]       = useState(true);
  const targetId = useId();

  // ── Load baseline + current enrollments ──────────────────────────────────
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setLoading(false); return; }

      const { data: appUser } = await supabase
        .from('users').select('id').eq('auth_user_id', authData.user.id).single();
      if (!appUser) { setLoading(false); return; }
      const userId = (appUser as any).id;

      // Cumulative GPA + credits from academic_standing (most recent row)
      const { data: standingRows } = await supabase
        .from('academic_standing')
        .select('cumulative_gpa, credits_earned')
        .eq('student_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      const standing = (standingRows ?? [])[0] as any;
      const cumGpa     = standing?.cumulative_gpa ?? null;
      const cumCredits = standing?.credits_earned  ?? 0;
      setBaseGpa(cumGpa);
      setBaseCredits(cumCredits);

      // Active enrollments without a final grade (currently in-progress courses)
      const { data: enrollRows } = await supabase
        .from('enrollments')
        .select(`
          id,
          course_offerings!fk_enrollments_offering(
            courses!fk_course_offerings_course(title, credit_hours)
          )
        `)
        .eq('student_id', userId)
        .eq('status', 'active')
        .is('final_grade', null);

      const mapped: SimCourse[] = ((enrollRows ?? []) as any[]).map(r => {
        const course = r.course_offerings?.courses ?? {};
        return {
          id: r.id,
          title: course.title ?? 'Course',
          credits: course.credit_hours ?? DEFAULT_CREDITS,
          whatIfGrade: '',
        };
      });
      setCurrentCourses(mapped);
      setLoading(false);
    })();
  }, []);

  // ── Compute projected GPA ─────────────────────────────────────────────────

  const basePoints = baseGpa !== null ? baseGpa * baseCredits : 0;

  const simRows = [
    ...currentCourses.filter(c => c.whatIfGrade),
    ...futureCourses.filter(c => c.whatIfGrade),
  ];
  const simPoints  = simRows.reduce((s, c) => s + getGpaPoints(c.whatIfGrade) * c.credits, 0);
  const simCredits = simRows.reduce((s, c) => s + c.credits, 0);

  const totalCredits = baseCredits + simCredits;
  const totalPoints  = basePoints + simPoints;
  const projectedGpa = totalCredits > 0 ? Math.round((totalPoints / totalCredits) * 10000) / 10000 : null;

  const delta = projectedGpa !== null && baseGpa !== null
    ? Math.round((projectedGpa - baseGpa) * 1000) / 1000
    : null;

  const targetNum = parseFloat(targetGpa);
  const targetValid = !isNaN(targetNum) && targetNum >= 0 && targetNum <= 4.0;
  const meetsTarget = targetValid && projectedGpa !== null && projectedGpa >= targetNum;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const updateCurrentGrade = (id: string, grade: string) =>
    setCurrentCourses(prev => prev.map(c => c.id === id ? { ...c, whatIfGrade: grade } : c));

  const addFutureCourse = () =>
    setFutureCourses(prev => [...prev, {
      id: uid(), label: `Future Course ${prev.length + 1}`,
      credits: DEFAULT_CREDITS, whatIfGrade: '',
    }]);

  const updateFuture = (id: string, patch: Partial<FutureCourse>) =>
    setFutureCourses(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));

  const removeFuture = (id: string) =>
    setFutureCourses(prev => prev.filter(c => c.id !== id));

  const resetAll = () => {
    setCurrentCourses(prev => prev.map(c => ({ ...c, whatIfGrade: '' })));
    setFutureCourses([]);
    setTargetGpa('');
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="w-full min-w-0 animate-pulse space-y-4 p-6 max-w-2xl">
        <div className="h-7 bg-gray-200 rounded w-48" />
        <div className="h-40 bg-gray-200 rounded-xl" />
        <div className="h-48 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-2xl">

      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl" aria-hidden>🧮</span>
        <h1 className="text-2xl font-bold text-gray-900">GPA What-If Calculator</h1>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Simulate grade scenarios to plan your academic goals. Nothing here affects your real record.
      </p>
      <div className="border-t border-gray-200 mb-6" />

      {/* ── Projected GPA card ──────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-[#4c1d95] to-[#7c3aed] rounded-2xl px-6 py-5 mb-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1">Projected GPA</p>
            <div className="flex items-end gap-3">
              <span className={`text-6xl font-black tabular-nums tracking-tight ${projectedGpa !== null ? gpaColor(projectedGpa) : 'opacity-30'}`}>
                {projectedGpa !== null ? projectedGpa.toFixed(2) : (baseGpa?.toFixed(2) ?? '—')}
              </span>
              {delta !== null && delta !== 0 && (
                <span className={`text-lg font-semibold mb-1.5 ${delta > 0 ? 'text-green-300' : 'text-red-300'}`}>
                  {delta > 0 ? '+' : ''}{delta.toFixed(3)}
                </span>
              )}
            </div>
            {projectedGpa !== null && (
              <p className="text-xs opacity-70 mt-1">{standingLabel(projectedGpa)}</p>
            )}
          </div>

          {/* Progress bar */}
          <div className="flex-1 min-w-[160px]">
            <div className="bg-white/20 rounded-full h-2.5 overflow-hidden mt-6">
              <div
                className="h-2.5 rounded-full bg-white transition-all duration-300"
                style={{ width: `${Math.min(((projectedGpa ?? baseGpa ?? 0) / 4.0) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] opacity-50 mt-1">
              <span>0.0</span>
              <span>2.0</span>
              <span>3.0</span>
              <span>4.0</span>
            </div>
          </div>
        </div>

        {/* Baseline info */}
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-white/20">
          <div className="text-center">
            <p className="text-[10px] opacity-60 uppercase tracking-wide">Current GPA</p>
            <p className="text-base font-bold">{baseGpa?.toFixed(2) ?? 'N/A'}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] opacity-60 uppercase tracking-wide">Credits Earned</p>
            <p className="text-base font-bold">{baseCredits}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] opacity-60 uppercase tracking-wide">Simulated Credits</p>
            <p className="text-base font-bold">{simCredits}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] opacity-60 uppercase tracking-wide">Total Credits</p>
            <p className="text-base font-bold">{totalCredits}</p>
          </div>
        </div>

        {baseCredits > 60 && (
          <p className="text-[11px] opacity-50 mt-3">
            With {baseCredits} credits already earned, each new course has less impact on your cumulative GPA.
          </p>
        )}
      </div>

      {/* ── Target GPA ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 mb-5">
        <label htmlFor={targetId} className="block text-sm font-semibold text-gray-800 mb-2">
          Target GPA Goal
        </label>
        <div className="flex items-center gap-3">
          <input
            id={targetId}
            type="number"
            min="0" max="4" step="0.01"
            placeholder="e.g. 3.50"
            value={targetGpa}
            onChange={e => setTargetGpa(e.target.value)}
            className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/30 focus:border-[#4c1d95]"
          />
          {targetValid && projectedGpa !== null && (
            <span className={`text-sm font-medium flex items-center gap-1 ${meetsTarget ? 'text-green-600' : 'text-amber-600'}`}>
              {meetsTarget
                ? '✓ Your simulation meets this goal!'
                : `${(targetNum - projectedGpa).toFixed(2)} GPA points short — try selecting higher grades below.`
              }
            </span>
          )}
        </div>
      </div>

      {/* ── Current semester courses ─────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Current Semester</h2>
            <p className="text-xs text-gray-400 mt-0.5">Select a "what-if" grade for each enrolled course</p>
          </div>
        </div>

        {currentCourses.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400 text-center">
            No in-progress courses found. Use the Future Courses section below to plan ahead.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {currentCourses.map(course => (
              <div key={course.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{course.title}</p>
                  <p className="text-xs text-gray-400">{course.credits} credit{course.credits !== 1 ? 's' : ''}</p>
                </div>
                <select
                  value={course.whatIfGrade}
                  onChange={e => updateCurrentGrade(course.id, e.target.value)}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95] bg-white"
                >
                  <option value="">— select grade —</option>
                  {GRADE_OPTIONS.map(g => (
                    <option key={g} value={g}>{g} ({getGpaPoints(g).toFixed(1)} pts)</option>
                  ))}
                </select>
                {course.whatIfGrade && (
                  <span className="text-xs font-semibold text-[#4c1d95] w-16 text-right tabular-nums">
                    +{(getGpaPoints(course.whatIfGrade) * course.credits).toFixed(1)} pts
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Future courses ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Future Courses</h2>
            <p className="text-xs text-gray-400 mt-0.5">Plan ahead by adding hypothetical courses</p>
          </div>
          <button
            type="button"
            onClick={addFutureCourse}
            className="text-xs font-semibold text-[#4c1d95] hover:text-[#5b21b6] flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-purple-50 transition-colors"
          >
            + Add Course
          </button>
        </div>

        {futureCourses.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400 text-center">
            No future courses added yet.{' '}
            <button type="button" onClick={addFutureCourse} className="text-[#4c1d95] hover:underline font-medium">
              Add one →
            </button>
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {futureCourses.map(course => (
              <div key={course.id} className="flex items-center gap-2 px-5 py-3 flex-wrap">
                <input
                  type="text"
                  value={course.label}
                  onChange={e => updateFuture(course.id, { label: e.target.value })}
                  className="flex-1 min-w-[140px] border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95]"
                  placeholder="Course name"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1" max="12"
                    value={course.credits}
                    onChange={e => updateFuture(course.id, { credits: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-16 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95]"
                  />
                  <span className="text-xs text-gray-400">cr</span>
                </div>
                <select
                  value={course.whatIfGrade}
                  onChange={e => updateFuture(course.id, { whatIfGrade: e.target.value })}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20 focus:border-[#4c1d95] bg-white"
                >
                  <option value="">— grade —</option>
                  {GRADE_OPTIONS.map(g => (
                    <option key={g} value={g}>{g} ({getGpaPoints(g).toFixed(1)} pts)</option>
                  ))}
                </select>
                {course.whatIfGrade && (
                  <span className="text-xs font-semibold text-[#4c1d95] w-16 text-right tabular-nums">
                    +{(getGpaPoints(course.whatIfGrade) * course.credits).toFixed(1)} pts
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeFuture(course.id)}
                  className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none"
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── GPA scale reference ──────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 mb-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">4.0 GPA Scale</h3>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {GRADE_OPTIONS.map(g => (
            <div key={g} className="text-center bg-gray-50 rounded-lg px-2 py-2">
              <p className="text-sm font-bold text-gray-800">{g}</p>
              <p className="text-xs text-gray-500">{getGpaPoints(g).toFixed(1)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Reset ───────────────────────────────────────────────────────────── */}
      <div className="flex justify-end mb-8">
        <button
          type="button"
          onClick={resetAll}
          className="text-sm text-gray-400 hover:text-gray-600 hover:underline"
        >
          Reset all
        </button>
      </div>

    </div>
  );
}
