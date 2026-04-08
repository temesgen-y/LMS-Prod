'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface CreateThreadModalProps {
  offeringId: string;
  userId: string;
  onCreated: () => void;
  onClose: () => void;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function weekLaterStr() {
  const d = new Date();
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

// ─── Toolbar button ────────────────────────────────────────────────────────────

function ToolBtn({
  title, onClick, children, active,
}: { title: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
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
  return url;
}

// ─── Insert Media modal ────────────────────────────────────────────────────────

function InsertMediaModal({
  onClose, onInsert,
}: { onClose: () => void; onInsert: (url: string, desc: string, w: string, h: string) => void }) {
  const [url, setUrl] = useState('');
  const [desc, setDesc] = useState('');
  const [w, setW] = useState('');
  const [h, setH] = useState('');
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Media URL <span className="text-red-500">*</span></label>
            <input type="url" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-gray-500 mt-1">Supports YouTube, Vimeo, Loom, and other video platforms.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
            <input type="text" value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Describe the video content or purpose"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Width (px)</label>
              <input type="number" value={w} onChange={e => setW(e.target.value)} placeholder="560"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Height (px)</label>
              <input type="number" value={h} onChange={e => setH(e.target.value)} placeholder="315"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose}
            className="px-5 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={() => { if (!url.trim()) { alert('URL required'); return; } if (!desc.trim()) { alert('Description required'); return; } onInsert(url.trim(), desc.trim(), w.trim(), h.trim()); }}
            className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">Insert Media</button>
        </div>
      </div>
    </div>
  );
}

// ─── Insert Image modal ────────────────────────────────────────────────────────

function InsertImageModal({
  onClose, onInsert,
}: { onClose: () => void; onInsert: (url: string, alt: string, w: string) => void }) {
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [w, setW] = useState('');
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Image URL <span className="text-red-500">*</span></label>
            <input type="url" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Alt text</label>
            <input type="text" value={alt} onChange={e => setAlt(e.target.value)}
              placeholder="Describe the image for screen readers"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Width (px, optional)</label>
            <input type="number" value={w} onChange={e => setW(e.target.value)} placeholder="400"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose}
            className="px-5 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={() => { if (!url.trim()) { alert('Image URL required'); return; } onInsert(url.trim(), alt.trim(), w.trim()); }}
            className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">Insert Image</button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Link modal ────────────────────────────────────────────────────────────

