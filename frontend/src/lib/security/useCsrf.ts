'use client';

/**
 * useCsrf — client hook that reads the CSRF token from the __csrf cookie
 * and returns a helper to add it to fetch calls.
 *
 * Usage:
 *   const { csrfHeaders } = useCsrf();
 *   fetch('/api/some-mutation', { method: 'POST', headers: { ...csrfHeaders, 'Content-Type': 'application/json' }, body: ... });
 */

import { useCallback } from 'react';

function readCsrfCookie(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function useCsrf() {
  const getCsrfToken = useCallback((): string => readCsrfCookie(), []);

  const csrfHeaders = { 'x-csrf-token': readCsrfCookie() };

  return { getCsrfToken, csrfHeaders };
}
