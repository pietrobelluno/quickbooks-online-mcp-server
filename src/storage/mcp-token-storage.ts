/**
 * MCP Token Storage
 *
 * Stores MCP tokens issued to Claude Desktop after OAuth completion.
 * Tokens link to QuickBooks sessions which contain realmId and QB tokens.
 *
 * Storage: Persistent S3/file-based with in-memory cache
 * Purpose: Authenticate all /mcp requests from Claude Desktop
 * Expiration: 1 hour (3600 seconds)
 */

import { getS3StorageAdapter } from './s3-storage-adapter.js';

export interface MCPTokenSession {
  /** Session ID that links to QuickBooks session */
  sessionId: string;

  /** Optional user identifier */
  userId?: string;

  /** Timestamp when token was issued */
  issuedAt: number;

  /** Expiration timestamp (issuedAt + 1 hour) */
  expiresAt: number;

  /** Refresh token for renewing access without re-authentication */
  refreshToken?: string;

  /** Refresh token expiration (7 days) */
  refreshTokenExpiresAt?: number;
}

class MCPTokenStorage {
  private tokens: Map<string, MCPTokenSession> = new Map();
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

        // Load tokens into memory
        for (const [token, session] of Object.entries(parsed)) {
          this.tokens.set(token, session as MCPTokenSession);
        }

        console.log(
          `[MCP Token Storage] Loaded ${this.tokens.size} tokens from ${storageAdapter.isS3() ? 'S3' : 'local file'}`
        );

        // Clean up expired tokens after loading
        this.cleanupExpired();
      } else {
        console.log(
          `[MCP Token Storage] No existing data, starting fresh`
        );
      }

      this.loaded = true;
    } catch (error) {
      console.error('[MCP Token Storage] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Store MCP token
   * @param token MCP token (format: mcp_...)
   * @param session Token session data
   */
  async storeToken(
    token: string,
    session: Omit<MCPTokenSession, 'issuedAt' | 'expiresAt' | 'refreshTokenExpiresAt'>
  ): Promise<void> {
    await this.ensureLoaded();

    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000; // 7 days for refresh token

    this.tokens.set(token, {
      ...session,
      issuedAt: now,
      expiresAt: now + 3600000, // 1 hour for access token
      refreshTokenExpiresAt: session.refreshToken ? now + SEVEN_DAYS : undefined,
    });

    console.log(
      `[MCP Token Storage] Stored token: ${token.substring(0, 20)}... → session: ${session.sessionId}`
    );

    // Schedule save (debounced)
    this.scheduleSave();
  }

  /**
   * Get MCP token session
   * Returns undefined if token not found or expired
   * @param token MCP token
   * @returns Token session data if valid
   */
  getToken(token: string): MCPTokenSession | undefined {
    const session = this.tokens.get(token);

    if (!session) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > session.expiresAt) {
      console.warn(
        `[MCP Token Storage] Token expired`
      );
      this.tokens.delete(token);
      this.scheduleSave();
      return undefined;
    }

    return session;
  }

  /**
   * Delete MCP token
   * @param token MCP token
   */
  async deleteToken(token: string): Promise<void> {
    await this.ensureLoaded();

    if (this.tokens.delete(token)) {
      console.log(
        `[MCP Token Storage] Deleted token`
      );
      this.scheduleSave();
    }
  }

  /**
   * Get all tokens for a given session ID
   * @param sessionId Session ID
   * @returns Array of token strings
   */
  getTokensBySessionId(sessionId: string): string[] {
    const tokens: string[] = [];

    for (const [token, session] of this.tokens.entries()) {
      if (session.sessionId === sessionId && Date.now() <= session.expiresAt) {
        tokens.push(token);
      }
    }

    return tokens;
  }

  /**
   * Delete all tokens for a given session ID
   * @param sessionId Session ID
   * @returns Number of tokens deleted
   */
  async deleteTokensBySessionId(sessionId: string): Promise<number> {
    await this.ensureLoaded();

    let deletedCount = 0;

    for (const [token, session] of this.tokens.entries()) {
      if (session.sessionId === sessionId) {
        this.tokens.delete(token);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(
        `[MCP Token Storage] Deleted ${deletedCount} tokens for session: ${sessionId}`
      );
      this.scheduleSave();
    }

    return deletedCount;
  }

  /**
   * Get session by refresh token
   * @param refreshToken Refresh token
   * @returns MCPTokenSession and its access token if found
   */
  getSessionByRefreshToken(refreshToken: string): { accessToken: string; session: MCPTokenSession } | undefined {
    for (const [token, session] of this.tokens.entries()) {
      if (session.refreshToken === refreshToken) {
        // Check if refresh token is expired
        if (session.refreshTokenExpiresAt && Date.now() > session.refreshTokenExpiresAt) {
          console.warn(`[MCP Token Storage] Refresh token expired`);
          return undefined;
        }
        return { accessToken: token, session };
      }
    }
    return undefined;
  }

  /**
   * Get number of stored tokens
   */
  size(): number {
    return this.tokens.size;
  }

  /**
   * Clear all tokens (for testing)
   */
  async clear(): Promise<void> {
    await this.ensureLoaded();
    this.tokens.clear();
    await this.save();
    console.log('[MCP Token Storage] Cleared all tokens');
  }

  /**
   * Clean up expired tokens
   * @returns Number of tokens cleaned up
   */
  cleanupExpired(): number {
    const now = Date.now();
    let expiredCount = 0;

    for (const [token, session] of this.tokens.entries()) {
      if (now > session.expiresAt) {
        this.tokens.delete(token);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(
        `[MCP Token Storage] Cleaned up ${expiredCount} expired tokens`
      );
      this.scheduleSave();
    }

    return expiredCount;
  }

  /**
   * Get statistics (for monitoring)
   */
  getStats(): {
    total: number;
    expired: number;
    valid: number;
  } {
    const now = Date.now();
    let expired = 0;
    let valid = 0;

    for (const session of this.tokens.values()) {
      if (now > session.expiresAt) {
        expired++;
      } else {
        valid++;
      }
    }

    return {
      total: this.tokens.size,
      expired,
      valid,
    };
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
        console.error('[MCP Token Storage] Failed to save:', err)
      );
    }, 1000); // Debounce 1 second
  }

  /**
   * Save tokens to disk
   */
  private async save(): Promise<void> {
    try {
      const storageAdapter = getS3StorageAdapter();

      // Clean up expired before saving
      this.cleanupExpired();

      // Convert Map to plain object
      const data: Record<string, MCPTokenSession> = {};
      for (const [token, session] of this.tokens.entries()) {
        data[token] = session;
      }

      // Write to S3 or file
      await storageAdapter.write(this.filePath, JSON.stringify(data, null, 2));

      console.log(
        `[MCP Token Storage] Saved ${this.tokens.size} tokens to ${storageAdapter.isS3() ? 'S3' : 'local file'}`
      );
    } catch (error) {
      console.error('[MCP Token Storage] Failed to save:', error);
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
let mcpTokenStorageInstance: MCPTokenStorage | null = null;

/**
 * Get singleton MCP token storage instance
 * @param filePath Storage file path (default: ./data/mcp-tokens.json)
 */
export function getMCPTokenStorage(
  filePath: string = './data/mcp-tokens.json'
): MCPTokenStorage {
  if (!mcpTokenStorageInstance) {
    mcpTokenStorageInstance = new MCPTokenStorage(filePath);
  }
  return mcpTokenStorageInstance;
}

/**
 * Reset MCP token storage (for testing)
 */
export function resetMCPTokenStorage(): void {
  mcpTokenStorageInstance = null;
}
