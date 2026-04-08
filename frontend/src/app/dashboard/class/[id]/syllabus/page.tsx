'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Module = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  unlock_date: string | null;
  itemCount: number;
};

type Assessment = {
  id: string;
  title: string;
  type: string;
  totalMarks: number;
  availableFrom: string | null;
  availableUntil: string | null;
};

type Assignment = {
  id: string;
  title: string;
  dueDate: string | null;
  maxScore: number;
};

function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ClassSyllabusPage() {
  const params = useParams();
  const offeringId = params?.id as string;

  const [syllabusText, setSyllabusText] = useState<string | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!offeringId) return;
    (async () => {
      const supabase = createClient();

      const [offeringRes, modsRes, assessRes, assignRes] = await Promise.all([
        supabase
          .from('course_offerings')
          .select('syllabus')
          .eq('id', offeringId)
          .single(),
        supabase
          .from('course_modules')
          .select('id, title, description, sort_order, unlock_date, course_module_items(id)')
          .eq('offering_id', offeringId)
          .eq('is_visible', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('assessments')
          .select('id, title, type, total_marks, available_from, available_until')
          .eq('offering_id', offeringId)
          .eq('status', 'published')
          .order('available_from', { ascending: true }),
        supabase
          .from('assignments')
          .select('id, title, due_date, max_score')
          .eq('offering_id', offeringId)
          .eq('status', 'published')
          .order('due_date', { ascending: true }),
      ]);

      const text = (offeringRes.data as any)?.syllabus ?? null;
      setSyllabusText(text && text.trim() ? text.trim() : null);

      setModules(
        ((modsRes.data ?? []) as any[]).map((m: any) => ({
          id: m.id,
          title: m.title,
          description: m.description,
          sort_order: m.sort_order,
          unlock_date: m.unlock_date,
          itemCount: (m.course_module_items ?? []).length,
        }))
      );
      setAssessments(
        ((assessRes.data ?? []) as any[]).map(a => ({
          id: a.id,
          title: a.title,
          type: a.type,
          totalMarks: a.total_marks,
          availableFrom: a.available_from,
          availableUntil: a.available_until,
        }))
      );
      setAssignments(
        ((assignRes.data ?? []) as any[]).map(a => ({
          id: a.id,
          title: a.title,
          dueDate: a.due_date,
          maxScore: a.max_score,
        }))
      );
      setLoading(false);
    })();
  }, [offeringId]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/4" />
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-lg" />)}</div>
        <div className="h-40 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl" aria-hidden>📋</span>
          <h1 className="text-2xl font-bold text-gray-900">Syllabus</h1>
        </div>
        <div className="border-t border-gray-200" />
      </div>

      {/* Instructor-written syllabus */}
      {syllabusText && (
        <section>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <span className="text-base" aria-hidden>📄</span>
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Course Syllabus</h2>
            </div>
            <div className="px-5 py-5 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {syllabusText}
            </div>
          </div>
        </section>
      )}

      {/* Course Modules */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3">
          Course Modules <span className="text-gray-400 font-normal">({modules.length})</span>
        </h2>
        {modules.length === 0 ? (
          <p className="text-sm text-gray-400">No modules available yet.</p>
        ) : (
          <div className="space-y-2">
            {modules.map((m, idx) => (
              <div key={m.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-start gap-3">
                <span className="w-8 h-8 rounded-full bg-[#4c1d95] text-white text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm">{m.title}</h3>
                  {m.description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{m.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-1.5">
                    <span className="text-xs text-gray-400">{m.itemCount} item{m.itemCount !== 1 ? 's' : ''}</span>
                    {m.unlock_date && (
                      <span className="text-xs text-amber-600">Unlocks: {fmt(m.unlock_date)}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Assessments */}
      {assessments.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-gray-900 mb-3">
            Assessments <span className="text-gray-400 font-normal">({assessments.length})</span>
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Title', 'Type', 'Points', 'Available Window'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assessments.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{a.title}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded capitalize">
                        {a.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{a.totalMarks}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {fmt(a.availableFrom)} – {fmt(a.availableUntil)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Assignments */}
      {assignments.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-gray-900 mb-3">
            Assignments <span className="text-gray-400 font-normal">({assignments.length})</span>
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Title', 'Max Score', 'Due Date'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assignments.map(a => {
                  const overdue = a.dueDate && Date.now() > new Date(a.dueDate).getTime();
                  return (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{a.title}</td>
                      <td className="px-4 py-3 text-gray-700">{a.maxScore}</td>
                      <td className={`px-4 py-3 text-xs ${overdue ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                        {fmt(a.dueDate)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!syllabusText && modules.length === 0 && assessments.length === 0 && assignments.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <span className="text-4xl block mb-3">📋</span>
          <p className="text-gray-400">Syllabus content has not been published yet.</p>
        </div>
      )}
    </div>
  );
}
