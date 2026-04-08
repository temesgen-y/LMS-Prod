'use client';

/**
 * /setup-password?token=<UUID>
 *
 * Instructor account activation page.
 * Flow:
 *   1. Extract invite token from URL query params
 *   2. Validate token via GET /api/invite/validate
 *   3. Show password creation form with real-time strength meter
 *   4. On submit: POST /api/invite/set-password → set password via Supabase Admin
 *   5. Auto sign-in with the new credentials → redirect to /instructor/dashboard
 *
 * Security decisions:
 * - Password set server-side via admin client (never exposes service-role key to client)
 * - Token validated both on page-load and on submit (defence in depth)
 * - Personal identifier (email) passed to the strength meter for context-aware checking
 * - Submit button disabled until all policy requirements are met client-side
 */

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';
import { validatePasswordPolicy } from '@/lib/security/password';
import { toast } from 'sonner';

// ─── Sub-components ───────────────────────────────────────────────────────────

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13.875 18.825A10.05 10.058 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  ) : (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

// ─── Page states ─────────────────────────────────────────────────────────────

type PageState =
  | { status: 'loading' }
  | { status: 'invalid'; reason: string }
  | { status: 'ready';   email: string }
  | { status: 'success' };

// ─── Main component ───────────────────────────────────────────────────────────

function SetupPasswordContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get('token') ?? '';

  const [page,            setPage]            = useState<PageState>({ status: 'loading' });
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw,          setShowPw]          = useState(false);
  const [showConfirmPw,   setShowConfirmPw]   = useState(false);
  const [submitting,      setSubmitting]      = useState(false);
  const [submitError,     setSubmitError]     = useState('');

  // ─── Token validation on mount ─────────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setPage({ status: 'invalid', reason: 'No invite token found in the URL. Please use the link from your invitation email.' });
      return;
    }

    fetch(`/api/invite/validate?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data: { valid: boolean; email?: string; reason?: string }) => {
        if (data.valid && data.email) {
          setPage({ status: 'ready', email: data.email });
        } else {
          const msgs: Record<string, string> = {
            expired:       'This invite link has expired. Please ask an administrator to send a new invitation.',
            used:          'This invite link has already been used. If you need to reset your password, sign in and use "Forgot password".',
            not_found:     'This invite link is invalid or no longer exists.',
            rate_limited:  'Too many validation attempts. Please wait a moment and try again.',
            table_missing: 'The invite system is not yet configured. Please ask an administrator to run the database migration (20260322000001_instructor_invites.sql) in Supabase.',
          };
          setPage({
            status: 'invalid',
            reason: msgs[data.reason ?? ''] ?? 'This invite link is invalid.',
          });
        }
      })
      .catch(() => {
        setPage({
          status: 'invalid',
          reason: 'Could not validate the invite link. Please check your connection and try again.',
        });
      });
  }, [token]);

  // ─── Form submission ────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (page.status !== 'ready') return;

    setSubmitError('');

    // Client-side validation before hitting the server
    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }

    const policyResult = validatePasswordPolicy(password, [page.email, page.email.split('@')[0]]);
    if (!policyResult.valid) {
      setSubmitError(policyResult.errors[0]);
      return;
    }

    setSubmitting(true);

    try {
      // 1. Set password via our server-side API (validates + calls Supabase Admin)
      const res  = await fetch('/api/invite/set-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password }),
      });
      const data: { success?: boolean; email?: string; error?: string; errors?: string[] } = await res.json();

      if (!res.ok || !data.success) {
        setSubmitError(data.error ?? 'Could not set your password. Please try again.');
        setSubmitting(false);
        return;
      }

      // 2. Auto sign-in now that the password is set
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email:    data.email ?? page.email,
        password,
      });

      if (signInError) {
        // Password was set successfully; just redirect to login to complete sign-in manually
        toast.success('Password set! Please sign in with your new password.');
        router.push('/login?message=password-set');
        return;
      }

      toast.success('Password set! Welcome to MULE LMS.');
      setPage({ status: 'success' });
      router.push('/instructor/dashboard');
      router.refresh();
    } catch {
      setSubmitError('An unexpected error occurred. Please try again.');
      setSubmitting(false);
    }
  }, [page, password, confirmPassword, token, router]);

  // ─── Derived state ──────────────────────────────────────────────────────────

  const email      = page.status === 'ready' ? page.email : '';
  const userInputs = [email, email.split('@')[0]].filter(Boolean);

  // Disable submit if policy isn't met (prevents needless server round-trips)
  const policyMet  = password.length > 0 && validatePasswordPolicy(password, userInputs).valid && password === confirmPassword;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen flex flex-col items-center justify-center py-12 px-4 bg-[#faf9f7]">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <div className="w-10 h-10 rounded-lg bg-amber-400 flex items-center justify-center">
          <svg className="w-6 h-6 text-amber-900" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 14l9-5-9-5-9 5 9 5z" />
            <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
          </svg>
        </div>
        <span className="text-xl font-bold text-gray-800 tracking-tight">MULE LMS</span>
      </div>

      <div className="w-full max-w-[460px] rounded-2xl bg-white shadow-lg p-8">

        {/* Loading */}
        {page.status === 'loading' && (
          <div className="flex flex-col items-center py-8 gap-3 text-gray-500">
            <svg className="w-8 h-8 animate-spin text-[#4c1d95]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <p className="text-sm">Validating your invite link…</p>
          </div>
        )}

        {/* Invalid / expired / used */}
        {page.status === 'invalid' && (
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">Invite link invalid</h1>
            <p className="text-sm text-gray-600 mb-6">{page.reason}</p>
            <Link href="/login" className="text-sm font-medium text-[#4c1d95] hover:underline">
              Go to sign in →
            </Link>
          </div>
        )}

        {/* Password form */}
        {page.status === 'ready' && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-800">Set your password</h1>
              <p className="text-sm text-gray-500 mt-1">
                You were invited as an instructor. Create a strong password to activate your account.
              </p>
            </div>

            {/* Locked email (read-only) */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="px-3.5 py-2.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 text-sm select-all">
                {page.email}
              </div>
            </div>

            {/* Error banner */}
            {submitError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex items-start gap-2 mb-4">
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 pr-10 border border-gray-300 rounded-lg text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-[#4c1d95] focus:border-[#4c1d95]"
                    placeholder="At least 12 characters"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon open={showPw} />
                  </button>
                </div>

                {/* Real-time strength meter */}
                <PasswordStrengthMeter
                  password={password}
                  userInputs={userInputs}
                  showBreachCheck
                />
              </div>

              {/* Confirm password */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPw ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 pr-10 border border-gray-300 rounded-lg text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-[#4c1d95] focus:border-[#4c1d95]"
                    placeholder="Repeat your password"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showConfirmPw ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon open={showConfirmPw} />
                  </button>
                </div>
                {/* Match indicator */}
                {confirmPassword && (
                  <p className={`mt-1 text-xs ${password === confirmPassword ? 'text-emerald-600' : 'text-red-500'}`}>
                    {password === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </p>
                )}
              </div>

              {/* Security note */}
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700">
                <strong>Tip:</strong> Consider using a passphrase — several random words strung together
                (e.g. <em>coral-piano-7-thunder</em>) are easier to remember and harder to crack than
                a short complex password.
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting || !policyMet}
                className="w-full py-3 rounded-lg bg-[#4c1d95] hover:bg-[#5b21b6] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 mt-2 transition-colors"
              >
                {submitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Activating account…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Activate account
                  </>
                )}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-gray-400">
              Already have a password?{' '}
              <Link href="/login" className="text-[#4c1d95] hover:underline">Sign in</Link>
            </p>
          </>
        )}

        {/* Success (rare — usually redirects before rendering) */}
        {page.status === 'success' && (
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Account activated!</h2>
            <p className="text-sm text-gray-500">Redirecting you to the dashboard…</p>
          </div>
        )}

      </div>
    </main>
  );
}

// useSearchParams() requires a Suspense boundary in Next.js App Router
export default function SetupPasswordPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-[#faf9f7]">
        <svg className="w-8 h-8 animate-spin text-[#4c1d95]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </main>
    }>
      <SetupPasswordContent />
    </Suspense>
  );
}
