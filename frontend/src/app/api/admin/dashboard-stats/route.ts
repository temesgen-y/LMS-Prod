import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();

  const [
    { count: students },
    { count: instructors },
    { count: admins },
    { count: courses },
    { count: enrActive },
    { count: enrCompleted },
    { count: enrDropped },
    { count: enrFailed },
    { count: certTotal },
    { count: certRevoked },
    { count: apTotal },
    { count: apActive },
    { count: apInactive },
    { data: settingsRow },
  ] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }).ilike('role', 'student'),
    supabase.from('users').select('id', { count: 'exact', head: true }).ilike('role', 'instructor'),
    supabase.from('users').select('id', { count: 'exact', head: true }).ilike('role', 'admin'),
    supabase.from('courses').select('id', { count: 'exact', head: true }),
    supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('status', 'dropped'),
    supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    supabase.from('certificates').select('id', { count: 'exact', head: true }),
    supabase.from('certificates').select('id', { count: 'exact', head: true }).not('revoked_at', 'is', null),
    supabase.from('admin_profiles').select('id', { count: 'exact', head: true }),
    supabase.from('admin_profiles').select('id', { count: 'exact', head: true }).eq('profile_status', 'active'),
    supabase.from('admin_profiles').select('id', { count: 'exact', head: true }).eq('profile_status', 'inactive'),
    supabase.from('institution_settings').select('institution_name').limit(1).single(),
  ]);

  return NextResponse.json({
    students:                students    ?? 0,
    instructors:             instructors ?? 0,
    admins:                  admins      ?? 0,
    courses:                 courses     ?? 0,
    enrollments_active:      enrActive   ?? 0,
    enrollments_completed:   enrCompleted ?? 0,
    enrollments_dropped:     enrDropped  ?? 0,
    enrollments_failed:      enrFailed   ?? 0,
    certificates_total:      certTotal   ?? 0,
    certificates_active:     (certTotal ?? 0) - (certRevoked ?? 0),
    certificates_revoked:    certRevoked ?? 0,
    admin_profiles_total:    apTotal     ?? 0,
    admin_profiles_active:   apActive    ?? 0,
    admin_profiles_inactive: apInactive  ?? 0,
    institution_name:        settingsRow?.institution_name ?? 'MULE LMS',
  });
}
