/**
 * Token Refresh Service
 *
 * Automatically refreshes QuickBooks OAuth tokens before expiry.
 * Ensures uninterrupted access to QuickBooks API across all devices.
 *
 * Features:
 * - Automatic refresh when token expires in < 5 minutes
 * - Updates QuickBooks session storage with new tokens
 * - Thread-safe with mutex to prevent concurrent refreshes
 * - Error handling and logging
 *
 * QuickBooks Token Lifecycle:
 * - Access token: 1 hour expiry
 * - Refresh token: 100 days, refreshes on use
 */

import { getQuickBooksSessionStorage, QuickBooksSession } from '../storage/quickbooks-session-storage.js';

// Mutex to prevent concurrent refreshes for the same session
const refreshMutexes = new Map<string, Promise<void>>();

/**
 * Token Refresh Service
 */
export class TokenRefreshService {
  private quickbooksClient: any;

  constructor(quickbooksClient: any) {
    this.quickbooksClient = quickbooksClient;
  }

  /**
   * Refresh QuickBooks tokens if needed (< 5 minutes until expiry)
   * @param sessionId Session ID
   * @returns true if refreshed, false if not needed
   */
  async refreshQuickBooksTokenIfNeeded(sessionId: string): Promise<boolean> {
    const qbSessionStorage = getQuickBooksSessionStorage();
    await qbSessionStorage.initialize();

    const qbSession = qbSessionStorage.getSession(sessionId);

    if (!qbSession) {
      console.error(`[Token Refresh] Session not found: ${sessionId}`);
      throw new Error('QuickBooks session not found');
    }

    // Check if token expires in < 5 minutes (300000 ms)
    const timeUntilExpiry = qbSession.qbTokenExpiresAt - Date.now();
    const fiveMinutes = 300000;

    if (timeUntilExpiry > fiveMinutes) {
      // Token is still valid for more than 5 minutes, no refresh needed
      console.log(
        `[Token Refresh] Token valid for ${Math.round(timeUntilExpiry / 60000)} minutes, no refresh needed`
      );
      return false;
    }

    console.log(
      `[Token Refresh] Token expires in ${Math.round(timeUntilExpiry / 1000)} seconds, refreshing...`
    );

    // Use mutex to prevent concurrent refreshes
    if (refreshMutexes.has(sessionId)) {
      console.log(`[Token Refresh] Refresh already in progress for session ${sessionId}, waiting...`);
      await refreshMutexes.get(sessionId);
      return true;
    }

    const refreshPromise = this.refreshQuickBooksToken(sessionId);
    refreshMutexes.set(sessionId, refreshPromise);

    try {
      await refreshPromise;
      return true;
    } finally {
      refreshMutexes.delete(sessionId);
    }
  }

  /**
   * Force refresh QuickBooks tokens
   * @param sessionId Session ID
   */
  async refreshQuickBooksToken(sessionId: string): Promise<void> {
    const qbSessionStorage = getQuickBooksSessionStorage();
    await qbSessionStorage.initialize();

    const qbSession = qbSessionStorage.getSession(sessionId);

    if (!qbSession) {
      console.error(`[Token Refresh] Session not found: ${sessionId}`);
      throw new Error('QuickBooks session not found');
    }

    console.log(`[Token Refresh] Refreshing tokens for session: ${sessionId}`);
    console.log(`  → RealmId: ${qbSession.realmId}`);
    console.log(`  → Refreshing QB tokens...`);

    try {
      // Use QuickBooks OAuth client to refresh token
      const oauthClient = this.quickbooksClient['oauthClient'];

      // Set the refresh token on the OAuth client
      oauthClient.setToken({
        refresh_token: qbSession.qbRefreshToken,
      });

      // Refresh the token
      const response = await oauthClient.refresh();

      const newTokens = response.token;

      console.log('  ✓ Successfully refreshed QuickBooks tokens');
      console.log(`  → New access token received`);
      console.log(`  → New refresh token received`);
      console.log(`  → Expires in: ${newTokens.expires_in} seconds`);

      // Update session storage with new tokens
      await qbSessionStorage.updateTokens(sessionId, {
        qbAccessToken: newTokens.access_token,
        qbRefreshToken: newTokens.refresh_token,
        qbTokenExpiresAt: Date.now() + (newTokens.expires_in * 1000),
      });

      console.log('  ✓ Updated session storage with new tokens');
      console.log('  → RealmId preserved: ' + qbSession.realmId);
    } catch (error) {
      console.error('[Token Refresh] Failed to refresh tokens:', error);
      throw new Error('Failed to refresh QuickBooks tokens');
    }
  }

  /**
   * Get time until token expiry in milliseconds
   * @param sessionId Session ID
   * @returns milliseconds until expiry, or null if session not found
   */
  async getTimeUntilExpiry(sessionId: string): Promise<number | null> {
    const qbSessionStorage = getQuickBooksSessionStorage();
    await qbSessionStorage.initialize();

    const qbSession = qbSessionStorage.getSession(sessionId);

    if (!qbSession) {
      return null;
    }

    return qbSession.qbTokenExpiresAt - Date.now();
  }

  /**
   * Check if token is expired
   * @param sessionId Session ID
   * @returns true if expired
   */
  async isTokenExpired(sessionId: string): Promise<boolean> {
    const timeUntilExpiry = await this.getTimeUntilExpiry(sessionId);

    if (timeUntilExpiry === null) {
      return true; // Session not found, consider expired
    }

    return timeUntilExpiry <= 0;
  }

  /**
   * Check if token needs refresh soon (< 5 minutes)
   * @param sessionId Session ID
   * @returns true if needs refresh
   */
  async needsRefresh(sessionId: string): Promise<boolean> {
    const timeUntilExpiry = await this.getTimeUntilExpiry(sessionId);

    if (timeUntilExpiry === null) {
      return true; // Session not found, needs refresh
    }

    const fiveMinutes = 300000;
    return timeUntilExpiry < fiveMinutes;
  }
}

// Singleton instance
let tokenRefreshServiceInstance: TokenRefreshService | null = null;

/**
 * Get token refresh service instance
 * @param quickbooksClient QuickBooks client instance
 */
export function getTokenRefreshService(quickbooksClient: any): TokenRefreshService {
  if (!tokenRefreshServiceInstance) {
    tokenRefreshServiceInstance = new TokenRefreshService(quickbooksClient);
  }
  return tokenRefreshServiceInstance;
}

/**
 * Reset token refresh service (for testing)
 */
export function resetTokenRefreshService(): void {
  tokenRefreshServiceInstance = null;
}
