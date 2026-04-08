/**
 * breachCheck.ts — HaveIBeenPwned k-Anonymity password breach detection
 *
 * Security design (k-Anonymity):
 *   1. SHA-1 hash the password locally (never transmitted raw)
 *   2. Send only the first 5 hex characters to the HIBP API
 *   3. HIBP returns all hashes sharing that prefix (~500 entries)
 *   4. We check locally whether the full hash appears in the list
 *
 * The actual password — or even enough of the hash to reconstruct it —
 * is never sent over the network. This is safe to call from both browser
 * and server (Node 18+ / Next.js 15 both expose crypto.subtle).
 */

/** SHA-1 hash → uppercase hex string (uses Web Crypto, available browser + Node 18+) */
async function sha1Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-1', encoder.encode(input));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export interface BreachResult {
  /** Number of times this password appeared in breach databases (0 = not found) */
  count: number;
  /** Whether the check succeeded (false if network/API was unavailable) */
  checked: boolean;
  error?: string;
}

/**
 * Check whether a password has appeared in known data breaches.
 *
 * @param password Plaintext password to check (never leaves the device in readable form)
 * @param timeoutMs API request timeout in milliseconds (default 5000)
 */
export async function checkPasswordBreach(
  password: string,
  timeoutMs = 5000
): Promise<BreachResult> {
  if (!password) return { count: 0, checked: true };

  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let text: string;
    try {
      const response = await fetch(
        `https://api.pwnedpasswords.com/range/${prefix}`,
        {
          signal: controller.signal,
          // Padding header tells HIBP to pad responses to a fixed size,
          // preventing traffic-analysis attacks.
          headers: { 'Add-Padding': 'true' },
        }
      );
      if (!response.ok) {
        return { count: 0, checked: false, error: `HIBP API returned ${response.status}` };
      }
      text = await response.text();
    } finally {
      clearTimeout(timer);
    }

    // Response format: "HASHSUFFIX:COUNT\r\n" per line
    for (const line of text.split('\n')) {
      const [lineSuffix, countStr] = line.split(':');
      if (lineSuffix?.trim().toUpperCase() === suffix) {
        return { count: parseInt(countStr?.trim() ?? '0', 10), checked: true };
      }
    }

    return { count: 0, checked: true };
  } catch (err) {
    // AbortError = timeout; treat as unavailable (don't block the user)
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return {
      count: 0,
      checked: false,
      error: isTimeout ? 'Breach check timed out.' : String(err),
    };
  }
}
