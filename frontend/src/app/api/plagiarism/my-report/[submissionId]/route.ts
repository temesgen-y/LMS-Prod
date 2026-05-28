import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const { submissionId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('users')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Students can only see their own submission's report
  if (profile.role === 'student') {
    const { data: sub } = await admin
      .from('assignment_submissions')
      .select('student_id')
      .eq('id', submissionId)
      .single();
    if (!sub || sub.student_id !== profile.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (!['instructor', 'admin', 'department_head'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: reports, error } = await admin
    .from('plagiarism_reports')
    .select('id, status, similarity_pct, provider, provider_report_url, error_message, completed_at, requested_at')
    .eq('submission_id', submissionId)
    .order('requested_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: reports ?? [] });
}
