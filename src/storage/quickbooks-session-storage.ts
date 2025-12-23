/**
 * QuickBooks Session Storage
 *
 * **THE SOLUTION TO REALMID PRESERVATION!**
 *
 * Stores QuickBooks OAuth tokens + realmId for each user session.
 * This is the critical module that answers the user's question:
 * "how it will get the refresh access token and realm id?"
 *
 * Answer: Everything is stored here server-side, linked by sessionId!
 *
 * Storage: Persistent S3/file-based with in-memory cache
 * Purpose: Store QB access token, refresh token, and realmId per session
 * Survives: Server restarts, device changes - works across all devices!
 */

import { getS3StorageAdapter } from './s3-storage-adapter.js';

export interface QuickBooksSession {
  /** QuickBooks OAuth access token (1 hour expiry) */
  qbAccessToken: string;

  /** QuickBooks OAuth refresh token (100 days, refreshes on use) */
  qbRefreshToken: string;

  /** QuickBooks token expiration timestamp */
  qbTokenExpiresAt: number;

  /** QuickBooks realm ID (company ID) - THE CRITICAL PIECE! */
  realmId: string;

  /** Optional user identifier */
  userId?: string;

  /** Timestamp when session was created */
  createdAt: number;

  /** Timestamp when session was last used */
  lastUsedAt: number;
}

