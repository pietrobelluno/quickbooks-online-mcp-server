/**
 * Authentication Middleware
 *
 * Extracts and manages OAuth tokens from HTTP requests for Copilot Studio integration.
 * Supports both external OAuth (Copilot Studio) and internal OAuth (.env tokens).
 */

import { config } from '../config/server-config.js';

export interface AuthContext {
  /** OAuth access token from Copilot Studio */
  accessToken?: string;

  /** QuickBooks realm ID (company ID) */
  realmId?: string;

  /** User identifier (for multi-user scenarios) */
  userId?: string;

  /** Whether authentication is from external source (Copilot Studio) */
  isExternalAuth: boolean;
}

/**
 * Extract OAuth token from Authorization header
 * Format: "Bearer <token>"
 */
export function extractTokenFromHeader(authHeader?: string): string | undefined {
  if (!authHeader) {
    return undefined;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return undefined;
  }

  return parts[1];
}

/**
 * Extract user ID from request headers
 * Copilot Studio may provide user context in custom headers
 */
export function extractUserIdFromHeaders(headers: Record<string, string>): string | undefined {
  // Common headers that might contain user ID
  return (
    headers['x-ms-client-principal-id'] || // Azure AD user ID
    headers['x-user-id'] || // Custom user ID header
    headers['x-ms-client-principal-name'] || // User email/name
    undefined
  );
}

/**
 * Extract OAuth state from request headers
 * This is used to bridge OAuth callback (has realmId + state) with first API call
 */
export function extractOAuthStateFromHeaders(headers: Record<string, string>): string | undefined {
  return (
    headers['x-oauth-state'] ||
    headers['x-ms-oauth-state'] ||
    undefined
  );
}

/**
 * Create authentication context from HTTP request headers
 */
export function createAuthContext(headers: Record<string, string>): AuthContext {
  const authHeader = headers['authorization'] || headers['Authorization'];
  const accessToken = extractTokenFromHeader(authHeader);
  const userId = extractUserIdFromHeaders(headers);
  const oauthState = extractOAuthStateFromHeaders(headers);

  const context: AuthContext = {
    accessToken,
    userId,
    isExternalAuth: !!accessToken && config.authMode === 'claude-desktop',
  };

  // Note: For Claude Desktop, realm ID is now managed via QuickBooks session storage
  // This auth middleware is kept for legacy compatibility only

  return context;
}

// Global auth context (will be replaced with request-scoped context in HTTP mode)
let globalAuthContext: AuthContext = {
  isExternalAuth: false,
};

/**
 * Set the global auth context (temporary until we have request-scoped context)
 */
export function setGlobalAuthContext(context: AuthContext): void {
  globalAuthContext = context;
}

/**
 * Get the current auth context
 */
export function getAuthContext(): AuthContext {
  return globalAuthContext;
}
