/**
 * SessionLockManager - Prevents race conditions during OAuth authorization
 *
 * When multiple users connect simultaneously, this ensures only one OAuth flow
 * proceeds at a time, preventing duplicate QuickBooks authorization attempts.
 */

class SessionLockManager {
  private locks = new Map<string, Promise<void>>();

  /**
   * Acquire a lock for the given key
   * @param key - Lock identifier (e.g., 'qb-company-auth')
   * @returns Release function to unlock when done
   */
  async acquireLock(key: string): Promise<() => void> {
    // Wait for existing lock to be released
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }

    // Create new lock
    let releaseFn: (() => void) | undefined;
    const lockPromise = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });

    this.locks.set(key, lockPromise);

    // Return release function
    return () => {
      this.locks.delete(key);
      if (releaseFn) {
        releaseFn();
      }
    };
  }

  /**
   * Check if a lock is currently held
   * @param key - Lock identifier
   * @returns true if lock is held
   */
  isLocked(key: string): boolean {
    return this.locks.has(key);
  }

  /**
   * Clear all locks (useful for testing/cleanup)
   */
  clearAll(): void {
    this.locks.clear();
  }
}

// Export singleton instance
export const sessionLockManager = new SessionLockManager();
