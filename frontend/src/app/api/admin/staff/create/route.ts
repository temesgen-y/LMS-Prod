import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRoleNames } from '@/lib/auth/get-user-roles';
import { getHighestRole, type RoleName } from '@/types/auth';

const ALLOWED_ROLES = ['registrar', 'department_head', 'academic_advisor', 'it_admin'] as const;
type StaffRole = typeof ALLOWED_ROLES[number];

/**
 * POST /api/admin/staff/create
 * Admin-only. Creates a staff user (auth + public.users + role-specific profile) with a provided password.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser }, error: sessionError } = await supabase.auth.getUser();

    if (sessionError || !authUser) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const roleNames = await getUserRoleNames(supabase, authUser.id);
    const highestRole = getHighestRole(roleNames as RoleName[]);
    if (highestRole !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
    }

    const { data: appUser } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', authUser.id)
      .single();
    const adminUserId = (appUser as { id: string } | null)?.id ?? null;

    const body = await request.json();
    const { email, password, first_name, last_name, role, staff_no, department, specialization, access_level } = body;

    if (!email || !password || !first_name || !last_name || !role) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }
    if (!ALLOWED_ROLES.includes(role as StaffRole)) {
      return NextResponse.json({ error: 'Invalid staff role.' }, { status: 400 });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Step 1: create auth user with password
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
    });
    if (authErr) {
      const msg = authErr.message ?? '';
      if (msg.toLowerCase().includes('already') || (authErr as any).status === 422) {
        return NextResponse.json(
          { error: 'An account with this email already exists.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: msg || 'Failed to create auth user.' }, { status: 400 });
    }

    const newAuthUserId = authData.user!.id;

    // Step 2: create public.users row
    const { data: newUser, error: userErr } = await admin
      .from('users')
      .insert({
        auth_user_id: newAuthUserId,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: email.toLowerCase().trim(),
        role,
      })
      .select('id')
      .single();

    if (userErr || !newUser) {
      await admin.auth.admin.deleteUser(newAuthUserId);
      const isDuplicateEmail = userErr?.code === '23505';
      if (isDuplicateEmail) {
        return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
      }
      return NextResponse.json({ error: userErr?.message || 'Failed to create user record.' }, { status: 500 });
    }

    const userId = (newUser as { id: string }).id;

    // Step 3: create role-specific profile
    let profileError: { message: string } | null = null;

    if (role === 'registrar') {
      const { error } = await admin.from('registrar_profiles').insert({
        user_id: userId,
        staff_no: staff_no?.trim() || null,
        department: department?.trim() || null,
        profile_status: 'active',
        created_by: adminUserId,
      });
      profileError = error;
    } else if (role === 'department_head') {
      const { error } = await admin.from('department_head_profiles').insert({
        user_id: userId,
        staff_no: staff_no?.trim() || null,
        department_id: department || null,
        profile_status: 'active',
        created_by: adminUserId,
      });
      profileError = error;
    } else if (role === 'academic_advisor') {
      const { error } = await admin.from('academic_advisor_profiles').insert({
        user_id: userId,
        staff_no: staff_no?.trim() || null,
        specialization: specialization?.trim() || null,
        profile_status: 'active',
        created_by: adminUserId,
      });
      profileError = error;
    } else if (role === 'it_admin') {
      const { error } = await admin.from('it_admin_profiles').insert({
        user_id: userId,
        staff_no: staff_no?.trim() || null,
        access_level: access_level ?? 'standard',
        profile_status: 'active',
        created_by: adminUserId,
      });
      profileError = error;
    }

    if (profileError) {
      return NextResponse.json({ error: profileError.message || 'Failed to create staff profile.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, user_id: userId, message: `${role} account created successfully.` });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
