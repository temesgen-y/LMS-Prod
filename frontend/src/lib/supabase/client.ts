import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnv } from './env';

// Module-level singleton — avoids multiple browser clients competing for
// the same Supabase session Web Lock ("Lock broken by another request
// with the 'steal' option").
let _client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (_client) return _client;
  const { url, anonKey } = getSupabaseEnv();
  _client = createBrowserClient(url, anonKey);
  return _client;
}
