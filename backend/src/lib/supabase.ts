import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazily initialized to ensure dotenv has loaded before reading env vars.
let _supabaseAdmin: SupabaseClient | null = null;
let _supabaseAnon: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
  if (!_supabaseAdmin) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        'Missing Supabase environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
      );
    }
    // Admin client — bypasses RLS. NEVER expose to frontend.
    _supabaseAdmin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _supabaseAdmin;
}

function getAnonClient(): SupabaseClient {
  if (!_supabaseAnon) {
    const url = process.env.SUPABASE_URL!;
    const anonKey = process.env.SUPABASE_ANON_KEY!;
    // Anon client — used for verifying user JWTs.
    _supabaseAnon = createClient(url, anonKey);
  }
  return _supabaseAnon;
}

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getAdminClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const supabaseAnon: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getAnonClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
