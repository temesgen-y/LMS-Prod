'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'active' | 'inactive' | 'scheduled' | 'draft' | 'archived';

type Announcement = {
  id: string;
  offering_id: string | null;
  author_id: string;
  title: string;
  body: string;
  status: Status;
  starts_at: string | null;
  ends_at: string | null;
  is_pinned: boolean;
  send_email: boolean;
  created_at: string;
  offering_label: string;
};

type OfferingOption = { id: string; label: string };

const TABS: { key: Status; label: string }[] = [
  { key: 'active',    label: 'ACTIVE' },
  { key: 'inactive',  label: 'INACTIVE' },
  { key: 'scheduled', label: 'SCHEDULED' },
  { key: 'draft',     label: 'DRAFT' },
  { key: 'archived',  label: 'ARCHIVED' },
];

const PAGE_SIZE = 10;

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDateInput(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}
function toTimeInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toTimeString().slice(0, 5);
}
function combineDatetime(date: string, time: string): string | null {
  if (!date) return null;
  return new Date(`${date}T${time || '00:00'}:00`).toISOString();
}

// ─── Notify students helper ───────────────────────────────────────────────────

async function notifyEnrolledStudents(
  supabase: ReturnType<typeof createClient>,
  offeringId: string,
  title: string,
  body: string,
) {
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('student_id')
    .eq('offering_id', offeringId)
    .eq('status', 'active');
  if (!enrollments?.length) return;
  await supabase.from('notifications').insert(
    enrollments.map((e: any) => ({
      user_id: e.student_id,
      type: 'announcement',
      title,
      body: body.replace(/<[^>]+>/g, '').slice(0, 120),
      link: '/dashboard/announcements',
    }))
  );
}

// ─── Rich text toolbar button ─────────────────────────────────────────────────

