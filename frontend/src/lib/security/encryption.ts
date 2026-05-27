/**
 * encryption.ts — AES-256-GCM field-level encryption (server-only)
 *
 * Used to encrypt sensitive data before writing to the database,
 * e.g. PII fields, SCORM suspend_data, or any custom sensitive payload.
 *
 * Key is derived from ENCRYPTION_SECRET env var using PBKDF2 so that
 * a plain string secret can be used without pre-generating a 32-byte hex key.
 *
 * IMPORTANT: This module uses Node.js `crypto` — it is server-only.
 * Never import it in client components or 'use client' files.
 *
 * Environment variable required:
 *   ENCRYPTION_SECRET=<at least 32 characters of entropy>
 */

import crypto from 'crypto';

const ALGORITHM   = 'aes-256-gcm';
const IV_LENGTH   = 12;   // GCM standard nonce
const TAG_LENGTH  = 16;   // Authentication tag bytes
const KEY_LENGTH  = 32;   // AES-256
const PBKDF2_ITER = 100_000;
const PBKDF2_HASH = 'sha256';
// Salt is fixed (purpose-bound) — the secret has sufficient entropy.
// If you ever rotate secrets, keep the old salt per-record via the ciphertext prefix.
const FIXED_SALT  = 'mule-lms-v1-field-encryption';

let _cachedKey: Buffer | null = null;

function getDerivedKey(): Buffer {
  if (_cachedKey) return _cachedKey;
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('ENCRYPTION_SECRET env var is missing or too short (min 16 chars).');
  }
  _cachedKey = crypto.pbkdf2Sync(secret, FIXED_SALT, PBKDF2_ITER, KEY_LENGTH, PBKDF2_HASH);
  return _cachedKey;
}

/**
 * Encrypt a plaintext string.
 * Returns a base64-encoded string: `iv:ciphertext:tag`
 */
export function encrypt(plaintext: string): string {
  const key  = getDerivedKey();
  const iv   = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Pack as: iv(12B) + tag(16B) + ciphertext → base64
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypt a value produced by `encrypt()`.
 * Returns the original plaintext string, or throws on tampered/invalid data.
 */
export function decrypt(ciphertext: string): string {
  const key  = getDerivedKey();
  const buf  = Buffer.from(ciphertext, 'base64');
  const iv   = buf.subarray(0, IV_LENGTH);
  const tag  = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final('utf8');
}

/**
 * Encrypt a value only if it is non-null and non-empty.
 * Useful for optional fields: `encryptIfPresent(user.phone)`
 */
export function encryptIfPresent(value: string | null | undefined): string | null {
  if (!value) return null;
  return encrypt(value);
}

/**
 * Decrypt a nullable field, returning null if input is null.
 */
export function decryptIfPresent(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return null;
  }
}

/**
 * Hash a value with SHA-256 for deterministic lookup without storing plaintext.
 * E.g. hashing a student ID number for indexed search while storing it encrypted.
 */
export function hashForIndex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
