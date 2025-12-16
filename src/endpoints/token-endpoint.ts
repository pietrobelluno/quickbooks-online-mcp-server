/**
 * OAuth 2.0 /token Endpoint Handler
 *
 * Handles token exchange requests from Claude Desktop.
 * Implements OAuth 2.0 Authorization Code Grant with PKCE verification.
 *
 * Flow:
 * 1. Claude Desktop → POST /token (with auth code + code_verifier)
 * 2. Validate grant_type and client_id
 * 3. Look up authorization code
 * 4. Verify PKCE (code_verifier matches stored code_challenge)
 * 5. Generate MCP access token
 * 6. Link MCP token to QuickBooks session (which has realmId!)
 * 7. Return access token to Claude Desktop
 *
 * Expected body parameters from Claude:
 * - grant_type: "authorization_code"
 * - code: Authorization code from /oauth/callback
 * - code_verifier: PKCE code verifier
 * - client_id: Claude client ID
 * - redirect_uri: https://claude.ai/api/mcp/auth_callback (optional)
 */

import { Request, Response } from 'express';
import { getAuthCodeStorage } from '../storage/auth-code-storage.js';
import { getPKCEStorage } from '../storage/pkce-storage.js';
import { getMCPTokenStorage } from '../storage/mcp-token-storage.js';
import { verifyPKCE, isValidCodeVerifier } from '../utils/pkce-verifier.js';
import { generateMCPToken } from '../utils/token-generator.js';

/**
 * Handle POST /token requests from Claude Desktop
 */
export async function handleTokenEndpoint(req: Request, res: Response): Promise<any> {
  try {
    console.log('\n→ OAuth /token request from Claude Desktop');

    // Extract token request parameters
    const { grant_type, code, code_verifier, client_id, redirect_uri } = req.body;

    // Log request details (don't log code_verifier for security)
    console.log(`  → grant_type: ${grant_type}`);
    console.log(`  → code: ${code ? code.substring(0, 16) + '...' : 'missing'}`);
    console.log(`  → code_verifier: ${code_verifier ? '[present]' : 'missing'}`);
    console.log(`  → client_id: ${client_id}`);
    console.log(`  → redirect_uri: ${redirect_uri || '(not provided)'}`);

    // Validate grant_type
    if (!grant_type || grant_type !== 'authorization_code') {
      console.error(`  ✗ Invalid grant_type: ${grant_type}`);
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'grant_type must be "authorization_code"',
      });
    }

    // Note: client_id is user-provided in Claude Desktop, no validation needed
    console.log(`  ✓ Client ID: ${client_id || 'none'}`);

    // Validate authorization code
    if (!code) {
      console.error('  ✗ Missing authorization code');
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameter: code',
      });
    }

    // Validate code_verifier
    if (!code_verifier) {
      console.error('  ✗ Missing code_verifier (PKCE required)');
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameter: code_verifier (PKCE required)',
      });
    }

    if (!isValidCodeVerifier(code_verifier)) {
      console.error('  ✗ Invalid code_verifier format');
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Invalid code_verifier format',
      });
    }

    // Look up authorization code
    const authCodeStorage = getAuthCodeStorage();
    const authCode = authCodeStorage.getAuthCode(code);

    if (!authCode) {
      console.error(`  ✗ Authorization code not found or expired: ${code.substring(0, 16)}...`);
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid or expired authorization code',
      });
    }

    console.log(`  ✓ Found authorization code for session: ${authCode.sessionId}`);

    // Mark authorization code as used (prevent replay attacks)
    authCodeStorage.markAsUsed(code);
    console.log('  ✓ Marked authorization code as used');

    // Get PKCE challenge
    const pkceStorage = getPKCEStorage();
    const pkceChallenge = pkceStorage.getPKCE(authCode.claudeState);

    if (!pkceChallenge) {
      console.error(
        `  ✗ PKCE challenge not found for state: ${authCode.claudeState.substring(0, 20)}...`
      );
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'PKCE challenge not found or expired',
      });
    }

    console.log(`  ✓ Found PKCE challenge (method: ${pkceChallenge.codeChallengeMethod})`);

    // Verify PKCE
    const pkceValid = verifyPKCE(
      code_verifier,
      pkceChallenge.codeChallenge,
      pkceChallenge.codeChallengeMethod
    );

    if (!pkceValid) {
      console.error('  ✗ PKCE verification failed');
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'PKCE verification failed',
      });
    }

    console.log('  ✓ PKCE verification successful');

    // Verify client_id matches (prevent authorization code theft)
    if (pkceChallenge.clientId !== client_id) {
      console.error(
        `  ✗ Client ID mismatch: expected ${pkceChallenge.clientId}, got ${client_id}`
      );
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Authorization code was issued to a different client',
      });
    }

    console.log('  ✓ Client ID validation successful');

    // Clean up PKCE challenge (no longer needed)
    pkceStorage.deletePKCE(authCode.claudeState);

    // Generate MCP access token
    const mcpToken = generateMCPToken();
    console.log(`  ✓ Generated MCP token for session: ${mcpToken ? "yes" : "no"}`);

    // Store MCP token linked to QuickBooks session
    const mcpTokenStorage = getMCPTokenStorage();
    await mcpTokenStorage.initialize(); // Ensure storage is initialized
    await mcpTokenStorage.storeToken(mcpToken, {
      sessionId: authCode.sessionId,
    });

    console.log(
      `  ✓ Stored MCP token → session: ${authCode.sessionId} → QB session (with realmId!)`
    );

    // Return token response (OAuth 2.0 standard format)
    const tokenResponse = {
      access_token: mcpToken,
      token_type: 'Bearer',
      expires_in: 3600, // 1 hour
    };

    console.log('  ✓ Token exchange successful');
    console.log('  → Claude Desktop can now use this token for /mcp requests');

    res.json(tokenResponse);
  } catch (error) {
    console.error('Error in /token endpoint:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'An internal server error occurred',
    });
  }
}
