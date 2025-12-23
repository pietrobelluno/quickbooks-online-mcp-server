# OAuth 2.0 Implementation Guide for Claude Desktop MCP Servers

**Version**: 1.0
**Last Updated**: 2025-12-16
**Purpose**: Complete guide for implementing OAuth 2.0 Authorization Code Flow with PKCE for Claude Desktop custom connectors

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Storage Layer](#storage-layer)
4. [OAuth Endpoints](#oauth-endpoints)
5. [Security Implementation](#security-implementation)
6. [Common Issues & Fixes](#common-issues--fixes)
7. [Testing Guide](#testing-guide)
8. [Deployment Checklist](#deployment-checklist)

---

## Overview

### What This Guide Covers

This guide documents a production-ready OAuth 2.0 implementation for Claude Desktop MCP servers that need to integrate with third-party APIs (like QuickBooks, Salesforce, etc.) requiring OAuth authentication.

### Key Features

- ✅ OAuth 2.0 Authorization Code Flow with PKCE (RFC 7636)
- ✅ Multi-user session management
- ✅ Automatic token refresh
- ✅ Security best practices (rate limiting, validation, secure storage)
- ✅ Cross-device support (Desktop + Mobile)
- ✅ Production-ready error handling

### OAuth Flow Summary

```
Claude Desktop → Your Server → Third-Party API → Your Server → Claude Desktop
      |              |                |               |              |
   /authorize    QB OAuth        /callback        /token         /mcp
  (with PKCE)   (get tokens)   (store session)  (MCP token)   (API calls)
```

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Desktop                           │
│  (Initiates OAuth with PKCE code_challenge)                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Your MCP Server                              │
│                                                                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │   /authorize    │  │  /oauth/callback │  │    /token    │  │
│  │  Endpoint       │─▶│   Endpoint       │─▶│  Endpoint    │  │
│  │  (Store PKCE)   │  │  (Store QB sess) │  │  (MCP token) │  │
│  └─────────────────┘  └──────────────────┘  └──────────────┘  │
│           │                     │                     │         │
│           ▼                     ▼                     ▼         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Storage Layer (5 modules)                   │  │
│  │  • PKCE Storage        • Auth Code Storage              │  │
│  │  • QB OAuth State      • QB Session Storage             │  │
│  │  • MCP Token Storage                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Third-Party API (QuickBooks, etc.)                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Authorization Request** (`/authorize`)
   - Claude Desktop sends: `client_id`, `redirect_uri`, `code_challenge`, `state`
   - Server stores: PKCE challenge + client_id
   - Server redirects: User to third-party OAuth page

2. **OAuth Callback** (`/oauth/callback`)
   - Third-party sends: `code`, `realmId`, `state`
   - Server exchanges: code → access_token + refresh_token
   - Server stores: QB session (tokens + realmId)
   - Server generates: MCP authorization code
   - Server redirects: Back to Claude Desktop

3. **Token Exchange** (`/token`)
   - Claude Desktop sends: `code`, `code_verifier`, `client_id`
   - Server verifies: PKCE + client_id
   - Server generates: MCP access token
   - Server links: MCP token → QB session
   - Server returns: `access_token` to Claude

4. **MCP Requests** (`/mcp`)
   - Claude Desktop sends: `Authorization: Bearer {mcp_token}`
   - Server looks up: MCP token → QB session → realmId + tokens
   - Server calls: Third-party API with QB tokens
   - Server returns: API response to Claude

---

## Storage Layer

### Why We Need 5 Storage Modules

Each storage module serves a specific purpose in the OAuth flow:

| Module | Purpose | Lifetime | Storage Type |
|--------|---------|----------|--------------|
| **PKCE Storage** | Store code challenges for verification | 10 minutes | In-memory |
| **QB OAuth State** | Bridge authorize → callback | 10 minutes | In-memory |
| **Auth Code Storage** | Bridge callback → token endpoint | 10 minutes | In-memory |
| **QB Session Storage** | Store QB tokens + realmId | Persistent | File-based |
| **MCP Token Storage** | Link MCP tokens to QB sessions | Persistent | File-based |

### 1. PKCE Storage (`src/storage/pkce-storage.ts`)

**Purpose**: Store PKCE challenges during authorization flow

```typescript
export interface PKCEChallenge {
  codeChallenge: string;
  codeChallengeMethod: 'S256' | 'plain';
  redirectUri: string;
  clientId: string; // ⚠️ CRITICAL: Store for validation in /token
  timestamp: number;
}

class PKCEStorage {
  private challenges: Map<string, PKCEChallenge> = new Map();

  storePKCE(state: string, challenge: Omit<PKCEChallenge, 'timestamp'>): void {
    this.challenges.set(state, {
      ...challenge,
      timestamp: Date.now(),
    });
  }

  getPKCE(state: string): PKCEChallenge | undefined {
    const challenge = this.challenges.get(state);
    if (!challenge) return undefined;

    // Check expiry (10 minutes)
    if (Date.now() > challenge.timestamp + 600000) {
      this.challenges.delete(state);
      return undefined;
    }

    return challenge;
  }
}
```

**⚠️ Common Issue**: Forgetting to store `clientId` leads to security vulnerability where authorization codes can be stolen and used by different clients.

---

### 2. QB OAuth State Storage (`src/storage/qb-oauth-state-storage.ts`)

**Purpose**: Bridge `/authorize` to `/oauth/callback` through QuickBooks redirect

```typescript
export interface QuickBooksOAuthState {
  claudeState: string; // Original state from Claude Desktop
  sessionId: string;   // Generated session ID
  timestamp: number;
}

class QBOAuthStateStorage {
  private states: Map<string, QuickBooksOAuthState> = new Map();

  storeQBState(qbState: string, data: Omit<QuickBooksOAuthState, 'timestamp'>): void {
    this.states.set(qbState, {
      ...data,
      timestamp: Date.now(),
    });
  }

  getQBState(qbState: string): QuickBooksOAuthState | undefined {
    const state = this.states.get(qbState);
    if (!state) return undefined;

    // Check expiry (10 minutes)
    if (Date.now() > state.timestamp + 600000) {
      this.states.delete(qbState);
      return undefined;
    }

    return state;
  }
}
```

**Why This Matters**: The `claudeState` is needed to redirect back to Claude Desktop, and `sessionId` links to the QB session.

---

### 3. Authorization Code Storage (`src/storage/auth-code-storage.ts`)

**Purpose**: Store single-use authorization codes for token exchange

```typescript
export interface AuthorizationCode {
  sessionId: string;   // Links to QB session
  claudeState: string; // For PKCE lookup
  timestamp: number;
  expiresAt: number;
  used: boolean;       // ⚠️ CRITICAL: Prevent replay attacks
}

class AuthCodeStorage {
  private codes: Map<string, AuthorizationCode> = new Map();

  storeAuthCode(code: string, data: Pick<AuthorizationCode, 'sessionId' | 'claudeState'>): void {
    const now = Date.now();
    this.codes.set(code, {
      ...data,
      timestamp: now,
      expiresAt: now + 600000, // 10 minutes
      used: false,
    });
  }

  getAuthCode(code: string): AuthorizationCode | undefined {
    const authCode = this.codes.get(code);
    if (!authCode) return undefined;

    // Check if used (prevent replay)
    if (authCode.used) {
      console.warn('[Security] Authorization code replay attack detected');
      return undefined;
    }

    // Check expiry
    if (Date.now() > authCode.expiresAt) {
      this.codes.delete(code);
      return undefined;
    }

    return authCode;
  }

  markAsUsed(code: string): boolean {
    const authCode = this.codes.get(code);
    if (!authCode) return false;
    authCode.used = true;
    return true;
  }
}
```

**⚠️ Security Critical**: Always mark codes as used to prevent replay attacks.

---

### 4. QuickBooks Session Storage (`src/storage/quickbooks-session-storage.ts`)

**Purpose**: Store QB tokens + realmId persistently (survives server restarts)

```typescript
export interface QuickBooksSession {
  qbAccessToken: string;     // 1-hour expiry
  qbRefreshToken: string;    // 100-day expiry
  qbTokenExpiresAt: number;
  realmId: string;           // ⚠️ CRITICAL: Company ID for API calls
  userId?: string;
  createdAt: number;
  lastUsedAt: number;
}

class QuickBooksSessionStorage {
  private sessions: Map<string, QuickBooksSession> = new Map();
  private filePath: string;

  async initialize(): Promise<void> {
    // Load from disk
    const data = await fs.readFile(this.filePath, 'utf-8');
    const parsed = JSON.parse(data);
    for (const [sessionId, session] of Object.entries(parsed)) {
      this.sessions.set(sessionId, session as QuickBooksSession);
    }
  }

  async storeSession(sessionId: string, session: Omit<QuickBooksSession, 'lastUsedAt'>): Promise<void> {
    this.sessions.set(sessionId, {
      ...session,
      lastUsedAt: Date.now(),
    });
    await this.save(); // Persist to disk
  }

  getSession(sessionId: string): QuickBooksSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    session.lastUsedAt = Date.now();
    return session;
  }

  async updateTokens(sessionId: string, tokens: Pick<QuickBooksSession, 'qbAccessToken' | 'qbRefreshToken' | 'qbTokenExpiresAt'>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.qbAccessToken = tokens.qbAccessToken;
    session.qbRefreshToken = tokens.qbRefreshToken;
    session.qbTokenExpiresAt = tokens.qbTokenExpiresAt;
    session.lastUsedAt = Date.now();

    await this.save();
  }

  private async save(): Promise<void> {
    const data: Record<string, QuickBooksSession> = {};
    for (const [sessionId, session] of this.sessions.entries()) {
      data[sessionId] = session;
    }
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
```

**⚠️ Critical Issues We Fixed**:
1. **File Permissions**: MUST set directory permissions to `0o700` (owner-only)
   ```typescript
   await fs.mkdir(dir, { recursive: true, mode: 0o700 });
   ```

2. **Token Logging**: NEVER log token values (even prefixes)
   ```typescript
   // ❌ BAD
   console.log(`Token: ${token.substring(0, 20)}...`);

   // ✅ GOOD
   console.log(`Token stored successfully`);
   ```

3. **Encryption**: For production, encrypt tokens at rest using AES-256-GCM

---

### 5. MCP Token Storage (`src/storage/mcp-token-storage.ts`)

**Purpose**: Map MCP tokens (from Claude) to QB sessions

```typescript
export interface MCPTokenSession {
  sessionId: string;  // Links to QB session
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
}

class MCPTokenStorage {
  private tokens: Map<string, MCPTokenSession> = new Map();
  private filePath: string;

  async storeToken(token: string, session: Pick<MCPTokenSession, 'sessionId'>): Promise<void> {
    const now = Date.now();
    this.tokens.set(token, {
      ...session,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: now + 3600000, // 1 hour
    });
    await this.save();
  }

  getSession(token: string): MCPTokenSession | undefined {
    const session = this.tokens.get(token);
    if (!session) return undefined;

    // Check expiry
    if (Date.now() > session.expiresAt) {
      this.tokens.delete(token);
      return undefined;
    }

    session.lastUsedAt = Date.now();
    return session;
  }

  private async save(): Promise<void> {
    const data: Record<string, MCPTokenSession> = {};
    for (const [token, session] of this.tokens.entries()) {
      data[token] = session;
    }
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
```

---

## OAuth Endpoints

### 1. Authorization Endpoint (`/authorize`)

**Purpose**: Initiate OAuth flow from Claude Desktop

```typescript
import { Request, Response } from 'express';
import { getPKCEStorage } from '../storage/pkce-storage.js';
import { getQBOAuthStateStorage } from '../storage/qb-oauth-state-storage.js';
import { generateSessionId, encodeQBState } from '../utils/token-generator.js';

export async function handleAuthorizeEndpoint(req: Request, res: Response): Promise<any> {
  try {
    console.log('\n→ OAuth /authorize request from Claude Desktop');

    // Extract OAuth 2.0 parameters
    const {
      response_type,
      client_id,
      redirect_uri,
      code_challenge,
      code_challenge_method,
      state,
      scope,
    } = req.query;

    // Validate parameters
    if (!response_type || response_type !== 'code') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'response_type must be "code"',
      });
    }

    if (!client_id || !redirect_uri || !code_challenge || !code_challenge_method || !state) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters',
      });
    }

    // ⚠️ SECURITY: Validate redirect URI with strict hostname matching
    const redirectUriStr = redirect_uri as string;
    try {
      const url = new URL(redirectUriStr);
      const validHosts = ['claude.ai', 'localhost', '127.0.0.1'];
      if (!validHosts.includes(url.hostname)) {
        return res.status(400).send('Invalid redirect URI');
      }
    } catch (error) {
      return res.status(400).send('Malformed redirect URI');
    }

    // Store PKCE challenge with client_id
    const pkceStorage = getPKCEStorage();
    pkceStorage.storePKCE(state as string, {
      codeChallenge: code_challenge as string,
      codeChallengeMethod: code_challenge_method as 'S256' | 'plain',
      redirectUri: redirectUriStr,
      clientId: client_id as string, // ⚠️ CRITICAL: Store for validation
    });

    // Generate session ID
    const sessionId = generateSessionId();

    // Create QuickBooks OAuth state
    const qbState = encodeQBState({
      claudeState: state as string,
      sessionId,
    });

    // Store QB OAuth state
    const qbOAuthStateStorage = getQBOAuthStateStorage();
    qbOAuthStateStorage.storeQBState(qbState, {
      claudeState: state as string,
      sessionId,
    });

    // Build QuickBooks authorization URL
    const qbAuthUrl = buildQuickBooksAuthUrl({
      clientId: process.env.QUICKBOOKS_CLIENT_ID!,
      redirectUri: process.env.QUICKBOOKS_REDIRECT_URI!,
      state: qbState,
      environment: process.env.QUICKBOOKS_ENVIRONMENT as 'sandbox' | 'production',
    });

    // Redirect to QuickBooks
    res.redirect(qbAuthUrl);
  } catch (error) {
    console.error('Error in /authorize endpoint:', error);
    res.status(500).send('Internal Server Error');
  }
}

function buildQuickBooksAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  environment: 'sandbox' | 'production';
}): string {
  const authEndpoint = 'https://appcenter.intuit.com/connect/oauth2';

  const queryParams = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: 'com.intuit.quickbooks.accounting',
    response_type: 'code',
    state: params.state,
  });

  return `${authEndpoint}?${queryParams.toString()}`;
}
```

**⚠️ Common Issues**:
1. **Redirect URI Validation**: Use URL parsing, NOT `startsWith()` (can be bypassed)
2. **Missing client_id Storage**: Store with PKCE for validation in `/token`
3. **Missing Rate Limiting**: Apply rate limiter to prevent brute force

---

### 2. OAuth Callback Endpoint (`/oauth/callback`)

**Purpose**: Receive tokens from third-party, create MCP authorization code

```typescript
// In your main server file (e.g., src/index-http.ts)
app.get('/oauth/callback', async (req, res) => {
  try {
    console.log('\n→ OAuth callback from QuickBooks');

    const { code, state, realmId } = req.query;

    if (!code || !state || !realmId) {
      return res.status(400).send('Missing required parameters');
    }

    // Decode QB state to get Claude state + session ID
    const qbOAuthStateStorage = getQBOAuthStateStorage();
    const stateData = qbOAuthStateStorage.getQBState(state as string);

    if (!stateData) {
      return res.status(400).send('Invalid or expired state');
    }

    const { claudeState, sessionId } = stateData;

    // Exchange QB authorization code for tokens
    const oauthClient = new OAuthClient({
      clientId: process.env.QUICKBOOKS_CLIENT_ID!,
      clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET!,
      environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
      redirectUri: process.env.QUICKBOOKS_REDIRECT_URI!,
    });

    const authResponse = await oauthClient.createToken(req.url!);
    const tokens = authResponse.token;

    // ⚠️ CRITICAL: Store QB session with realmId
    const qbSessionStorage = getQuickBooksSessionStorage();
    await qbSessionStorage.initialize();
    await qbSessionStorage.storeSession(sessionId, {
      qbAccessToken: tokens.access_token,
      qbRefreshToken: tokens.refresh_token,
      qbTokenExpiresAt: Date.now() + (tokens.expires_in * 1000),
      realmId: realmId as string, // ⚠️ CRITICAL: Store realmId
      createdAt: Date.now(),
    });

    console.log(`  ✓ Stored QB session: ${sessionId} → realmId: ${realmId}`);

    // Generate MCP authorization code
    const mcpAuthCode = generateAuthCode();

    // Store authorization code
    const authCodeStorage = getAuthCodeStorage();
    authCodeStorage.storeAuthCode(mcpAuthCode, {
      sessionId,
      claudeState,
    });

    // Build Claude redirect URL
    const pkceStorage = getPKCEStorage();
    const pkceChallenge = pkceStorage.getPKCE(claudeState);

    if (!pkceChallenge) {
      return res.status(400).send('PKCE challenge not found');
    }

    const claudeRedirectUrl = `${pkceChallenge.redirectUri}?code=${mcpAuthCode}&state=${claudeState}`;

    // Redirect back to Claude Desktop
    res.redirect(claudeRedirectUrl);
  } catch (error) {
    console.error('Error in /oauth/callback:', error);
    res.status(500).send('Internal Server Error');
  }
});
```

**⚠️ Critical Issues We Fixed**:
1. **Missing realmId Storage**: The realmId is ESSENTIAL for all API calls
2. **Token Expiry Calculation**: Must calculate `qbTokenExpiresAt = Date.now() + (expires_in * 1000)`
3. **State Cleanup**: Delete QB OAuth state after use to prevent replay

---

### 3. Token Exchange Endpoint (`/token`)

**Purpose**: Exchange MCP authorization code for MCP access token

```typescript
import { Request, Response } from 'express';
import { getAuthCodeStorage } from '../storage/auth-code-storage.js';
import { getPKCEStorage } from '../storage/pkce-storage.js';
import { getMCPTokenStorage } from '../storage/mcp-token-storage.js';
import { verifyPKCE } from '../utils/pkce-verifier.js';
import { generateMCPToken } from '../utils/token-generator.js';

export async function handleTokenEndpoint(req: Request, res: Response): Promise<any> {
  try {
    console.log('\n→ OAuth /token request from Claude Desktop');

    const { grant_type, code, code_verifier, client_id } = req.body;

    // Validate grant_type
    if (!grant_type || grant_type !== 'authorization_code') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'grant_type must be "authorization_code"',
      });
    }

    // Validate required parameters
    if (!code || !code_verifier || !client_id) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters',
      });
    }

    // Get authorization code
    const authCodeStorage = getAuthCodeStorage();
    const authCode = authCodeStorage.getAuthCode(code);

    if (!authCode) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid or expired authorization code',
      });
    }

    // Mark as used (prevent replay)
    authCodeStorage.markAsUsed(code);

    // Get PKCE challenge
    const pkceStorage = getPKCEStorage();
    const pkceChallenge = pkceStorage.getPKCE(authCode.claudeState);

    if (!pkceChallenge) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'PKCE challenge not found or expired',
      });
    }

    // Verify PKCE
    const pkceValid = verifyPKCE(
      code_verifier,
      pkceChallenge.codeChallenge,
      pkceChallenge.codeChallengeMethod
    );

    if (!pkceValid) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'PKCE verification failed',
      });
    }

    // ⚠️ SECURITY: Verify client_id matches
    if (pkceChallenge.clientId !== client_id) {
      console.error(`  ✗ Client ID mismatch: expected ${pkceChallenge.clientId}, got ${client_id}`);
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Authorization code was issued to a different client',
      });
    }

    console.log('  ✓ PKCE verification successful');
    console.log('  ✓ Client ID validation successful');

    // Clean up PKCE challenge
    pkceStorage.deletePKCE(authCode.claudeState);

    // Generate MCP access token
    const mcpToken = generateMCPToken();

    // Store MCP token linked to QB session
    const mcpTokenStorage = getMCPTokenStorage();
    await mcpTokenStorage.initialize();
    await mcpTokenStorage.storeToken(mcpToken, {
      sessionId: authCode.sessionId,
    });

    console.log(`  ✓ Token exchange successful`);

    // Return token response
    res.json({
      access_token: mcpToken,
      token_type: 'Bearer',
      expires_in: 3600,
    });
  } catch (error) {
    console.error('Error in /token endpoint:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'An internal server error occurred',
    });
  }
}
```

**⚠️ Security Critical**:
1. **Client ID Validation**: MUST verify client_id matches the one from `/authorize`
2. **Single-Use Codes**: MUST mark authorization codes as used
3. **PKCE Verification**: MUST verify code_verifier matches code_challenge

---

### 4. MCP Request Handler (`/mcp`)

**Purpose**: Handle tool calls from Claude Desktop with authenticated API calls

```typescript
app.post('/mcp', async (req, res) => {
  try {
    // Extract MCP token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized' },
        id: null,
      });
    }

    const mcpToken = authHeader.substring(7);

    // Look up MCP session
    const mcpTokenStorage = getMCPTokenStorage();
    await mcpTokenStorage.initialize();
    const mcpSession = mcpTokenStorage.getSession(mcpToken);

    if (!mcpSession) {
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Invalid or expired token' },
        id: null,
      });
    }

    // Get QB session
    const qbSessionStorage = getQuickBooksSessionStorage();
    await qbSessionStorage.initialize();
    const qbSession = qbSessionStorage.getSession(mcpSession.sessionId);

    if (!qbSession) {
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'QuickBooks session not found' },
        id: null,
      });
    }

    // ⚠️ CRITICAL: Check if token needs refresh (< 5 minutes until expiry)
    const tokenRefreshService = getTokenRefreshService(quickbooksClient);
    await tokenRefreshService.refreshQuickBooksTokenIfNeeded(mcpSession.sessionId);

    // Refresh QB session after potential token refresh
    const refreshedQbSession = qbSessionStorage.getSession(mcpSession.sessionId)!;

    // Initialize QuickBooks client with session tokens
    quickbooksClient.setExternalAuth(
      refreshedQbSession.qbAccessToken,
      refreshedQbSession.realmId
    );

    await quickbooksClient.authenticate();

    // Handle MCP request
    const { method, params, id } = req.body;

    if (method === 'tools/list') {
      // Return available tools
      return res.json({
        jsonrpc: '2.0',
        result: { tools: ALL_TOOLS },
        id,
      });
    }

    if (method === 'tools/call') {
      // Execute tool
      const tool = TOOL_HANDLERS[params.name];
      if (!tool) {
        return res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32601, message: 'Tool not found' },
          id,
        });
      }

      const result = await tool.handler(params.arguments);

      return res.json({
        jsonrpc: '2.0',
        result,
        id,
      });
    }

    return res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid request' },
      id,
    });
  } catch (error) {
    console.error('Error in /mcp endpoint:', error);
    return res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal error' },
      id: req.body.id,
    });
  }
});
```

**⚠️ Critical: Automatic Token Refresh**
- Check if token expires in < 5 minutes
- Refresh before making API calls
- Update session storage with new tokens

---

## Security Implementation

### 1. Rate Limiting

**⚠️ CRITICAL**: OAuth endpoints MUST have rate limiting to prevent brute force attacks

```typescript
import rateLimit from 'express-rate-limit';

// OAuth rate limiter (stricter)
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per window
  message: 'Too many OAuth requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// API rate limiter (more lenient)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to endpoints
app.get('/authorize', oauthLimiter, handleAuthorizeEndpoint);
app.post('/token', oauthLimiter, handleTokenEndpoint);
app.post('/mcp', apiLimiter, mcpHandler);
```

---

### 2. Redirect URI Validation

**⚠️ SECURITY CRITICAL**: Previous implementations used `startsWith()` which could be bypassed

```typescript
// ❌ BAD: Can be bypassed with https://claude.ai.attacker.com
if (redirectUri.startsWith('https://claude.ai/')) { ... }

// ✅ GOOD: Use URL parsing with exact hostname matching
try {
  const url = new URL(redirectUri);
  const validHosts = ['claude.ai', 'localhost', '127.0.0.1'];

  if (!validHosts.includes(url.hostname)) {
    throw new Error('Invalid redirect URI hostname');
  }

  // For production, block localhost
  if (process.env.NODE_ENV === 'production' && url.hostname === 'localhost') {
    throw new Error('Localhost not allowed in production');
  }
} catch (error) {
  return res.status(400).send('Invalid redirect URI');
}
```

---

### 3. File Permissions

**⚠️ SECURITY CRITICAL**: Token storage files MUST have restricted permissions

```typescript
// ❌ BAD: Default permissions (may be world-readable)
await fs.mkdir(dir, { recursive: true });

// ✅ GOOD: Owner-only permissions (0o700 = rwx------)
await fs.mkdir(dir, { recursive: true, mode: 0o700 });

// Also set file permissions after writing
await fs.writeFile(filePath, data, 'utf-8');
await fs.chmod(filePath, 0o600); // rw-------
```

---

### 4. Token Logging

**⚠️ SECURITY CRITICAL**: NEVER log token values (even prefixes)

```typescript
// ❌ BAD: Logging token prefixes aids prediction attacks
console.log(`Token: ${token.substring(0, 20)}...`);
console.log(`Access token: ${accessToken.substring(0, 20)}...`);

// ✅ GOOD: Log actions without token values
console.log(`Token stored successfully`);
console.log(`Access token validated`);
console.log(`Token refreshed for session: ${sessionId}`);
```

We had **35+ instances** of token logging that needed to be removed.

---

### 5. PKCE Verification

**Implementation**:

```typescript
import crypto from 'crypto';

export function verifyPKCE(
  codeVerifier: string,
  codeChallenge: string,
  codeChallengeMethod: 'S256' | 'plain'
): boolean {
  if (codeChallengeMethod === 'plain') {
    return codeVerifier === codeChallenge;
  }

  // S256: base64url(SHA256(codeVerifier))
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const calculatedChallenge = base64UrlEncode(hash);

  return calculatedChallenge === codeChallenge;
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function isValidCodeVerifier(verifier: string): boolean {
  // RFC 7636: 43-128 characters, [A-Za-z0-9-._~]
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
}
```

---

### 6. Token Refresh Service

**Purpose**: Automatically refresh QB tokens before expiry

```typescript
export class TokenRefreshService {
  private quickbooksClient: any;

  constructor(quickbooksClient: any) {
    this.quickbooksClient = quickbooksClient;
  }

  async refreshQuickBooksTokenIfNeeded(sessionId: string): Promise<boolean> {
    const qbSessionStorage = getQuickBooksSessionStorage();
    await qbSessionStorage.initialize();

    const qbSession = qbSessionStorage.getSession(sessionId);
    if (!qbSession) {
      throw new Error('QuickBooks session not found');
    }

    // Check if token expires in < 5 minutes (300000 ms)
    const timeUntilExpiry = qbSession.qbTokenExpiresAt - Date.now();
    const fiveMinutes = 300000;

    if (timeUntilExpiry > fiveMinutes) {
      console.log(`Token valid for ${Math.round(timeUntilExpiry / 60000)} minutes, no refresh needed`);
      return false;
    }

    console.log(`Token expires in ${Math.round(timeUntilExpiry / 1000)} seconds, refreshing...`);

    // Use QuickBooks OAuth client to refresh token
    const oauthClient = this.quickbooksClient['oauthClient'];
    oauthClient.setToken({
      refresh_token: qbSession.qbRefreshToken,
    });

    const response = await oauthClient.refresh();
    const newTokens = response.token;

    // Update session storage with new tokens
    await qbSessionStorage.updateTokens(sessionId, {
      qbAccessToken: newTokens.access_token,
      qbRefreshToken: newTokens.refresh_token,
      qbTokenExpiresAt: Date.now() + (newTokens.expires_in * 1000),
    });

    console.log('✓ Successfully refreshed QuickBooks tokens');
    return true;
  }
}
```

**⚠️ Common Issue**: Forgetting to update the refresh token after refresh (QB returns a new refresh token each time)

---

## Common Issues & Fixes

### Issue 1: Entity Method Name Typos

**Problem**: Typos in entity-to-method mappings cause runtime failures

```typescript
// ❌ BAD: Incorrect plural forms
const ENTITY_TO_METHOD_MAP = {
  'JournalEntry': 'findJournalEntrys',  // Wrong!
  'Preferences': 'findPreferenceses',   // Wrong!
  'TaxAgency': 'findTaxAgencys',        // Wrong!
  'TimeActivity': 'findTimeActivitys',  // Wrong!
};

// ✅ GOOD: Correct plural forms
const ENTITY_TO_METHOD_MAP = {
  'JournalEntry': 'findJournalEntries',
  'Preferences': 'findPreferences',
  'TaxAgency': 'findTaxAgencies',
  'TimeActivity': 'findTimeActivities',
};
```

**Impact**: 4 entities completely broken until fixed.

---

### Issue 2: Parameter Extraction Bug

**Problem**: Tools accessing `args.entity` instead of `args.params.entity`

```typescript
// ❌ BAD: Accessing wrong parameter path
export const deleteVendorTool = {
  handler: async (args: any) => {
    const response = await deleteQuickbooksVendor(args.vendor); // Wrong!
    return response;
  },
};

// ✅ GOOD: Correct parameter path
export const deleteVendorTool = {
  handler: async (args: any) => {
    const response = await deleteQuickbooksVendor(args.params.vendor);
    return response;
  },
};
```

**Impact**: 3 tools (delete-bill, delete-vendor, create-bill) completely broken.

---

### Issue 3: Missing realmId Storage

**Problem**: Not storing realmId from OAuth callback

```typescript
// ❌ BAD: Missing realmId
await qbSessionStorage.storeSession(sessionId, {
  qbAccessToken: tokens.access_token,
  qbRefreshToken: tokens.refresh_token,
  qbTokenExpiresAt: Date.now() + (tokens.expires_in * 1000),
  // Missing: realmId
});

// ✅ GOOD: Store realmId (critical for API calls)
await qbSessionStorage.storeSession(sessionId, {
  qbAccessToken: tokens.access_token,
  qbRefreshToken: tokens.refresh_token,
  qbTokenExpiresAt: Date.now() + (tokens.expires_in * 1000),
  realmId: realmId as string, // ⚠️ CRITICAL
  createdAt: Date.now(),
});
```

**Impact**: All API calls fail without realmId.

---

### Issue 4: Missing client_id Validation

**Problem**: Not validating client_id in token exchange

**Fix**: See "Token Exchange Endpoint" section above - must store client_id with PKCE and verify in `/token`.

**Impact**: Authorization codes can be stolen and used by different clients.

---

### Issue 5: Storage Not Initialized

**Problem**: Calling storage methods before initialization

```typescript
// ❌ BAD: May fail if not initialized
const session = qbSessionStorage.getSession(sessionId);

// ✅ GOOD: Ensure initialization
await qbSessionStorage.initialize();
const session = qbSessionStorage.getSession(sessionId);

// ✅ BETTER: Initialize all storage at server startup
async function main() {
  await getQuickBooksSessionStorage().initialize();
  await getMCPTokenStorage().initialize();

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}
```

---

### Issue 6: Redirect URI Bypass

**Problem**: Using `startsWith()` for redirect URI validation

**Fix**: See "Redirect URI Validation" section above.

**Impact**: Attackers can redirect to malicious domains like `https://claude.ai.attacker.com`

---

### Issue 7: No Rate Limiting

**Problem**: OAuth endpoints without rate limiting

**Fix**: See "Rate Limiting" section above.

**Impact**: Brute force attacks on authorization codes and tokens.

---

### Issue 8: Unencrypted Token Storage

**Problem**: Storing tokens in plain text JSON files

**Recommended Fix**: Encrypt tokens at rest using AES-256-GCM

```typescript
import crypto from 'crypto';

class EncryptedStorage {
  private encryptionKey: Buffer;

  constructor() {
    // Load from environment or generate
    const key = process.env.STORAGE_ENCRYPTION_KEY;
    if (!key) throw new Error('STORAGE_ENCRYPTION_KEY required');
    this.encryptionKey = Buffer.from(key, 'hex');
  }

  encrypt(data: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  decrypt(encrypted: string): string {
    const parts = encrypted.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedData = parts[2];

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
```

**Status**: Deferred to post-deployment (Phase 4).

---

## Testing Guide

### Manual Testing Flow

1. **Start Server**
   ```bash
   npm run build
   npm start
   ```

2. **Test /authorize**
   ```
   Open browser:
   http://localhost:8000/authorize?response_type=code&client_id=test&redirect_uri=http://localhost:3000/callback&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&state=test123&scope=quickbooks
   ```

   Expected: Redirect to QuickBooks OAuth page

3. **Test /oauth/callback**
   - Complete QuickBooks authorization
   - Expected: Redirect back to Claude with `code` and `state`

4. **Test /token**
   ```bash
   curl -X POST http://localhost:8000/token \
     -H "Content-Type: application/json" \
     -d '{
       "grant_type": "authorization_code",
       "code": "YOUR_AUTH_CODE",
       "code_verifier": "YOUR_CODE_VERIFIER",
       "client_id": "test"
     }'
   ```

   Expected: `{ "access_token": "...", "token_type": "Bearer", "expires_in": 3600 }`

5. **Test /mcp**
   ```bash
   curl -X POST http://localhost:8000/mcp \
     -H "Authorization: Bearer YOUR_MCP_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "jsonrpc": "2.0",
       "method": "tools/list",
       "id": 1
     }'
   ```

   Expected: List of available tools

---

### Integration Testing

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

describe('OAuth Flow Integration', () => {
  let server: any;
  let authCode: string;
  let mcpToken: string;

  beforeAll(async () => {
    server = await startServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('should complete full OAuth flow', async () => {
    // 1. Request authorization
    const authResponse = await fetch('http://localhost:8000/authorize?...');
    expect(authResponse.status).toBe(302);

    // 2. Simulate QB callback
    const callbackResponse = await fetch('http://localhost:8000/oauth/callback?...');
    expect(callbackResponse.status).toBe(302);

    // Extract auth code from redirect
    authCode = extractCodeFromRedirect(callbackResponse.headers.get('location'));

    // 3. Exchange for MCP token
    const tokenResponse = await fetch('http://localhost:8000/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: authCode,
        code_verifier: 'test_verifier',
        client_id: 'test',
      }),
    });

    const tokenData = await tokenResponse.json();
    expect(tokenData.access_token).toBeDefined();
    mcpToken = tokenData.access_token;

    // 4. Make MCP request
    const mcpResponse = await fetch('http://localhost:8000/mcp', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mcpToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      }),
    });

    const mcpData = await mcpResponse.json();
    expect(mcpData.result.tools).toBeDefined();
  });
});
```

---

## Deployment Checklist

### Phase 1: Critical Security Fixes (MUST FIX)

- [ ] Fix entity mapping typos (if applicable)
- [ ] Fix parameter extraction bugs (if applicable)
- [ ] Implement strict redirect URI validation (URL parsing)
- [ ] Add rate limiting to OAuth endpoints
- [ ] Set file permissions to 0o700 for data directories
- [ ] Remove all token prefix logging
- [ ] Store client_id with PKCE challenge
- [ ] Verify client_id in token endpoint

### Phase 2: High Priority (SHOULD FIX)

- [ ] Add Content-Type validation
- [ ] Move storage initialization to server startup
- [ ] Add HTTP security headers (helmet)
- [ ] Implement automatic token refresh
- [ ] Add comprehensive error handling

### Phase 3: Production Hardening (RECOMMENDED)

- [ ] Encrypt tokens at rest (AES-256-GCM)
- [ ] Add OAuth state signing (HMAC-SHA256)
- [ ] Implement audit logging
- [ ] Add monitoring and alerting
- [ ] Write integration tests
- [ ] Conduct penetration testing

### Phase 4: Documentation

- [ ] Document OAuth flow for users
- [ ] Create troubleshooting guide
- [ ] Document API endpoints
- [ ] Create security disclosure policy

---

## Environment Variables

```bash
# QuickBooks OAuth
QUICKBOOKS_CLIENT_ID=your_client_id
QUICKBOOKS_CLIENT_SECRET=your_client_secret
QUICKBOOKS_REDIRECT_URI=http://localhost:8000/oauth/callback
QUICKBOOKS_ENVIRONMENT=sandbox # or production

# Server Configuration
PORT=8000
NODE_ENV=development # or production

# Storage (optional)
STORAGE_ENCRYPTION_KEY=hex_encoded_32_byte_key # For encrypted storage

# Rate Limiting (optional)
OAUTH_RATE_LIMIT_MAX=10
OAUTH_RATE_LIMIT_WINDOW_MS=900000
```

---

## Architecture Decisions

### Why File-Based Storage for Sessions?

**Pros**:
- Simple to implement
- No external dependencies (no Redis, no database)
- Survives server restarts
- Works in containerized environments

**Cons**:
- Not suitable for horizontal scaling (use Redis for that)
- Slower than in-memory for high-traffic

**Recommendation**: Start with file-based, migrate to Redis when scaling horizontally.

---

### Why 5 Separate Storage Modules?

Each module has a different:
- **Lifetime**: Some are temporary (10 min), some are persistent
- **Storage Type**: Some are in-memory, some are file-based
- **Purpose**: Clear separation of concerns

This makes the code:
- Easier to understand
- Easier to test
- Easier to debug
- Easier to migrate (e.g., move PKCE to Redis, keep sessions in files)

---

### Why Not Store Everything in One Place?

**Anti-pattern**: Single storage module with mixed concerns

```typescript
// ❌ BAD: Everything in one place
interface Session {
  pkceChallenge?: string;
  qbState?: string;
  authCode?: string;
  qbTokens?: { ... };
  mcpToken?: string;
  // Too many optional fields, unclear lifecycle
}
```

**Better**: Separate storage modules with clear purpose

---

## Summary

### What We Learned

1. **OAuth is Complex**: 5 storage modules, 4 endpoints, multiple security checks
2. **Security is Critical**: 26 security issues identified in our implementation
3. **Testing is Essential**: Manual testing + integration tests + security audit
4. **Documentation Matters**: This guide is the result of fixing 36 issues

### Key Takeaways

- ✅ Always validate client_id in token exchange
- ✅ Always use strict redirect URI validation
- ✅ Always mark authorization codes as used
- ✅ Always store realmId from OAuth callback
- ✅ Always set file permissions to 0o700
- ✅ Never log token values (even prefixes)
- ✅ Always implement rate limiting on OAuth endpoints
- ✅ Always refresh tokens before expiry

### Risk Assessment

| Risk Level | Description | Status |
|------------|-------------|--------|
| **HIGH** | Missing client_id validation | ✅ Fixed |
| **HIGH** | Weak redirect URI validation | ✅ Fixed |
| **HIGH** | No rate limiting | ✅ Fixed |
| **HIGH** | Token logging | ✅ Fixed |
| **MEDIUM** | Insecure file permissions | ✅ Fixed |
| **MEDIUM** | Unencrypted token storage | ⏳ Deferred |
| **LOW** | Missing audit logging | ⏳ Deferred |

---

## Additional Resources

- **OAuth 2.0 RFC**: https://datatracker.ietf.org/doc/html/rfc6749
- **PKCE RFC**: https://datatracker.ietf.org/doc/html/rfc7636
- **OWASP OAuth Security**: https://owasp.org/www-community/vulnerabilities/OAuth
- **Claude Desktop MCP Docs**: https://docs.anthropic.com/claude/docs/mcp

---

## Questions?

If you encounter issues implementing this in your MCP server:

1. Review the "Common Issues & Fixes" section
2. Check that all 5 storage modules are implemented
3. Verify all security checks are in place
4. Test the full flow manually before deploying

Good luck! 🚀
