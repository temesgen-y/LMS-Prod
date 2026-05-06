'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useInstructorCourse, type OfferingDetails } from '@/contexts/InstructorCourseContext';
import { getNextItemOrder } from '@/utils/sortOrderHelpers';
import RichTextEditor from '@/components/shared/RichTextEditor';

export interface Lesson {
  id: string;
  title: string;
  type: 'video' | 'document' | 'link' | 'scorm';
  content_url: string | null;
  content_body: string | null;
  duration_mins: number | null;
  is_visible: boolean;
}

interface ModuleOption {
  id: string;
  title: string;
}

export interface AddLessonModalProps {
  moduleId?: string;    // pre-fills and locks module field
  moduleName?: string;  // shown when locked
  offeringId?: string;  // locks course dropdown when moduleId is provided
  onClose: () => void;
  onSuccess: (lesson: Lesson) => void;
  onOpenAddModule?: () => void; // optional: opens AddModuleModal
}

const LESSON_TYPES = ['video', 'document', 'link', 'scorm'] as const;
const TYPE_LABELS: Record<string, string> = {
  video: 'Video',
  document: 'Document',
  link: 'Link',
  scorm: 'SCORM',
};
const URL_LABELS: Record<string, string> = {
  video: 'Video URL',
  document: 'PDF URL',
  link: 'External Link URL',
  scorm: 'SCORM Package URL',
};

function offeringLabel(o: OfferingDetails): string {
  return (
    `${o.courses?.code ?? ''} — ${o.courses?.title ?? ''}` +
    ` (${o.academic_terms?.term_name ?? ''} ${o.academic_terms?.year_start ?? ''}` +
    ` · Sec ${o.section_name} · ${o.enrolled_count} students)`
  );
}

