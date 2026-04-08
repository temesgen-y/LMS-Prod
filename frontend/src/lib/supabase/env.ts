/**
 * Validates Supabase env vars. Use in client, server, and middleware to fail fast with a clear error.
 */
export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    const missing: string[] = [];
    if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    throw new Error(
      `Supabase is not configured. Add ${missing.join(' and ')} to .env.local (see .env.local.example).`
    );
  }
  return { url, anonKey };
}
