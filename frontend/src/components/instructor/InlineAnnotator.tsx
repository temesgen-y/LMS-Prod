'use client';

import { useRef, useState, useCallback } from 'react';

export type Annotation = {
  id: string;
  start: number;
  end: number;
  comment: string;
  createdAt: string;
};

type Segment =
  | { type: 'plain'; text: string }
  | { type: 'annotated'; text: string; ann: Annotation };

function buildSegments(text: string, annotations: Annotation[]): Segment[] {
  const sorted = [...annotations].sort((a, b) => a.start - b.start);
  const segs: Segment[] = [];
  let pos = 0;
  for (const ann of sorted) {
    const s = Math.max(ann.start, pos);
    const e = Math.min(ann.end, text.length);
    if (s >= e) continue;
    if (s > pos) segs.push({ type: 'plain', text: text.slice(pos, s) });
    segs.push({ type: 'annotated', text: text.slice(s, e), ann });
    pos = e;
  }
  if (pos < text.length) segs.push({ type: 'plain', text: text.slice(pos) });
  return segs;
}

function getCharOffset(container: HTMLElement, node: Node, offset: number): number {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let cur = walker.nextNode();
  while (cur) {
    if (cur === node) return pos + offset;
    pos += cur.textContent?.length ?? 0;
    cur = walker.nextNode();
  }
  return pos + offset;
}

type Props = {
  text: string;
  annotations: Annotation[];
  readOnly?: boolean;
  onChange?: (annotations: Annotation[]) => void;
};

export function InlineAnnotator({ text, annotations, readOnly = false, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<{ start: number; end: number; x: number; y: number } | null>(null);
  const [draft, setDraft] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);

  const handleMouseUp = useCallback(() => {
    if (readOnly) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) return;
    const range = sel.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) return;

    const start = getCharOffset(containerRef.current, range.startContainer, range.startOffset);
    const end = getCharOffset(containerRef.current, range.endContainer, range.endOffset);
    if (start >= end) return;

    const rect = range.getBoundingClientRect();
    const cRect = containerRef.current.getBoundingClientRect();
    setPending({
      start, end,
      x: Math.max(0, Math.min(rect.left - cRect.left + rect.width / 2, (containerRef.current.offsetWidth ?? 256) - 128)),
      y: rect.bottom - cRect.top + 6,
    });
    setDraft('');
    sel.removeAllRanges();
  }, [readOnly]);

  const addComment = useCallback(() => {
    if (!pending || !draft.trim()) return;
    const ann: Annotation = {
      id: crypto.randomUUID(),
      start: pending.start,
      end: pending.end,
      comment: draft.trim(),
      createdAt: new Date().toISOString(),
    };
    onChange?.([...annotations, ann]);
    setPending(null);
    setDraft('');
  }, [pending, draft, annotations, onChange]);

  const remove = useCallback((id: string) => {
    onChange?.(annotations.filter(a => a.id !== id));
  }, [annotations, onChange]);

  const segments = buildSegments(text, annotations);

  return (
    <div className="relative">
      {!readOnly && (
        <p className="text-[10px] text-gray-400 mb-1.5 select-none">
          Select text to add an inline comment
        </p>
      )}

      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed p-4 bg-white border border-gray-200 rounded-lg max-h-80 overflow-y-auto select-text cursor-text"
      >
        {segments.map((seg, i) => {
          if (seg.type === 'plain') return <span key={i}>{seg.text}</span>;
          const idx = annotations.findIndex(a => a.id === seg.ann.id);
          const isHov = hovered === seg.ann.id;
          return (
            <mark
              key={i}
              className={`rounded px-0.5 transition-colors cursor-pointer not-italic ${isHov ? 'bg-yellow-300' : 'bg-yellow-100'}`}
              onMouseEnter={() => setHovered(seg.ann.id)}
              onMouseLeave={() => setHovered(null)}
              title={seg.ann.comment}
            >
              {seg.text}
              <sup className="ml-0.5 text-[9px] font-bold text-amber-600">{idx + 1}</sup>
            </mark>
          );
        })}
      </div>

      {/* Floating comment input */}
      {pending && (
        <div
          className="absolute z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-60"
          style={{ left: pending.x - 120, top: pending.y }}
        >
          <p className="text-xs font-semibold text-gray-600 mb-2">Add comment</p>
          <textarea
            autoFocus
            rows={2}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Your comment…"
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); }
              if (e.key === 'Escape') setPending(null);
            }}
          />
          <div className="flex justify-end gap-1.5 mt-2">
            <button onClick={() => setPending(null)} className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">
              Cancel
            </button>
            <button
              onClick={addComment}
              disabled={!draft.trim()}
              className="px-2 py-1 text-xs font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Annotation list */}
      {annotations.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
            Inline Comments ({annotations.length})
          </p>
          {annotations.map((ann, i) => (
            <div
              key={ann.id}
              className={`flex items-start gap-2 p-2.5 rounded-lg border text-xs transition-colors ${
                hovered === ann.id ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-100'
              }`}
              onMouseEnter={() => setHovered(ann.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="font-bold text-amber-600 bg-amber-100 rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px]">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-gray-400 italic truncate mb-0.5">
                  "{text.slice(ann.start, Math.min(ann.end, ann.start + 60))}{ann.end - ann.start > 60 ? '…' : ''}"
                </p>
                <p className="text-gray-700">{ann.comment}</p>
              </div>
              {!readOnly && (
                <button
                  onClick={() => remove(ann.id)}
                  className="text-gray-300 hover:text-red-400 flex-shrink-0 mt-0.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
