'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { GradeBadge } from '@/components/shared/GradeBadge';
import { getLetterGrade, getGradeColor } from '@/utils/gradeCalculator';
import { fetchGradeWeights, computeCategoryBreakdown, type GradeWeights, type CategoryBreakdown } from '@/utils/weightedGrade';

type GradeItem = {
  id         : string;
  itemTitle  : string;
  itemType   : string;
  rawScore   : number | null;
  totalMarks : number;
  isOverridden: boolean;
  recordedAt : string | null;
};

function fmt(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ClassGradebookPage() {
  const params     = useParams();
  const offeringId = params?.id as string;

  const [items, setItems]           = useState<GradeItem[]>([]);
  const [finalGrade, setFinalGrade] = useState<string | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [loading, setLoading]       = useState(true);
  const [weights, setWeights]       = useState<GradeWeights | null>(null);
  const [breakdown, setBreakdown]   = useState<CategoryBreakdown | null>(null);

  useEffect(() => {
    if (!offeringId) return;
    (async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setLoading(false); return; }

      const { data: appUser } = await supabase
        .from('users').select('id').eq('auth_user_id', authData.user.id).single();
      if (!appUser) { setLoading(false); return; }
      const userId = (appUser as { id: string }).id;

      const { data: enr } = await supabase
        .from('enrollments')
        .select('id, final_grade, final_score')
        .eq('student_id', userId)
        .eq('offering_id', offeringId)
        .single();

      if (!enr) { setLoading(false); return; }
      const enrollmentId = (enr as any).id;
      setFinalGrade((enr as any).final_grade ?? null);
      setFinalScore((enr as any).final_score ?? null);

      const { data: gbRows } = await supabase
        .from('gradebook_items')
        .select(`
          id, raw_score, total_marks, is_overridden, recorded_at,
          assessment_id, assignment_id,
          assessments!fk_gradebook_items_assessment(title, type),
          assignments!fk_gradebook_items_assignment(title)
        `)
        .eq('enrollment_id', enrollmentId)
        .order('recorded_at', { ascending: false });

      const mappedItems: GradeItem[] = ((gbRows ?? []) as any[]).map(r => ({
        id         : r.id,
        itemTitle  : r.assessment_id
          ? (r.assessments?.title ?? 'Assessment')
          : (r.assignments?.title ?? 'Assignment'),
        itemType   : r.assessment_id ? (r.assessments?.type ?? 'assessment') : 'assignment',
        rawScore   : r.raw_score,
        totalMarks : r.total_marks ?? 0,
        isOverridden: !!r.is_overridden,
        recordedAt : r.recorded_at,
      }));
      setItems(mappedItems);

      // Load grade weights and compute running grade
      const w = await fetchGradeWeights(supabase, offeringId);
      setWeights(w);
      if (w) {
        const { data: attRows } = await supabase
          .from('attendance')
          .select('status')
          .eq('enrollment_id', enrollmentId);
        const gbForCalc = mappedItems.map(i => ({
          raw_score: i.rawScore,
          total_marks: i.totalMarks,
          assessment_id: i.itemType !== 'assignment' ? i.id : null,
          assignment_id: i.itemType === 'assignment' ? i.id : null,
        }));
        setBreakdown(computeCategoryBreakdown(gbForCalc, (attRows ?? []) as any[], w));
      }

      setLoading(false);
    })();
  }, [offeringId]);

  const gradedItems   = items.filter(i => i.rawScore !== null);
  const totalScored   = gradedItems.reduce((s, i) => s + (i.rawScore ?? 0), 0);
  const totalMax      = items.reduce((s, i) => s + i.totalMarks, 0);
  const totalMaxGraded = gradedItems.reduce((s, i) => s + i.totalMarks, 0);

  return (
    <div className="w-full min-w-0">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl" aria-hidden>📊</span>
        <h1 className="text-2xl font-bold text-gray-900">Gradebook</h1>
      </div>
      <div className="border-t border-gray-200 mb-6" />

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}
          </div>
          {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-200 rounded" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">📊</span>
          <p className="text-gray-400 font-medium">No grades recorded yet.</p>
          <p className="text-gray-400 text-sm mt-1">Grades will appear here once assessments or assignments are graded.</p>
        </div>
      ) : (
        <>
          {/* ── Running Grade Banner (weighted) ── */}
          {weights && breakdown && (
            <div className="bg-gradient-to-r from-[#4c1d95] to-[#7c3aed] text-white rounded-xl px-6 py-5 mb-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium opacity-70 mb-1 uppercase tracking-wide">Running Grade</p>
                  <div className="flex items-end gap-3">
                    <span className={`text-5xl font-black tracking-tight`}>
                      {getLetterGrade(breakdown.weightedScore)}
                    </span>
                    <span className="text-2xl font-semibold opacity-90 mb-0.5">
                      {breakdown.weightedScore.toFixed(1)}%
                    </span>
                  </div>
                  {breakdown.coveredWeightPct < 100 && (
                    <p className="text-xs opacity-60 mt-1.5">
                      Based on {breakdown.coveredWeightPct.toFixed(0)}% of your final grade
                      {breakdown.coveredWeightPct < 100 && ' — remaining categories not yet recorded'}
                    </p>
                  )}
                </div>

                {/* Category breakdown */}
                <div className="flex gap-4 flex-wrap">
                  {[
                    { label: 'Assessments', pct: breakdown.assessmentPct, weight: weights.assessments_weight },
                    { label: 'Assignments', pct: breakdown.assignmentPct, weight: weights.assignments_weight },
                    { label: 'Attendance',  pct: breakdown.attendancePct, weight: weights.attendance_weight },
                  ].map(cat => (
                    <div key={cat.label} className="bg-white/15 rounded-lg px-4 py-3 text-center min-w-[90px]">
                      <p className="text-xs opacity-70 mb-1">{cat.label}</p>
                      <p className="text-lg font-bold">
                        {cat.pct !== null ? `${cat.pct.toFixed(1)}%` : <span className="text-sm font-normal opacity-50">N/A</span>}
                      </p>
                      <p className="text-[10px] opacity-60 mt-0.5">weight: {cat.weight}%</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Summary cards */}
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 min-w-[150px]">
              <p className="text-xs text-gray-500 mb-1">Current Score</p>
              <p className="text-2xl font-bold text-[#4c1d95]">
                {totalScored}/{totalMaxGraded}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {totalMaxGraded > 0 ? `${Math.round((totalScored / totalMaxGraded) * 10000) / 100}%` : '—'} of graded
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 min-w-[150px]">
              <p className="text-xs text-gray-500 mb-1">Final Grade</p>
              {finalGrade ? (
                <>
                  <GradeBadge grade={finalGrade} size="lg" />
                  {finalScore != null && <p className="text-xs text-gray-400 mt-1">{finalScore.toFixed(1)}%</p>}
                </>
              ) : (
                <p className="text-2xl font-bold text-gray-400">Pending</p>
              )}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 min-w-[150px]">
              <p className="text-xs text-gray-500 mb-1">Graded Items</p>
              <p className="text-2xl font-bold text-gray-700">
                {gradedItems.length}
                <span className="text-base font-normal text-gray-400"> / {items.length}</span>
              </p>
            </div>
          </div>

          {/* Gradebook table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Item', 'Type', 'Scored', 'Max', 'Date'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map(item => (
                  <tr key={item.id} className={`hover:bg-gray-50 ${item.rawScore === null ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-900 text-sm line-clamp-1">{item.itemTitle}</span>
                        {item.isOverridden && (
                          <span className="text-xs text-purple-600" title="Grade overridden by instructor">✏️</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500 capitalize">{item.itemType.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {item.rawScore !== null
                        ? item.rawScore
                        : <span className="text-amber-500 text-xs font-medium">pending</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-gray-500">{item.totalMarks}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{fmt(item.recordedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-gray-200 px-4 py-3 bg-gray-50 flex items-center justify-between text-sm">
              <span className="font-semibold text-gray-700">Total</span>
              <span className="font-bold text-gray-900">
                {totalScored} <span className="text-gray-400 font-normal">/ {totalMax}</span>
                {totalMax > 0 && (
                  <span className="ml-2 text-gray-500 font-normal text-xs">
                    ({Math.round((totalScored / totalMax) * 10000) / 100}%)
                  </span>
                )}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
