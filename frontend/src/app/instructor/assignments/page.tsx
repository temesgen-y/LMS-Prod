'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

type Assignment = {
  id: string; offeringId: string; offeringLabel: string; title: string;
  maxScore: number; dueDate: string;
  allowFiles: boolean; allowText: boolean; lateAllowed: boolean; status: string;
};
type OfferingOption = { id: string; label: string };
type PendingFile = { file: File; name: string; sizeKb: number };

const STATUSES = ['draft', 'published', 'closed'];
const STATUS_COLORS: Record<string, string> = { draft: 'text-gray-500', published: 'text-green-600', closed: 'text-amber-600' };
const PAGE_SIZE = 10;
const initialForm = {
  offeringId: '', title: '', brief: '', maxScore: '100',
  allowFiles: true, allowedTypes: '', maxFileMb: '10',
  allowText: false, dueDate: '', lateAllowed: false, latePenaltyPct: '0', status: 'draft',
};

// ─── Notify helper ────────────────────────────────────────────────────────────

async function notifyEnrolledStudents(supabase: any, offeringId: string, type: string, title: string, body: string) {
  const { data: enrollments } = await supabase.from('enrollments').select('student_id').eq('offering_id', offeringId).eq('status', 'active');
  if (!enrollments?.length) return;
  await supabase.from('notifications').insert(enrollments.map((e: any) => ({ user_id: e.student_id, type, title, body })));
}

// ─── Rich editor helpers ──────────────────────────────────────────────────────

function ToolBtn({ title, onClick, children, active }: { title: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`px-1.5 py-1 rounded text-sm hover:bg-gray-200 transition-colors ${active ? 'bg-gray-200 ring-1 ring-purple-300' : ''}`}
    >
      {children}
    </button>
  );
}

function toEmbedUrl(url: string): string {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return url;
}

// ─── Insert Media modal ───────────────────────────────────────────────────────

function InsertMediaModal({ onClose, onInsert }: { onClose: () => void; onInsert: (url: string, desc: string, w: string, h: string) => void }) {
  const [url, setUrl] = useState(''); const [desc, setDesc] = useState(''); const [w, setW] = useState(''); const [h, setH] = useState('');
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">Insert Media</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Media URL <span className="text-red-500">*</span></label><input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label><input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe the video" className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Width (px)</label><input type="number" value={w} onChange={e => setW(e.target.value)} placeholder="560" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Height (px)</label><input type="number" value={h} onChange={e => setH(e.target.value)} placeholder="315" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="px-5 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={() => { if (!url.trim() || !desc.trim()) { alert('URL and description are required'); return; } onInsert(url.trim(), desc.trim(), w.trim(), h.trim()); }} className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">Insert Media</button>
        </div>
      </div>
    </div>
  );
}

// ─── Insert Image modal ───────────────────────────────────────────────────────

