/**
 * Server-only Supabase client using the service role key.
 * Use ONLY in server code (API routes, server actions) for admin operations
 * that bypass RLS: inviting users, inserting users/instructor_profiles on behalf of others.
 * Never expose this client or the service role key to the browser.
 */
import { createClient } from '@supabase/supabase-js';

function getAdminEnv(): { url: string; serviceRoleKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    const missing: string[] = [];
    if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    throw new Error(
      `Supabase admin client is not configured. Add ${missing.join(' and ')} to .env.local.`
    );
  }
  return { url, serviceRoleKey };
}

export function createAdminClient() {
  const { url, serviceRoleKey } = getAdminEnv();
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
