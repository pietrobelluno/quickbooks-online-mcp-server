/**
 * Authorization Code Storage
 *
 * Stores single-use authorization codes during OAuth 2.0 flow.
 * Implements security best practices:
 * - Short TTL (10 minutes)
 * - Single-use enforcement (prevents replay attacks)
 * - Auto-cleanup of expired codes
 *
 * Storage: In-memory only
 * Purpose: Bridge /oauth/callback to /token endpoint
 */

export interface AuthorizationCode {
  /** Session ID that links to QuickBooks session */
  sessionId: string;

  /** Original state parameter from Claude Desktop */
  claudeState: string;

  /** Timestamp when code was created */
  timestamp: number;

  /** Expiration timestamp (timestamp + 10 minutes) */
  expiresAt: number;

  /** Whether this code has been used (single-use enforcement) */
  used: boolean;
}

class AuthCodeStorage {
  private codes: Map<string, AuthorizationCode> = new Map();
  private cleanupIntervalId?: NodeJS.Timeout;

  constructor() {
    // Auto-cleanup expired codes every 2 minutes
    this.startAutoCleanup();
  }

  /**
   * Store authorization code
   * @param code Authorization code
   * @param data Code data (sessionId, claudeState)
   */
  storeAuthCode(
    code: string,
    data: Pick<AuthorizationCode, 'sessionId' | 'claudeState'>
  ): void {
    const now = Date.now();
    this.codes.set(code, {
      ...data,
      timestamp: now,
      expiresAt: now + 600000, // 10 minutes
      used: false,
    });

    console.log(
      `[Auth Code Storage] Stored code: ${code.substring(0, 16)}... (expires in 10 min)`
    );
  }

  /**
   * Get authorization code data
   * Returns undefined if code not found, expired, or already used
   * @param code Authorization code
   * @returns Code data if valid and unused
   */
  getAuthCode(code: string): AuthorizationCode | undefined {
    const authCode = this.codes.get(code);

    if (!authCode) {
      console.warn(
        `[Auth Code Storage] Code not found: ${code.substring(0, 16)}...`
      );
      return undefined;
    }

    // Check if already used
    if (authCode.used) {
      console.warn(
        `[Auth Code Storage] Code already used (replay attack?): ${code.substring(0, 16)}...`
      );
      return undefined;
    }

    // Check if expired
    if (Date.now() > authCode.expiresAt) {
      console.warn(
        `[Auth Code Storage] Code expired: ${code.substring(0, 16)}...`
      );
      this.codes.delete(code);
      return undefined;
    }

    return authCode;
  }

  /**
   * Mark authorization code as used (single-use enforcement)
   * @param code Authorization code
   * @returns true if marked successfully, false if code not found
   */
  markAsUsed(code: string): boolean {
    const authCode = this.codes.get(code);

    if (!authCode) {
      console.warn(
        `[Auth Code Storage] Cannot mark as used - code not found: ${code.substring(0, 16)}...`
      );
      return false;
    }

    authCode.used = true;
    console.log(
      `[Auth Code Storage] Marked as used: ${code.substring(0, 16)}...`
    );
    return true;
  }

  /**
   * Delete authorization code
   * @param code Authorization code
   */
  deleteAuthCode(code: string): void {
    if (this.codes.delete(code)) {
      console.log(
        `[Auth Code Storage] Deleted code: ${code.substring(0, 16)}...`
      );
    }
  }

  /**
   * Get number of stored codes
   */
  size(): number {
    return this.codes.size;
  }

  /**
   * Clear all codes (for testing)
   */
  clear(): void {
    this.codes.clear();
    console.log('[Auth Code Storage] Cleared all authorization codes');
  }

  /**
   * Start automatic cleanup of expired/used codes
   */
  private startAutoCleanup(): void {
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupExpired();
    }, 120000); // Run every 2 minutes
  }

  /**
   * Clean up expired and used codes
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [code, authCode] of this.codes.entries()) {
      // Remove if expired or used (and older than 5 minutes)
      const shouldRemove =
        now > authCode.expiresAt ||
        (authCode.used && now > authCode.timestamp + 300000);

      if (shouldRemove) {
        this.codes.delete(code);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(
        `[Auth Code Storage] Cleaned up ${cleanedCount} expired/used codes`
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

  /**
   * Get statistics (for monitoring)
   */
  getStats(): {
    total: number;
    used: number;
    unused: number;
    expired: number;
  } {
    const now = Date.now();
    let used = 0;
    let unused = 0;
    let expired = 0;

    for (const authCode of this.codes.values()) {
      if (now > authCode.expiresAt) {
        expired++;
      } else if (authCode.used) {
        used++;
      } else {
        unused++;
      }
    }

    return {
      total: this.codes.size,
      used,
      unused,
      expired,
    };
  }
}

// Singleton instance
let authCodeStorageInstance: AuthCodeStorage | null = null;

/**
 * Get singleton authorization code storage instance
 */
export function getAuthCodeStorage(): AuthCodeStorage {
  if (!authCodeStorageInstance) {
    authCodeStorageInstance = new AuthCodeStorage();
  }
  return authCodeStorageInstance;
}

/**
 * Reset authorization code storage (for testing)
 */
export function resetAuthCodeStorage(): void {
  if (authCodeStorageInstance) {
    authCodeStorageInstance.stopAutoCleanup();
    authCodeStorageInstance = null;
  }
}
