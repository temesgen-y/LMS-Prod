'use server';

import { createClient } from '@/lib/supabase/server';

export type CompleteStudentSignupResult =
  | { success: true }
  | { success: false; error: string };

/**
 * After Supabase Auth signUp, this action creates/updates public.users and student_profiles (no roles/user_roles).
 * Flow: upsert users (auth_user_id, email, first_name, last_name, role, status) → upsert student_profiles.
 * Run supabase/migrations/20260302000001_users_and_student_profiles_insert.sql so RLS allows these inserts.
 *
 * Pass accessToken/refreshToken when calling right after signup so the server has the session even if cookies
 * are not yet available (avoids "Not signed in" and ensures inserts succeed).
 */
export async function completeStudentSignup(
  program: string,
  degreeLevel: string,
  options?: { accessToken?: string; refreshToken?: string }
): Promise<CompleteStudentSignupResult> {
  const supabase = await createClient();

  // If tokens are provided (e.g. right after signup), set session so server sees the user
  if (options?.accessToken && options?.refreshToken) {
    const { error: setError } = await supabase.auth.setSession({
      access_token: options.accessToken,
      refresh_token: options.refreshToken,
    });
    if (setError) {
      return { success: false, error: 'Session could not be applied. Please try signing in again.' };
    }
  }

  const {
    data: { user: authUser },
    error: sessionError,
  } = await supabase.auth.getUser();

  if (sessionError || !authUser) {
    return {
      success: false,
      error:
        'Not signed in. Please complete sign up and try again. If you just signed up, try signing in on the login page first, then we can complete your profile.',
    };
  }

  const authUserId = authUser.id;
  const email = authUser.email ?? '';
  const firstName = (authUser.user_metadata?.first_name ?? '').trim();
  const lastName = (authUser.user_metadata?.last_name ?? '').trim();

  // Create a pending users row. student_profiles is only created on admin approval.
  const { error: upsertError } = await supabase
    .from('users')
    .upsert(
      {
        auth_user_id: authUserId,
        email,
        first_name: firstName || null,
        last_name: lastName || null,
        role: 'STUDENT',
        status: 'PENDING',
      },
      { onConflict: 'auth_user_id' }
    );

  if (upsertError) {
    const hint =
      upsertError.code === '42501'
        ? ' Run the RLS migration: supabase/migrations/20260302000001_users_and_student_profiles_insert.sql'
        : upsertError.code === '42P01'
          ? ' Ensure the public.users table exists (run your base schema migrations first).'
          : '';
    return {
      success: false,
      error: (upsertError.message || 'Could not create your user record.') + hint,
    };
  }

  return { success: true };
}
