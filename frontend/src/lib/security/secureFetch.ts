'use client';

/**
 * secureFetch — drop-in replacement for fetch() that automatically attaches
 * the CSRF token from the __csrf cookie to every state-changing request.
 *
 * Usage (replaces raw `fetch` calls in client components / pages):
 *   import { secureFetch } from '@/lib/security/secureFetch';
 *   const res = await secureFetch('/api/admin/instructors/invite', { method: 'POST', ... });
 *
 * Safe methods (GET, HEAD, OPTIONS) pass through unchanged.
 */

function readCsrfCookie(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export async function secureFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);

  if (!isMutation) return fetch(input, init);

  const token = readCsrfCookie();
  const headers = new Headers(init?.headers);
  if (token) headers.set('x-csrf-token', token);

  return fetch(input, { ...init, headers });
}
