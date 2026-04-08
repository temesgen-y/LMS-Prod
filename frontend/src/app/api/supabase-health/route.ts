import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/supabase-health
 * Returns whether the app can reach Supabase (auth + config).
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !hasKey) {
    return NextResponse.json(
      {
        connected: false,
        error: 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
      },
      { status: 503 }
    );
  }

  try {
    // Call Supabase Auth (no tables required); if this succeeds, we're connected.
    const { error } = await supabase.auth.getSession();
    if (error) {
      return NextResponse.json(
        {
          connected: false,
          error: error.message,
          hint: 'Check your Supabase URL and anon key in .env.local',
        },
        { status: 503 }
      );
    }

    const baseUrl = url.replace(/\/$/, '');
    // Extract project ref (e.g. "timgnlruhrwjjxqsfnqs") from https://REF.supabase.co
    const projectRef = baseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null;

    return NextResponse.json({
      connected: true,
      message: 'Supabase is reachable.',
      account: {
        url: baseUrl,
        projectRef,
        dashboardUrl: projectRef
          ? `https://supabase.com/dashboard/project/${projectRef}`
          : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      {
        connected: false,
        error: message,
        hint: 'Network issue or invalid Supabase URL.',
      },
      { status: 503 }
    );
  }
}
