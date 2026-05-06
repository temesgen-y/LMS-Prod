'use client';

/**
 * Student-only public signup. No role selection; student role is assigned automatically.
 * Flow: Supabase Auth signUp → server action creates/updates users + student_profiles (no trigger or RPC required).
 * Requires "Confirm email" OFF in Supabase and RLS migration so inserts to users/student_profiles are allowed.
 */
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signupSchema, type SignupFormData } from './schema';
import { createClient } from '@/lib/supabase/client';
import { completeStudentSignup } from './actions';
import { toast } from 'sonner';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';
import { validatePasswordPolicy } from '@/lib/security/password';

const SELECT_STYLE =
  'w-full pl-3.5 pr-10 py-2.5 border border-gray-300 rounded-lg text-gray-800 focus:ring-2 focus:ring-[#4c1d95] focus:border-[#4c1d95] bg-white appearance-none cursor-pointer';

export default function SignUpPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [academicPrograms, setAcademicPrograms] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('departments')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }: { data: { id: string; name: string }[] | null }) => {
        if (data) setDepartments(data);
      });
    supabase
      .from('academic_programs')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }: { data: { id: string; name: string }[] | null }) => {
        if (data) setAcademicPrograms(data);
      });
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      program: '',
      degreeLevel: '',
    },
  });

  // Watch fields needed for the strength meter and identifier checks
  const watchedPassword  = watch('password');
  const watchedFirstName = watch('firstName');
  const watchedLastName  = watch('lastName');
  const watchedEmail     = watch('email');

  const onSubmit = async (data: SignupFormData) => {
    setSubmitError('');
    const supabase = createClient();

    const email = data.email.trim().toLowerCase();
    if (!email) {
      setSubmitError('Email is required.');
      return;
    }

    // Full policy check including identifier-in-password detection (needs form values)
    const userInputs = [email, data.firstName.trim(), data.lastName.trim()].filter(Boolean);
    const policyResult = validatePasswordPolicy(data.password, userInputs);
    if (!policyResult.valid) {
      setSubmitError(policyResult.errors[0]);
      return;
    }

    // Build user_metadata: only non-empty values (some Supabase configs 400 on empty metadata)
    const userMetadata: Record<string, string> = {
      first_name: data.firstName.trim(),
      last_name: data.lastName.trim(),
    };
    if (data.program?.trim()) userMetadata.program = data.program.trim();
    if (data.degreeLevel?.trim()) userMetadata.degree_level = data.degreeLevel.trim();

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: data.password,
      options: { data: userMetadata },
    });

    if (signUpError) {
      // Log full error in console to debug 400 / Auth issues
      console.error('Signup error:', signUpError);
      const msg = signUpError.message ?? '';
      const status = (signUpError as { status?: number }).status;
      const isEmailSignupsDisabled = /email signups are disabled/i.test(msg);
      const isRateLimit = /rate limit|too many requests|email rate limit/i.test(msg);
      const isEmailTaken = status === 400 && /already registered|already exists|user already exists/i.test(msg);
      let displayMsg: string;
      if (isEmailSignupsDisabled) {
        displayMsg =
          'Email signups are disabled for this project. In Supabase Dashboard go to Authentication → Providers → Email and turn ON "Enable Email Signup", then try again.';
      } else if (isRateLimit) {
        displayMsg =
          'Signup is temporarily limited. Turn off "Confirm email" in Supabase (Authentication → Email). Wait at least 1 hour, then try again or sign in.';
      } else if (status === 400) {
        displayMsg =
          msg || 'Invalid signup (400). Check: email format, password at least 8 characters, and that this email is not already registered.';
      } else {
        displayMsg = msg || 'Sign up failed. Please try again.';
      }
      if (isEmailTaken) {
        displayMsg = 'This email is already registered. Sign in below or use a different email.';
      }
      setSubmitError(displayMsg);
      toast.error(displayMsg);
      return;
    }

    let session = signUpData.session;
    const password = data.password;

    // If no session, try signing in with email and password (works when "Confirm email" is OFF in Supabase).
    if (!session) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError || !signInData.session) {
        // Supabase often returns "Invalid login credentials" when email confirmation is required
        const msg = signInError?.message?.toLowerCase() ?? '';
        const likelyEmailConfirm = msg.includes('confirm') || msg.includes('invalid login credentials');
        if (likelyEmailConfirm) {
          toast.info('Account created. Check your email to confirm your account, then sign in below.');
        } else {
          toast.success('Account created. Sign in below with your email and password.');
          if (signInError) toast.error(signInError.message);
        }
        router.push('/login');
        router.refresh();
        return;
      }
      session = signInData.session;
    }

    // Create/update users row and student_profiles via server action (no DB trigger or RPC required).
    // Pass session so the server has auth even if cookies aren't set yet (avoids "no data inserted").
    const result = await completeStudentSignup(data.program || '', data.degreeLevel || '', {
      accessToken: session.access_token,
      refreshToken: session.refresh_token ?? undefined,
    });

    if (!result.success) {
      const errMsg = 'error' in result ? result.error : 'Could not complete signup.';
      setSubmitError(errMsg);
      toast.error(errMsg);
      return;
    }

    toast.success('Account created. You’re signed in.');
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <main className="min-h-screen flex flex-col items-center py-10 px-4 bg-[#faf9f7]">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-10 h-10 rounded-lg bg-amber-400 flex items-center justify-center">
          <svg className="w-6 h-6 text-amber-900" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 14l9-5-9-5-9 5 9 5z" />
            <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
          </svg>
        </div>
        <span className="text-xl font-bold text-gray-800 tracking-tight">MULE LMS</span>
      </div>

      <div className="w-full max-w-[440px] rounded-2xl bg-white shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-800 text-center">Create your account</h1>
        <p className="text-gray-500 text-sm text-center mt-1">Join MULE LMS&apos;s learning platform</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          {submitError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
              <span className="flex-shrink-0 mt-0.5" aria-hidden>⚠</span>
              <span>{submitError}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                First Name
              </label>
              <input
                id="firstName"
                type="text"
                {...register('firstName')}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-[#4c1d95] focus:border-[#4c1d95]"
                placeholder="First name"
              />
              {errors.firstName && (
                <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                Last Name
              </label>
              <input
                id="lastName"
                type="text"
                {...register('lastName')}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-[#4c1d95] focus:border-[#4c1d95]"
                placeholder="Last name"
              />
              {errors.lastName && (
                <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              {...register('email')}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-[#4c1d95] focus:border-[#4c1d95]"
              placeholder="you@example.com"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
            )}
          </div>

          <p className="text-sm font-medium text-gray-700 pt-1 border-t border-gray-200 mt-2">
            Account security
          </p>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                {...register('password')}
                className="w-full px-3.5 py-2.5 pr-10 border border-gray-300 rounded-lg text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-[#4c1d95] focus:border-[#4c1d95]"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.058 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
            )}
            {/* Real-time strength meter and policy checklist */}
            <PasswordStrengthMeter
              password={watchedPassword}
              userInputs={[watchedEmail, watchedFirstName, watchedLastName]}
              showBreachCheck
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                {...register('confirmPassword')}
                className="w-full px-3.5 py-2.5 pr-10 border border-gray-300 rounded-lg text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-[#4c1d95] focus:border-[#4c1d95]"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.058 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
            )}
          </div>

          <p className="text-sm font-medium text-gray-700 pt-1 border-t border-gray-200 mt-2">
            Student profile (saved to your account)
          </p>
          <div>
            <label htmlFor="program" className="block text-sm font-medium text-gray-700 mb-1">
              Program
            </label>
            <select
              id="program"
              {...register('program')}
              className={SELECT_STYLE}
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.75rem center',
                backgroundSize: '1.25rem',
              }}
            >
              <option value="">Select your program</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
            {errors.program && (
              <p className="mt-1 text-sm text-red-600">{errors.program.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="degreeLevel" className="block text-sm font-medium text-gray-700 mb-1">
              Degree Level
            </label>
            <select
              id="degreeLevel"
              {...register('degreeLevel')}
              className={SELECT_STYLE}
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.75rem center',
                backgroundSize: '1.25rem',
              }}
            >
              <option value="">Select degree level</option>
              {academicPrograms.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            {errors.degreeLevel && (
              <p className="mt-1 text-sm text-red-600">{errors.degreeLevel.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-lg bg-[#4c1d95] hover:bg-[#5b21b6] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 mt-2"
          >
            {isSubmitting ? (
              'Creating account…'
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Create Account
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-[#4c1d95] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
