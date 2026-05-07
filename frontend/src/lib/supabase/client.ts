import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnv } from './env';

// Supabase uses the Web Locks API so only one tab manages the auth session at
// a time. When a new tab opens it steals the lock from the previous tab; the
// previous tab receives an unhandled AbortError rejection. This is expected
// behaviour, but Next.js dev mode surfaces it as "1 Issue". Suppress it here.
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    if (event.reason instanceof Error && event.reason.name === 'AbortError') {
      event.preventDefault();
    }
  });
}

// Persist the singleton on globalThis so it survives Next.js HMR module
// reloads in development. Without this, each hot-reload resets the
// module-level variable to null, creates a new createBrowserClient()
// instance, which steals the Supabase session Web Lock from the previous
// instance → "Lock broken by another request with the 'steal' option".
declare global {
  // eslint-disable-next-line no-var
  var _supabaseBrowserClient: ReturnType<typeof createBrowserClient> | undefined;
}

export function createClient() {
  if (globalThis._supabaseBrowserClient) return globalThis._supabaseBrowserClient;
  const { url, anonKey } = getSupabaseEnv();
  globalThis._supabaseBrowserClient = createBrowserClient(url, anonKey);
  return globalThis._supabaseBrowserClient;
}
