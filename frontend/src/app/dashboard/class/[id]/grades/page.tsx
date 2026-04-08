'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getLetterGrade, getGradeColor } from '@/utils/gradeCalculator';
import { GradeBadge } from '@/components/shared/GradeBadge';

// ─── Types ────────────────────────────────────────────────────────────────────

type GradeRow = {
  itemId   : string;
  title    : string;
  itemType : string;
  maxScore : number;
  rawScore : number | null;
  isGraded : boolean;
};

type CourseInfo = {
  courseCode  : string;
  courseTitle : string;
  termName    : string;
  sectionName : string;
};

const TYPE_LABELS: Record<string, string> = {
  quiz: 'Quiz', midterm: 'Midterm', final_exam: 'Final Exam',
  practice: 'Practice', assignment: 'Assignment',
};

const TYPE_ORDER = ['quiz', 'assignment', 'midterm', 'final_exam', 'practice'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClassGradesPage() {
  const params     = useParams();
  const offeringId = params?.id as string;

  const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null);
  const [rows, setRows]             = useState<GradeRow[]>([]);
  const [finalGrade, setFinalGrade] = useState<string | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!offeringId) return;
    (async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setLoading(false); return; }
      const { data: appUser } = await supabase.from('users').select('id').eq('auth_user_id', authData.user.id).single();
      if (!appUser) { setLoading(false); return; }
      const userId = (appUser as any).id;

      // Course info
      const { data: offering } = await supabase
        .from('course_offerings')
        .select(`section_name, courses!fk_course_offerings_course(code,title), academic_terms!fk_course_offerings_term(term_name)`)
        .eq('id', offeringId)
        .single();
      if (offering) {
        const o = offering as any;
        setCourseInfo({
          courseCode:  o.courses?.code ?? '—',
          courseTitle: o.courses?.title ?? '—',
          termName:    o.academic_terms?.term_name ?? '—',
          sectionName: o.section_name ?? 'A',
        });
      }

      // Enrollment
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

      // All items for this offering
      const [{ data: assessments }, { data: assignments }] = await Promise.all([
        supabase.from('assessments').select('id, title, type, total_marks').eq('offering_id', offeringId).neq('status', 'archived').order('created_at'),
        supabase.from('assignments').select('id, title, max_score').eq('offering_id', offeringId).neq('status', 'archived').order('created_at'),
      ]);

      // Gradebook items (graded records)
      const { data: gbItems } = await supabase
        .from('gradebook_items')
        .select('assessment_id, assignment_id, raw_score')
        .eq('enrollment_id', enrollmentId);

      const gbByAssessment: Record<string, any> = {};
      const gbByAssignment: Record<string, any> = {};
      ((gbItems ?? []) as any[]).forEach(g => {
        if (g.assessment_id) gbByAssessment[g.assessment_id] = g;
        if (g.assignment_id) gbByAssignment[g.assignment_id] = g;
      });

      const assessmentRows: GradeRow[] = ((assessments ?? []) as any[]).map(a => {
        const gb = gbByAssessment[a.id];
        return {
          itemId:   a.id,
          title:    a.title,
          itemType: a.type,
          maxScore: a.total_marks,
          rawScore: gb?.raw_score ?? null,
          isGraded: !!gb,
        };
      });

      const assignmentRows: GradeRow[] = ((assignments ?? []) as any[]).map(a => {
        const gb = gbByAssignment[a.id];
        return {
          itemId:   a.id,
          title:    a.title,
          itemType: 'assignment',
          maxScore: a.max_score,
          rawScore: gb?.raw_score ?? null,
          isGraded: !!gb,
        };
      });

      const allRows = [...assessmentRows, ...assignmentRows].sort((a, b) => {
        const ai = TYPE_ORDER.indexOf(a.itemType);
        const bi = TYPE_ORDER.indexOf(b.itemType);
        if (ai !== bi) return ai - bi;
        return a.title.localeCompare(b.title);
      });

      setRows(allRows);
      setLoading(false);
    })();
  }, [offeringId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const gradedRows    = rows.filter(r => r.isGraded);
  const totalScored   = gradedRows.reduce((s, r) => s + (r.rawScore ?? 0), 0);
  const totalMaxGraded = gradedRows.reduce((s, r) => s + r.maxScore, 0);
  const totalMaxAll   = rows.reduce((s, r) => s + r.maxScore, 0);

  const hasMidterm       = rows.some(r => r.itemType === 'midterm');
  const hasFinal         = rows.some(r => r.itemType === 'final_exam');
  const hasAssignment    = rows.some(r => r.itemType === 'assignment');
  const midtermGraded    = !hasMidterm    || rows.filter(r => r.itemType === 'midterm').every(r => r.isGraded);
  const finalGraded2     = !hasFinal      || rows.filter(r => r.itemType === 'final_exam').every(r => r.isGraded);
  const assignmentGraded = !hasAssignment || rows.filter(r => r.itemType === 'assignment').some(r => r.isGraded);
  const allMandatoryDone = midtermGraded && finalGraded2 && assignmentGraded;

  const missingItems: string[] = [];
  if (hasMidterm    && !midtermGraded)    missingItems.push('Midterm');
  if (hasFinal      && !finalGraded2)     missingItems.push('Final Exam');
  if (hasAssignment && !assignmentGraded) missingItems.push('Assignment');

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full min-w-0 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl" aria-hidden>📊</span>
        <h1 className="text-2xl font-bold text-gray-900">
          My Grades{courseInfo ? ` — ${courseInfo.courseTitle}` : ''}
        </h1>
      </div>
      {courseInfo && (
        <p className="text-sm text-gray-500 mb-1">
          {courseInfo.termName} · Section {courseInfo.sectionName}
        </p>
      )}
      <div className="border-t border-gray-200 mb-6" />

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">📊</span>
          <p className="text-gray-400 font-medium">No graded items yet.</p>
          <p className="text-gray-400 text-sm mt-1">Grades will appear here once your instructor publishes assessments or assignments.</p>
        </div>
      ) : (
        <>
          {/* Grade table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Item', 'Type', 'Scored', 'Max'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(row => (
                  <tr key={row.itemId} className={`hover:bg-gray-50 ${!row.isGraded ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900 text-sm">{row.title}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 capitalize">{TYPE_LABELS[row.itemType] ?? row.itemType}</td>
                    <td className="px-4 py-3">
                      {row.isGraded
                        ? <span className="font-semibold text-gray-900">{row.rawScore}</span>
                        : <span className="text-amber-500 text-xs font-medium">pending</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-gray-500">{row.maxScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Summary footer */}
            <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between text-sm">
              <span className="font-semibold text-gray-700">Total</span>
              <span className="font-bold text-gray-900">
                {totalScored} <span className="text-gray-400 font-normal">/ {totalMaxAll}</span>
                {totalMaxAll > 0 && (
                  <span className="ml-2 text-gray-500 font-normal text-xs">
                    ({Math.round((totalScored / totalMaxAll) * 10000) / 100}%)
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Grade summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {/* Current score */}
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Current Score</p>
              {gradedRows.length > 0 ? (
                <>
                  <p className="text-xl font-bold text-[#4c1d95]">
                    {totalScored}/{totalMaxGraded}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {totalMaxGraded > 0 ? `${Math.round((totalScored / totalMaxGraded) * 10000) / 100}%` : '—'} of graded items
                  </p>
                </>
              ) : (
                <p className="text-xl font-bold text-gray-400">—</p>
              )}
            </div>

            {/* Final grade */}
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Final Grade</p>
              {allMandatoryDone && finalGrade ? (
                <>
                  <GradeBadge grade={finalGrade} size="lg" />
                  {finalScore != null && <p className="text-xs text-gray-400 mt-1">{finalScore.toFixed(1)}%</p>}
                </>
              ) : rows.length === 0 ? (
                <p className="text-base font-semibold text-gray-400">In Progress</p>
              ) : (
                <>
                  <p className="text-base font-semibold text-amber-600">Pending</p>
                  {missingItems.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">{missingItems.join(', ')} not graded yet</p>
                  )}
                </>
              )}
            </div>

            {/* Items graded */}
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Items Graded</p>
              <p className="text-xl font-bold text-gray-700">
                {gradedRows.length}
                <span className="text-base font-normal text-gray-400"> / {rows.length}</span>
              </p>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            <Link href={`/dashboard/class/${offeringId}/gradebook`} className="text-[#4c1d95] hover:underline">
              View detailed gradebook →
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
