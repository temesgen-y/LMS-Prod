'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { EnrolledCourse } from '@/types/study-groups';

interface Props {
  userId: string;
  onCreated: (group: { id: string; name: string }) => void;
  onClose: () => void;
}

export default function CreateGroupModal({ userId, onCreated, onClose }: Props) {
  const [courses, setCourses] = useState<EnrolledCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [offeringId, setOfferingId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('enrollments')
        .select(`
          offering_id,
          course_offerings (
            id,
            courses ( code, title )
          )
        `)
        .eq('student_id', userId)
        .eq('status', 'active');
      setCourses((data ?? []) as unknown as EnrolledCourse[]);
      setLoadingCourses(false);
    };
    load();
  }, [userId]);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!offeringId) { setError('Please select a course.'); return; }
    if (!name.trim()) { setError('Group name is required.'); return; }
    if (name.trim().length > 60) { setError('Group name must be 60 characters or fewer.'); return; }
    if (description.length > 200) { setError('Description must be 200 characters or fewer.'); return; }

    setSubmitting(true);
    const supabase = createClient();

    // Check for duplicate name in same offering
    const { data: existing } = await supabase
      .from('study_groups')
      .select('id')
      .eq('offering_id', offeringId)
      .eq('name', name.trim())
      .maybeSingle();

    if (existing) {
      setError('A group with this name already exists in this course.');
      setSubmitting(false);
      return;
    }

    const { data: group, error: gErr } = await supabase
      .from('study_groups')
      .insert({
        offering_id: offeringId,
        created_by: userId,
        name: name.trim(),
        description: description.trim() || null,
      })
      .select('id, name')
      .single();

    if (gErr) {
      setError(gErr.message);
      setSubmitting(false);
      return;
    }

    const { error: mErr } = await supabase.from('study_group_members').insert({
      group_id: (group as { id: string; name: string }).id,
      student_id: userId,
      role: 'owner',
      status: 'active',
    });

    if (mErr) {
      setError(mErr.message);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onCreated(group as { id: string; name: string });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Create Study Group</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Course selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Course <span className="text-red-500">*</span>
            </label>
            {loadingCourses ? (
              <div className="h-10 bg-gray-100 animate-pulse rounded-lg" />
            ) : (
              <select
                value={offeringId}
                onChange={e => setOfferingId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent bg-white"
              >
                <option value="">Select your course…</option>
                {courses.map(c => {
                  const co = c.course_offerings;
                  const course = co?.courses;
                  return (
                    <option key={c.offering_id} value={c.offering_id}>
                      {course ? `${course.code} — ${course.title}` : c.offering_id}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          {/* Group name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Group Name <span className="text-red-500">*</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={60}
              placeholder="e.g. CS301 Exam Prep Group"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{name.length}/60</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={200}
              rows={3}
              placeholder="What is this group for?"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95] focus:border-transparent resize-none"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{description.length}/200</p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#4c1d95] rounded-lg hover:bg-[#5b21b6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {submitting && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              )}
              {submitting ? 'Creating…' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