export default function AddLessonModal({
  moduleId: lockedModuleId,
  moduleName: lockedModuleName,
  offeringId: lockedOfferingId,
  onClose,
  onSuccess,
  onOpenAddModule,
}: AddLessonModalProps) {
  const { activeOfferingId, allOfferings } = useInstructorCourse();

  // When a module is locked, also lock the offering to match it.
  const effectiveDefault = lockedOfferingId ?? activeOfferingId;
  const [selectedOfferingId, setSelectedOfferingId] = useState(effectiveDefault);
  const isOfferingLocked = !!lockedModuleId && !!lockedOfferingId;
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState(lockedModuleId ?? '');
  const [loadingModules, setLoadingModules] = useState(false);

  const [title, setTitle] = useState('');
  const [lessonType, setLessonType] = useState<string>('video');
  const [contentMethod, setContentMethod] = useState<'url' | 'upload'>('url');
  const [contentUrl, setContentUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contentBody, setContentBody] = useState('');
  const [duration, setDuration] = useState('');
  const [isVisible, setIsVisible] = useState(true);
  const [isMandatory, setIsMandatory] = useState(false);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Sync to the locked/active offering if not yet set
  useEffect(() => {
    if (!selectedOfferingId) {
      setSelectedOfferingId(lockedOfferingId ?? activeOfferingId);
    }
  }, [activeOfferingId, lockedOfferingId, selectedOfferingId]);

  // Load modules for offering
  const loadModules = useCallback(async (offeringId: string) => {
    if (!offeringId) { setModules([]); return; }
    setLoadingModules(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('course_modules')
      .select('id, title, sort_order')
      .eq('offering_id', offeringId)
      .order('sort_order', { ascending: true });
    const mods = (data ?? []).map((m: any) => ({ id: m.id, title: m.title }));
    setModules(mods);
    // Auto-select first module if none locked
    if (!lockedModuleId && mods.length > 0) {
      setSelectedModuleId((prev) => prev || mods[0].id);
    }
    setLoadingModules(false);
  }, [lockedModuleId]);

  useEffect(() => {
    loadModules(selectedOfferingId);
  }, [selectedOfferingId, loadModules]);

  const handleOfferingChange = (id: string) => {
    setSelectedOfferingId(id);
    if (!lockedModuleId) setSelectedModuleId('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedOfferingId) { setError('Please select a course.'); return; }
    if (!lockedModuleId && !selectedModuleId) { setError('Please select a module.'); return; }
    if (!title.trim()) { setError('Title is required.'); return; }
    // Content validation based on type + method
    const needsUpload = (lessonType === 'video' || lessonType === 'document') && contentMethod === 'upload';
    const needsUrl = lessonType === 'link' || ((lessonType === 'video' || lessonType === 'document') && contentMethod === 'url');
    if (needsUpload && !selectedFile) { setError('Please select a file to upload.'); return; }
    if (needsUrl && !contentUrl.trim()) { setError(`${URL_LABELS[lessonType] ?? 'Content URL'} is required.`); return; }
    if (lessonType === 'scorm' && !selectedFile && !contentUrl.trim()) { setError('SCORM package is required.'); return; }
    const durationNum = duration ? Number(duration) : null;
    if (durationNum !== null && (isNaN(durationNum) || durationNum < 1)) {
      setError('Duration must be a positive number.'); return;
    }

    const moduleId = lockedModuleId ?? selectedModuleId;

    setSubmitting(true);
    try {
      const supabase = createClient();
      const useUpload = selectedFile !== null && (contentMethod === 'upload' || lessonType === 'scorm');

      // Step 1: insert lesson (content_url null if uploading — filled in step 2)
      const { data: lesson, error: lessonErr } = await supabase
        .from('lessons')
        .insert({
          offering_id: selectedOfferingId,
          title: title.trim(),
          type: lessonType,
          content_url: useUpload ? null : (contentUrl.trim() || null),
          content_body: contentBody || null,
          duration_mins: durationNum,
          is_visible: isVisible,
        })
        .select()
        .single();

      if (lessonErr) throw lessonErr;

      // Step 2 (optional): upload file, then update lesson content_url
      if (useUpload && selectedFile) {
        const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `lessons/${lesson.id}/${Date.now()}_${safeName}`;
        const { error: uploadErr } = await supabase.storage
          .from('lms-uploads')
          .upload(path, selectedFile, { upsert: false });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from('lms-uploads').getPublicUrl(path);
        const { error: updateErr } = await supabase.from('lessons').update({ content_url: urlData.publicUrl }).eq('id', lesson.id);
        if (updateErr) throw updateErr;
        lesson.content_url = urlData.publicUrl;
      }

      // Step 3: get next sort_order in module
      const nextOrder = await getNextItemOrder(moduleId);

      // Step 3: link lesson to module
      const { error: linkErr } = await supabase
        .from('course_module_items')
        .insert({
          module_id: moduleId,
          offering_id: selectedOfferingId,
          item_type: 'lesson',
          lesson_id: lesson.id,
          sort_order: nextOrder,
          is_visible: isVisible,
          is_mandatory: isMandatory,
        });

      if (linkErr) throw linkErr;

      onSuccess(lesson as Lesson);
      onClose();
    } catch (err: any) {
      console.error('[AddLessonModal]', err);
      setError('Failed to add lesson. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const noModules = !loadingModules && modules.length === 0 && !!selectedOfferingId;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-white rounded-xl shadow-xl border border-gray-200 flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-lesson-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 id="add-lesson-title" className="text-lg font-bold text-gray-900">
            Add Lesson
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
              <label htmlFor="al-offering" className="block text-sm font-medium text-gray-700 mb-1">
                Course <span className="text-red-500">*</span>
              </label>
              {isOfferingLocked ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 flex items-center gap-2">
                  <span>📚</span>
                  <span className="flex-1 truncate">
                    {allOfferings.find(o => o.id === selectedOfferingId)
                      ? offeringLabel(allOfferings.find(o => o.id === selectedOfferingId)!)
                      : selectedOfferingId}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">(locked)</span>
                </div>
              ) : (
                <select
                  id="al-offering"
                  value={selectedOfferingId}
                  onChange={(e) => handleOfferingChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  {allOfferings.map((o) => (
                    <option key={o.id} value={o.id}>
                      {offeringLabel(o)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Module */}
            <div>
              <label htmlFor="al-module" className="block text-sm font-medium text-gray-700 mb-1">
                Module <span className="text-red-500">*</span>
              </label>

              {lockedModuleId ? (
                /* Locked — module passed as prop */
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 flex items-center gap-2">
                  <span>📦</span>
                  <span className="flex-1">{lockedModuleName ?? 'Selected Module'}</span>
                  <span className="text-xs text-gray-400">(locked — adding to this module)</span>
                </div>
              ) : noModules ? (
                /* No modules exist */
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                  ⚠️ No modules exist for this course yet.
                  {onOpenAddModule && (
                    <button
                      type="button"
                      onClick={onOpenAddModule}
                      className="ml-2 underline font-medium hover:text-amber-900"
                    >
                      Create a module first →
                    </button>
                  )}
                </div>
              ) : (
                /* Open module dropdown */
                <select
                  id="al-module"
                  value={selectedModuleId}
                  onChange={(e) => setSelectedModuleId(e.target.value)}
                  required
                  disabled={loadingModules}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white disabled:opacity-50"
                >
                  <option value="">— Select module —</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Title */}
            <div>
              <label htmlFor="al-title" className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                id="al-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Introduction to SQL"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Type + Duration */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="al-type" className="block text-sm font-medium text-gray-700 mb-1">
                  Type <span className="text-red-500">*</span>
                </label>
                <select
                  id="al-type"
                  value={lessonType}
                  onChange={(e) => {
                    const t = e.target.value;
                    setLessonType(t);
                    if (t === 'document' || t === 'link') setDuration('');
                    if (t === 'link') setContentMethod('url');
                    else if (t === 'scorm') setContentMethod('upload');
                    setSelectedFile(null);
                    setContentUrl('');
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  {LESSON_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              {(lessonType === 'video' || lessonType === 'scorm') && (
                <div>
                  <label htmlFor="al-duration" className="block text-sm font-medium text-gray-700 mb-1">
                    Duration (mins)
                  </label>
                  <input
                    id="al-duration"
                    type="number"
                    min={1}
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="e.g. 30"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              )}
            </div>

            {/* Content — upload or URL depending on type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {lessonType === 'video' ? 'Video Content' :
                 lessonType === 'document' ? 'Document Content' :
                 lessonType === 'link' ? 'External Link URL' :
                 'SCORM Package'}{' '}
                <span className="text-red-500">*</span>
              </label>

              {/* Video / Document: upload OR url choice */}
              {(lessonType === 'video' || lessonType === 'document') && (
                <>
                  <div className="flex gap-5 mb-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" value="url" checked={contentMethod === 'url'}
                        onChange={() => { setContentMethod('url'); setSelectedFile(null); }}
                        className="text-purple-600" />
                      <span className="text-sm text-gray-700">Paste URL</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" value="upload" checked={contentMethod === 'upload'}
                        onChange={() => { setContentMethod('upload'); setContentUrl(''); }}
                        className="text-purple-600" />
                      <span className="text-sm text-gray-700">Upload file</span>
                    </label>
                  </div>

                  {contentMethod === 'url' && (
                    <input
                      type="url"
                      value={contentUrl}
                      onChange={(e) => setContentUrl(e.target.value)}
                      placeholder={lessonType === 'video' ? 'https://youtube.com/... or direct video URL' : 'https://... PDF URL'}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  )}

                  {contentMethod === 'upload' && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept={lessonType === 'video' ? 'video/*' : 'application/pdf'}
                        onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                      />
                      <div
                        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                          selectedFile ? 'border-purple-300 bg-purple-50' : 'border-gray-300 hover:border-purple-400'
                        }`}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {selectedFile ? (
                          <div className="flex items-center justify-center gap-3">
                            <span className="text-2xl">{lessonType === 'video' ? '📹' : '📄'}</span>
                            <span className="text-sm font-medium text-gray-700 truncate max-w-xs">{selectedFile.name}</span>
                            <button type="button"
                              onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                              className="text-red-400 hover:text-red-600 text-xs ml-1">✕</button>
                          </div>
                        ) : (
                          <div>
                            <p className="text-gray-500 text-sm">
                              {lessonType === 'video' ? '📹 Click to upload video file' : '📄 Click to upload PDF'}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {lessonType === 'video' ? 'Max 100MB · MP4, WebM, MOV' : 'Max 20MB · PDF'}
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Link: URL only */}
              {lessonType === 'link' && (
                <>
                  <input
                    type="url"
                    value={contentUrl}
                    onChange={(e) => setContentUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">ℹ️ Opens in a new browser tab for students.</p>
                </>
              )}

              {/* SCORM: upload only */}
              {lessonType === 'scorm' && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".zip"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  />
                  <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      selectedFile ? 'border-purple-300 bg-purple-50' : 'border-gray-300 hover:border-purple-400'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {selectedFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <span className="text-2xl">📦</span>
                        <span className="text-sm font-medium text-gray-700">{selectedFile.name}</span>
                        <button type="button"
                          onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                          className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </div>
                    ) : (
                      <div>
                        <p className="text-gray-500 text-sm">📦 Click to upload SCORM .zip package</p>
                        <p className="text-xs text-gray-400 mt-1">Max 100MB · .zip only</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Description — TipTap */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <RichTextEditor
                value={contentBody}
                onChange={(html) => setContentBody(html)}
                placeholder="What students will learn..."
                minHeight="140px"
              />
            </div>

            {/* Visible + Mandatory */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <input
                  id="al-visible"
                  type="checkbox"
                  checked={isVisible}
                  onChange={(e) => setIsVisible(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <label htmlFor="al-visible" className="text-sm font-medium text-gray-700">
                  Visible to students
                </label>
              </div>
              <div className="flex items-start gap-3">
                <input
                  id="al-mandatory"
                  type="checkbox"
                  checked={isMandatory}
                  onChange={(e) => setIsMandatory(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 mt-0.5"
                />
                <div>
                  <label htmlFor="al-mandatory" className="text-sm font-medium text-gray-700">
                    Mandatory
                  </label>
                  <p className="text-xs text-gray-400">Student must complete this before advancing to the next item.</p>
                </div>
              </div>
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
              disabled={submitting || noModules}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#4c1d95] text-white text-sm font-medium hover:bg-[#3b1677] transition disabled:opacity-50 min-w-[110px] justify-center"
            >
              {submitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Adding…
                </>
              ) : (
                'Add Lesson'
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
