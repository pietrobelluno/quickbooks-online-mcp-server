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

// Mutex to prevent concurrent refreshes for the same REALM (company)
// Key is realmId, not sessionId, because multiple sessions can share the same QB connection
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

    // Use mutex based on realmId to prevent concurrent refreshes for the SAME COMPANY
    // This is critical because multiple sessions can share the same QB refresh token
    const realmId = qbSession.realmId;
    if (refreshMutexes.has(realmId)) {
      console.log(`[Token Refresh] Refresh already in progress for company ${realmId}, waiting...`);
      await refreshMutexes.get(realmId);
      // After waiting, re-check if tokens were updated by the other refresh
      const updatedSession = qbSessionStorage.getSession(sessionId);
      if (updatedSession && updatedSession.qbTokenExpiresAt > Date.now() + 300000) {
        console.log(`[Token Refresh] Tokens already refreshed by another session, no action needed`);
        return true;
      }
    }

    const refreshPromise = this.refreshQuickBooksToken(sessionId);
    refreshMutexes.set(realmId, refreshPromise);

    try {
      await refreshPromise;
      return true;
    } finally {
      refreshMutexes.delete(realmId);
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

    const timeUntilExpiry = qbSession.qbTokenExpiresAt - Date.now();
    const isAlreadyExpired = timeUntilExpiry <= 0;

    console.log(`[Token Refresh] Refreshing tokens for session: ${sessionId}`);
    console.log(`  → RealmId: ${qbSession.realmId}`);
    console.log(`  → Token status: ${isAlreadyExpired ? 'EXPIRED' : 'expiring soon'}`);
    console.log(`  → Time until expiry: ${Math.round(timeUntilExpiry / 1000)} seconds`);
    console.log(`  → Refreshing QB tokens...`);

    try {
      // Use the SHARED OAuth client from quickbooksClient (like Intuit's implementation)
      // This is critical - creating new OAuth clients each time may cause issues
      const oauthClient = this.quickbooksClient['oauthClient'];

      if (!oauthClient) {
        throw new Error('OAuth client not available from quickbooksClient');
      }

      console.log(`  → Using shared OAuth client from quickbooksClient`);
      console.log(`  → Refresh token (first 20 chars): ${qbSession.qbRefreshToken.substring(0, 20)}...`);
      console.log(`  → Calling intuit-oauth refreshUsingToken()...`);

      // Refresh the token using refreshUsingToken() method (like Intuit's implementation)
      const response = await oauthClient.refreshUsingToken(qbSession.qbRefreshToken);

      if (!response || !response.token) {
        throw new Error('Invalid response from OAuth refresh');
      }

      const newTokens = response.token;

      if (!newTokens.access_token || !newTokens.refresh_token) {
        throw new Error('Missing tokens in refresh response');
      }

      console.log('  ✓ Successfully refreshed QuickBooks tokens');
      console.log(`  → New access token received (${newTokens.access_token.substring(0, 20)}...)`);
      console.log(`  → New refresh token received (${newTokens.refresh_token.substring(0, 20)}...)`);
      console.log(`  → Expires in: ${newTokens.expires_in} seconds`);

      // CRITICAL: Update ALL sessions for this company (realmId) with new tokens
      // Multiple sessions can share the same QB connection, so they all need the new refresh token
      const allSessions = qbSessionStorage.getAllSessions();
      const sessionsForThisCompany = allSessions.filter(([_, s]) => s.realmId === qbSession.realmId);

      console.log(`  → Updating ${sessionsForThisCompany.length} session(s) for company ${qbSession.realmId}`);

      const tokenUpdate = {
        qbAccessToken: newTokens.access_token,
        qbRefreshToken: newTokens.refresh_token,
        qbTokenExpiresAt: Date.now() + (newTokens.expires_in * 1000),
      };

      for (const [sid, _] of sessionsForThisCompany) {
        await qbSessionStorage.updateTokens(sid, tokenUpdate);
        console.log(`    ✓ Updated session: ${sid.substring(0, 8)}...`);
      }

      console.log('  ✓ All sessions updated with new tokens');
      console.log('  → RealmId preserved: ' + qbSession.realmId);
    } catch (error: any) {
      console.error('[Token Refresh] Failed to refresh tokens');
      console.error(`  → Error type: ${error.constructor.name}`);
      console.error(`  → Error message: ${error.message}`);

      // Log additional details from intuit-oauth errors
      if (error.intuit_tid) {
        console.error(`  → Intuit TID: ${error.intuit_tid}`);
      }
      if (error.authResponse) {
        console.error(`  → Auth response:`, JSON.stringify(error.authResponse, null, 2));
      }
      if (error.originalMessage) {
        console.error(`  → Original message: ${error.originalMessage}`);
      }

      // Log the FULL error object to see all properties
      console.error(`  → Full error object keys:`, Object.keys(error));
      console.error(`  → Full error object:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

      // Check for error_description and error properties (OAuth standard)
      if (error.error) {
        console.error(`  → OAuth error code: ${error.error}`);
      }
      if (error.error_description) {
        console.error(`  → OAuth error description: ${error.error_description}`);
      }

      // Throw with more context
      throw new Error(`Failed to refresh QuickBooks tokens: ${error.message}`);
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
