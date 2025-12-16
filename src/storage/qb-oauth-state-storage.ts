/**
 * QuickBooks OAuth State Storage
 *
 * Temporarily stores QuickBooks OAuth state during the OAuth flow.
 * Bridges Claude Desktop state to QuickBooks OAuth callback.
 *
 * Flow:
 * 1. /authorize receives claudeState from Claude Desktop
 * 2. Generate qbState and store {claudeState, sessionId}
 * 3. Redirect to QuickBooks with qbState
 * 4. /oauth/callback receives qbState
 * 5. Decode qbState to get claudeState and sessionId
 * 6. Use sessionId to store QB session
 * 7. Use claudeState to redirect back to Claude
 *
 * Storage: In-memory with 10-minute TTL
 * Purpose: Bridge /authorize → QuickBooks → /oauth/callback
 */

export interface QuickBooksOAuthState {
  /** Original state parameter from Claude Desktop */
  claudeState: string;

  /** Session ID generated for this OAuth flow */
  sessionId: string;

  /** Timestamp when state was created */
  timestamp: number;
}

class QBOAuthStateStorage {
  private states: Map<string, QuickBooksOAuthState> = new Map();
  private cleanupIntervalId?: NodeJS.Timeout;

  constructor() {
    // Auto-cleanup expired states every 2 minutes
    this.startAutoCleanup();
  }

  /**
   * Store QuickBooks OAuth state
   * @param qbState QuickBooks OAuth state (base64url encoded)
   * @param data State data (claudeState, sessionId)
   */
  storeQBState(
    qbState: string,
    data: Omit<QuickBooksOAuthState, 'timestamp'>
  ): void {
    this.states.set(qbState, {
      ...data,
      timestamp: Date.now(),
    });

    console.log(
      `[QB OAuth State Storage] Stored qbState: ${qbState.substring(0, 20)}... → claudeState: ${data.claudeState.substring(0, 20)}...`
    );
  }

  /**
   * Get QuickBooks OAuth state
   * @param qbState QuickBooks OAuth state
   * @returns State data if found and not expired
   */
  getQBState(qbState: string): QuickBooksOAuthState | undefined {
    const state = this.states.get(qbState);

    if (!state) {
      console.warn(
        `[QB OAuth State Storage] State not found: ${qbState.substring(0, 20)}...`
      );
      return undefined;
    }

    // Check if expired (10 minutes TTL)
    const expiresAt = state.timestamp + 600000; // 10 minutes
    if (Date.now() > expiresAt) {
      console.warn(
        `[QB OAuth State Storage] State expired: ${qbState.substring(0, 20)}...`
      );
      this.states.delete(qbState);
      return undefined;
    }

    return state;
  }

  /**
   * Delete QuickBooks OAuth state after use
   * @param qbState QuickBooks OAuth state
   */
  deleteQBState(qbState: string): void {
    if (this.states.delete(qbState)) {
      console.log(
        `[QB OAuth State Storage] Deleted state: ${qbState.substring(0, 20)}...`
      );
    }
  }

  /**
   * Get number of stored states
   */
  size(): number {
    return this.states.size;
  }

  /**
   * Clear all states (for testing)
   */
  clear(): void {
    this.states.clear();
    console.log('[QB OAuth State Storage] Cleared all states');
  }

  /**
   * Start automatic cleanup of expired states
   */
  private startAutoCleanup(): void {
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupExpired();
    }, 120000); // Run every 2 minutes
  }

  /**
   * Clean up expired states
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [qbState, state] of this.states.entries()) {
      const expiresAt = state.timestamp + 600000; // 10 minutes
      if (now > expiresAt) {
        this.states.delete(qbState);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(
        `[QB OAuth State Storage] Cleaned up ${expiredCount} expired states`
      );
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
let qbOAuthStateStorageInstance: QBOAuthStateStorage | null = null;

/**
 * Get singleton QuickBooks OAuth state storage instance
 */
export function getQBOAuthStateStorage(): QBOAuthStateStorage {
  if (!qbOAuthStateStorageInstance) {
    qbOAuthStateStorageInstance = new QBOAuthStateStorage();
  }
  return qbOAuthStateStorageInstance;
}

/**
 * Reset QuickBooks OAuth state storage (for testing)
 */
export function resetQBOAuthStateStorage(): void {
  if (qbOAuthStateStorageInstance) {
    qbOAuthStateStorageInstance.stopAutoCleanup();
    qbOAuthStateStorageInstance = null;
  }
}
