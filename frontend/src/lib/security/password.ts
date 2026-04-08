/**
 * password.ts — Core password policy validation
 *
 * Security decisions:
 * - 12-character minimum: NIST SP 800-63B recommends at least 8; we use 12
 *   for higher-assurance accounts (instructors/admins).
 * - 3-of-4 character classes: avoids purely random complexity theatre while
 *   still increasing entropy meaningfully.
 * - Reject user identifiers embedded in the password: prevents trivially
 *   guessable passwords like "john.doe2024!".
 * - Reject sequential/repeated runs: "abc", "123", "aaa" add no real entropy.
 * - zxcvbn score ≥ 2 (Fair): catches dictionary-word passwords and common
 *   patterns that our rule-checks might miss.
 * - Breach check is async and done separately (see breachCheck.ts).
 */

// zxcvbn is large (~800 KB); we lazy-load it to avoid blocking the bundle.
let _zxcvbn: typeof import('zxcvbn') | null = null;
async function getZxcvbn(): Promise<typeof import('zxcvbn')> {
  if (!_zxcvbn) {
    _zxcvbn = (await import('zxcvbn')).default as unknown as typeof import('zxcvbn');
  }
  return _zxcvbn;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
  /** Granular per-rule pass/fail — used by the strength meter UI */
  rules: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasDigit: boolean;
    hasSpecial: boolean;
    characterClassCount: number;   // how many of the 4 classes are present
    noIdentifiers: boolean;
    noSequences: boolean;
    noRepeats: boolean;
  };
}