function AddLinkModal({
  onClose, onInsert,
}: { onClose: () => void; onInsert: (url: string, text: string) => void }) {
  const [url, setUrl] = useState('https://');
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
            <label className="block text-xs font-medium text-gray-700 mb-1">Link text (optional)</label>
            <input type="text" value={text} onChange={e => setText(e.target.value)} placeholder="Click here"
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

// ─── Rich Text Editor ─────────────────────────────────────────────────────────

function RichEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editorRef  = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const linkBtnRef = useRef<HTMLDivElement>(null);

  const [wordCount,      setWordCount]      = useState(0);
  const [initialized,    setInitialized]    = useState(false);
  const [showLinkDrop,   setShowLinkDrop]   = useState(false);
  const [showLinkModal,  setShowLinkModal]  = useState(false);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);

  useEffect(() => {
    if (editorRef.current && !initialized) {
      editorRef.current.innerHTML = value;
      setInitialized(true);
    }
  }, [value, initialized]);

  useEffect(() => {
    if (editorRef.current && value === '') {
      editorRef.current.innerHTML = '';
      setWordCount(0);
      setInitialized(false);
    }
  }, [value]);

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

  const handleInsertMedia = (url: string, desc: string, w: string, h: string) => {
    const embedUrl = toEmbedUrl(url);
    const width  = w || '560';
    const height = h || '315';
    const html = `<div style="margin:8px 0">
      <iframe src="${embedUrl}" width="${width}" height="${height}" frameborder="0" allowfullscreen title="${desc}" style="max-width:100%;display:block;"></iframe>
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
      document.execCommand('insertHTML', false, `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
    } else {
      document.execCommand('createLink', false, url);
      editorRef.current?.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
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
          <ToolBtn title="Fullscreen" onClick={() => {}}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
            </svg>
          </ToolBtn>

          <ToolBtn title="Undo (Ctrl+Z)" onClick={() => exec('undo')}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 7h10a5 5 0 010 10H7"/><path strokeLinecap="round" strokeLinejoin="round" d="M3 7l4-4M3 7l4 4"/></svg>
          </ToolBtn>
          <ToolBtn title="Redo (Ctrl+Y)" onClick={() => exec('redo')}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 7H11a5 5 0 000 10h6"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 7l-4-4M21 7l-4 4"/></svg>
          </ToolBtn>

          <span className="w-px h-4 bg-gray-300 mx-0.5" />

          <ToolBtn title="Bold (Ctrl+B)" onClick={() => exec('bold')}><strong className="text-xs font-bold">B</strong></ToolBtn>
          <ToolBtn title="Italic (Ctrl+I)" onClick={() => exec('italic')}><em className="text-xs italic font-serif">I</em></ToolBtn>
          <ToolBtn title="Underline (Ctrl+U)" onClick={() => exec('underline')}><u className="text-xs">U</u></ToolBtn>
          <ToolBtn title="Strikethrough" onClick={() => exec('strikeThrough')}><s className="text-xs">S</s></ToolBtn>

          <span className="w-px h-4 bg-gray-300 mx-0.5" />

          <ToolBtn title="Align left" onClick={() => exec('justifyLeft')}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
          </ToolBtn>
          <ToolBtn title="Numbered list" onClick={() => exec('insertOrderedList')}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
          </ToolBtn>
          <ToolBtn title="Bullet list" onClick={() => exec('insertUnorderedList')}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>
          </ToolBtn>

          <span className="w-px h-4 bg-gray-300 mx-0.5" />

          <ToolBtn title="Insert Image" onClick={() => { saveSelection(); setShowImageModal(true); }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </ToolBtn>

          <ToolBtn title="Insert Media / Video" onClick={() => { saveSelection(); setShowMediaModal(true); }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </ToolBtn>

          <div className="relative" ref={linkBtnRef}>
            <button
              type="button"
              title="Link"
              onMouseDown={e => { e.preventDefault(); setShowLinkDrop(v => !v); }}
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
                <button type="button"
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onMouseDown={e => { e.preventDefault(); saveSelection(); setShowLinkDrop(false); setShowLinkModal(true); }}>
                  <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                  </svg>
                  Add Link
                </button>
                <button type="button"
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
                  onMouseDown={e => { e.preventDefault(); exec('unlink'); setShowLinkDrop(false); }}>
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

          <ToolBtn title="Blockquote" onClick={() => exec('formatBlock', 'blockquote')}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zm12 0c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>
          </ToolBtn>
          <ToolBtn title="Code block" onClick={() => exec('formatBlock', 'pre')}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          </ToolBtn>
          <ToolBtn title="Remove formatting" onClick={() => exec('removeFormat')}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 3h12l4 6-10 13L2 9z"/><line x1="3" y1="21" x2="21" y2="3"/></svg>
          </ToolBtn>
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
      {showLinkModal  && <AddLinkModal    onClose={() => setShowLinkModal(false)}  onInsert={handleInsertLink}  />}
    </>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function CreateThreadModal({
  offeringId, userId, onCreated, onClose,
}: CreateThreadModalProps) {
  const [title,       setTitle]       = useState('');
  const [startDate,   setStartDate]   = useState(todayStr());
  const [endDate,     setEndDate]     = useState(weekLaterStr());
  const [description, setDescription] = useState('');
  const [isPinned,    setIsPinned]    = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle)       { toast.error('Discussion name is required.'); return; }
    if (!startDate)          { toast.error('Start date is required.'); return; }
    if (!endDate)            { toast.error('End date is required.'); return; }
    if (endDate < startDate) { toast.error('End date must be after start date.'); return; }

    setSubmitting(true);
    try {
      const supabase = createClient();

      const { data: threadData, error: threadError } = await supabase
        .from('forum_threads')
        .insert({
          offering_id: offeringId,
          author_id:   userId,
          title:       trimmedTitle,
          is_pinned:   isPinned,
          is_locked:   false,
          reply_count: 0,
          last_reply_at: null,
          start_date:  startDate,
          end_date:    endDate,
        })
        .select('id')
        .single();

      if (threadError) throw threadError;
      const threadId = (threadData as any).id as string;

      const desc = description.trim();
      if (desc) {
        const { error: postError } = await supabase.from('forum_posts').insert({
          thread_id: threadId,
          parent_id: null,
          author_id: userId,
          body:      desc,
          is_answer: false,
          upvotes:   0,
        });
        if (postError) throw postError;
      }

      // Upload attachments if any
      for (const file of attachments) {
        const path = `forum/${threadId}/${Date.now()}_${file.name}`;
        const { data: storageData, error: storageError } = await supabase.storage
          .from('lms-uploads')
          .upload(path, file);
        if (storageError) { console.error('Attachment upload error:', storageError); continue; }
        const { data: { publicUrl } } = supabase.storage.from('lms-uploads').getPublicUrl(path);
        await supabase.from('attachments').insert({
          uploader_id: userId,
          file_name:   file.name,
          file_size:   file.size,
          mime_type:   file.type,
          url:         publicUrl,
        });
      }

      toast.success('Discussion published successfully.');
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to publish discussion.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) setAttachments(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900">Add Discussion</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none" aria-label="Close">✕</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 pb-2">

          {/* Subtitle */}
          <p className="text-sm text-amber-600 mb-5 leading-relaxed">
            Create your own discussion for this course by filling out the form below.{' '}
            <span className="text-blue-600">This discussion</span> will only count for participation points.
          </p>

          {/* Discussion Name */}
          <div className="mb-5">
            <label className="block text-xs text-gray-500 mb-1">
              Discussion Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Enter Discussion Name"
              value={title}
              onChange={e => setTitle(e.target.value)}
              disabled={submitting}
              className="w-full border-0 border-b border-gray-400 focus:border-blue-500 focus:outline-none pb-1 text-sm text-gray-900 bg-transparent placeholder-gray-400"
              maxLength={200}
            />
          </div>

          {/* Start Date + End Date */}
          <div className="flex gap-6 mb-5">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Start Date <span className="text-red-500">*</span></label>
              <div className="flex items-center gap-2 border-b border-gray-400 pb-1">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={submitting}
                  className="flex-1 text-sm text-gray-900 bg-transparent border-0 focus:outline-none" />
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">End Date <span className="text-red-500">*</span></label>
              <div className="flex items-center gap-2 border-b border-gray-400 pb-1">
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} disabled={submitting}
                  className="flex-1 text-sm text-gray-900 bg-transparent border-0 focus:outline-none" />
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <RichEditor value={description} onChange={setDescription} />
          </div>

          {/* Add Attachment */}
          <div className="mb-4">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Attachment
            </button>

            {attachments.length > 0 && (
              <ul className="mt-2 space-y-1">
                {attachments.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span className="truncate max-w-[240px]">{f.name}</span>
                    <span className="text-gray-400">({(f.size / 1024).toFixed(1)} KB)</span>
                    <button type="button" onClick={() => removeAttachment(i)} className="text-red-400 hover:text-red-600 ml-1">✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Pin this discussion */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none mb-2">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={e => setIsPinned(e.target.checked)}
              disabled={submitting}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">📌 Pin this discussion to top</span>
          </label>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-4 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button type="button" onClick={onClose} disabled={submitting}
            className="text-sm font-semibold text-gray-500 hover:text-gray-700 uppercase tracking-wide transition-colors">
            CANCEL
          </button>
          <button type="button" onClick={handleSubmit} disabled={submitting || !title.trim()}
            className="px-6 py-2 text-sm font-bold bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50 uppercase tracking-wide transition-colors">
            {submitting ? 'Publishing…' : 'PUBLISH'}
          </button>
        </div>

      </div>
    </div>
  );
}
