import dotenv from "dotenv";
import QuickBooks from "node-quickbooks";
import OAuthClient from "intuit-oauth";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';
import crypto from 'crypto';
import os from 'os';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default credentials (embedded for plug & play experience)
const client_id = process.env.QUICKBOOKS_CLIENT_ID || 'ABpGhVYm2eeC9kElcXiQUkbjWjT2ufhW00J7z7w9lOzCNexREx';
const client_secret = process.env.QUICKBOOKS_CLIENT_SECRET || 'oz6oPxwUOIdU5UeTx0doLdTwR3ThrwiWf141oDT4';
const environment = process.env.QUICKBOOKS_ENVIRONMENT || 'production';

// Hosted OAuth endpoints
const REDIRECT_URI = process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:3000/qbo/callback';
const TOKEN_ENDPOINT = process.env.QUICKBOOKS_TOKEN_ENDPOINT || 'http://localhost:3000/qbo/tokens';

// Only throw error if client_id or client_secret is missing
if (!client_id || !client_secret) {
  throw Error("Client ID and Client Secret must be set");
}

class QuickbooksClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private refreshToken?: string;
  private realmId?: string;
  private readonly environment: string;
  private accessToken?: string;
  private accessTokenExpiry?: number;
  private quickbooksInstance?: QuickBooks;
  private oauthClient: OAuthClient;
  private isAuthenticating: boolean = false;

  constructor() {
    this.clientId = client_id;
    this.clientSecret = client_secret;
    this.environment = environment;

    // Load tokens from file if they exist
    this.loadTokensFromFile();

    this.oauthClient = new OAuthClient({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      environment: this.environment,
      redirectUri: REDIRECT_URI,
    });
  }

  private getTokenFilePath(): string {
    const homeDir = os.homedir();
    const configDir = path.join(homeDir, '.qbo-mcp-server');

    // Create directory if doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    return path.join(configDir, 'tokens.json');
  }

  private loadTokensFromFile(): void {
    try {
      const tokenPath = this.getTokenFilePath();
      if (fs.existsSync(tokenPath)) {
        const data = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
        this.refreshToken = data.refresh_token;
        this.realmId = data.realm_id;
        this.accessToken = data.access_token;
        this.accessTokenExpiry = data.expires_at;
        console.error('Loaded existing tokens from', tokenPath);
      }
    } catch (error) {
      // No tokens yet, will trigger OAuth on first use
      console.error('No existing tokens found, will authenticate on first use');
    }
  }

  private async saveTokensToFile(): Promise<void> {
    const tokenData = {
      refresh_token: this.refreshToken,
      realm_id: this.realmId,
      access_token: this.accessToken,
      expires_at: this.accessTokenExpiry
    };

    const tokenPath = this.getTokenFilePath();
    fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2));
    console.error('Tokens saved to', tokenPath);
  }

  private async startOAuthFlow(): Promise<void> {
    if (this.isAuthenticating) {
      return;
    }

    this.isAuthenticating = true;

    try {
      // Generate unique session ID
      const sessionId = crypto.randomBytes(16).toString('hex');

      // Generate OAuth URL with hosted redirect
      const authUri = this.oauthClient.authorizeUri({
        scope: [OAuthClient.scopes.Accounting as string],
        state: sessionId
      }).toString();

      // Open browser
      console.error('\n🔐 Opening browser for QuickBooks authentication...');
      console.error('📋 Please sign in and authorize the application.');
      await open(authUri);

      // Poll for tokens
      await this.pollForTokens(sessionId);

      this.isAuthenticating = false;
    } catch (error) {
      this.isAuthenticating = false;
      throw error;
    }
  }

  private async pollForTokens(sessionId: string, maxAttempts = 60): Promise<void> {
    console.error('⏳ Waiting for authorization...');

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`${TOKEN_ENDPOINT}/${sessionId}`);

        if (response.ok) {
          const data = await response.json();

          // Save tokens
          this.accessToken = data.access_token;
          this.refreshToken = data.refresh_token;
          this.realmId = data.realm_id;
          this.accessTokenExpiry = Date.now() + (data.expires_in * 1000);

          // Save to file
          await this.saveTokensToFile();

          console.error('✅ Authentication successful!');
          return;
        }
      } catch (error) {
        // Token not ready yet, continue polling
      }

      // Wait 2 seconds before next attempt
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Authentication timeout - please try again. Make sure you clicked "Authorize" in the browser.');
  }

  async refreshAccessToken() {
    if (!this.refreshToken) {
      await this.startOAuthFlow();

      // Verify we have a refresh token after OAuth flow
      if (!this.refreshToken) {
        throw new Error('Failed to obtain refresh token from OAuth flow');
      }
    }

    try {
      // At this point we know refreshToken is not undefined
      const authResponse = await this.oauthClient.refreshUsingToken(this.refreshToken);

      this.accessToken = authResponse.token.access_token;

      // Calculate expiry time
      const expiresIn = authResponse.token.expires_in || 3600; // Default to 1 hour
      this.accessTokenExpiry = Date.now() + (expiresIn * 1000);

      // Save updated tokens
      await this.saveTokensToFile();

      return {
        access_token: this.accessToken,
        expires_in: expiresIn,
      };
    } catch (error: any) {
      throw new Error(`Failed to refresh Quickbooks token: ${error.message}`);
    }
  }

  async authenticate() {
    if (!this.refreshToken || !this.realmId) {
      await this.startOAuthFlow();

      // Verify we have both tokens after OAuth flow
      if (!this.refreshToken || !this.realmId) {
        throw new Error('Failed to obtain required tokens from OAuth flow');
      }
    }

    // Check if token exists and is still valid
    const now = Date.now();
    if (!this.accessToken || !this.accessTokenExpiry || this.accessTokenExpiry <= now) {
      const tokenResponse = await this.refreshAccessToken();
      this.accessToken = tokenResponse.access_token;
    }

    // At this point we know all tokens are available
    this.quickbooksInstance = new QuickBooks(
      this.clientId,
      this.clientSecret,
      this.accessToken,
      false, // no token secret for OAuth 2.0
      this.realmId!, // Safe to use ! here as we checked above
      this.environment === 'sandbox', // use the sandbox?
      false, // debug?
      null, // minor version
      '2.0', // oauth version
      this.refreshToken
    );

    return this.quickbooksInstance;
  }
  
  getQuickbooks() {
    if (!this.quickbooksInstance) {
      throw new Error('Quickbooks not authenticated. Call authenticate() first');
    }
    return this.quickbooksInstance;
  }
}

export const quickbooksClient = new QuickbooksClient();