export interface PasswordStrengthResult {
  /** 0 = Very Weak … 4 = Very Strong (zxcvbn scale) */
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  labelColor: string;    // Tailwind text colour class
  barColor: string;      // Tailwind bg colour class
  widthPct: number;      // 0–100, for the progress bar width
  suggestions: string[];
  warning: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MIN_CLASSES = 3;
const SPECIAL_RE = /[!@#$%^&*()_\-+=\[\]{};':"\\|,.<>\/?`~]/;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Check for runs of 3+ sequential characters (ascending or descending) */
function hasSequential(password: string): boolean {
  const s = password.toLowerCase();
  for (let i = 0; i < s.length - 2; i++) {
    const a = s.charCodeAt(i);
    const b = s.charCodeAt(i + 1);
    const c = s.charCodeAt(i + 2);
    if (b === a + 1 && c === b + 1) return true; // abc, 123
    if (b === a - 1 && c === b - 1) return true; // cba, 321
  }
  return false;
}

/** Check for 3+ identical consecutive characters */
function hasRepeated(password: string): boolean {
  for (let i = 0; i < password.length - 2; i++) {
    if (password[i] === password[i + 1] && password[i + 1] === password[i + 2]) return true;
  }
  return false;
}

/**
 * Check whether the password contains a user identifier (email, first/last name).
 * Matching is case-insensitive and ignores short fragments (< 3 chars) to avoid
 * false positives on names like "Jo".
 */
function containsIdentifier(password: string, identifiers: string[]): boolean {
  const lower = password.toLowerCase();
  for (const id of identifiers) {
    if (!id || id.length < 3) continue;
    const parts = id.toLowerCase()
      // split email into local-part + domain parts
      .split(/[@._\-+]/)
      .filter((p) => p.length >= 3);
    // also test the whole identifier
    const tokens = [id.toLowerCase(), ...parts];
    for (const token of tokens) {
      if (lower.includes(token)) return true;
    }
  }
  return false;
}

// ─── Core policy check (synchronous) ─────────────────────────────────────────

/**
 * Validate the password against the platform's security policy.
 * This is synchronous — breach-database checking is done separately (async).
 *
 * @param password    The plaintext password to check
 * @param userInputs  Personal identifiers to exclude (email, firstName, lastName…)
 */
export function validatePasswordPolicy(
  password: string,
  userInputs: string[] = []
): PasswordPolicyResult {
  const errors: string[] = [];

  // 1. Minimum length
  const minLength = password.length >= PASSWORD_MIN_LENGTH;
  if (!minLength) {
    errors.push(`At least ${PASSWORD_MIN_LENGTH} characters required.`);
  }

  // 2. Character class counts
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = SPECIAL_RE.test(password);
  const characterClassCount = [hasUppercase, hasLowercase, hasDigit, hasSpecial].filter(Boolean).length;

  if (characterClassCount < PASSWORD_MIN_CLASSES) {
    const missing: string[] = [];
    if (!hasUppercase) missing.push('uppercase letter');
    if (!hasLowercase) missing.push('lowercase letter');
    if (!hasDigit) missing.push('number');
    if (!hasSpecial) missing.push('special character (!@#$%^&*)');
    errors.push(
      `Include at least ${PASSWORD_MIN_CLASSES} of: uppercase, lowercase, number, special character. Missing: ${missing.join(', ')}.`
    );
  }

  // 3. No user identifiers
  const noIdentifiers = !containsIdentifier(password, userInputs);
  if (!noIdentifiers) {
    errors.push('Password must not contain your name or email address.');
  }

  // 4. No sequential patterns (abc, 123, cba, 321)
  const noSequences = !hasSequential(password);
  if (!noSequences) {
    errors.push('Password must not contain sequential characters (e.g. abc, 123).');
  }

  // 5. No repeated characters (aaa, 111)
  const noRepeats = !hasRepeated(password);
  if (!noRepeats) {
    errors.push('Password must not contain three or more repeated characters (e.g. aaa, 111).');
  }

  return {
    valid: errors.length === 0,
    errors,
    rules: {
      minLength,
      hasUppercase,
      hasLowercase,
      hasDigit,
      hasSpecial,
      characterClassCount,
      noIdentifiers,
      noSequences,
      noRepeats,
    },
  };
}

// ─── Strength scoring (async, uses zxcvbn) ───────────────────────────────────

const SCORE_META: Record<
  number,
  { label: PasswordStrengthResult['label']; labelColor: string; barColor: string; widthPct: number }
> = {
  0: { label: 'Very Weak', labelColor: 'text-red-600',    barColor: 'bg-red-500',    widthPct: 20  },
  1: { label: 'Weak',      labelColor: 'text-orange-500', barColor: 'bg-orange-400', widthPct: 40  },
  2: { label: 'Fair',      labelColor: 'text-yellow-600', barColor: 'bg-yellow-400', widthPct: 60  },
  3: { label: 'Strong',    labelColor: 'text-emerald-600',barColor: 'bg-emerald-500',widthPct: 80  },
  4: { label: 'Very Strong',labelColor:'text-green-600',  barColor: 'bg-green-500',  widthPct: 100 },
};

/**
 * Run zxcvbn to get a strength score and actionable feedback.
 * @param password   The plaintext password
 * @param userInputs Personal identifiers passed to zxcvbn as dictionary entries
 */
export async function getPasswordStrength(
  password: string,
  userInputs: string[] = []
): Promise<PasswordStrengthResult> {
  if (!password) {
    return { score: 0, ...SCORE_META[0], suggestions: [], warning: '' };
  }

  const zxcvbn = await getZxcvbn();
  const result = zxcvbn(password, userInputs.filter(Boolean));
  const score = result.score as PasswordStrengthResult['score'];

  return {
    score,
    ...SCORE_META[score],
    suggestions: result.feedback.suggestions,
    warning: result.feedback.warning,
  };
}

/**
 * Convenience: run policy + strength together.
 * Ideal for server-side validation where we can await.
 */
export async function fullPasswordCheck(
  password: string,
  userInputs: string[] = []
): Promise<{ policy: PasswordPolicyResult; strength: PasswordStrengthResult }> {
  const [policy, strength] = await Promise.all([
    Promise.resolve(validatePasswordPolicy(password, userInputs)),
    getPasswordStrength(password, userInputs),
  ]);
  return { policy, strength };
}
