import { supabaseAdmin } from '../lib/supabase';
import { createError } from '../middleware/errorHandler';
import type { StaffRole } from '../types';

const ALLOWED_ROLES: StaffRole[] = ['registrar', 'department_head', 'academic_advisor', 'it_admin'];

export const createStaffUser = async (
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: string,
  staffNo: string | null,
  department: string | null,
  specialization: string | null,
  accessLevel: string | null,
  createdBy: string,
): Promise<{ userId: string }> => {
  if (!ALLOWED_ROLES.includes(role as StaffRole)) {
    throw createError('Invalid staff role', 400, 'INVALID_ROLE');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw createError('Invalid email address', 400, 'INVALID_EMAIL');
  }

  // Create auth user
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password,
    email_confirm: true,
  });

  if (authErr) {
    const msg = authErr.message ?? '';
    if (msg.toLowerCase().includes('already') || (authErr as { status?: number }).status === 422) {
      throw createError('An account with this email already exists.', 409, 'DUPLICATE_EMAIL');
    }
    throw createError(msg || 'Failed to create auth user.', 400);
  }

  const newAuthUserId = authData.user!.id;

  // Create public.users row
  const { data: newUser, error: userErr } = await supabaseAdmin
    .from('users')
    .insert({
      auth_user_id: newAuthUserId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.toLowerCase().trim(),
      role,
    })
    .select('id')
    .single();

  if (userErr || !newUser) {
    await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
    const isDuplicate = (userErr as { code?: string })?.code === '23505';
    if (isDuplicate) {
      throw createError('An account with this email already exists.', 409, 'DUPLICATE_EMAIL');
    }
    throw createError(userErr?.message || 'Failed to create user record.', 500);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (newUser as any).id as string;

  // Create role-specific profile
  let profileError: { message: string } | null = null;

  if (role === 'registrar') {
    const { error } = await supabaseAdmin.from('registrar_profiles').insert({
      user_id: userId,
      staff_no: staffNo?.trim() || null,
      department: department?.trim() || null,
      profile_status: 'active',
      created_by: createdBy,
    });
    profileError = error;
  } else if (role === 'department_head') {
    const { error } = await supabaseAdmin.from('department_head_profiles').insert({
      user_id: userId,
      staff_no: staffNo?.trim() || null,
      department_id: department || null,
      profile_status: 'active',
      created_by: createdBy,
    });
    profileError = error;
  } else if (role === 'academic_advisor') {
    const { error } = await supabaseAdmin.from('academic_advisor_profiles').insert({
      user_id: userId,
      staff_no: staffNo?.trim() || null,
      specialization: specialization?.trim() || null,
      profile_status: 'active',
      created_by: createdBy,
    });
    profileError = error;
  } else if (role === 'it_admin') {
    const { error } = await supabaseAdmin.from('it_admin_profiles').insert({
      user_id: userId,
      staff_no: staffNo?.trim() || null,
      access_level: accessLevel ?? 'standard',
      profile_status: 'active',
      created_by: createdBy,
    });
    profileError = error;
  }

  if (profileError) {
    throw createError(profileError.message || 'Failed to create staff profile.', 500);
  }

  return { userId };
};
