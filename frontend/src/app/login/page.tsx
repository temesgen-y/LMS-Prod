'use client';

/**
 * Single sign-in page for all users (admin, instructor, student).
 * Redirect: admin → /admin/dashboard, instructor → /instructor/dashboard, student → /dashboard.
 * Role is read from public.users.role.
 * Handles invite callback: when user lands with hash (type=invite), show "Set your password" then redirect.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { getUserRoleNames } from '@/lib/auth/get-user-roles';
import { getHighestRole, getRedirectForRole, type RoleName } from '@/types/auth';
import { toast } from 'sonner';

function getHashParams() {
  if (typeof window === 'undefined') return {};
  const hash = window.location.hash?.replace(/^#/, '') || '';
  return Object.fromEntries(new URLSearchParams(hash));
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteMode, setInviteMode] = useState(false);
  const [inviteSessionReady, setInviteSessionReady] = useState(false);
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteConfirmPassword, setInviteConfirmPassword] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  useEffect(() => {
    const params = getHashParams();
    const type = params.type;
    const accessToken = params.access_token;
    const refreshToken = params.refresh_token;
    if ((type === 'invite' || type === 'recovery') && accessToken && refreshToken) {
      setInviteMode(true);
      const supabase = createClient();
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(() => {
          setInviteSessionReady(true);
          setError('');
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        })
        .catch((err: unknown) => {
          setError((err as Error)?.message || 'Invalid or expired link. Please use the invite link from your email again.');
        });
    }
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (signInError) {
      setIsSubmitting(false);
      // Network/connectivity failure (e.g. wrong Supabase URL, server down, CORS)
      if (isAuthRetryableFetchError(signInError) && (signInError.status === 0 || signInError.status === undefined)) {
        const displayError =
          'Cannot reach the authentication server. Check your internet connection and ensure Supabase is configured in .env.local (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY).';
        setError(displayError);
        toast.error('Connection error');
        return;
      }
      const msg = signInError.message ?? '';
      const lower = msg.toLowerCase();
      const isEmailNotConfirmed = lower.includes('email not confirmed') || lower.includes('not confirmed');
      const isInvalidCreds = lower.includes('invalid login credentials') || lower.includes('invalid email or password');
      let displayError: string;
      if (isEmailNotConfirmed) {
        displayError = 'Please confirm your email first. Check your inbox (and spam) for a link from us, then try signing in again.';
      } else if (isInvalidCreds) {
        displayError = 'Invalid email or password. Check both and try again, or use "Forgot password?" to reset.';
      } else {
        displayError = msg || 'Invalid email or password.';
      }
      setError(displayError);
      toast.error(isEmailNotConfirmed ? 'Confirm your email first' : (isInvalidCreds ? 'Wrong email or password' : (msg || 'Sign in failed.')));
      return;
    }

    const authUserId = data.user?.id;
    if (!authUserId) {
      setIsSubmitting(false);
      setError('Sign-in succeeded but no user id. Please try again.');
      return;
    }

    const roleNames = await getUserRoleNames(supabase, authUserId);
    const role = getHighestRole(roleNames as RoleName[]);

    if (!role) {
      await supabase.auth.signOut();
      setIsSubmitting(false);
      setError(
        'Your account has no role set. Ensure the users table has a role column and your user row has role = \'ADMIN\', \'INSTRUCTOR\', or \'STUDENT\'.'
      );
      toast.error('No role assigned');
      return;
    }

    if (rememberMe && typeof window !== 'undefined') {
      localStorage.setItem('lms_remember', '1');
    }

    const redirectTo = getRedirectForRole(role);
    toast.success('Signed in successfully.');
    // Use hard navigation to ensure session cookies are flushed before the
    // server-side layout runs its auth checks (soft router.push can race).
    window.location.href = redirectTo;
    setIsSubmitting(false);
  };

  const handleSetPasswordFromInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitePassword || invitePassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (invitePassword !== inviteConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setInviteSubmitting(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password: invitePassword });
    if (updateError) {
      setError(updateError.message || 'Failed to set password.');
      setInviteSubmitting(false);
      return;
    }
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      setError('Session lost. Please use the invite link again.');
      setInviteSubmitting(false);
      return;
    }
    const roleNames = await getUserRoleNames(supabase, authUser.id);
    const role = getHighestRole(roleNames as RoleName[]);
    const redirectTo = role ? getRedirectForRole(role) : '/login';
    toast.success('Password set. Redirecting…');
    window.history.replaceState(null, '', window.location.pathname);
    router.push(redirectTo);
    router.refresh();
    setInviteSubmitting(false);
  };

  return (
    <main className="min-h-screen w-full flex flex-col md:flex-row flex-nowrap overflow-x-hidden">
      {/* Left: brand panel */}
      <div
        className="relative flex-shrink-0 w-full md:w-[42%] md:min-w-[300px] min-h-[220px] md:min-h-screen flex flex-col justify-between py-8 md:py-12 px-6 md:px-10 text-white overflow-hidden"
        style={{ backgroundColor: '#4c1d95' }}
      >
        {/* University building — full-panel background illustration */}
        <div className="absolute inset-0 flex items-end justify-center pointer-events-none select-none" aria-hidden>
          <svg
            viewBox="0 0 500 620"
            className="w-full h-full"
            preserveAspectRatio="xMidYMax meet"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ opacity: 0.38 }}
          >
            {/* Sky dots / stars */}
            <circle cx="60" cy="40" r="2" fill="white" fillOpacity="0.6" />
            <circle cx="130" cy="20" r="1.5" fill="white" fillOpacity="0.5" />
            <circle cx="370" cy="30" r="2" fill="white" fillOpacity="0.5" />
            <circle cx="440" cy="55" r="1.5" fill="white" fillOpacity="0.4" />
            <circle cx="250" cy="15" r="1" fill="white" fillOpacity="0.4" />

            {/* ══════════════ CLOCK TOWER ══════════════ */}
            {/* Spire */}
            <polygon points="250,30 244,80 256,80" fill="white" />
            {/* Tower top block */}
            <rect x="228" y="80" width="44" height="50" fill="white" rx="2" />
            {/* Clock circle */}
            <circle cx="250" cy="106" r="16" fill="#4c1d95" fillOpacity="0.55" stroke="white" strokeWidth="2.5" />
            <line x1="250" y1="106" x2="250" y2="95" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <line x1="250" y1="106" x2="260" y2="106" stroke="white" strokeWidth="2" strokeLinecap="round" />
            {/* Belfry arch */}
            <rect x="238" y="82" width="24" height="20" fill="#4c1d95" fillOpacity="0.4" rx="12" />
            {/* Tower base block */}
            <rect x="218" y="128" width="64" height="60" fill="white" />
            {/* Tower windows */}
            <rect x="234" y="138" width="14" height="20" fill="#4c1d95" fillOpacity="0.45" rx="7" />
            <rect x="252" y="138" width="14" height="20" fill="#4c1d95" fillOpacity="0.45" rx="7" />

            {/* ══════════════ MAIN CENTRAL BUILDING ══════════════ */}
            {/* Pediment (roof triangle) */}
            <polygon points="100,310 250,230 400,310" fill="white" />
            {/* Pediment inner detail */}
            <polygon points="140,310 250,252 360,310" fill="#4c1d95" fillOpacity="0.25" />
            {/* Frieze band */}
            <rect x="100" y="308" width="300" height="18" fill="white" />

            {/* Main body */}
            <rect x="100" y="326" width="300" height="294" fill="white" />

            {/* Columns — 6 across */}
            <rect x="116" y="326" width="18" height="294" fill="#4c1d95" fillOpacity="0.2" rx="4" />
            <rect x="152" y="326" width="18" height="294" fill="#4c1d95" fillOpacity="0.2" rx="4" />
            <rect x="188" y="326" width="18" height="294" fill="#4c1d95" fillOpacity="0.2" rx="4" />
            <rect x="294" y="326" width="18" height="294" fill="#4c1d95" fillOpacity="0.2" rx="4" />
            <rect x="330" y="326" width="18" height="294" fill="#4c1d95" fillOpacity="0.2" rx="4" />
            <rect x="366" y="326" width="18" height="294" fill="#4c1d95" fillOpacity="0.2" rx="4" />

            {/* Column capitals (top decorations) */}
            <rect x="112" y="322" width="26" height="6" fill="white" rx="1" />
            <rect x="148" y="322" width="26" height="6" fill="white" rx="1" />
            <rect x="184" y="322" width="26" height="6" fill="white" rx="1" />
            <rect x="290" y="322" width="26" height="6" fill="white" rx="1" />
            <rect x="326" y="322" width="26" height="6" fill="white" rx="1" />
            <rect x="362" y="322" width="26" height="6" fill="white" rx="1" />

            {/* Windows row 1 */}
            <rect x="120" y="350" width="30" height="28" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="160" y="350" width="30" height="28" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="310" y="350" width="30" height="28" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="350" y="350" width="30" height="28" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            {/* Window arch tops */}
            <ellipse cx="135" cy="350" rx="15" ry="7" fill="#4c1d95" fillOpacity="0.45" />
            <ellipse cx="175" cy="350" rx="15" ry="7" fill="#4c1d95" fillOpacity="0.45" />
            <ellipse cx="325" cy="350" rx="15" ry="7" fill="#4c1d95" fillOpacity="0.45" />
            <ellipse cx="365" cy="350" rx="15" ry="7" fill="#4c1d95" fillOpacity="0.45" />

            {/* Windows row 2 */}
            <rect x="120" y="400" width="30" height="28" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="160" y="400" width="30" height="28" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="310" y="400" width="30" height="28" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="350" y="400" width="30" height="28" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <ellipse cx="135" cy="400" rx="15" ry="7" fill="#4c1d95" fillOpacity="0.45" />
            <ellipse cx="175" cy="400" rx="15" ry="7" fill="#4c1d95" fillOpacity="0.45" />
            <ellipse cx="325" cy="400" rx="15" ry="7" fill="#4c1d95" fillOpacity="0.45" />
            <ellipse cx="365" cy="400" rx="15" ry="7" fill="#4c1d95" fillOpacity="0.45" />

            {/* Windows row 3 */}
            <rect x="120" y="450" width="30" height="28" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="160" y="450" width="30" height="28" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="310" y="450" width="30" height="28" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="350" y="450" width="30" height="28" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <ellipse cx="135" cy="450" rx="15" ry="7" fill="#4c1d95" fillOpacity="0.45" />
            <ellipse cx="175" cy="450" rx="15" ry="7" fill="#4c1d95" fillOpacity="0.45" />
            <ellipse cx="325" cy="450" rx="15" ry="7" fill="#4c1d95" fillOpacity="0.45" />
            <ellipse cx="365" cy="450" rx="15" ry="7" fill="#4c1d95" fillOpacity="0.45" />

            {/* Grand entrance arch door */}
            <rect x="215" y="490" width="70" height="130" fill="#4c1d95" fillOpacity="0.5" rx="2" />
            <ellipse cx="250" cy="490" rx="35" ry="18" fill="#4c1d95" fillOpacity="0.5" />
            {/* Door frame */}
            <rect x="213" y="488" width="74" height="134" fill="none" stroke="white" strokeWidth="3" rx="37" />

            {/* Entry steps */}
            <rect x="170" y="618" width="160" height="6" fill="white" fillOpacity="0.7" rx="1" />
            <rect x="185" y="612" width="130" height="6" fill="white" fillOpacity="0.7" rx="1" />
            <rect x="200" y="606" width="100" height="6" fill="white" fillOpacity="0.7" rx="1" />
            <rect x="215" y="600" width="70" height="6" fill="white" fillOpacity="0.6" rx="1" />

            {/* ══════════════ LEFT WING ══════════════ */}
            {/* Left wing roof */}
            <polygon points="0,360 100,310 100,380" fill="white" />
            {/* Left wing body */}
            <rect x="0" y="378" width="102" height="242" fill="white" />
            {/* Left wing columns */}
            <rect x="10" y="378" width="12" height="242" fill="#4c1d95" fillOpacity="0.2" rx="3" />
            <rect x="40" y="378" width="12" height="242" fill="#4c1d95" fillOpacity="0.2" rx="3" />
            <rect x="70" y="378" width="12" height="242" fill="#4c1d95" fillOpacity="0.2" rx="3" />
            {/* Left wing windows */}
            <rect x="14" y="398" width="22" height="20" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="44" y="398" width="22" height="20" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="14" y="432" width="22" height="20" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="44" y="432" width="22" height="20" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="14" y="466" width="22" height="20" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="44" y="466" width="22" height="20" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            {/* Left wing door */}
            <rect x="37" y="540" width="30" height="80" fill="#4c1d95" fillOpacity="0.45" rx="15" />

            {/* ══════════════ RIGHT WING ══════════════ */}
            {/* Right wing roof */}
            <polygon points="500,360 400,310 400,380" fill="white" />
            {/* Right wing body */}
            <rect x="398" y="378" width="102" height="242" fill="white" />
            {/* Right wing columns */}
            <rect x="408" y="378" width="12" height="242" fill="#4c1d95" fillOpacity="0.2" rx="3" />
            <rect x="438" y="378" width="12" height="242" fill="#4c1d95" fillOpacity="0.2" rx="3" />
            <rect x="468" y="378" width="12" height="242" fill="#4c1d95" fillOpacity="0.2" rx="3" />
            {/* Right wing windows */}
            <rect x="414" y="398" width="22" height="20" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="444" y="398" width="22" height="20" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="414" y="432" width="22" height="20" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="444" y="432" width="22" height="20" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="414" y="466" width="22" height="20" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            <rect x="444" y="466" width="22" height="20" fill="#4c1d95" fillOpacity="0.45" rx="3" />
            {/* Right wing door */}
            <rect x="433" y="540" width="30" height="80" fill="#4c1d95" fillOpacity="0.45" rx="15" />

            {/* ══════════════ GROUND & TREES ══════════════ */}
            <rect x="0" y="618" width="500" height="8" fill="white" fillOpacity="0.5" rx="2" />

            {/* Left trees */}
            <ellipse cx="30" cy="580" rx="22" ry="30" fill="white" fillOpacity="0.55" />
            <ellipse cx="30" cy="565" rx="16" ry="22" fill="white" fillOpacity="0.45" />
            <rect x="27" y="605" width="6" height="18" fill="white" fillOpacity="0.5" />

            <ellipse cx="75" cy="590" rx="18" ry="24" fill="white" fillOpacity="0.45" />
            <rect x="72" y="610" width="6" height="14" fill="white" fillOpacity="0.4" />

            {/* Right trees */}
            <ellipse cx="470" cy="580" rx="22" ry="30" fill="white" fillOpacity="0.55" />
            <ellipse cx="470" cy="565" rx="16" ry="22" fill="white" fillOpacity="0.45" />
            <rect x="467" y="605" width="6" height="18" fill="white" fillOpacity="0.5" />

            <ellipse cx="425" cy="590" rx="18" ry="24" fill="white" fillOpacity="0.45" />
            <rect x="422" y="610" width="6" height="14" fill="white" fillOpacity="0.4" />
          </svg>
        </div>

        {/* Content above the building */}
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-lg bg-amber-400 flex items-center justify-center mb-4 md:mb-6 flex-shrink-0">
            <svg className="w-6 h-6 md:w-8 md:h-8 text-amber-900" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 14l9-5-9-5-9 5 9 5z" />
              <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">MULE LMS</h1>
          <p className="mt-2 md:mt-3 text-white/90 text-sm max-w-[280px]">
            Learning Management System. Access your courses, assignments, and academic resources.
          </p>
        </div>

        <div className="relative z-10 h-16 md:h-20" />
      </div>

      {/* Right: form panel */}
      <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center bg-[#faf9f7] py-8 px-6 sm:px-8">
        <div className="w-full max-w-[400px]">
          {inviteMode ? (
            <>
              <h2 className="text-2xl font-bold text-gray-800">Set your password</h2>
              <p className="mt-1 text-gray-500 text-sm">
                {inviteSessionReady
                  ? 'You were invited to MULE LMS. Choose a password to finish setting up your account.'
                  : 'Preparing…'}
              </p>
              {!inviteSessionReady && (
                <p className="mt-4 text-sm text-gray-400">Please wait while we verify your invite link.</p>
              )}
              <form onSubmit={handleSetPasswordFromInvite} className="mt-8 space-y-5" style={{ visibility: inviteSessionReady ? 'visible' : 'hidden' }}>
                <div>
                  <label htmlFor="invite-password" className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
                  <input
                    id="invite-password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-[#4c1d95] focus:border-[#4c1d95]"
                    autoComplete="new-password"
                    minLength={6}
                  />
                </div>
                <div>
                  <label htmlFor="invite-confirm" className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
                  <input
                    id="invite-confirm"
                    type="password"
                    placeholder="Repeat password"
                    value={inviteConfirmPassword}
                    onChange={(e) => setInviteConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-[#4c1d95] focus:border-[#4c1d95]"
                    autoComplete="new-password"
                    minLength={6}
                  />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={inviteSubmitting}
                  className="w-full py-3 rounded-lg bg-[#4c1d95] hover:bg-[#5b21b6] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm"
                >
                  {inviteSubmitting ? 'Setting password…' : 'Set password and continue'}
                </button>
              </form>
            </>
          ) : (
            <>
          <h2 className="text-2xl font-bold text-gray-800">Welcome back</h2>
          <p className="mt-1 text-gray-500 text-sm">Sign in to your account to continue</p>

          <form onSubmit={handleSignIn} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-[#4c1d95] focus:border-[#4c1d95]"
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 pr-10 border border-gray-300 rounded-lg text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-[#4c1d95] focus:border-[#4c1d95]"
                  autoComplete="current-password"
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
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-gray-300 text-[#4c1d95] focus:ring-[#4c1d95]"
                />
                <span className="text-sm text-gray-600">Remember me</span>
              </label>
              <a href="#" className="text-sm font-medium text-[#4c1d95] hover:underline">
                Forgot password?
              </a>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-lg bg-[#4c1d95] hover:bg-[#5b21b6] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2"
            >
              {isSubmitting ? 'Signing in…' : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  Sign In
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-medium text-[#4c1d95] hover:underline">
              Sign up
            </Link>
          </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
