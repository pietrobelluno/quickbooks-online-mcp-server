/**
 * User Realm ID Storage
 *
 * Manages mapping between user IDs and QuickBooks realm IDs (company IDs).
 * Supports multi-user scenarios where each user may access different QuickBooks companies.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface UserRealmMapping {
  [userId: string]: string; // userId -> realmId
}

export class UserRealmStorage {
  private storagePath: string;
  private cache: UserRealmMapping = {};

  constructor(storagePath: string) {
    this.storagePath = storagePath;
    this.ensureStorageExists();
    this.loadFromFile();
  }

  /**
   * Get realm ID for a specific user
   */
  getRealmId(userId: string): string | undefined {
    return this.cache[userId];
  }

  /**
   * Store realm ID for a user
   */
  setRealmId(userId: string, realmId: string): void {
    this.cache[userId] = realmId;
    this.saveToFile();
  }

  /**
   * Check if user has a stored realm ID
   */
  hasRealmId(userId: string): boolean {
    return userId in this.cache;
  }

  /**
   * Remove realm ID for a user
   */
  removeRealmId(userId: string): void {
    delete this.cache[userId];
    this.saveToFile();
  }

  /**
   * Find user ID by realm ID (reverse lookup)
   * Used when QuickBooks calls disconnect endpoint with realm ID
   */
  getUserIdByRealmId(realmId: string): string | undefined {
    for (const [userId, storedRealmId] of Object.entries(this.cache)) {
      if (storedRealmId === realmId) {
        return userId;
      }
    }
    return undefined;
  }

  /**
   * Get all stored mappings
   */
  getAllMappings(): UserRealmMapping {
    return { ...this.cache };
  }

  /**
   * Ensure storage directory and file exist
   */
  private ensureStorageExists(): void {
    const dir = path.dirname(this.storagePath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create empty file if it doesn't exist
    if (!fs.existsSync(this.storagePath)) {
      fs.writeFileSync(this.storagePath, JSON.stringify({}, null, 2));
    }
  }

  /**
   * Load mappings from file
   */
  private loadFromFile(): void {
    try {
      const data = fs.readFileSync(this.storagePath, 'utf-8');
      this.cache = JSON.parse(data);
    } catch (error) {
      console.error('Failed to load user realm mappings:', error);
      this.cache = {};
    }
  }

  /**
   * Save mappings to file
   */
  private saveToFile(): void {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      console.error('Failed to save user realm mappings:', error);
    }
  }
}

// Singleton instance
let storageInstance: UserRealmStorage | null = null;

/**
 * Get or create the storage instance
 */
export function getUserRealmStorage(storagePath?: string): UserRealmStorage {
  if (!storageInstance) {
    const defaultPath = path.join(process.cwd(), 'data', 'user-realms.json');
    storageInstance = new UserRealmStorage(storagePath || defaultPath);
  }
  return storageInstance;
}
