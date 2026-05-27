import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users').select('role').eq('auth_user_id', user.id).single();
  if (!profile || !['admin', 'it_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const apiKey  = process.env.TURNITIN_API_KEY;
  const baseUrl = process.env.TURNITIN_BASE_URL;

  if (!apiKey || !baseUrl) {
    return NextResponse.json({ configured: false });
  }

  try {
    const res = await fetch(`${baseUrl}/api/v1/features-enabled`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Turnitin-Integration-Name': process.env.TURNITIN_INTEGRATION_NAME ?? 'MuleLMS',
        'X-Turnitin-Integration-Version': '1.0',
      },
      signal: AbortSignal.timeout(5000),
    });
    return NextResponse.json({ configured: true, reachable: res.ok, status: res.status });
  } catch {
    return NextResponse.json({ configured: true, reachable: false });
  }
}
