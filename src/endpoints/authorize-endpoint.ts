/**
 * OAuth 2.0 /authorize Endpoint Handler
 *
 * Handles authorization requests from Claude Desktop.
 * Implements OAuth 2.0 Authorization Code Flow with PKCE (RFC 7636).
 *
 * Flow:
 * 1. Claude Desktop → GET /authorize (with PKCE challenge)
 * 2. Validate OAuth 2.0 parameters
 * 3. Store PKCE challenge for later verification
 * 4. Generate session ID and QB OAuth state
 * 5. Redirect user to QuickBooks authorization page
 *
 * Expected query parameters from Claude:
 * - response_type: "code"
 * - client_id: Claude client ID
 * - redirect_uri: https://claude.ai/api/mcp/auth_callback
 * - code_challenge: PKCE challenge (SHA256)
 * - code_challenge_method: "S256"
 * - state: Claude state parameter
 * - scope: "claudeai" or "quickbooks"
 */

import { Request, Response } from 'express';
import { getPKCEStorage } from '../storage/pkce-storage.js';
import { getQBOAuthStateStorage } from '../storage/qb-oauth-state-storage.js';
import { generateSessionId, encodeQBState } from '../utils/token-generator.js';

/**
 * Handle GET /authorize requests from Claude Desktop
 */
export async function handleAuthorizeEndpoint(
  req: Request,
  res: Response
): Promise<any> {
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

    // Log request details
    console.log(`  → response_type: ${response_type}`);
    console.log(`  → client_id: ${client_id}`);
    console.log(`  → redirect_uri: ${redirect_uri}`);
    console.log(
      `  → code_challenge: ${
        code_challenge ? String(code_challenge).substring(0, 20) + '...' : 'missing'
      }`
    );
    console.log(`  → code_challenge_method: ${code_challenge_method}`);
    console.log(
      `  → state: ${state ? String(state).substring(0, 20) + '...' : 'missing'}`
    );
    console.log(`  → scope: ${scope}`);

    // Validate required parameters
    const validationError = validateAuthorizeParams({
      response_type: response_type as string,
      client_id: client_id as string,
      redirect_uri: redirect_uri as string,
      code_challenge: code_challenge as string,
      code_challenge_method: code_challenge_method as string,
      state: state as string,
    });

    if (validationError) {
      console.error(`  ✗ Validation error: ${validationError}`);

      // If no parameters at all, return OAuth metadata (Claude Desktop discovery)
      if (!response_type && !client_id && !redirect_uri && !code_challenge && !state) {
        console.log('  → Returning OAuth metadata for Claude Desktop discovery');
        const baseUrl = `https://${req.get('host')}`;
        return res.json({
          authorization_endpoint: `${baseUrl}/authorize`,
          token_endpoint: `${baseUrl}/token`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none']
        });
      }

      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2 style="color: #d32f2f;">Invalid Authorization Request</h2>
            <p>${validationError}</p>
            <p>Please check the request parameters and try again.</p>
          </body>
        </html>
      `);
    }

    // Note: client_id comes from Claude Desktop (user-provided QuickBooks credentials)
    // We accept any client_id since users configure it when adding the custom connector
    console.log(`  ✓ Client ID: ${client_id}`);

    // Validate redirect URI (must be Claude) - Use strict hostname validation
    const redirectUriStr = redirect_uri as string;
    try {
      const url = new URL(redirectUriStr);
      const validHosts = ['claude.ai', 'localhost', '127.0.0.1'];
      if (!validHosts.includes(url.hostname)) {
        console.error(`  ✗ Invalid redirect_uri hostname: ${url.hostname}`);
        return res.status(400).send(`
          <html>
            <body style="font-family: Arial; padding: 40px; text-align: center;">
              <h2 style="color: #d32f2f;">Invalid Redirect URI</h2>
              <p>redirect_uri must be a Claude URL (claude.ai) or localhost for testing.</p>
            </body>
          </html>
        `);
      }
    } catch (error) {
      console.error(`  ✗ Malformed redirect_uri: ${redirectUriStr}`);
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2 style="color: #d32f2f;">Invalid Redirect URI</h2>
            <p>redirect_uri must be a valid URL.</p>
          </body>
        </html>
      `);
    }

    // Store PKCE challenge with client_id for later validation
    const pkceStorage = getPKCEStorage();
    pkceStorage.storePKCE(state as string, {
      codeChallenge: code_challenge as string,
      codeChallengeMethod: code_challenge_method as 'S256' | 'plain',
      redirectUri: redirectUriStr,
      clientId: client_id as string,
    });

    console.log(`  ✓ Stored PKCE challenge for state: ${String(state).substring(0, 20)}...`);

    // ========== MULTI-USER SHARED CONNECTION ==========
    // Check if we already have a company connection (skip QB OAuth if yes)
    // Use mutex lock to prevent race conditions when multiple users connect simultaneously
    const { getQuickBooksSessionStorage } = await import('../storage/quickbooks-session-storage.js');
    const { generateAuthCode } = await import('../utils/token-generator.js');
    const { getAuthCodeStorage } = await import('../storage/auth-code-storage.js');
    const { sessionLockManager } = await import('../utils/session-lock.js');

    const qbSessionStorage = getQuickBooksSessionStorage();
    await qbSessionStorage.initialize();
    console.log(`  → QB Session Storage initialized (${qbSessionStorage.size()} sessions loaded from S3)`);

    // Acquire mutex lock to prevent simultaneous OAuth attempts
    const release = await sessionLockManager.acquireLock('qb-company-auth');

    try {
      console.log(`  → Checking for existing company connection...`);

      // Check for ANY active session with valid tokens (>30 min validity)
      const activeSession = qbSessionStorage.getActiveCompanySession();

      if (activeSession) {
        // ✅ Company already connected with VALID tokens! Skip QuickBooks OAuth
        console.log(`  ✓ Found active company connection (realmId: ${activeSession.session.realmId})`);
        console.log(`  ✓ Tokens valid - skipping QuickBooks OAuth to prevent admin replacement`);

        // Generate new session ID for this user
        const newSessionId = generateSessionId();
        console.log(`  ✓ Generated new session ID: ${newSessionId}`);

        // Clone existing session for new user (share QB tokens, new sessionId)
        await qbSessionStorage.storeSession(newSessionId, {
          qbAccessToken: activeSession.session.qbAccessToken,
          qbRefreshToken: activeSession.session.qbRefreshToken,
          qbTokenExpiresAt: activeSession.session.qbTokenExpiresAt,
          realmId: activeSession.session.realmId,
          userId: undefined, // Optional: extract from request if available
          createdAt: Date.now(),
        });

        console.log(`  ✓ Linked new user session to existing company connection`);
        console.log(`  → Original admin remains unchanged (no QB "Assign new admin" screen)`);

        // Generate MCP authorization code
        const mcpAuthCode = generateAuthCode();
        console.log(`  ✓ Generated MCP auth code: ${mcpAuthCode.substring(0, 16)}...`);

        // Store authorization code
        const authCodeStorage = getAuthCodeStorage();
        authCodeStorage.storeAuthCode(mcpAuthCode, {
          sessionId: newSessionId,
          claudeState: state as string,
        });

        console.log(`  ✓ Stored authorization code`);

        // Build Claude callback URL
        const claudeCallbackUrl = `${redirect_uri}?code=${mcpAuthCode}&state=${state}`;

        console.log(`  ✓ Redirecting to Claude: ${claudeCallbackUrl.substring(0, 80)}...`);
        console.log(`  ✅ User automatically connected without QuickBooks OAuth!`);

        // Redirect back to Claude Desktop
        return res.redirect(claudeCallbackUrl);
      }

      // No active session found - proceed with QuickBooks OAuth
      console.log(`  → No active company connection found`);
      console.log(`  → Proceeding with QuickBooks OAuth (user will see QB authorization)`);
    } finally {
      // Always release the lock
      release();
    }

    // Generate session ID
    const sessionId = generateSessionId();
    console.log(`  ✓ Generated session ID: ${sessionId}`);

    // Create QuickBooks OAuth state (encodes claudeState + sessionId)
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

    console.log(`  ✓ Stored QB OAuth state: ${qbState.substring(0, 20)}...`);

    // Get QuickBooks OAuth configuration
    const qbClientId = process.env.QUICKBOOKS_CLIENT_ID;
    const qbRedirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
    const qbEnvironment = process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox';

    if (!qbClientId || !qbRedirectUri) {
      console.error('  ✗ Missing QuickBooks OAuth configuration');
      return res.status(500).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2 style="color: #d32f2f;">Server Configuration Error</h2>
            <p>QuickBooks OAuth is not configured. Please contact the administrator.</p>
          </body>
        </html>
      `);
    }

    // Build QuickBooks authorization URL
    const qbAuthUrl = buildQuickBooksAuthUrl({
      clientId: qbClientId,
      redirectUri: qbRedirectUri,
      state: qbState,
      environment: qbEnvironment as 'sandbox' | 'production',
    });

    console.log(`  ✓ Redirecting to QuickBooks: ${qbAuthUrl.substring(0, 80)}...`);
    console.log(`  → User will authorize QuickBooks, then return with realmId`);

    // Redirect to QuickBooks
    res.redirect(qbAuthUrl);
  } catch (error) {
    console.error('Error in /authorize endpoint:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h2 style="color: #d32f2f;">Internal Server Error</h2>
          <p>An error occurred while processing your authorization request.</p>
          <p>Please try again or contact support.</p>
        </body>
      </html>
    `);
  }
}

