import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('users')
    .select(`
      id, email, first_name, last_name, status, created_at,
      admin_profiles!user_id(profile_status, created_at)
    `)
    .ilike('role', 'admin')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
