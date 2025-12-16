/**
 * Token Generator Utility
 *
 * Generates secure cryptographic tokens for OAuth 2.0 flow:
 * - MCP access tokens (for Claude Desktop)
 * - Authorization codes (single-use, short-lived)
 * - Session IDs (persistent identifiers)
 * - OAuth state encoding/decoding
 *
 * Security: Uses crypto.randomBytes for cryptographically secure random generation
 */

import crypto from 'crypto';
import { randomUUID } from 'crypto';

/**
 * Generate MCP access token
 * Format: mcp_<64 hex characters>
 *
 * @returns MCP token string
 *
 * @example
 * const token = generateMCPToken();
 * // Returns: "mcp_a1b2c3d4e5f6..."
 */
export function generateMCPToken(): string {
  const randomBytes = crypto.randomBytes(32); // 32 bytes = 64 hex chars
  return `mcp_${randomBytes.toString('hex')}`;
}

/**
 * Generate authorization code
 * Format: 64 hex characters
 *
 * @returns Authorization code string
 *
 * @example
 * const code = generateAuthCode();
 * // Returns: "a1b2c3d4e5f6..."
 */
export function generateAuthCode(): string {
  const randomBytes = crypto.randomBytes(32); // 32 bytes = 64 hex chars
  return randomBytes.toString('hex');
}

/**
 * Generate session ID
 * Format: UUID v4
 *
 * @returns Session ID (UUID v4)
 *
 * @example
 * const sessionId = generateSessionId();
 * // Returns: "550e8400-e29b-41d4-a716-446655440000"
 */
export function generateSessionId(): string {
  return randomUUID();
}

/**
 * Generate random state parameter for OAuth
 * Format: 32 hex characters
 *
 * @returns State parameter string
 *
 * @example
 * const state = generateState();
 * // Returns: "a1b2c3d4e5f6..."
 */
export function generateState(): string {
  const randomBytes = crypto.randomBytes(16); // 16 bytes = 32 hex chars
  return randomBytes.toString('hex');
}

/**
 * Encode QuickBooks OAuth state
 * Encodes {claudeState, sessionId, timestamp} to base64url
 *
 * @param data State data to encode
 * @returns Base64url encoded state
 *
 * @example
 * const qbState = encodeQBState({
 *   claudeState: '3yVO1STe6u0n8aYdLARPhqkuyoB6Mmt36o0vVaVNkXY',
 *   sessionId: '550e8400-e29b-41d4-a716-446655440000',
 *   timestamp: 1234567890
 * });
 */
export function encodeQBState(data: {
  claudeState: string;
  sessionId: string;
  timestamp?: number;
}): string {
  const stateData = {
    claudeState: data.claudeState,
    sessionId: data.sessionId,
    timestamp: data.timestamp || Date.now(),
  };

  const json = JSON.stringify(stateData);
  const buffer = Buffer.from(json, 'utf-8');

  return base64UrlEncode(buffer);
}

/**
 * Decode QuickBooks OAuth state
 * Decodes base64url state to {claudeState, sessionId, timestamp}
 *
 * @param qbState Base64url encoded state
 * @returns Decoded state data
 *
 * @example
 * const data = decodeQBState(qbState);
 * // Returns: { claudeState: '...', sessionId: '...', timestamp: 1234567890 }
 */
export function decodeQBState(qbState: string): {
  claudeState: string;
  sessionId: string;
  timestamp: number;
} {
  try {
    const buffer = base64UrlDecode(qbState);
    const json = buffer.toString('utf-8');
    const data = JSON.parse(json);

    if (!data.claudeState || !data.sessionId) {
      throw new Error('Invalid QB state format: missing required fields');
    }

    return {
      claudeState: data.claudeState,
      sessionId: data.sessionId,
      timestamp: data.timestamp || Date.now(),
    };
  } catch (error) {
    console.error('[Token Generator] Failed to decode QB state:', error);
    throw new Error('Invalid QB state format');
  }
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
function base64UrlDecode(str: string): Buffer {
  // Add padding if needed
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }

  return Buffer.from(base64, 'base64');
}

/**
 * Validate MCP token format
 * Expected format: mcp_<64 hex characters>
 *
 * @param token Token to validate
 * @returns true if valid format
 */
export function isValidMCPToken(token: string): boolean {
  if (!token) return false;

  // Check prefix
  if (!token.startsWith('mcp_')) {
    return false;
  }

  // Check length: "mcp_" (4 chars) + 64 hex chars = 68 chars
  if (token.length !== 68) {
    return false;
  }

  // Check hex characters after prefix
  const hexPart = token.substring(4);
  const hexPattern = /^[0-9a-f]{64}$/;

  return hexPattern.test(hexPart);
}

/**
 * Validate authorization code format
 * Expected format: 64 hex characters
 *
 * @param code Code to validate
 * @returns true if valid format
 */
export function isValidAuthCode(code: string): boolean {
  if (!code) return false;

  // Check length: 64 hex characters
  if (code.length !== 64) {
    return false;
  }

  // Check hex characters
  const hexPattern = /^[0-9a-f]{64}$/;

  return hexPattern.test(code);
}

/**
 * Validate session ID format
 * Expected format: UUID v4
 *
 * @param sessionId Session ID to validate
 * @returns true if valid format
 */
export function isValidSessionId(sessionId: string): boolean {
  if (!sessionId) return false;

  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidPattern.test(sessionId);
}