/**
 * Validate OAuth 2.0 authorize parameters
 */
function validateAuthorizeParams(params: {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
}): string | null {
  if (!params.response_type) {
    return 'Missing required parameter: response_type';
  }

  if (params.response_type !== 'code') {
    return `Invalid response_type: ${params.response_type} (must be "code")`;
  }

  if (!params.client_id) {
    return 'Missing required parameter: client_id';
  }

  if (!params.redirect_uri) {
    return 'Missing required parameter: redirect_uri';
  }

  if (!params.code_challenge) {
    return 'Missing required parameter: code_challenge (PKCE is required)';
  }

  if (!params.code_challenge_method) {
    return 'Missing required parameter: code_challenge_method';
  }

  if (params.code_challenge_method !== 'S256' && params.code_challenge_method !== 'plain') {
    return `Invalid code_challenge_method: ${params.code_challenge_method} (must be "S256" or "plain")`;
  }

  if (!params.state) {
    return 'Missing required parameter: state';
  }

  return null;
}

/**
 * Build QuickBooks authorization URL
 */
function buildQuickBooksAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  environment: 'sandbox' | 'production';
}): string {
  // QuickBooks OAuth endpoints
  const authEndpoint =
    params.environment === 'production'
      ? 'https://appcenter.intuit.com/connect/oauth2'
      : 'https://appcenter.intuit.com/connect/oauth2';

  const queryParams = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: 'com.intuit.quickbooks.accounting',
    response_type: 'code',
    state: params.state,
  });

  return `${authEndpoint}?${queryParams.toString()}`;
}
