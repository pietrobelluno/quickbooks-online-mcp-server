/**
 * Server Configuration
 *
 * Manages server settings for different deployment modes:
 * - Development: stdio transport with .env OAuth
 * - Production: HTTP transport with Claude Desktop OAuth
 */

export interface ServerConfig {
  /** Server port for HTTP transport (default: 8080) */
  port: number;

  /** Transport mode: 'http' for Claude Desktop, 'stdio' for local dev */
  transport: 'http' | 'stdio';

  /** Auth mode: 'claude-desktop' for Claude OAuth, 'internal' for .env tokens */
  authMode: 'claude-desktop' | 'internal';

  /** Claude Desktop OAuth client ID */
  claudeClientId?: string;

  /** Claude Desktop OAuth redirect URI */
  claudeRedirectUri: string;

  /** Path to MCP token storage */
  mcpTokenStoragePath: string;

  /** Path to QuickBooks session storage */
  qbSessionStoragePath: string;

  /** QuickBooks OAuth configuration */
  quickbooksClientId: string;
  quickbooksClientSecret: string;
  quickbooksRedirectUri: string;
  quickbooksEnvironment: string;
}

/**
 * Load server configuration from environment variables
 */
export function loadConfig(): ServerConfig {
  return {
    port: parseInt(process.env.PORT || '8080', 10),
    transport: (process.env.TRANSPORT as 'http' | 'stdio') || 'http',
    authMode: (process.env.AUTH_MODE as 'claude-desktop' | 'internal') || 'claude-desktop',

    // Claude Desktop OAuth
    claudeClientId: process.env.CLAUDE_CLIENT_ID,
    claudeRedirectUri: process.env.CLAUDE_REDIRECT_URI || 'https://claude.ai/api/mcp/auth_callback',

    // Storage paths
    mcpTokenStoragePath: process.env.MCP_TOKEN_STORAGE_PATH || './data/mcp-tokens.json',
    qbSessionStoragePath: process.env.QB_SESSION_STORAGE_PATH || './data/qb-sessions.json',

    // QuickBooks OAuth (required)
    quickbooksClientId: process.env.QUICKBOOKS_CLIENT_ID || '',
    quickbooksClientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || '',
    quickbooksRedirectUri: process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:8080/oauth/callback',
    quickbooksEnvironment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
  };
}

/**
 * Get current server configuration
 */
export const config = loadConfig();
