'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useInstructorCourse, type OfferingDetails } from '@/contexts/InstructorCourseContext';
import { getNextModuleOrder } from '@/utils/sortOrderHelpers';

export interface CourseModule {
  id: string;
  offering_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_visible: boolean;
  unlock_date: string | null;
}

export interface AddModuleModalProps {
  onClose: () => void;
  onSuccess: (module: CourseModule) => void;
}

const TITLE_MAX = 100;
const DESC_MAX = 300;

function offeringLabel(o: OfferingDetails): string {
  return (
    `${o.courses?.code ?? ''} — ${o.courses?.title ?? ''}` +
    ` (${o.academic_terms?.term_name ?? ''} ${o.academic_terms?.year_start ?? ''}` +
    ` · Sec ${o.section_name} · ${o.enrolled_count} students)`
  );
}

export default function AddModuleModal({ onClose, onSuccess }: AddModuleModalProps) {
  const { activeOfferingId, allOfferings } = useInstructorCourse();

  const [selectedOfferingId, setSelectedOfferingId] = useState(activeOfferingId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [isVisible, setIsVisible] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sync if activeOfferingId loads after mount
  useEffect(() => {
    if (!selectedOfferingId && activeOfferingId) {
      setSelectedOfferingId(activeOfferingId);
    }
  }, [activeOfferingId, selectedOfferingId]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedOfferingId) { setError('Please select a course.'); return; }
    if (!title.trim()) { setError('Title is required.'); return; }
    if (title.trim().length > TITLE_MAX) { setError(`Title must be ${TITLE_MAX} characters or fewer.`); return; }
    if (description.length > DESC_MAX) { setError(`Description must be ${DESC_MAX} characters or fewer.`); return; }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const nextOrder = await getNextModuleOrder(selectedOfferingId);

      const { data: newModule, error: insertErr } = await supabase
        .from('course_modules')
        .insert({
          offering_id: selectedOfferingId,
          title: title.trim(),
          description: description.trim() || null,
          sort_order: nextOrder,
          is_visible: isVisible,
          unlock_date: releaseDate || null,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;
      onSuccess(newModule as CourseModule);
      onClose();
    } catch (err: any) {
      setError('Failed to create module. Please try again.');
      console.error('[AddModuleModal]', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-white rounded-xl shadow-xl border border-gray-200 flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-module-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 id="add-module-title" className="text-lg font-bold text-gray-900">
            Add Module
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
                {error}
              </div>
            )}

            {/* Course */}
            <div>
              <label htmlFor="am-offering" className="block text-sm font-medium text-gray-700 mb-1">
                Course <span className="text-red-500">*</span>
              </label>
              <select
                id="am-offering"
                value={selectedOfferingId}
                onChange={(e) => setSelectedOfferingId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              >
                {allOfferings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {offeringLabel(o)}
                  </option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="am-title" className="block text-sm font-medium text-gray-700">
                  Title <span className="text-red-500">*</span>
                </label>
                <span className={`text-xs ${title.length > TITLE_MAX ? 'text-red-500' : 'text-gray-400'}`}>
                  {title.length}/{TITLE_MAX}
                </span>
              </div>
              <input
                id="am-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Module 1: Introduction"
                maxLength={TITLE_MAX + 10}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="am-desc" className="block text-sm font-medium text-gray-700">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <span className={`text-xs ${description.length > DESC_MAX ? 'text-red-500' : 'text-gray-400'}`}>
                  {description.length}/{DESC_MAX}
                </span>
              </div>
              <textarea
                id="am-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief overview of this module..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>

            {/* Release Date */}
            <div>
              <label htmlFor="am-release" className="block text-sm font-medium text-gray-700 mb-1">
                Release Date <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="am-release"
                type="date"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Students cannot access this module before this date.
              </p>
            </div>

            {/* Visible */}
            <div className="flex items-center gap-3">
              <input
                id="am-visible"
                type="checkbox"
                checked={isVisible}
                onChange={(e) => setIsVisible(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <label htmlFor="am-visible" className="text-sm font-medium text-gray-700">
                Visible to students
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#4c1d95] text-white text-sm font-medium hover:bg-[#3b1677] transition disabled:opacity-50 min-w-[110px] justify-center"
            >
              {submitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Creating…
                </>
              ) : (
                'Add Module'
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