function InsertImageModal({ onClose, onInsert }: { onClose: () => void; onInsert: (url: string, alt: string, w: string) => void }) {
  const [url, setUrl] = useState(''); const [alt, setAlt] = useState(''); const [w, setW] = useState('');
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">Insert Image</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Image URL <span className="text-red-500">*</span></label><input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/image.jpg" className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Alt text</label><input type="text" value={alt} onChange={e => setAlt(e.target.value)} placeholder="Describe the image" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Width (px, optional)</label><input type="number" value={w} onChange={e => setW(e.target.value)} placeholder="400" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="px-5 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={() => { if (!url.trim()) { alert('Image URL is required'); return; } onInsert(url.trim(), alt.trim(), w.trim()); }} className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">Insert Image</button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Link modal ───────────────────────────────────────────────────────────

function AddLinkModal({ onClose, onInsert }: { onClose: () => void; onInsert: (url: string, text: string) => void }) {
  const [url, setUrl] = useState('https://'); const [text, setText] = useState('');
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Add Link</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <div className="space-y-3">
          <div><label className="block text-xs font-medium text-gray-700 mb-1">URL <span className="text-red-500">*</span></label><input type="url" value={url} onChange={e => setUrl(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Link text (optional)</label><input type="text" value={text} onChange={e => setText(e.target.value)} placeholder="Click here" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={() => { if (url.trim()) onInsert(url.trim(), text.trim()); }} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Insert Link</button>
        </div>
      </div>
    </div>
  );
}

// ─── Rich Editor ──────────────────────────────────────────────────────────────

function RichEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editorRef  = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const linkBtnRef = useRef<HTMLDivElement>(null);
  const [wordCount, setWordCount] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [showLinkDrop, setShowLinkDrop] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);

  useEffect(() => { if (editorRef.current && !initialized) { editorRef.current.innerHTML = value; setInitialized(true); } }, [value, initialized]);
  useEffect(() => { if (editorRef.current && value === '') { editorRef.current.innerHTML = ''; setWordCount(0); setInitialized(false); } }, [value]);
  useEffect(() => {
    if (!showLinkDrop) return;
    const handler = (e: MouseEvent) => { if (linkBtnRef.current && !linkBtnRef.current.contains(e.target as Node)) setShowLinkDrop(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLinkDrop]);

  const updateCount = () => { const t = editorRef.current?.innerText ?? ''; setWordCount(t.trim() ? t.trim().split(/\s+/).length : 0); };
  const exec = (cmd: string, val?: string) => { editorRef.current?.focus(); document.execCommand(cmd, false, val); if (editorRef.current) onChange(editorRef.current.innerHTML); };
  const saveSelection = () => { const sel = window.getSelection(); if (sel && sel.rangeCount > 0) savedRange.current = sel.getRangeAt(0).cloneRange(); };
  const restoreSelection = () => { editorRef.current?.focus(); if (!savedRange.current) return; const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(savedRange.current); };
  const execHTML = (html: string) => { restoreSelection(); document.execCommand('insertHTML', false, html); if (editorRef.current) onChange(editorRef.current.innerHTML); };

  const handleInsertMedia = (url: string, desc: string, w: string, h: string) => {
    const embedUrl = toEmbedUrl(url);
    execHTML(`<div style="margin:8px 0"><iframe src="${embedUrl}" width="${w || '560'}" height="${h || '315'}" frameborder="0" allowfullscreen title="${desc}" style="max-width:100%;display:block;"></iframe><p style="font-size:0.75rem;color:#6b7280;margin:2px 0 0">${desc}</p></div>`);
    setShowMediaModal(false);
  };
  const handleInsertImage = (url: string, alt: string, w: string) => {
    execHTML(`<img src="${url}" alt="${alt || 'Image'}" style="${w ? `width:${w}px;` : ''}max-width:100%;display:block;margin:4px 0" />`);
    setShowImageModal(false);
  };
  const handleInsertLink = (url: string, text: string) => {
    restoreSelection();
    const sel = window.getSelection();
    const hasSelection = sel && sel.toString().trim().length > 0;
    if (text && !hasSelection) document.execCommand('insertHTML', false, `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
    else { document.execCommand('createLink', false, url); editorRef.current?.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; }); }
    if (editorRef.current) onChange(editorRef.current.innerHTML);
    setShowLinkModal(false);
  };

  return (
    <>
      <div className="border border-gray-300 rounded overflow-hidden">
        {/* Menu bar */}
        <div className="flex items-center gap-4 px-3 py-1 border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
          {['File','Edit','Insert','Format','Table','Help'].map(m => <span key={m} className="cursor-default hover:text-gray-800 select-none">{m}</span>)}
        </div>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-gray-200 bg-gray-50">
          <ToolBtn title="Undo" onClick={() => exec('undo')}><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 7h10a5 5 0 010 10H7"/><path strokeLinecap="round" strokeLinejoin="round" d="M3 7l4-4M3 7l4 4"/></svg></ToolBtn>
          <ToolBtn title="Redo" onClick={() => exec('redo')}><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 7H11a5 5 0 000 10h6"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 7l-4-4M21 7l-4 4"/></svg></ToolBtn>
          <span className="w-px h-4 bg-gray-300 mx-0.5" />
          <ToolBtn title="Bold" onClick={() => exec('bold')}><strong className="text-xs font-bold">B</strong></ToolBtn>
          <ToolBtn title="Italic" onClick={() => exec('italic')}><em className="text-xs italic font-serif">I</em></ToolBtn>
          <ToolBtn title="Underline" onClick={() => exec('underline')}><u className="text-xs">U</u></ToolBtn>
          <ToolBtn title="Strikethrough" onClick={() => exec('strikeThrough')}><s className="text-xs">S</s></ToolBtn>
          <span className="w-px h-4 bg-gray-300 mx-0.5" />
          <ToolBtn title="Align left" onClick={() => exec('justifyLeft')}><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg></ToolBtn>
          <ToolBtn title="Numbered list" onClick={() => exec('insertOrderedList')}><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg></ToolBtn>
          <ToolBtn title="Bullet list" onClick={() => exec('insertUnorderedList')}><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg></ToolBtn>
          <span className="w-px h-4 bg-gray-300 mx-0.5" />
          <ToolBtn title="Insert Image" onClick={() => { saveSelection(); setShowImageModal(true); }}><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></ToolBtn>
          <ToolBtn title="Insert Media / Video" onClick={() => { saveSelection(); setShowMediaModal(true); }}><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="5 3 19 12 5 21 5 3"/></svg></ToolBtn>
          <div className="relative" ref={linkBtnRef}>
            <button type="button" title="Link" onMouseDown={(e) => { e.preventDefault(); setShowLinkDrop(v => !v); }} className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-sm hover:bg-gray-200 transition-colors ${showLinkDrop ? 'bg-purple-100 ring-1 ring-purple-300' : ''}`}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
              <svg className="w-2.5 h-2.5 text-gray-400" viewBox="0 0 10 10" fill="currentColor"><path d="M0 3l5 5 5-5z"/></svg>
            </button>
            {showLinkDrop && (
              <div className="absolute left-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                <button type="button" className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50" onMouseDown={(e) => { e.preventDefault(); saveSelection(); setShowLinkDrop(false); setShowLinkModal(true); }}>
                  <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                  Add Link
                </button>
                <button type="button" className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:bg-gray-50" onMouseDown={(e) => { e.preventDefault(); exec('unlink'); setShowLinkDrop(false); }}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" strokeDasharray="4 2"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" strokeDasharray="4 2"/><line x1="4" y1="4" x2="20" y2="20"/></svg>
                  Remove Link
                </button>
              </div>
            )}
          </div>
          <span className="w-px h-4 bg-gray-300 mx-0.5" />
          <ToolBtn title="Blockquote" onClick={() => exec('formatBlock', 'blockquote')}><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zm12 0c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg></ToolBtn>
          <ToolBtn title="Code block" onClick={() => exec('formatBlock', 'pre')}><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></ToolBtn>
          <ToolBtn title="Remove formatting" onClick={() => exec('removeFormat')}><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 3h12l4 6-10 13L2 9z"/><line x1="3" y1="21" x2="21" y2="3"/></svg></ToolBtn>
        </div>
        {/* Editable area */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => { if (editorRef.current) { onChange(editorRef.current.innerHTML); updateCount(); } }}
          className="min-h-[160px] p-3 text-sm text-gray-800 focus:outline-none"
          style={{ lineHeight: 1.7 }}
        />
        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-200 bg-gray-50 text-xs text-gray-400">
          <span>Press Alt + 0 for help</span>
          <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
        </div>
      </div>
      {showMediaModal && <InsertMediaModal onClose={() => setShowMediaModal(false)} onInsert={handleInsertMedia} />}
      {showImageModal && <InsertImageModal onClose={() => setShowImageModal(false)} onInsert={handleInsertImage} />}
      {showLinkModal && <AddLinkModal onClose={() => setShowLinkModal(false)} onInsert={handleInsertLink} />}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InstructorAssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [offerings, setOfferings] = useState<OfferingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOffering, setFilterOffering] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(initialForm);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getCurrentUserId = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
    return data?.id ?? null;
  }, []);

  const fetchOfferings = useCallback(async () => {
    const userId = await getCurrentUserId(); if (!userId) return;
    const supabase = createClient();
    const { data } = await supabase.from('course_instructors').select(`course_offerings!fk_course_instructors_offering(id,section_name,courses!fk_course_offerings_course(code,title),academic_terms!fk_course_offerings_term(academic_year_label,term_name,term_code))`).eq('instructor_id', userId);
    if (data) setOfferings((data ?? []).map((r: any) => { const o = r.course_offerings ?? {}; const c = o.courses ?? {}; const t = o.academic_terms ?? {}; return { id: o.id, label: `${(c.code ?? '').toUpperCase()} — ${c.title ?? '—'} · ${[t.academic_year_label, t.term_name ?? t.term_code].filter(Boolean).join(' · ')} · Sec ${o.section_name ?? 'A'}` }; }).filter((o: OfferingOption) => !!o.id));
  }, [getCurrentUserId]);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    const userId = await getCurrentUserId(); if (!userId) { setLoading(false); return; }
    const supabase = createClient();
    const { data: ciData } = await supabase.from('course_instructors').select('offering_id').eq('instructor_id', userId);
    const offeringIds = (ciData ?? []).map((r: any) => r.offering_id);
    if (!offeringIds.length) { setAssignments([]); setLoading(false); return; }
    const { data, error } = await supabase.from('assignments').select(`id,offering_id,title,max_score,due_date,allow_files,allow_text,late_allowed,status,course_offerings!fk_assignments_offering(section_name,courses!fk_course_offerings_course(code,title),academic_terms!fk_course_offerings_term(academic_year_label,term_name,term_code))`).in('offering_id', offeringIds).order('created_at', { ascending: false });
    if (error) toast.error('Failed to load assignments.');
    else setAssignments((data ?? []).map((r: any) => { const o = r.course_offerings ?? {}; const c = o.courses ?? {}; const t = o.academic_terms ?? {}; return { id: r.id, offeringId: r.offering_id, offeringLabel: `${(c.code ?? '').toUpperCase()} — ${c.title ?? '—'} · ${[t.academic_year_label, t.term_name ?? t.term_code].filter(Boolean).join(' · ')} · Sec ${o.section_name ?? 'A'}`, title: r.title ?? '', maxScore: r.max_score ?? 100, dueDate: r.due_date ?? '', allowFiles: r.allow_files ?? true, allowText: r.allow_text ?? false, lateAllowed: r.late_allowed ?? false, status: r.status ?? 'draft' }; }));
    setLoading(false);
  }, [getCurrentUserId]);

  useEffect(() => { fetchOfferings(); fetchAssignments(); }, [fetchOfferings, fetchAssignments]);

  const openAddModal = useCallback(() => {
    setEditingId(null);
    setForm({ ...initialForm, offeringId: filterOffering });
    setPendingFiles([]);
    setSubmitError('');
    setModalOpen(true);
  }, [filterOffering]);

  const openEditModal = useCallback((a: Assignment) => {
    setEditingId(a.id);
    setForm({ offeringId: a.offeringId, title: a.title, brief: '', maxScore: String(a.maxScore), allowFiles: a.allowFiles, allowedTypes: '', maxFileMb: '10', allowText: a.allowText, dueDate: a.dueDate ? new Date(a.dueDate).toISOString().slice(0, 16) : '', lateAllowed: a.lateAllowed, latePenaltyPct: '0', status: a.status });
    setPendingFiles([]);
    setSubmitError('');
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => { if (!isSubmitting) { setModalOpen(false); setPendingFiles([]); } }, [isSubmitting]);
  useEffect(() => { if (!modalOpen) return; const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [modalOpen, closeModal]);

  // ── File picker ──────────────────────────────────────────────────────────
  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const newFiles: PendingFile[] = files.map(f => ({ file: f, name: f.name, sizeKb: Math.ceil(f.size / 1024) }));
    setPendingFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingFile = (idx: number) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));

  // ── Upload files to Supabase Storage + attachments table ─────────────────
  const uploadPendingFiles = async (userId: string): Promise<string> => {
    if (!pendingFiles.length) return '';
    setUploadingFiles(true);
    const supabase = createClient();
    const links: string[] = [];

    for (const pf of pendingFiles) {
      try {
        const ext = pf.name.split('.').pop() ?? '';
        const path = `assignments/${userId}/${Date.now()}-${pf.name}`;
        const { error: upErr } = await supabase.storage.from('lms-uploads').upload(path, pf.file, { contentType: pf.file.type });
        if (upErr) { toast.error(`Failed to upload ${pf.name}: ${upErr.message}`); continue; }
        const { data: urlData } = supabase.storage.from('lms-uploads').getPublicUrl(path);
        const fileUrl = urlData.publicUrl;

        // Insert into attachments table
        await supabase.from('attachments').insert({
          file_name: pf.name,
          file_url: fileUrl,
          mime_type: pf.file.type || `application/${ext}`,
          size_kb: pf.sizeKb,
          uploaded_by: userId,
        });

        links.push(`<a href="${fileUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:4px;color:#2563eb;text-decoration:underline;">📎 ${pf.name}</a>`);
      } catch {
        toast.error(`Skipped ${pf.name} due to an error.`);
      }
    }

    setUploadingFiles(false);
    if (!links.length) return '';
    return `<div style="margin-top:12px;border-top:1px solid #e5e7eb;padding-top:8px;"><p style="font-size:0.75rem;font-weight:600;color:#6b7280;margin-bottom:4px;">ATTACHMENTS</p>${links.map(l => `<div style="margin:2px 0">${l}</div>`).join('')}</div>`;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitError('');
    if (!form.offeringId) { setSubmitError('Offering is required.'); return; }
    if (!form.title.trim()) { setSubmitError('Title is required.'); return; }
    if (!form.dueDate) { setSubmitError('Due date is required.'); return; }
    const maxScore = parseInt(form.maxScore, 10);
    if (!maxScore || maxScore < 1) { setSubmitError('Max score must be at least 1.'); return; }
    setIsSubmitting(true);

    const userId = await getCurrentUserId();
    if (!userId) { setSubmitError('Could not identify user.'); setIsSubmitting(false); return; }

    // Upload attachments and get HTML snippet
    const attachmentHtml = await uploadPendingFiles(userId);
    const briefHtml = (form.brief || '') + attachmentHtml;

    const supabase = createClient();
    const prevStatus = editingId ? (assignments.find(a => a.id === editingId)?.status ?? '') : '';
    const payload: any = {
      offering_id: form.offeringId,
      created_by: userId,
      title: form.title.trim(),
      brief: briefHtml || '(no brief)',
      max_score: maxScore,
      weight_pct: 0,
      allow_files: form.allowFiles,
      allowed_types: form.allowedTypes.trim() || null,
      max_file_mb: parseInt(form.maxFileMb, 10) || 10,
      allow_text: form.allowText,
      due_date: new Date(form.dueDate).toISOString(),
      late_allowed: form.lateAllowed,
      late_penalty_pct: parseFloat(form.latePenaltyPct) || 0,
      status: form.status,
    };

    let error;
    if (editingId) ({ error } = await supabase.from('assignments').update(payload).eq('id', editingId));
    else ({ error } = await supabase.from('assignments').insert(payload));
    if (error) { setSubmitError(error.message); setIsSubmitting(false); return; }

    if (form.status === 'published' && prevStatus !== 'published') {
      await notifyEnrolledStudents(supabase, form.offeringId, 'assignment_due', `New assignment: ${form.title.trim()}`, `A new assignment has been published. Due: ${new Date(form.dueDate).toLocaleDateString()}`);
    }

    toast.success(editingId ? 'Assignment updated.' : 'Assignment created.');
    setModalOpen(false);
    setForm(initialForm);
    setPendingFiles([]);
    fetchAssignments();
    setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return; setIsDeleting(true);
    const { error } = await createClient().from('assignments').delete().eq('id', deleteId);
    if (error) toast.error('Failed to delete assignment.'); else { toast.success('Assignment deleted.'); fetchAssignments(); }
    setDeleteId(null); setIsDeleting(false);
  };

  const filtered = assignments.filter(a => {
    const matchO = !filterOffering || a.offeringId === filterOffering;
    const matchS = !search || a.title.toLowerCase().includes(search.toLowerCase());
    return matchO && matchS;
  });
  const totalCount = filtered.length;
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, totalCount);
  const paginated = filtered.slice(start, end);

  return (
    <div className="p-6 space-y-6">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <div className="flex flex-wrap gap-3 flex-1">
          <select value={filterOffering} onChange={e => { setFilterOffering(e.target.value); setPage(1); }} className="flex-1 min-w-[200px] max-w-xs px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20">
            <option value="">All Offerings</option>{offerings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <input type="search" placeholder="Search assignments..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
        <button type="button" onClick={openAddModal} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>New Assignment
        </button>
      </div>

      {/* ── Modal ── */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={closeModal} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200" role="dialog" aria-modal="true">
            <div className="flex items-center justify-between shrink-0 px-6 pt-5 pb-0">
              <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Edit Assignment' : 'New Assignment'}</h2>
              <button type="button" onClick={closeModal} disabled={isSubmitting} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 px-6 pb-6 pt-4">
              <div className="space-y-4 overflow-y-auto pr-1 flex-1">
                {submitError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{submitError}</div>}

                {/* 1. Offering */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Offering *</label>
                  <select value={form.offeringId} onChange={e => setForm((f: any) => ({ ...f, offeringId: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20">
                    <option value="">— Select —</option>{offerings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>

                {/* 2. Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input type="text" value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>

                {/* 3. Brief / Instructions — rich editor */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brief / Instructions *</label>
                  <RichEditor value={form.brief} onChange={html => setForm((f: any) => ({ ...f, brief: html }))} />
                </div>

                {/* 4. Attachments */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Attachments <span className="text-gray-400 font-normal">(optional)</span></label>
                  <div className="border border-dashed border-gray-300 rounded-lg p-3 bg-gray-50">
                    {pendingFiles.length > 0 && (
                      <ul className="space-y-1.5 mb-3">
                        {pendingFiles.map((pf, idx) => (
                          <li key={idx} className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded px-3 py-1.5 text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                              <span className="truncate text-gray-700">{pf.name}</span>
                              <span className="text-xs text-gray-400 shrink-0">{pf.sizeKb} KB</span>
                            </div>
                            <button type="button" onClick={() => removePendingFile(idx)} className="text-gray-400 hover:text-red-500 shrink-0">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2}/><line x1="12" y1="8" x2="12" y2="16" strokeWidth={2}/><line x1="8" y1="12" x2="16" y2="12" strokeWidth={2}/></svg>
                      Add Attachment
                    </button>
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilePick} />
                  </div>
                </div>

                {/* 5. Max Score */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Score</label>
                  <input type="number" min={1} value={form.maxScore} onChange={e => setForm((f: any) => ({ ...f, maxScore: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>

                {/* 6. Due Date | Status */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
                    <input type="datetime-local" value={form.dueDate} onChange={e => setForm((f: any) => ({ ...f, dueDate: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select value={form.status} onChange={e => setForm((f: any) => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20">
                      {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                  </div>
                </div>

                {/* 7. Allow file uploads | Allow text submission */}
                <div className="flex flex-wrap gap-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.allowFiles} onChange={e => setForm((f: any) => ({ ...f, allowFiles: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary" />
                    <span className="text-sm text-gray-700">Allow file uploads</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.allowText} onChange={e => setForm((f: any) => ({ ...f, allowText: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary" />
                    <span className="text-sm text-gray-700">Allow text submission</span>
                  </label>
                </div>

                {/* 8. Allow late submission */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.lateAllowed} onChange={e => setForm((f: any) => ({ ...f, lateAllowed: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary" />
                    <span className="text-sm text-gray-700">Allow late submission</span>
                  </label>
                </div>

                {/* 9. Allowed File Types — only if allowFiles */}
                {form.allowFiles && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Allowed File Types</label>
                    <input type="text" value={form.allowedTypes} placeholder="e.g. .pdf,.docx" onChange={e => setForm((f: any) => ({ ...f, allowedTypes: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                )}

                {/* 10. Late Penalty % — only if lateAllowed */}
                {form.lateAllowed && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Late Penalty %</label>
                    <input type="number" min={0} max={100} value={form.latePenaltyPct} onChange={e => setForm((f: any) => ({ ...f, latePenaltyPct: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                )}
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 pt-4 mt-4 shrink-0 border-t border-gray-100">
                <button type="button" onClick={closeModal} disabled={isSubmitting} className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmitting || uploadingFiles} className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 min-w-[120px]">
                  {isSubmitting ? (uploadingFiles ? 'Uploading…' : 'Saving…') : editingId ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ── Delete confirm ── */}
      {deleteId && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6" role="dialog">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete Assignment?</h2>
            <p className="text-sm text-gray-600 mb-6">This will delete the assignment and all submissions.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteId(null)} disabled={isDeleting} className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={isDeleting} className="px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 min-w-[100px]">{isDeleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </>
      )}

      {/* ── Table ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead><tr className="border-b border-gray-200 bg-gray-50/80">
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Title</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Score</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Due Date</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Status</th>
              <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Actions</th>
            </tr></thead>
            <tbody>
              {loading
                ? <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-500">Loading...</td></tr>
                : paginated.length === 0
                  ? <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-500">No assignments found.</td></tr>
                  : paginated.map(a => (
                    <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="px-5 py-3"><div className="text-sm font-medium text-gray-900">{a.title}</div><div className="text-xs text-gray-500 line-clamp-1">{a.offeringLabel}</div></td>
                      <td className="px-5 py-3 text-sm text-gray-600">{a.maxScore}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">{a.dueDate ? new Date(a.dueDate).toLocaleDateString() : '—'}</td>
                      <td className="px-5 py-3"><span className={`text-sm font-medium capitalize ${STATUS_COLORS[a.status] ?? 'text-gray-500'}`}>{a.status}</span></td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Link href={`/instructor/assignments/${a.id}/submissions`} title="View Submissions" className="p-1.5 rounded hover:bg-purple-50 text-[#4c1d95] hover:text-[#3b0764]"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></Link>
                          <button type="button" onClick={() => openEditModal(a)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                          <button type="button" onClick={() => setDeleteId(a.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-red-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center px-5 py-3 border-t border-gray-200 bg-gray-50/50">
          <p className="text-sm text-gray-600">{totalCount === 0 ? 'No results' : `Showing ${start + 1}–${end} of ${totalCount}`}</p>
          <div className="flex gap-1">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
            <button type="button" onClick={() => setPage(p => p + 1)} disabled={end >= totalCount} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
          </div>
        </div>
      </div>
    </div>
  );
}
