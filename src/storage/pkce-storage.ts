/**
 * PKCE Challenge Storage
 *
 * Stores PKCE (Proof Key for Code Exchange) challenges during OAuth 2.0 flow.
 * Implements RFC 7636 for enhanced security in OAuth authorization code flow.
 *
 * Storage: In-memory with 10-minute TTL
 * Purpose: Bridge /authorize endpoint to /token endpoint with PKCE verification
 */

export interface PKCEChallenge {
  /** SHA256 hash of code_verifier, base64url encoded */
  codeChallenge: string;

  /** Challenge method: 'S256' (SHA256) or 'plain' */
  codeChallengeMethod: 'S256' | 'plain';

  /** Redirect URI from authorization request */
  redirectUri: string;

  /** Client ID from authorization request (for validation in token exchange) */
  clientId: string;

  /** Timestamp when challenge was stored */
  timestamp: number;
}

class PKCEStorage {
  private challenges: Map<string, PKCEChallenge> = new Map();
  private cleanupIntervalId?: NodeJS.Timeout;

  constructor() {
    // Auto-cleanup expired challenges every 2 minutes
    this.startAutoCleanup();
  }

  /**
   * Store PKCE challenge for a given state
   * @param state OAuth state parameter from Claude Desktop
   * @param challenge PKCE challenge data
   */
  storePKCE(state: string, challenge: Omit<PKCEChallenge, 'timestamp'>): void {
    this.challenges.set(state, {
      ...challenge,
      timestamp: Date.now(),
    });

    console.log(`[PKCE Storage] Stored challenge for state: ${state.substring(0, 20)}...`);
  }

  /**
   * Retrieve PKCE challenge for a given state
   * @param state OAuth state parameter
   * @returns PKCE challenge if found and not expired, undefined otherwise
   */
  getPKCE(state: string): PKCEChallenge | undefined {
    const challenge = this.challenges.get(state);

    if (!challenge) {
      console.warn(`[PKCE Storage] Challenge not found for state: ${state.substring(0, 20)}...`);
      return undefined;
    }

    // Check if expired (10 minutes TTL)
    const expiresAt = challenge.timestamp + 600000; // 10 minutes
    if (Date.now() > expiresAt) {
      console.warn(`[PKCE Storage] Challenge expired for state: ${state.substring(0, 20)}...`);
      this.challenges.delete(state);
      return undefined;
    }

    return challenge;
  }

  /**
   * Delete PKCE challenge after use
   * @param state OAuth state parameter
   */
  deletePKCE(state: string): void {
    if (this.challenges.delete(state)) {
      console.log(`[PKCE Storage] Deleted challenge for state: ${state.substring(0, 20)}...`);
    }
  }

  /**
   * Get number of stored challenges
   */
  size(): number {
    return this.challenges.size;
  }

  /**
   * Clear all challenges (for testing)
   */
  clear(): void {
    this.challenges.clear();
    console.log('[PKCE Storage] Cleared all challenges');
  }

  /**
   * Start automatic cleanup of expired challenges
   */
  private startAutoCleanup(): void {
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupExpired();
    }, 120000); // Run every 2 minutes
  }

  /**
   * Clean up expired challenges
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [state, challenge] of this.challenges.entries()) {
      const expiresAt = challenge.timestamp + 600000; // 10 minutes
      if (now > expiresAt) {
        this.challenges.delete(state);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`[PKCE Storage] Cleaned up ${expiredCount} expired challenges`);
    }
  }

  /**
   * Stop automatic cleanup (for testing or shutdown)
   */
  stopAutoCleanup(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = undefined;
    }
  }
}

// Singleton instance
let pkceStorageInstance: PKCEStorage | null = null;

/**
 * Get singleton PKCE storage instance
 */
export function getPKCEStorage(): PKCEStorage {
  if (!pkceStorageInstance) {
    pkceStorageInstance = new PKCEStorage();
  }
  return pkceStorageInstance;
}

/**
 * Reset PKCE storage (for testing)
 */
export function resetPKCEStorage(): void {
  if (pkceStorageInstance) {
    pkceStorageInstance.stopAutoCleanup();
    pkceStorageInstance = null;
  }
}
