import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('users').select('role').eq('auth_user_id', user.id).single();
  if ((me as any)?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { userId } = body as { userId?: string };
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const { data: target } = await admin.from('users').select('email').eq('id', userId).single();
  if (!(target as any)?.email) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: (target as any).email,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ resetLink: (data as any)?.properties?.action_link ?? null });
}
