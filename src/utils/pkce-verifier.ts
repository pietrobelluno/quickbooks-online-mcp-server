/**
 * PKCE Verifier Utility
 *
 * Implements OAuth 2.0 PKCE (Proof Key for Code Exchange) verification.
 * Based on RFC 7636: https://tools.ietf.org/html/rfc7636
 *
 * PKCE Flow:
 * 1. Client generates random code_verifier
 * 2. Client creates code_challenge = BASE64URL(SHA256(code_verifier))
 * 3. Client sends code_challenge to /authorize
 * 4. Server stores code_challenge
 * 5. Client sends code_verifier to /token
 * 6. Server verifies: BASE64URL(SHA256(code_verifier)) === code_challenge
 *
 * Security: Prevents authorization code interception attacks
 */

import crypto from 'crypto';

/**
 * Verify PKCE code challenge against code verifier
 *
 * @param codeVerifier Code verifier from client (plain text)
 * @param codeChallenge Code challenge stored during /authorize
 * @param method Challenge method: 'S256' (SHA256) or 'plain'
 * @returns true if verification succeeds, false otherwise
 *
 * @example
 * // Client sends code_verifier in /token request
 * const isValid = verifyPKCE(
 *   codeVerifier,
 *   storedChallenge.codeChallenge,
 *   'S256'
 * );
 */
export function verifyPKCE(
  codeVerifier: string,
  codeChallenge: string,
  method: 'S256' | 'plain'
): boolean {
  try {
    if (!codeVerifier || !codeChallenge) {
      console.error('[PKCE] Missing code verifier or challenge');
      return false;
    }

    if (method === 'plain') {
      // Plain text comparison (not recommended, but supported)
      return codeVerifier === codeChallenge;
    }

    if (method === 'S256') {
      // S256: BASE64URL(SHA256(code_verifier))
      const hash = crypto.createHash('sha256').update(codeVerifier).digest();
      const computed = base64UrlEncode(hash);

      const isValid = computed === codeChallenge;

      if (!isValid) {
        console.error('[PKCE] Verification failed');
        console.error(`  Expected: ${codeChallenge}`);
        console.error(`  Computed: ${computed}`);
      } else {
        console.log('[PKCE] ✓ Verification successful');
      }

      return isValid;
    }

    console.error(`[PKCE] Unsupported challenge method: ${method}`);
    return false;
  } catch (error) {
    console.error('[PKCE] Verification error:', error);
    return false;
  }
}

/**
 * Generate code challenge from code verifier
 * Used for testing or when server needs to generate challenges
 *
 * @param codeVerifier Code verifier (random string)
 * @param method Challenge method: 'S256' or 'plain'
 * @returns Code challenge
 *
 * @example
 * const verifier = generateCodeVerifier();
 * const challenge = generateCodeChallenge(verifier, 'S256');
 */
export function generateCodeChallenge(
  codeVerifier: string,
  method: 'S256' | 'plain' = 'S256'
): string {
  if (method === 'plain') {
    return codeVerifier;
  }

  // S256: BASE64URL(SHA256(code_verifier))
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  return base64UrlEncode(hash);
}

/**
 * Generate random code verifier
 * Used for testing
 *
 * @param length Length of verifier (43-128 characters per RFC 7636)
 * @returns Random code verifier
 *
 * @example
 * const verifier = generateCodeVerifier();
 * // Returns: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
 */
export function generateCodeVerifier(length: number = 43): string {
  // RFC 7636: code_verifier = high-entropy cryptographic random string
  // Length: 43-128 characters
  // Characters: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"

  if (length < 43 || length > 128) {
    throw new Error('Code verifier length must be between 43 and 128 characters');
  }

  // Generate random bytes and base64url encode
  const bytes = crypto.randomBytes(Math.ceil((length * 3) / 4));
  const verifier = base64UrlEncode(bytes).substring(0, length);

  return verifier;
}

/**
 * Base64URL encode (RFC 4648 Section 5)
 * Converts Buffer to base64url string without padding
 *
 * @param buffer Buffer to encode
 * @returns Base64URL encoded string
 */
function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')  // Replace + with -
    .replace(/\//g, '_')  // Replace / with _
    .replace(/=/g, '');    // Remove padding =
}

/**
 * Base64URL decode
 * Converts base64url string to Buffer
 *
 * @param str Base64URL encoded string
 * @returns Decoded buffer
 */
export function base64UrlDecode(str: string): Buffer {
  // Add padding if needed
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }

  return Buffer.from(base64, 'base64');
}

/**
 * Validate code verifier format
 * Per RFC 7636: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 *
 * @param codeVerifier Code verifier to validate
 * @returns true if valid format
 */
export function isValidCodeVerifier(codeVerifier: string): boolean {
  if (!codeVerifier) return false;

  const length = codeVerifier.length;
  if (length < 43 || length > 128) {
    console.error(`[PKCE] Invalid code verifier length: ${length} (must be 43-128)`);
    return false;
  }

  // Check characters: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
  const validPattern = /^[A-Za-z0-9\-._~]+$/;
  if (!validPattern.test(codeVerifier)) {
    console.error('[PKCE] Invalid code verifier characters');
    return false;
  }

  return true;
}
