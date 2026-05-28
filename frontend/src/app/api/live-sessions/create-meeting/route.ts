import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import crypto from 'crypto';

async function getZoomAccessToken(): Promise<string> {
  const accountId  = process.env.ZOOM_ACCOUNT_ID!;
  const clientId   = process.env.ZOOM_CLIENT_ID!;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET!;
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) throw new Error(`Zoom token error: ${res.status}`);
  const data = await res.json();
  return data.access_token as string;
}

async function createZoomMeeting(topic: string, startTime: string, durationMins: number) {
  const token = await getZoomAccessToken();
  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, type: 2, start_time: startTime, duration: durationMins, timezone: 'UTC', settings: { join_before_host: true, waiting_room: false } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Zoom meeting creation failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return { join_url: data.join_url as string, meeting_id: String(data.id), passcode: (data.password ?? '') as string, raw: data };
}

function makeGoogleJwt(serviceEmail: string, privateKey: string, scope: string, impersonate?: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claims: Record<string, unknown> = {
    iss: serviceEmail,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  // Domain-wide delegation: impersonate a real Google Workspace user
  if (impersonate) claims.sub = impersonate;
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sigInput = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(sigInput);
  const sig = sign.sign(privateKey.replace(/\\n/g, '\n'), 'base64url');
  return `${sigInput}.${sig}`;
}

async function getGoogleAccessToken(serviceEmail: string, privateKey: string, impersonate?: string): Promise<string> {
  const jwt = makeGoogleJwt(serviceEmail, privateKey, 'https://www.googleapis.com/auth/meetings.space.created', impersonate);
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Google token error: ${res.status}`);
  const data = await res.json();
  return data.access_token as string;
}

async function createGoogleMeetSpace(serviceEmail: string, privateKey: string, impersonate?: string) {
  if (!impersonate) {
    throw new Error(
      'Google Meet requires domain-wide delegation. Set GOOGLE_IMPERSONATE_EMAIL in your environment variables to a Google Workspace user email (e.g. your admin email). ' +
      'Then enable domain-wide delegation for your service account in Google Admin Console → Security → API Controls → Domain-wide Delegation.'
    );
  }
  const token = await getGoogleAccessToken(serviceEmail, privateKey, impersonate);
  const res = await fetch('https://meet.googleapis.com/v2/spaces', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Meet space creation failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return { join_url: data.meetingUri as string, meeting_id: (data.name ?? '') as string, passcode: '', raw: data };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('users').select('role').eq('auth_user_id', user.id).single();
  if (!profile || !['instructor', 'admin', 'department_head'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden — role: ' + (profile?.role ?? 'not found') }, { status: 403 });
  }

  const { platform, title, scheduledAt, durationMins } = await req.json() as {
    platform: string; title: string; scheduledAt: string; durationMins: number;
  };

  if (!platform || !title || !scheduledAt || !durationMins) {
    return NextResponse.json({ error: 'platform, title, scheduledAt, and durationMins are required' }, { status: 400 });
  }

  try {
    if (platform === 'zoom') {
      const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;
      if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) {
        return NextResponse.json({ error: 'Zoom credentials are not configured on the server (ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET).' }, { status: 503 });
      }
      const result = await createZoomMeeting(title, new Date(scheduledAt).toISOString(), durationMins);
      return NextResponse.json({ join_url: result.join_url, meeting_id: result.meeting_id, passcode: result.passcode, provider_data: result.raw });
    }

    if (platform === 'google_meet') {
      const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      const privateKey   = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
      const impersonate  = process.env.GOOGLE_IMPERSONATE_EMAIL;
      if (!serviceEmail || !privateKey) {
        return NextResponse.json({ error: 'Google Meet service account credentials are not configured on the server (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).' }, { status: 503 });
      }
      const result = await createGoogleMeetSpace(serviceEmail, privateKey, impersonate);
      return NextResponse.json({ join_url: result.join_url, meeting_id: result.meeting_id, passcode: '', provider_data: result.raw });
    }

    return NextResponse.json({ error: `Auto-generation is not supported for platform "${platform}". Use Zoom or Google Meet.` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
