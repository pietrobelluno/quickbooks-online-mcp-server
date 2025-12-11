/**
 * OAuth State Storage
 *
 * Temporarily stores realmId keyed by OAuth state parameter.
 * This bridges the gap between OAuth callback (has realmId + state)
 * and first API call (has user ID from Copilot Studio).
 *
 * Flow:
 * 1. OAuth callback: state → realmId (temporary, 10 min TTL)
 * 2. First API call: extract state from custom header (if Copilot Studio provides it)
 * 3. Look up realmId using state
 * 4. Store in permanent user-realm mapping
 * 5. Clear temporary state entry
 */

interface StateRealmMapping {
  realmId: string;
  timestamp: number; // for expiry (states only valid ~10 mins)
}

class OAuthStateStorage {
  private stateToRealm: Map<string, StateRealmMapping> = new Map();
  private readonly TTL = 10 * 60 * 1000; // 10 minutes

  /**
   * Store realm ID temporarily keyed by OAuth state
   */
  setRealmIdForState(state: string, realmId: string): void {
    this.stateToRealm.set(state, {
      realmId,
      timestamp: Date.now(),
    });
    console.log(`  ✓ Stored temporary mapping: state → realm ${realmId}`);

    // Auto-cleanup expired entries
    this.cleanup();
  }

  /**
   * Get realm ID for a state token
   */
  getRealmIdForState(state: string): string | undefined {
    const entry = this.stateToRealm.get(state);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.TTL) {
      this.stateToRealm.delete(state);
      return undefined;
    }

    return entry.realmId;
  }

  /**
   * Remove state entry after successfully mapping to user
   */
  clearState(state: string): void {
    this.stateToRealm.delete(state);
    console.log(`  ✓ Cleared temporary state mapping`);
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [state, entry] of this.stateToRealm.entries()) {
      if (now - entry.timestamp > this.TTL) {
        this.stateToRealm.delete(state);
      }
    }
  }

  /**
   * Get all active mappings (for debugging)
   */
  getAllMappings(): Array<{ state: string; realmId: string; age: number }> {
    const now = Date.now();
    return Array.from(this.stateToRealm.entries()).map(([state, entry]) => ({
      state: state.substring(0, 20) + '...',
      realmId: entry.realmId,
      age: Math.floor((now - entry.timestamp) / 1000), // seconds
    }));
  }
}

// Singleton instance
const oauthStateStorage = new OAuthStateStorage();

export function storeRealmIdByState(state: string, realmId: string): void {
  oauthStateStorage.setRealmIdForState(state, realmId);
}

export function getRealmIdByState(state: string): string | undefined {
  return oauthStateStorage.getRealmIdForState(state);
}

export function clearOAuthState(state: string): void {
  oauthStateStorage.clearState(state);
}

export function getActiveOAuthStates(): Array<{ state: string; realmId: string; age: number }> {
  return oauthStateStorage.getAllMappings();
}
