'use client';

/**
 * PasswordStrengthMeter — real-time password policy + strength feedback
 *
 * Renders:
 * - An animated segmented strength bar (Very Weak → Very Strong)
 * - A checklist of policy requirements with live pass/fail indicators
 * - A breach warning if the password appears in known data breaches
 * - zxcvbn suggestions when the password is weak
 *
 * Usage:
 *   <PasswordStrengthMeter password={watch('password')} userInputs={[email, firstName, lastName]} />
 */

import { useEffect, useState, useRef } from 'react';
import { validatePasswordPolicy, getPasswordStrength, PASSWORD_MIN_LENGTH, PASSWORD_MIN_CLASSES } from '@/lib/security/password';
import type { PasswordPolicyResult, PasswordStrengthResult } from '@/lib/security/password';
import { checkPasswordBreach } from '@/lib/security/breachCheck';

interface Props {
  password: string;
  /** Personal identifiers to flag if found inside the password */
  userInputs?: string[];
  /** Show the breach-check indicator (adds an async HIBP request) */
  showBreachCheck?: boolean;
  className?: string;
}

// Individual requirement row
function Req({ met, label }: { met: boolean; label: string }) {
  return (
    <li className="flex items-center gap-1.5 text-xs">
      {met ? (
        <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 text-gray-300 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      )}
      <span className={met ? 'text-gray-700' : 'text-gray-400'}>{label}</span>
    </li>
  );
}

// Segmented strength bar (5 equal segments)
function StrengthBar({ score, barColor }: { score: number; barColor: string }) {
  return (
    <div className="flex gap-1 mt-2" role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={4}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
            i <= score ? barColor : 'bg-gray-200'
          }`}
        />
      ))}
    </div>
  );
}

export default function PasswordStrengthMeter({
  password,
  userInputs = [],
  showBreachCheck = true,
  className = '',
}: Props) {
  const [policy, setPolicy] = useState<PasswordPolicyResult | null>(null);
  const [strength, setStrength] = useState<PasswordStrengthResult | null>(null);
  const [breachCount, setBreachCount] = useState<number | null>(null);
  const [breachChecking, setBreachChecking] = useState(false);

  // Debounce the breach check so we don't hammer the HIBP API on every keystroke
  const breachTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!password) {
      setPolicy(null);
      setStrength(null);
      setBreachCount(null);
      return;
    }

    // Policy check is synchronous — run immediately
    setPolicy(validatePasswordPolicy(password, userInputs));

    // Strength check uses zxcvbn (lazy import) — run async
    getPasswordStrength(password, userInputs).then(setStrength);

    // Breach check — debounced 800ms, only if password is ≥ 12 chars (avoid unnecessary API calls for obviously weak passwords)
    if (showBreachCheck && password.length >= PASSWORD_MIN_LENGTH) {
      if (breachTimer.current) clearTimeout(breachTimer.current);
      setBreachChecking(true);
      breachTimer.current = setTimeout(async () => {
        const result = await checkPasswordBreach(password);
        setBreachCount(result.checked ? result.count : null);
        setBreachChecking(false);
      }, 800);
    } else {
      if (breachTimer.current) clearTimeout(breachTimer.current);
      setBreachCount(null);
      setBreachChecking(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, showBreachCheck]);

  // Nothing to show until the user starts typing
  if (!password) return null;

  const rules = policy?.rules;

  return (
    <div className={`mt-2 space-y-2 ${className}`}>
      {/* Segmented strength bar */}
      {strength && (
        <div>
          <StrengthBar score={strength.score} barColor={strength.barColor} />
          <div className="flex items-center justify-between mt-1">
            <span className={`text-xs font-medium ${strength.labelColor}`}>{strength.label}</span>
            {strength.warning && (
              <span className="text-xs text-orange-500 truncate max-w-[200px]">{strength.warning}</span>
            )}
          </div>
        </div>
      )}

      {/* Requirements checklist */}
      {rules && (
        <ul className="grid grid-cols-1 gap-0.5 pl-0.5">
          <Req met={rules.minLength} label={`At least ${PASSWORD_MIN_LENGTH} characters`} />
          <Req
            met={rules.characterClassCount >= PASSWORD_MIN_CLASSES}
            label={`At least ${PASSWORD_MIN_CLASSES} of: uppercase, lowercase, number, special character`}
          />
          <Req met={rules.hasUppercase} label="Uppercase letter (A–Z)" />
          <Req met={rules.hasLowercase} label="Lowercase letter (a–z)" />
          <Req met={rules.hasDigit} label="Number (0–9)" />
          <Req met={rules.hasSpecial} label="Special character (!@#$%^&*)" />
          <Req met={rules.noSequences} label="No sequential patterns (abc, 123)" />
          <Req met={rules.noRepeats} label="No repeated characters (aaa, 111)" />
          {userInputs.some((s) => s && s.length >= 3) && (
            <Req met={rules.noIdentifiers} label="Doesn't contain your name or email" />
          )}
        </ul>
      )}

      {/* Breach check indicator */}
      {showBreachCheck && (
        <div className="flex items-center gap-1.5 text-xs">
          {breachChecking ? (
            <>
              <svg className="w-3.5 h-3.5 text-gray-400 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span className="text-gray-400">Checking breach database…</span>
            </>
          ) : breachCount === null ? null : breachCount === 0 ? (
            <>
              <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span className="text-gray-500">Not found in known data breaches</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-red-600 font-medium">
                Found in {breachCount.toLocaleString()} data breaches — choose a different password
              </span>
            </>
          )}
        </div>
      )}

      {/* zxcvbn suggestions (only when score < 3) */}
      {strength && strength.score < 3 && strength.suggestions.length > 0 && (
        <ul className="text-xs text-gray-500 space-y-0.5 pl-4 list-disc">
          {strength.suggestions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
