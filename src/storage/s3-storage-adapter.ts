/**
 * S3 Storage Adapter
 *
 * Replaces file-based storage with S3 for App Runner deployment.
 * Provides persistent storage across container restarts.
 *
 * Usage:
 * - Wraps existing storage classes
 * - Transparent S3 operations (read/write)
 * - Falls back to local storage in development
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import path from 'path';

export interface S3StorageConfig {
  bucketName: string;
  region: string;
  useS3: boolean; // false = local file storage (dev), true = S3 (production)
}

export class S3StorageAdapter {
  private s3Client: S3Client;
  private config: S3StorageConfig;

  constructor(config: S3StorageConfig) {
    this.config = config;
    this.s3Client = new S3Client({ region: config.region });
  }

  /**
   * Read data from S3 or local file
   * @param key S3 key or file path
   * @returns JSON data as string
   */
  async read(key: string): Promise<string | null> {
    if (!this.config.useS3) {
      // Development: Use local file storage
      try {
        return await fs.readFile(key, 'utf-8');
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          return null; // File doesn't exist
        }
        throw error;
      }
    }

    // Production: Use S3
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      const bodyString = await response.Body!.transformToString();
      return bodyString;
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return null; // Object doesn't exist
      }
      console.error(`[S3 Storage] Error reading ${key}:`, error);
      throw error;
    }
  }

  /**
   * Write data to S3 or local file
   * @param key S3 key or file path
   * @param data JSON data as string
   */
  async write(key: string, data: string): Promise<void> {
    if (!this.config.useS3) {
      // Development: Use local file storage
      const dir = path.dirname(key);
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      await fs.writeFile(key, data, 'utf-8');
      await fs.chmod(key, 0o600);
      return;
    }

    // Production: Use S3
    try {
      const command = new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
        Body: data,
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256', // Encrypt at rest
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error(`[S3 Storage] Error writing ${key}:`, error);
      throw error;
    }
  }

  /**
   * Check if storage backend is S3
   */
  isS3(): boolean {
    return this.config.useS3;
  }
}

// Singleton instance
let s3StorageAdapterInstance: S3StorageAdapter | null = null;

/**
 * Get S3 storage adapter instance
 */
export function getS3StorageAdapter(): S3StorageAdapter {
  if (!s3StorageAdapterInstance) {
    const useS3 = process.env.USE_S3_STORAGE === 'true';
    const bucketName = process.env.S3_STORAGE_BUCKET || 'quickbooks-mcp-sessions';
    const region = process.env.AWS_REGION || 'us-east-1';

    s3StorageAdapterInstance = new S3StorageAdapter({
      bucketName,
      region,
      useS3,
    });

    console.log(`[S3 Storage] Initialized with ${useS3 ? 'S3' : 'local file'} storage`);
    console.log(`  → Bucket: ${bucketName}`);
    console.log(`  → Region: ${region}`);
  }

  return s3StorageAdapterInstance;
}

/**
 * Reset adapter (for testing)
 */
export function resetS3StorageAdapter(): void {
  s3StorageAdapterInstance = null;
}