function ToolBtn({
  title, onClick, children, active,
}: { title: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
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

// ─── YouTube / Vimeo URL → embed URL ─────────────────────────────────────────

function toEmbedUrl(url: string): string {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return url; // assume it's already an embed URL
}

// ─── Insert Media modal ────────────────────────────────────────────────────────

function InsertMediaModal({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (url: string, desc: string, w: string, h: string) => void;
}) {
  const [url,  setUrl]  = useState('');
  const [desc, setDesc] = useState('');
  const [w,    setW]    = useState('');
  const [h,    setH]    = useState('');

  const handleInsert = () => {
    if (!url.trim())  { alert('Media URL is required'); return; }
    if (!desc.trim()) { alert('Description is required for accessibility'); return; }
    onInsert(url.trim(), desc.trim(), w.trim(), h.trim());
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">Insert Media</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Media URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=... or other video URL"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Enter the URL of a supported video platform (YouTube, Vimeo, Loom, etc.)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Describe the video content or purpose"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Required for accessibility. Helps users understand the video content and purpose.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Width (pixels)</label>
              <input
                type="number"
                value={w}
                onChange={e => setW(e.target.value)}
                placeholder="e.g., 300"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Height (pixels)</label>
              <input
                type="number"
                value={h}
                onChange={e => setH(e.target.value)}
                placeholder="e.g., 200"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-300 rounded p-3 text-xs text-amber-800">
            <strong>Accessibility Note:</strong> Video embeds should include captions or transcripts when possible.
            Consider providing additional context in surrounding text.
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose}
            className="px-5 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={handleInsert}
            className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">
            Insert Media
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Insert Image modal ────────────────────────────────────────────────────────

function InsertImageModal({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (url: string, alt: string, w: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [w,   setW]   = useState('');

  const handleInsert = () => {
    if (!url.trim()) { alert('Image URL is required'); return; }
    onInsert(url.trim(), alt.trim(), w.trim());
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">Insert Image</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Image URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Alt text (description)</label>
            <input
              type="text"
              value={alt}
              onChange={e => setAlt(e.target.value)}
              placeholder="Describe the image for screen readers"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Width (pixels, optional)</label>
            <input
              type="number"
              value={w}
              onChange={e => setW(e.target.value)}
              placeholder="e.g., 400"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose}
            className="px-5 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={handleInsert}
            className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">
            Insert Image
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Link mini modal ───────────────────────────────────────────────────────

function AddLinkModal({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (url: string, text: string) => void;
}) {
  const [url,  setUrl]  = useState('https://');
  const [text, setText] = useState('');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Add Link</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">URL <span className="text-red-500">*</span></label>
            <input type="url" value={url} onChange={e => setUrl(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Link text (optional — uses selection if blank)</label>
            <input type="text" value={text} onChange={e => setText(e.target.value)}
              placeholder="Click here"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={() => { if (url.trim()) onInsert(url.trim(), text.trim()); }}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Insert Link</button>
        </div>
      </div>
    </div>
  );
}

// ─── Rich text editor ─────────────────────────────────────────────────────────

function RichEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editorRef  = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const linkBtnRef = useRef<HTMLDivElement>(null);

  const [wordCount,       setWordCount]       = useState(0);
  const [initialized,     setInitialized]     = useState(false);
  const [showLinkDrop,    setShowLinkDrop]    = useState(false);
  const [showLinkModal,   setShowLinkModal]   = useState(false);
  const [showMediaModal,  setShowMediaModal]  = useState(false);
  const [showImageModal,  setShowImageModal]  = useState(false);

  // Init HTML
  useEffect(() => {
    if (editorRef.current && !initialized) {
      editorRef.current.innerHTML = value;
      setInitialized(true);
    }
  }, [value, initialized]);

  // Reset on clear
  useEffect(() => {
    if (editorRef.current && value === '') {
      editorRef.current.innerHTML = '';
      setWordCount(0);
      setInitialized(false);
    }
  }, [value]);

  // Close link dropdown on outside click
  useEffect(() => {
    if (!showLinkDrop) return;
    const handler = (e: MouseEvent) => {
      if (linkBtnRef.current && !linkBtnRef.current.contains(e.target as Node)) {
        setShowLinkDrop(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLinkDrop]);

  const updateCount = () => {
    const text = editorRef.current?.innerText ?? '';
    setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
  };

  const exec = (cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  // Save caret/selection before opening a modal (so we can insert at right position)
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRange.current = sel.getRangeAt(0).cloneRange();
  };

  const restoreSelection = () => {
    editorRef.current?.focus();
    if (!savedRange.current) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(savedRange.current);
  };

  const execHTML = (html: string) => {
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  // ── handlers ──

  const handleInsertMedia = (url: string, desc: string, w: string, h: string) => {
    const embedUrl = toEmbedUrl(url);
    const width  = w || '560';
    const height = h || '315';
    const html = `<div style="margin:8px 0">
      <iframe
        src="${embedUrl}"
        width="${width}" height="${height}"
        frameborder="0" allowfullscreen
        title="${desc}"
        style="max-width:100%;display:block;"
      ></iframe>
      <p style="font-size:0.75rem;color:#6b7280;margin:2px 0 0">${desc}</p>
    </div>`;
    execHTML(html);
    setShowMediaModal(false);
  };

  const handleInsertImage = (url: string, alt: string, w: string) => {
    const style = w ? `max-width:100%;width:${w}px;` : 'max-width:100%;';
    const html = `<img src="${url}" alt="${alt || 'Image'}" style="${style}display:block;margin:4px 0" />`;
    execHTML(html);
    setShowImageModal(false);
  };

  const handleInsertLink = (url: string, text: string) => {
    restoreSelection();
    const sel = window.getSelection();
    const hasSelection = sel && sel.toString().trim().length > 0;
    if (text && !hasSelection) {
      const html = `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      document.execCommand('insertHTML', false, html);
    } else {
      document.execCommand('createLink', false, url);
      // Make link open in new tab
      const links = editorRef.current?.querySelectorAll('a') ?? [];
      links.forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
    }
    if (editorRef.current) onChange(editorRef.current.innerHTML);
    setShowLinkModal(false);
  };

  return (
    <>
      <div className="border border-gray-300 rounded overflow-hidden">
        {/* Menu bar */}
        <div className="flex items-center gap-4 px-3 py-1 border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
          {['File','Edit','Insert','Format','Table','Help'].map(m => (
            <span key={m} className="cursor-default hover:text-gray-800 select-none">{m}</span>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-gray-200 bg-gray-50">
          {/* Fullscreen placeholder */}
          <ToolBtn title="Fullscreen" onClick={() => {}}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
            </svg>
          </ToolBtn>

          {/* Undo / Redo */}
          <ToolBtn title="Undo (Ctrl+Z)" onClick={() => exec('undo')}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 7h10a5 5 0 010 10H7"/><path strokeLinecap="round" strokeLinejoin="round" d="M3 7l4-4M3 7l4 4"/></svg>
          </ToolBtn>
          <ToolBtn title="Redo (Ctrl+Y)" onClick={() => exec('redo')}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 7H11a5 5 0 000 10h6"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 7l-4-4M21 7l-4 4"/></svg>
          </ToolBtn>

          <span className="w-px h-4 bg-gray-300 mx-0.5" />

          {/* Bold / Italic / Underline / Strikethrough */}
          <ToolBtn title="Bold (Ctrl+B)" onClick={() => exec('bold')}><strong className="text-xs font-bold">B</strong></ToolBtn>
          <ToolBtn title="Italic (Ctrl+I)" onClick={() => exec('italic')}><em className="text-xs italic font-serif">I</em></ToolBtn>
          <ToolBtn title="Underline (Ctrl+U)" onClick={() => exec('underline')}><u className="text-xs">U</u></ToolBtn>
          <ToolBtn title="Strikethrough" onClick={() => exec('strikeThrough')}><s className="text-xs">S</s></ToolBtn>

          <span className="w-px h-4 bg-gray-300 mx-0.5" />

          {/* Align dropdown (simplified) */}
          <ToolBtn title="Align left" onClick={() => exec('justifyLeft')}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
          </ToolBtn>

          {/* Ordered / Bullet list */}
          <ToolBtn title="Numbered list" onClick={() => exec('insertOrderedList')}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
          </ToolBtn>
          <ToolBtn title="Bullet list" onClick={() => exec('insertUnorderedList')}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>
          </ToolBtn>

          <span className="w-px h-4 bg-gray-300 mx-0.5" />

          {/* Insert Image */}
          <ToolBtn title="Insert Image" onClick={() => { saveSelection(); setShowImageModal(true); }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </ToolBtn>

          {/* Insert Media (video) */}
          <ToolBtn title="Insert Media / Video" onClick={() => { saveSelection(); setShowMediaModal(true); }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </ToolBtn>

          {/* Link dropdown */}
          <div className="relative" ref={linkBtnRef}>
            <button
              type="button"
              title="Link"
              onMouseDown={(e) => { e.preventDefault(); setShowLinkDrop(v => !v); }}
              className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-sm hover:bg-gray-200 transition-colors ${showLinkDrop ? 'bg-purple-100 ring-1 ring-purple-300' : ''}`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
              </svg>
              <svg className="w-2.5 h-2.5 text-gray-400" viewBox="0 0 10 10" fill="currentColor"><path d="M0 3l5 5 5-5z"/></svg>
            </button>

            {showLinkDrop && (
              <div className="absolute left-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    saveSelection();
                    setShowLinkDrop(false);
                    setShowLinkModal(true);
                  }}
                >
                  <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                  </svg>
                  Add Link
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    exec('unlink');
                    setShowLinkDrop(false);
                  }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" strokeDasharray="4 2"/>
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" strokeDasharray="4 2"/>
                    <line x1="4" y1="4" x2="20" y2="20"/>
                  </svg>
                  Remove Link
                </button>
              </div>
            )}
          </div>

          <span className="w-px h-4 bg-gray-300 mx-0.5" />

          {/* Blockquote */}
          <ToolBtn title="Blockquote" onClick={() => exec('formatBlock', 'blockquote')}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zm12 0c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>
          </ToolBtn>

          {/* Code */}
          <ToolBtn title="Code block" onClick={() => exec('formatBlock', 'pre')}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          </ToolBtn>

          {/* Remove formatting */}
          <ToolBtn title="Remove formatting" onClick={() => exec('removeFormat')}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 3h12l4 6-10 13L2 9z"/><line x1="3" y1="21" x2="21" y2="3"/></svg>
          </ToolBtn>
        </div>

        {/* Editable area */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => {
            if (editorRef.current) {
              onChange(editorRef.current.innerHTML);
              updateCount();
            }
          }}
          className="min-h-[160px] p-3 text-sm text-gray-800 focus:outline-none"
          style={{ lineHeight: 1.7 }}
        />

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-200 bg-gray-50 text-xs text-gray-400">
          <span>Press Alt + 0 for help</span>
          <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
        </div>
      </div>

      {/* Modals rendered outside editor div */}
      {showMediaModal && (
        <InsertMediaModal
          onClose={() => setShowMediaModal(false)}
          onInsert={handleInsertMedia}
        />
      )}
      {showImageModal && (
        <InsertImageModal
          onClose={() => setShowImageModal(false)}
          onInsert={handleInsertImage}
        />
      )}
      {showLinkModal && (
        <AddLinkModal
          onClose={() => setShowLinkModal(false)}
          onInsert={handleInsertLink}
        />
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const blankForm = () => ({
  offering_id: '',
  title: '',
  body: '',
  status: 'draft' as Status,
  starts_at_date: '',
  starts_at_time: '',
  ends_at_date: '',
  ends_at_time: '',
  is_pinned: false,
  send_email: false,
});

export default function InstructorAnnouncementsPage() {
  const supabase = createClient();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [offerings, setOfferings]         = useState<OfferingOption[]>([]);
  const [filterOffering, setFilterOffering] = useState('');
  const [activeTab, setActiveTab]         = useState<Status>('active');
  const [page, setPage]                   = useState(1);
  const [loading, setLoading]             = useState(true);

  const [showForm, setShowForm]           = useState(false);
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [form, setForm]                   = useState(blankForm());
  const [saving, setSaving]               = useState(false);

  const [deleteTarget, setDeleteTarget]   = useState<Announcement | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');

  // ─── Load offerings ─────────────────────────────────────────────

  const loadOfferings = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    const { data: userData } = await supabase
      .from('users').select('id').eq('auth_user_id', authData.user.id).single();
    if (!userData) return;
    setCurrentUserId(userData.id);

    const { data } = await supabase
      .from('course_instructors')
      .select('offering_id, course_offerings!fk_course_instructors_offering(id, section_name, courses!fk_course_offerings_course(code, title))')
      .eq('instructor_id', userData.id);

    setOfferings((data ?? []).map((r: any) => ({
      id: r.offering_id,
      label: `${r.course_offerings?.courses?.code ?? ''} – ${r.course_offerings?.section_name ?? r.offering_id}`,
    })));
  }, []);

  // ─── Load announcements ─────────────────────────────────────────

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setLoading(false); return; }
    const { data: userData } = await supabase
      .from('users').select('id').eq('auth_user_id', authData.user.id).single();
    if (!userData) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('announcements')
      .select(`
        id, offering_id, author_id, title, body,
        status, starts_at, ends_at,
        is_pinned, send_email, created_at,
        course_offerings!fk_announcements_offering(
          section_name, courses!fk_course_offerings_course(code, title)
        )
      `)
      .eq('author_id', userData.id)
      .order('is_pinned', { ascending: false })
      .order('created_at',  { ascending: false });

    if (error) { toast.error(error.message); setLoading(false); return; }

    setAnnouncements((data ?? []).map((r: any) => ({
      id:            r.id,
      offering_id:   r.offering_id,
      author_id:     r.author_id,
      title:         r.title,
      body:          r.body,
      status:        (r.status ?? 'active') as Status,
      starts_at:     r.starts_at ?? null,
      ends_at:       r.ends_at   ?? null,
      is_pinned:     r.is_pinned,
      send_email:    r.send_email,
      created_at:    r.created_at,
      offering_label: r.course_offerings
        ? `${r.course_offerings.courses?.code ?? ''} – ${r.course_offerings.section_name}`
        : 'Global',
    })));
    setLoading(false);
  }, []);

  useEffect(() => { loadOfferings(); loadAnnouncements(); }, []);

  // ─── Open / close form ──────────────────────────────────────────

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...blankForm(), offering_id: filterOffering });
    setShowForm(true);
  };

  const openEdit = (a: Announcement) => {
    setEditingId(a.id);
    setForm({
      offering_id:    a.offering_id ?? '',
      title:          a.title,
      body:           a.body,
      status:         a.status,
      starts_at_date: toDateInput(a.starts_at),
      starts_at_time: toTimeInput(a.starts_at),
      ends_at_date:   toDateInput(a.ends_at),
      ends_at_time:   toTimeInput(a.ends_at),
      is_pinned:      a.is_pinned,
      send_email:     a.send_email,
    });
    setShowForm(true);
  };

  const discard = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(blankForm());
  };

  // ─── Save (publish or update) ───────────────────────────────────

  const handleSave = async (publishStatus: Status = 'active') => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!form.body.replace(/<[^>]+>/g, '').trim()) { toast.error('Message is required'); return; }
    setSaving(true);

    const startsAt = combineDatetime(form.starts_at_date, form.starts_at_time);
    const endsAt   = combineDatetime(form.ends_at_date,   form.ends_at_time);

    // Auto-set status: if starts_at is in the future, mark as scheduled
    let resolvedStatus: Status = publishStatus;
    if (publishStatus === 'active' && startsAt && new Date(startsAt) > new Date()) {
      resolvedStatus = 'scheduled';
    }

    const payload: Record<string, any> = {
      offering_id: form.offering_id || null,
      author_id:   currentUserId,
      title:       form.title.trim(),
      body:        form.body,
      status:      resolvedStatus,
      starts_at:   startsAt,
      ends_at:     endsAt,
      is_pinned:   form.is_pinned,
      send_email:  form.send_email,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from('announcements').update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('announcements').insert(payload));
    }

    if (error) { toast.error(error.message); setSaving(false); return; }

    // Notify students only on new publish
    if (!editingId && resolvedStatus === 'active' && form.offering_id) {
      await notifyEnrolledStudents(supabase, form.offering_id, form.title, form.body);
    }

    const label = resolvedStatus === 'scheduled' ? 'Scheduled' : resolvedStatus === 'draft' ? 'Saved as draft' : 'Published';
    toast.success(editingId ? 'Announcement updated' : `${label} successfully`);
    setSaving(false);
    discard();
    loadAnnouncements();
  };

  // ─── Delete ─────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('announcements').delete().eq('id', deleteTarget.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Announcement deleted');
    setDeleteTarget(null);
    loadAnnouncements();
  };

  // ─── Derived data ───────────────────────────────────────────────

  const byOffering = announcements.filter(a =>
    !filterOffering || a.offering_id === filterOffering
  );

  const counts = TABS.reduce((acc, t) => {
    acc[t.key] = byOffering.filter(a => a.status === t.key).length;
    return acc;
  }, {} as Record<Status, number>);

  const tabItems = byOffering.filter(a => a.status === activeTab);
  const paginated = tabItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(tabItems.length / PAGE_SIZE);

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-2.236 9.168-5.5" />
          </svg>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Offering filter — kept from original */}
          <select
            value={filterOffering}
            onChange={e => { setFilterOffering(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">All Offerings</option>
            {offerings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>

          {/* Add button */}
          <button
            onClick={showForm ? discard : openAdd}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm font-medium hover:bg-gray-300 transition-colors"
          >
            {showForm ? '✕ CANCEL' : '+ ADD ANNOUNCEMENT'}
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-end gap-0 border-b border-gray-200 mb-0">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setActiveTab(t.key); setPage(1); }}
            className={`px-5 py-2.5 text-xs font-semibold tracking-wide transition-colors border-b-2 -mb-px
              ${activeTab === t.key
                ? 'border-[#4c1d95] text-[#4c1d95]'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label} ({counts[t.key] ?? 0})
          </button>
        ))}
      </div>

      {/* ── Inline announcement form ────────────────────────────── */}
      {showForm && (
        <div className="border border-gray-200 rounded-b-xl bg-white p-6 mb-6 shadow-sm">

          {/* Title */}
          <div className="mb-4 border-b border-gray-200 pb-3">
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Title *"
              className="w-full text-base text-gray-900 placeholder-gray-400 focus:outline-none"
            />
          </div>

          {/* Date / time row */}
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Date *</label>
              <div className="flex items-center gap-1 border border-gray-300 rounded px-2 py-1.5">
                <input
                  type="date"
                  value={form.starts_at_date}
                  onChange={e => setForm(f => ({ ...f, starts_at_date: e.target.value }))}
                  className="text-sm text-gray-800 focus:outline-none"
                />
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Time *</label>
              <div className="flex items-center gap-1 border border-gray-300 rounded px-2 py-1.5">
                <input
                  type="time"
                  value={form.starts_at_time}
                  onChange={e => setForm(f => ({ ...f, starts_at_time: e.target.value }))}
                  className="text-sm text-gray-800 focus:outline-none"
                />
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 7v5l3 3"/>
                </svg>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
              <div className="flex items-center gap-1 border border-gray-300 rounded px-2 py-1.5">
                <input
                  type="date"
                  value={form.ends_at_date}
                  onChange={e => setForm(f => ({ ...f, ends_at_date: e.target.value }))}
                  placeholder="End Date"
                  className="text-sm text-gray-800 focus:outline-none"
                />
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End Time</label>
              <div className="flex items-center gap-1 border border-gray-300 rounded px-2 py-1.5">
                <input
                  type="time"
                  value={form.ends_at_time}
                  onChange={e => setForm(f => ({ ...f, ends_at_time: e.target.value }))}
                  className="text-sm text-gray-800 focus:outline-none"
                />
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 7v5l3 3"/>
                </svg>
              </div>
            </div>

            {/* Offering picker */}
            <div className="ml-auto">
              <label className="block text-xs font-medium text-gray-600 mb-1">Offering (leave blank for global)</label>
              <select
                value={form.offering_id}
                onChange={e => setForm(f => ({ ...f, offering_id: e.target.value }))}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
              >
                <option value="">Global (all students)</option>
                {offerings.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Message label */}
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Message <span className="text-red-500">*</span>
          </label>

          {/* Rich text editor */}
          <RichEditor
            value={form.body}
            onChange={html => setForm(f => ({ ...f, body: html }))}
          />

          {/* Add Attachment */}
          <button type="button" className="flex items-center gap-1.5 mt-3 text-sm text-blue-600 hover:text-blue-800">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" strokeWidth={2}/>
              <line x1="12" y1="8" x2="12" y2="16" strokeWidth={2}/>
              <line x1="8" y1="12" x2="16" y2="12" strokeWidth={2}/>
            </svg>
            Add Attachment
          </button>

          {/* Flags row */}
          <div className="flex items-center gap-6 mt-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_pinned}
                onChange={e => setForm(f => ({ ...f, is_pinned: e.target.checked }))}
                className="rounded border-gray-300"
              />
              Pin to top
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.send_email}
                onChange={e => setForm(f => ({ ...f, send_email: e.target.checked }))}
                className="rounded border-gray-300"
              />
              Send email notification
            </label>
          </div>

          {/* Notification hint */}
          {!editingId && form.offering_id && (
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded p-2.5 text-xs text-blue-700">
              Enrolled students will receive an in-app notification when you publish.
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end items-center gap-3 mt-5 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={discard}
              disabled={saving}
              className="px-6 py-2 border border-gray-300 rounded text-sm font-semibold text-gray-700 hover:bg-gray-50 uppercase tracking-wide"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => handleSave('draft')}
              disabled={saving}
              className="px-6 py-2 border border-gray-400 rounded text-sm font-semibold text-gray-700 hover:bg-gray-100 uppercase tracking-wide"
            >
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              type="button"
              onClick={() => handleSave('active')}
              disabled={saving}
              className="px-6 py-2 bg-[#1a4a8a] text-white rounded text-sm font-semibold hover:bg-[#153c72] uppercase tracking-wide"
            >
              {saving ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </div>
      )}

      {/* ── Announcement list ───────────────────────────────────── */}
      <div className="mt-2">
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : paginated.length === 0 ? (
          <div className="text-center py-16 border border-gray-200 rounded-xl mt-4">
            <p className="text-gray-400 text-sm">No {activeTab} announcements.</p>
          </div>
        ) : (
          <div className="space-y-3 mt-4">
            {paginated.map(a => (
              <div
                key={a.id}
                className={`rounded-xl border p-4 ${a.is_pinned ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {a.is_pinned && (
                        <span className="px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full text-[10px] font-semibold">Pinned</span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        a.status === 'active'    ? 'bg-green-100 text-green-700' :
                        a.status === 'inactive'  ? 'bg-gray-100 text-gray-500'  :
                        a.status === 'scheduled' ? 'bg-blue-100 text-blue-700'  :
                        a.status === 'draft'     ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-200 text-gray-500'
                      }`}>
                        {a.status.toUpperCase()}
                      </span>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">{a.offering_label}</span>
                      {a.send_email && (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[10px]">Email</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900">{a.title}</h3>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2"
                      dangerouslySetInnerHTML={{ __html: a.body }} />
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span>Posted: {new Date(a.created_at).toLocaleString()}</span>
                      {a.starts_at && <span>Starts: {fmtDate(a.starts_at)}</span>}
                      {a.ends_at   && <span>Ends: {fmtDate(a.ends_at)}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 mt-0.5">
                    <button onClick={() => openEdit(a)}
                      className="text-xs text-blue-600 hover:underline">Edit</button>
                    <button onClick={() => setDeleteTarget(a)}
                      className="text-xs text-red-500 hover:underline">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1 rounded border text-sm disabled:opacity-40">Prev</button>
            <span className="px-3 py-1 text-sm text-gray-600">{page}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-3 py-1 rounded border text-sm disabled:opacity-40">Next</button>
          </div>
        )}
      </div>

      {/* ── Delete confirm ──────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-2">Delete Announcement?</h2>
            <p className="text-sm text-gray-600 mb-4">
              Delete <strong>"{deleteTarget.title}"</strong>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
              <button onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}