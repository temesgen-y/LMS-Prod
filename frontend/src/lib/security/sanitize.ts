/**
 * sanitize.ts — XSS prevention via HTML sanitization
 *
 * Uses isomorphic-dompurify which works in both Node.js (server) and browsers.
 *
 * Usage:
 *   import { sanitizeHtml, sanitizeText, sanitizeRichText } from '@/lib/security/sanitize';
 *
 *   // Strip ALL HTML (for plain text fields: names, titles, etc.)
 *   const safeName = sanitizeText(userInput);
 *
 *   // Allow safe rich-text HTML subset (for forum posts, announcements, lesson descriptions)
 *   const safeBody = sanitizeRichText(userHtml);
 *
 *   // Strict — only inline formatting, no links, no media (for short descriptions)
 *   const safeDesc = sanitizeInline(userInput);
 */

import DOMPurify from 'isomorphic-dompurify';

// ─── Configuration presets ────────────────────────────────────────────────────

/** Allowed tags for rich-text content (forum posts, announcements, lesson bodies) */
const RICH_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'del', 'ins',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'a', 'span', 'div',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img',
];

const RICH_ALLOWED_ATTRS = [
  'href', 'target', 'rel',   // links
  'src', 'alt', 'width', 'height', // images
  'class', 'id',
  'colspan', 'rowspan',
];

/** Inline-only: formatting without block structure or media */
const INLINE_ALLOWED_TAGS = ['strong', 'em', 'u', 's', 'code', 'span', 'a', 'br'];
const INLINE_ALLOWED_ATTRS = ['href', 'target', 'rel', 'class'];

// ─── Hook: force safe link attributes ─────────────────────────────────────────
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  // Force all links to be safe: noopener, noreferrer, target=_blank
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
    // Block javascript: and data: hrefs
    const href = node.getAttribute('href') ?? '';
    if (/^(javascript:|data:|vbscript:)/i.test(href.trim())) {
      node.removeAttribute('href');
    }
  }
  // Strip on* event handler attributes that DOMPurify may have missed
  if (node instanceof Element) {
    const attrs = Array.from(node.attributes);
    for (const attr of attrs) {
      if (/^on/i.test(attr.name)) {
        node.removeAttribute(attr.name);
      }
    }
  }
});

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Strip ALL HTML tags — for plain text fields (names, emails, codes, slugs).
 * Returns an empty string if input is null/undefined.
 */
export function sanitizeText(input: string | null | undefined): string {
  if (!input) return '';
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/**
 * Sanitize rich-text HTML allowing safe formatting, links, images, and tables.
 * Use for: forum posts, announcements, lesson descriptions, assignment bodies.
 */
export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS:  RICH_ALLOWED_TAGS,
    ALLOWED_ATTR:  RICH_ALLOWED_ATTRS,
    FORCE_BODY:    true,
    RETURN_DOM:    false,
  });
}

/**
 * Sanitize to inline formatting only — for short descriptions, subtitles.
 * No block elements, no images, no tables.
 */
export function sanitizeInline(html: string | null | undefined): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: INLINE_ALLOWED_TAGS,
    ALLOWED_ATTR: INLINE_ALLOWED_ATTRS,
  });
}

/**
 * Escape a value for safe inclusion in a SQL LIKE pattern.
 * Use before passing user input into `.ilike()` calls.
 */
export function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (c) => `\\${c}`);
}

/**
 * Sanitize an object's string values recursively (for JSON request bodies).
 * Only sanitizes leaf-level strings, ignores nested objects/arrays.
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      out[k] = sanitizeText(v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}