class QuickBooksSessionStorage {
  private sessions: Map<string, QuickBooksSession> = new Map();
  private filePath: string;
  private loaded: boolean = false;
  private saveTimeout?: NodeJS.Timeout;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Initialize storage (load from S3 or disk)
   */
  async initialize(): Promise<void> {
    if (this.loaded) return;

    try {
      const storageAdapter = getS3StorageAdapter();

      // Try to load existing data
      const data = await storageAdapter.read(this.filePath);

      if (data) {
        const parsed = JSON.parse(data);

        // Load sessions into memory
        for (const [sessionId, session] of Object.entries(parsed)) {
          this.sessions.set(sessionId, session as QuickBooksSession);
        }

        console.log(
          `[QB Session Storage] Loaded ${this.sessions.size} sessions from ${storageAdapter.isS3() ? 'S3' : 'local file'}`
        );
      } else {
        console.log(
          `[QB Session Storage] No existing data, starting fresh`
        );
      }

      this.loaded = true;
    } catch (error) {
      console.error('[QB Session Storage] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Store QuickBooks session
   * **THIS IS WHERE THE REALMID IS STORED!**
   * @param sessionId Session identifier
   * @param session Session data including realmId
   */
  async storeSession(
    sessionId: string,
    session: Omit<QuickBooksSession, 'lastUsedAt'>
  ): Promise<void> {
    await this.ensureLoaded();

    this.sessions.set(sessionId, {
      ...session,
      lastUsedAt: Date.now(),
    });

    console.log(
      `[QB Session Storage] Stored session: ${sessionId} → realmId: ${session.realmId}`
    );
    console.log(`  ✓ QB access token stored`);
    console.log(`  ✓ QB refresh token stored`);
    console.log(
      `  ✓ Token expires: ${new Date(session.qbTokenExpiresAt).toISOString()}`
    );

    // Schedule save (debounced)
    this.scheduleSave();
  }

  /**
   * Get QuickBooks session
   * **THIS IS HOW MOBILE/DESKTOP GET THE REALMID!**
   * @param sessionId Session identifier
   * @returns Session data including realmId, tokens
   */
  getSession(sessionId: string): QuickBooksSession | undefined {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return undefined;
    }

    // Update last used timestamp
    session.lastUsedAt = Date.now();

    return session;
  }

  /**
   * Update QuickBooks tokens after refresh
   * @param sessionId Session identifier
   * @param tokens New token data
   */
  async updateTokens(
    sessionId: string,
    tokens: Pick<
      QuickBooksSession,
      'qbAccessToken' | 'qbRefreshToken' | 'qbTokenExpiresAt'
    >
  ): Promise<void> {
    await this.ensureLoaded();

    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(
        `[QB Session Storage] Cannot update tokens - session not found: ${sessionId}`
      );
      return;
    }

    session.qbAccessToken = tokens.qbAccessToken;
    session.qbRefreshToken = tokens.qbRefreshToken;
    session.qbTokenExpiresAt = tokens.qbTokenExpiresAt;
    session.lastUsedAt = Date.now();

    console.log(
      `[QB Session Storage] Updated tokens for session: ${sessionId} → realmId: ${session.realmId}`
    );
    console.log(
      `  ✓ New token expires: ${new Date(tokens.qbTokenExpiresAt).toISOString()}`
    );

    this.scheduleSave();
  }

  /**
   * Delete QuickBooks session
   * @param sessionId Session identifier
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.ensureLoaded();

    const session = this.sessions.get(sessionId);
    if (session && this.sessions.delete(sessionId)) {
      console.log(
        `[QB Session Storage] Deleted session: ${sessionId} (realmId: ${session.realmId})`
      );
      this.scheduleSave();
    }
  }

  /**
   * Get session ID by realm ID (reverse lookup)
   * Useful for /disconnect endpoint
   * @param realmId QuickBooks realm ID
   * @returns Session ID if found
   */
  getSessionIdByRealmId(realmId: string): string | undefined {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.realmId === realmId) {
        return sessionId;
      }
    }
    return undefined;
  }

  /**
   * Get session by realm ID (for shared company connections)
   * Returns the first session found for this company
   * @param realmId QuickBooks realm ID
   * @returns Session data if found, including sessionId
   */
  getSessionByRealmId(realmId: string): { sessionId: string; session: QuickBooksSession } | undefined {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.realmId === realmId) {
        // Update last used timestamp
        session.lastUsedAt = Date.now();
        return { sessionId, session };
      }
    }
    return undefined;
  }

  /**
   * Get all sessions for a given user ID
   * @param userId User identifier
   * @returns Array of session IDs
   */
  getSessionIdsByUserId(userId: string): string[] {
    const sessionIds: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        sessionIds.push(sessionId);
      }
    }

    return sessionIds;
  }

  /**
   * Get number of stored sessions
   */
  size(): number {
    return this.sessions.size;
  }

  /**
   * Clear all sessions (for testing)
   */
  async clear(): Promise<void> {
    await this.ensureLoaded();
    this.sessions.clear();
    await this.save();
    console.log('[QB Session Storage] Cleared all sessions');
  }

  /**
   * Get statistics (for monitoring)
   */
  getStats(): {
    total: number;
    expiringSoon: number;
    expired: number;
  } {
    const now = Date.now();
    const fiveMinutes = 300000;
    let expiringSoon = 0;
    let expired = 0;

    for (const session of this.sessions.values()) {
      const timeUntilExpiry = session.qbTokenExpiresAt - now;

      if (timeUntilExpiry <= 0) {
        expired++;
      } else if (timeUntilExpiry <= fiveMinutes) {
        expiringSoon++;
      }
    }

    return {
      total: this.sessions.size,
      expiringSoon,
      expired,
    };
  }

  /**
   * Get all realm IDs (for debugging)
   */
  getAllRealmIds(): string[] {
    return Array.from(this.sessions.values()).map((s) => s.realmId);
  }

  /**
   * Get all sessions (for token refresh updates across shared connections)
   * @returns Array of [sessionId, session] tuples
   */
  getAllSessions(): Array<[string, QuickBooksSession]> {
    return Array.from(this.sessions.entries());
  }

  /**
   * Schedule save to disk (debounced to avoid frequent writes)
   */
  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.save().catch((err) =>
        console.error('[QB Session Storage] Failed to save:', err)
      );
    }, 1000); // Debounce 1 second
  }

  /**
   * Save sessions to S3 or disk
   * **THIS IS WHY MOBILE/DESKTOP BOTH WORK - DATA PERSISTS!**
   */
  private async save(): Promise<void> {
    try {
      const storageAdapter = getS3StorageAdapter();

      // Convert Map to plain object
      const data: Record<string, QuickBooksSession> = {};
      for (const [sessionId, session] of this.sessions.entries()) {
        data[sessionId] = session;
      }

      // Write to S3 or file
      await storageAdapter.write(this.filePath, JSON.stringify(data, null, 2));

      console.log(
        `[QB Session Storage] Saved ${this.sessions.size} sessions to ${storageAdapter.isS3() ? 'S3' : 'local file'}`
      );
    } catch (error) {
      console.error('[QB Session Storage] Failed to save:', error);
      throw error;
    }
  }

  /**
   * Ensure storage is loaded
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.initialize();
    }
  }
}

// Singleton instance
let qbSessionStorageInstance: QuickBooksSessionStorage | null = null;

/**
 * Get singleton QuickBooks session storage instance
 * @param filePath Storage file path (default: ./data/qb-sessions.json)
 */
export function getQuickBooksSessionStorage(
  filePath: string = './data/qb-sessions.json'
): QuickBooksSessionStorage {
  if (!qbSessionStorageInstance) {
    qbSessionStorageInstance = new QuickBooksSessionStorage(filePath);
  }
  return qbSessionStorageInstance;
}

/**
 * Reset QuickBooks session storage (for testing)
 */
export function resetQuickBooksSessionStorage(): void {
  qbSessionStorageInstance = null;
}
