/**
 * Server Configuration
 *
 * Manages server settings for different deployment modes:
 * - Development: stdio transport with .env OAuth
 * - Production: HTTP transport with Copilot Studio OAuth
 */

export interface ServerConfig {
  /** Server port for HTTP transport (default: 8080) */
  port: number;

  /** Transport mode: 'http' for Copilot Studio, 'stdio' for Claude Desktop */
  transport: 'http' | 'stdio';

  /** Auth mode: 'external' for Copilot Studio OAuth, 'internal' for .env tokens */
  authMode: 'external' | 'internal';

  /** Path to user-realm ID mapping storage */
  realmIdStoragePath: string;
}

/**
 * Load server configuration from environment variables
 */
export function loadConfig(): ServerConfig {
  return {
    port: parseInt(process.env.PORT || '8080', 10),
    transport: (process.env.TRANSPORT as 'http' | 'stdio') || 'http',
    authMode: (process.env.AUTH_MODE as 'external' | 'internal') || 'external',
    realmIdStoragePath: process.env.REALM_ID_STORAGE_PATH || './data/user-realms.json',
  };
}

/**
 * Get current server configuration
 */
export const config = loadConfig();
