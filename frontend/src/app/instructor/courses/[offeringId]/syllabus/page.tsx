'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function InstructorSyllabusPage() {
  const params     = useParams();
  const offeringId = params?.offeringId as string;

  const [syllabus, setSyllabus]   = useState('');
  const [original, setOriginal]   = useState('');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState('');

  const load = useCallback(async () => {
    if (!offeringId) return;
    const supabase = createClient();

    const { data: offering } = await supabase
      .from('course_offerings')
      .select('syllabus, section_name, course_id')
      .eq('id', offeringId)
      .single();

    if (offering) {
      const text = (offering as any).syllabus ?? '';
      setSyllabus(text);
      setOriginal(text);

      const { data: course } = await supabase
        .from('courses')
        .select('title, code')
        .eq('id', (offering as any).course_id)
        .single();
      if (course) {
        setCourseTitle(`${(course as any).code} — ${(course as any).title}`);
      }
    }
    setLoading(false);
  }, [offeringId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: saveErr } = await supabase
      .from('course_offerings')
      .update({ syllabus })
      .eq('id', offeringId);

    if (saveErr) {
      console.error('[Syllabus save]', saveErr);
      setError(`Save failed: ${saveErr.message}`);
    } else {
      setOriginal(syllabus);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  const isDirty = syllabus !== original;

  if (loading) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-96 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Syllabus</h1>
          {courseTitle && (
            <p className="text-sm text-gray-500 mt-0.5">{courseTitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {saved && (
            <span className="text-sm text-green-600 font-medium flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4c1d95] text-white text-sm font-medium hover:bg-[#3b1677] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Saving…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                {isDirty ? 'Save Syllabus' : 'Saved'}
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Hint */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-700">
        Write your course syllabus below. You can use plain text or Markdown formatting (headings with #, bold with **text**, lists with -). Students will see this on the Syllabus tab of your course.
      </div>

      {/* Editor */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Syllabus Content</span>
          {isDirty && (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Unsaved changes</span>
          )}
        </div>
        <textarea
          value={syllabus}
          onChange={e => setSyllabus(e.target.value)}
          placeholder={`Course Overview\n\nWrite an overview of the course here...\n\nLearning Objectives\n\n- Objective 1\n- Objective 2\n\nGrading Policy\n\nDescribe how grades are calculated...\n\nWeekly Schedule\n\nWeek 1: Introduction\nWeek 2: ...`}
          className="w-full min-h-[500px] p-4 text-sm text-gray-800 font-mono leading-relaxed resize-y focus:outline-none"
          spellCheck
        />
      </div>

      {/* Preview */}
      {syllabus.trim() && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Student Preview</span>
          </div>
          <div className="p-6 prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap leading-relaxed">
            {syllabus}
          </div>
        </div>
      )}
    </div>
  );
}
