#!/usr/bin/env node

/**
 * QuickBooks MCP Server - HTTP Entry Point
 *
 * Production-ready Express server for Copilot Studio integration.
 * Supports OAuth 2.0 tokens from Copilot Studio (multi-user).
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { QuickbooksMCPServer } from "./server/qbo-mcp-server.js";
import { RegisterTool } from "./helpers/register-tool.js";
import { config } from "./config/server-config.js";
import { quickbooksClient } from "./clients/quickbooks-client.js";

// Import read-only tools (Search + Get/Read for all entities)
// Core Business
import { SearchCustomersTool } from "./tools/search-customers.tool.js";
import { GetCustomerTool } from "./tools/get-customer.tool.js";
import { SearchInvoicesTool } from "./tools/search-invoices.tool.js";
import { ReadInvoiceTool } from "./tools/read-invoice.tool.js";
import { SearchItemsTool } from "./tools/search-items.tool.js";
import { ReadItemTool } from "./tools/read-item.tool.js";
import { SearchVendorsTool } from "./tools/search-vendors.tool.js";
import { GetVendorTool } from "./tools/get-vendor.tool.js";

// Financial
import { SearchBillsTool } from "./tools/search-bills.tool.js";
import { GetBillTool } from "./tools/get-bill.tool.js";
import { SearchEstimatesTool } from "./tools/search-estimates.tool.js";
import { GetEstimateTool } from "./tools/get-estimate.tool.js";
import { SearchBillPaymentsTool } from "./tools/search-bill-payments.tool.js";
import { GetBillPaymentTool } from "./tools/get-bill-payment.tool.js";
import { SearchPurchasesTool } from "./tools/search-purchases.tool.js";
import { GetPurchaseTool } from "./tools/get-purchase.tool.js";

// Other
import { SearchEmployeesTool } from "./tools/search-employees.tool.js";
import { GetEmployeeTool } from "./tools/get-employee.tool.js";
import { SearchJournalEntriesTool } from "./tools/search-journal-entries.tool.js";
import { GetJournalEntryTool } from "./tools/get-journal-entry.tool.js";
import { SearchAccountsTool } from "./tools/search-accounts.tool.js";

// Query tools (flexible querying)
import { QueryDataTool } from "./tools/query-data.tool.js";
import { QueryReportsTool } from "./tools/query-reports.tool.js";

// Import destructive tools (Create/Update/Delete for all entities)
// Create tools
import { CreateCustomerTool } from "./tools/create-customer.tool.js";
import { CreateInvoiceTool } from "./tools/create-invoice.tool.js";
import { CreateItemTool } from "./tools/create-item.tool.js";
import { CreateVendorTool } from "./tools/create-vendor.tool.js";
import { CreateBillTool } from "./tools/create-bill.tool.js";
import { CreateEstimateTool } from "./tools/create-estimate.tool.js";
import { CreateBillPaymentTool } from "./tools/create-bill-payment.tool.js";
import { CreatePurchaseTool } from "./tools/create-purchase.tool.js";
import { CreateEmployeeTool } from "./tools/create-employee.tool.js";
import { CreateJournalEntryTool } from "./tools/create-journal-entry.tool.js";
import { CreateAccountTool } from "./tools/create-account.tool.js";

// Update tools
import { UpdateCustomerTool } from "./tools/update-customer.tool.js";
import { UpdateInvoiceTool } from "./tools/update-invoice.tool.js";
import { UpdateItemTool } from "./tools/update-item.tool.js";
import { UpdateVendorTool } from "./tools/update-vendor.tool.js";
import { UpdateBillTool } from "./tools/update-bill.tool.js";
import { UpdateEstimateTool } from "./tools/update-estimate.tool.js";
import { UpdateBillPaymentTool } from "./tools/update-bill-payment.tool.js";
import { UpdatePurchaseTool } from "./tools/update-purchase.tool.js";
import { UpdateEmployeeTool } from "./tools/update-employee.tool.js";
import { UpdateJournalEntryTool } from "./tools/update-journal-entry.tool.js";
import { UpdateAccountTool } from "./tools/update-account.tool.js";

// Delete tools
import { DeleteCustomerTool } from "./tools/delete-customer.tool.js";
import { DeleteVendorTool } from "./tools/delete-vendor.tool.js";
import { DeleteBillTool } from "./tools/delete-bill.tool.js";
import { DeleteEstimateTool } from "./tools/delete-estimate.tool.js";
import { DeleteBillPaymentTool } from "./tools/delete-bill-payment.tool.js";
import { DeletePurchaseTool } from "./tools/delete-purchase.tool.js";
import { DeleteJournalEntryTool } from "./tools/delete-journal-entry.tool.js";

// Tool registry (will be populated by RegisterTool)
const toolRegistry = new Map<string, any>();

// Register a tool in our HTTP server's registry
export function registerHTTPTool(name: string, handler: any) {
  toolRegistry.set(name, handler);
}

// Helper: Extract Bearer token from Authorization header
function extractBearerToken(authHeader: string): string | undefined {
  if (!authHeader) return undefined;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return undefined;
  return parts[1];
}

// Simple MCP request/response handler
async function handleMCPRequest(method: string, params: any): Promise<any> {
  switch (method) {
    case 'tools/list':
      // Return list of registered tools with JSON Schema format
      const tools = Array.from(toolRegistry.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.schema, { target: 'jsonSchema7' }),
        ...(tool.readOnlyHint !== undefined && { readOnlyHint: tool.readOnlyHint }),
        ...(tool.destructiveHint !== undefined && { destructiveHint: tool.destructiveHint }),
      }));
      return { tools };

    case 'tools/call':
      // Call a specific tool
      const tool = toolRegistry.get(params.name);
      if (!tool) {
        throw new Error(`Tool not found: ${params.name}`);
      }

      // Execute the tool handler
      // Wrap arguments in 'params' object as tools expect { params: {...} }
      const result = await tool.handler({ params: params.arguments || {} });
      return result;

    case 'initialize':
      // Handle initialization
      return {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'QuickBooks Online MCP Server',
          version: '1.0.0',
        },
      };

    case 'notifications/initialized':
      // Handle notification that client has initialized
      // This is a notification, so we just acknowledge it
      return {};

    case 'ping':
      // Handle ping request
      return {};

    default:
      // For unknown methods, return empty result instead of error
      console.warn(`Unknown MCP method: ${method} - returning empty result`);
      return {};
  }
}

const main = async () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║   QuickBooks Online MCP Server (Production HTTP Mode)         ║
║   Port: ${config.port}                                                   ║
║   Auth Mode: ${config.authMode}                                        ║
╚════════════════════════════════════════════════════════════════╝
  `);

  // Create MCP server (for SDK compatibility)
  const server = QuickbooksMCPServer.GetServer();

  // Register all tools in both MCP server and HTTP registry
  const tools = [
    // Read-only tools (23 tools = 21 + 2 query tools)
    // Query tools (2 powerful tools for flexible querying)
    QueryDataTool, QueryReportsTool,

    // Core Business (8 tools)
    SearchCustomersTool, GetCustomerTool,
    SearchInvoicesTool, ReadInvoiceTool,
    SearchItemsTool, ReadItemTool,
    SearchVendorsTool, GetVendorTool,

    // Financial (8 tools)
    SearchBillsTool, GetBillTool,
    SearchEstimatesTool, GetEstimateTool,
    SearchBillPaymentsTool, GetBillPaymentTool,
    SearchPurchasesTool, GetPurchaseTool,

    // Other (5 tools)
    SearchEmployeesTool, GetEmployeeTool,
    SearchJournalEntriesTool, GetJournalEntryTool,
    SearchAccountsTool,

    // Destructive tools (31 tools)
    // Create tools (11 tools)
    CreateCustomerTool, CreateInvoiceTool, CreateItemTool, CreateVendorTool,
    CreateBillTool, CreateEstimateTool, CreateBillPaymentTool, CreatePurchaseTool,
    CreateEmployeeTool, CreateJournalEntryTool, CreateAccountTool,

    // Update tools (13 tools)
    UpdateCustomerTool, UpdateInvoiceTool, UpdateItemTool, UpdateVendorTool,
    UpdateBillTool, UpdateEstimateTool, UpdateBillPaymentTool, UpdatePurchaseTool,
    UpdateEmployeeTool, UpdateJournalEntryTool, UpdateAccountTool,

    // Delete tools (7 tools)
    DeleteCustomerTool, DeleteVendorTool, DeleteBillTool, DeleteEstimateTool,
    DeleteBillPaymentTool, DeletePurchaseTool, DeleteJournalEntryTool
  ];

  for (const tool of tools) {
    RegisterTool(server, tool as any); // Register with MCP server
    registerHTTPTool(tool.name, tool); // Register with HTTP server
  }

  console.log(`✓ Registered ${tools.length} QuickBooks tools (23 read-only + 29 destructive)`);

  // Create Express app
  const app = express();

  // Trust proxy (ALB is 1 hop away)
  app.set('trust proxy', 1);

  // Body parsers - support both JSON and URL-encoded (OAuth uses URL-encoded)
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Rate limiting for MCP endpoint (prevent abuse/DoS)
  const mcpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
  });

  // Rate limiting for OAuth endpoints (prevent brute force attacks)
  const oauthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 OAuth requests per window
    message: 'Too many OAuth requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', server: 'QuickBooks MCP Server' });
  });

  // Claude Desktop OAuth 2.0 endpoints (with rate limiting)
  const { handleAuthorizeEndpoint } = await import('./endpoints/authorize-endpoint.js');
  const { handleTokenEndpoint } = await import('./endpoints/token-endpoint.js');

  app.get('/authorize', oauthLimiter, handleAuthorizeEndpoint);
  app.post('/token', oauthLimiter, handleTokenEndpoint);

  console.log('✓ Registered Claude Desktop OAuth endpoints: /authorize, /token');

  // Legacy OAuth initiation endpoint (kept for backward compatibility, but not used by Claude Desktop)
  app.get('/start-oauth', (req, res) => {
    try {
      console.log('\n→ OAuth initiation requested');

      const userId = req.query.userId as string;

      if (!userId) {
        return res.status(400).send(`
          <html>
            <body style="font-family: Arial; padding: 40px; text-align: center;">
              <h2 style="color: #d32f2f;">Invalid Request</h2>
              <p>Missing user ID parameter</p>
            </body>
          </html>
        `);
      }

      console.log(`  ✓ Initiating OAuth for user: ${userId}`);

      // Create state with user ID for correlation
      const state = Buffer.from(JSON.stringify({
        userId,
        timestamp: Date.now(),
      })).toString('base64');

      const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:8000/callback';

      // Generate QuickBooks OAuth URL
      const authUrl = `https://appcenter.intuit.com/connect/oauth2?` +
        `client_id=${encodeURIComponent(process.env.QUICKBOOKS_CLIENT_ID || '')}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent('com.intuit.quickbooks.accounting')}&` +
        `response_type=code&` +
        `state=${encodeURIComponent(state)}`;

      console.log(`  → Redirecting to QuickBooks authorization...`);

      // Redirect user to QuickBooks
      res.redirect(authUrl);

    } catch (error: any) {
      console.error('Error initiating OAuth:', error);
      res.status(500).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2 style="color: #d32f2f;">Server Error</h2>
            <p>Failed to initiate QuickBooks authorization</p>
          </body>
        </html>
      `);
    }
  });

  // OAuth callback intercept endpoint (for Claude Desktop OAuth flow)
  app.get('/oauth/callback', async (req, res) => {
    try {
      console.log('\n→ OAuth callback received from QuickBooks');

      // Extract parameters from QuickBooks callback
      const code = req.query.code as string;
      const realmId = req.query.realmId as string;
      const state = req.query.state as string;
      const error = req.query.error as string;

      // Handle OAuth errors
      if (error) {
        console.error(`  ✗ OAuth error: ${error}`);
        return res.status(400).send(`
          <html>
            <body style="font-family: Arial; padding: 40px; text-align: center;">
              <h2 style="color: #d32f2f;">Authorization Failed</h2>
              <p>Error: ${error}</p>
              <p>Please close this window and try again.</p>
            </body>
          </html>
        `);
      }

      // Validate required parameters
      if (!code || !realmId || !state) {
        console.error('  ✗ Missing required OAuth parameters');
        console.error(`  code: ${code ? 'present' : 'missing'}`);
        console.error(`  realmId: ${realmId ? 'present' : 'missing'}`);
        console.error(`  state: ${state ? 'present' : 'missing'}`);
        return res.status(400).send(`
          <html>
            <body style="font-family: Arial; padding: 40px; text-align: center;">
              <h2 style="color: #d32f2f;">Invalid OAuth Callback</h2>
              <p>Missing required parameters (code, realmId, or state)</p>
              <p>Please close this window and try again.</p>
            </body>
          </html>
        `);
      }

      console.log(`  ✓ Captured realmId: ${realmId} (THIS IS THE CRITICAL PIECE!)`);
      console.log(`  ✓ State token: ${state.substring(0, 20)}...`);

      // Import Claude Desktop OAuth utilities
      const { decodeQBState } = await import('./utils/token-generator.js');
      const { getQBOAuthStateStorage } = await import('./storage/qb-oauth-state-storage.js');
      const { getQuickBooksSessionStorage } = await import('./storage/quickbooks-session-storage.js');
      const { getAuthCodeStorage } = await import('./storage/auth-code-storage.js');
      const { generateAuthCode } = await import('./utils/token-generator.js');

      // Decode QB state to get claudeState and sessionId
      let claudeState: string;
      let sessionId: string;

      try {
        const decoded = decodeQBState(state);
        claudeState = decoded.claudeState;
        sessionId = decoded.sessionId;
        console.log(`  ✓ Decoded QB state → claudeState: ${claudeState.substring(0, 20)}...`);
        console.log(`  ✓ Decoded QB state → sessionId: ${sessionId}`);
      } catch (decodeError) {
        console.error('  ✗ Failed to decode QB state:', decodeError);
        return res.status(400).send(`
          <html>
            <body style="font-family: Arial; padding: 40px; text-align: center;">
              <h2 style="color: #d32f2f;">Invalid OAuth State</h2>
              <p>Could not decode OAuth state parameter.</p>
              <p>Please restart the authorization process.</p>
            </body>
          </html>
        `);
      }

      // Exchange QB authorization code for tokens
      console.log('  → Exchanging QuickBooks authorization code for tokens...');

      let qbTokens: any;
      try {
        // Use the OAuth client to exchange code for tokens
        const fullCallbackUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        qbTokens = await quickbooksClient['oauthClient'].createToken(fullCallbackUrl);
        console.log('  ✓ Successfully exchanged code for QuickBooks tokens');
      } catch (tokenError) {
        console.error('  ✗ Failed to exchange code for tokens:', tokenError);
        return res.status(500).send(`
          <html>
            <body style="font-family: Arial; padding: 40px; text-align: center;">
              <h2 style="color: #d32f2f;">Token Exchange Failed</h2>
              <p>Failed to exchange authorization code for QuickBooks tokens.</p>
              <p>Please try again or contact support.</p>
            </body>
          </html>
        `);
      }

      // Extract tokens from response
      const accessToken = qbTokens.token.access_token;
      const refreshToken = qbTokens.token.refresh_token;
      const expiresIn = qbTokens.token.expires_in; // seconds

      console.log(`  ✓ Access token received`);
      console.log(`  ✓ Refresh token received`);
      console.log(`  ✓ Expires in: ${expiresIn} seconds`);

      // Store QuickBooks session with realmId (THIS IS THE ANSWER TO THE USER'S QUESTION!)
      const qbSessionStorage = getQuickBooksSessionStorage();
      await qbSessionStorage.initialize();
      await qbSessionStorage.storeSession(sessionId, {
        qbAccessToken: accessToken,
        qbRefreshToken: refreshToken,
        qbTokenExpiresAt: Date.now() + (expiresIn * 1000),
        realmId: realmId, // ← THE CRITICAL REALMID STORAGE!
        createdAt: Date.now(),
      });

      console.log(`  ✓ ✓ ✓ STORED QB SESSION WITH REALMID: ${sessionId} → ${realmId}`);
      console.log('  → This session is now available on ALL devices (mobile, desktop, web)!');

      // Generate MCP authorization code for Claude Desktop
      const mcpAuthCode = generateAuthCode();
      console.log(`  ✓ Generated MCP auth code: ${mcpAuthCode.substring(0, 16)}...`);

      // Store authorization code
      const authCodeStorage = getAuthCodeStorage();
      authCodeStorage.storeAuthCode(mcpAuthCode, {
        sessionId,
        claudeState,
      });

      console.log('  ✓ Stored authorization code');

      // Clean up QB OAuth state (no longer needed)
      const qbOAuthStateStorage = getQBOAuthStateStorage();
      qbOAuthStateStorage.deleteQBState(state);

      // Build Claude callback URL
      const claudeRedirectUri = process.env.CLAUDE_REDIRECT_URI || 'https://claude.ai/api/mcp/auth_callback';
      const claudeCallbackUrl = `${claudeRedirectUri}?code=${mcpAuthCode}&state=${claudeState}`;

      console.log(`  ✓ Redirecting to Claude: ${claudeCallbackUrl.substring(0, 80)}...`);
      console.log('  → Claude will exchange this code for an MCP token at /token');

      // Redirect to Claude
      res.redirect(claudeCallbackUrl);

    } catch (error: any) {
      console.error('Error in OAuth callback:', error);
      res.status(500).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2 style="color: #d32f2f;">Server Error</h2>
            <p>Internal server error during OAuth callback</p>
            <p>Please close this window and contact support.</p>
          </body>
        </html>
      `);
    }
  });

  // Disconnect endpoint (required by Intuit for production apps)
  app.get('/disconnect', async (req, res) => {
    try {
      console.log('\n→ QuickBooks disconnect request received');

      // Extract realm ID from query parameters (sent by QuickBooks)
      const realmId = req.query.realmId as string;

      if (!realmId) {
        console.warn('  ⚠ Disconnect called without realm ID');
        return res.status(400).send(`
          <html>
            <body style="font-family: Arial; padding: 40px; text-align: center;">
              <h2 style="color: #d32f2f;">Invalid Disconnect Request</h2>
              <p>Missing realm ID parameter.</p>
            </body>
          </html>
        `);
      }

      console.log(`  → Disconnecting realm ID: ${realmId}`);

      // Import Claude Desktop storage
      const { getQuickBooksSessionStorage } = await import('./storage/quickbooks-session-storage.js');

      // Find session with this realm ID (reverse lookup)
      const qbSessionStorage = getQuickBooksSessionStorage();
      await qbSessionStorage.initialize();
      const sessionId = qbSessionStorage.getSessionIdByRealmId(realmId);

      if (sessionId) {
        // Remove the session from storage
        await qbSessionStorage.deleteSession(sessionId);
        console.log(`  ✓ Deleted QB session: ${sessionId}`);
        console.log(`  ✓ User can now reconnect with a different company`);

        return res.status(200).send(`
          <html>
            <body style="font-family: Arial; padding: 40px; text-align: center;">
              <h2 style="color: #2E8B57;">✓ QuickBooks Disconnected</h2>
              <p>Your QuickBooks connection has been successfully removed.</p>
              <p>To reconnect, please initiate the OAuth flow again from Claude Desktop.</p>
              <p>You can close this window now.</p>
            </body>
          </html>
        `);
      } else {
        // Realm ID not found in storage (maybe already deleted, or never connected via our system)
        console.warn(`  ⚠ Realm ID ${realmId} not found in storage`);
        console.log(`  → This could be normal if user never completed OAuth flow`);

        return res.status(200).send(`
          <html>
            <body style="font-family: Arial; padding: 40px; text-align: center;">
              <h2 style="color: #2E8B57;">✓ QuickBooks Disconnected</h2>
              <p>Your QuickBooks connection has been removed.</p>
              <p>You can close this window now.</p>
            </body>
          </html>
        `);
      }
    } catch (error: any) {
      console.error('Error handling disconnect:', error);
      return res.status(500).send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2 style="color: #d32f2f;">Server Error</h2>
            <p>Failed to process disconnect request.</p>
            <p>Please contact your administrator.</p>
          </body>
        </html>
      `);
    }
  });

  // End-User License Agreement endpoint
  app.get('/eula', (req, res) => {
    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>End-User License Agreement</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
          }
          h1 { color: #2E8B57; }
          h2 { color: #333; margin-top: 30px; }
          .date { color: #666; font-style: italic; }
        </style>
      </head>
      <body>
        <h1>End-User License Agreement</h1>
        <p class="date"><strong>Effective Date:</strong> ${new Date().toLocaleDateString()}</p>

        <p>This QuickBooks MCP Server is provided for integration with Microsoft Copilot Studio.</p>

        <h2>1. License Grant</h2>
        <p>You are granted a non-exclusive, non-transferable license to use this software for accessing your QuickBooks data through Microsoft Teams and Copilot Studio.</p>

        <h2>2. Permitted Use</h2>
        <p>This software enables you to:</p>
        <ul>
          <li>Access your QuickBooks Online data via natural language queries</li>
          <li>Perform operations on your QuickBooks company through conversational AI</li>
          <li>Integrate QuickBooks functionality into Microsoft Teams workflows</li>
        </ul>

        <h2>3. Data Usage</h2>
        <ul>
          <li>This application accesses QuickBooks data on your behalf using OAuth 2.0 authentication</li>
          <li>Data is processed in real-time to respond to your queries</li>
          <li>No QuickBooks data is stored permanently by this application</li>
          <li>You can disconnect and revoke access at any time</li>
        </ul>

        <h2>4. User Responsibilities</h2>
        <p>You agree to:</p>
        <ul>
          <li>Use this software in compliance with QuickBooks' terms of service</li>
          <li>Maintain the security of your authentication credentials</li>
          <li>Use the software only for lawful business purposes</li>
        </ul>

        <h2>5. Limitations</h2>
        <p>This software is provided "as is" without warranties of any kind. The licensor is not responsible for data loss, business interruption, or any damages arising from use of this software.</p>

        <h2>6. Termination</h2>
        <p>You may terminate this agreement at any time by disconnecting your QuickBooks account and ceasing use of the software.</p>

        <p><small><em>This is a test document for production approval and will be updated with final legal terms.</em></small></p>
      </body>
      </html>
    `);
  });

  // Privacy Policy endpoint
  app.get('/privacy', (req, res) => {
    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Privacy Policy</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
          }
          h1 { color: #2E8B57; }
          h2 { color: #333; margin-top: 30px; }
          .date { color: #666; font-style: italic; }
        </style>
      </head>
      <body>
        <h1>Privacy Policy</h1>
        <p class="date"><strong>Effective Date:</strong> ${new Date().toLocaleDateString()}</p>

        <p>This Privacy Policy describes how the QuickBooks MCP Server handles your data when integrated with Microsoft Copilot Studio.</p>

        <h2>1. Information We Access</h2>
        <p>When you connect your QuickBooks account, this application accesses:</p>
        <ul>
          <li>QuickBooks company data (customers, invoices, transactions, etc.)</li>
          <li>Your QuickBooks company ID (Realm ID)</li>
          <li>OAuth access tokens provided by QuickBooks and Microsoft</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <p>Your QuickBooks data is used exclusively to:</p>
        <ul>
          <li>Process and respond to your queries in Microsoft Teams</li>
          <li>Perform operations you request on your QuickBooks company</li>
          <li>Maintain your connection between QuickBooks and Copilot Studio</li>
        </ul>

        <h2>3. Data Storage</h2>
        <p><strong>We do NOT permanently store your QuickBooks data.</strong> Specifically:</p>
        <ul>
          <li>QuickBooks business data (customers, invoices, etc.) is processed in real-time and not retained</li>
          <li>We only store your user ID → QuickBooks Realm ID mapping to maintain your connection</li>
          <li>OAuth tokens are managed by QuickBooks and Microsoft - we use them transiently</li>
        </ul>

        <h2>4. Data Security</h2>
        <p>We implement security measures including:</p>
        <ul>
          <li>All connections use HTTPS encryption</li>
          <li>OAuth 2.0 authentication (industry standard)</li>
          <li>No permanent storage of sensitive business data</li>
          <li>Session-based access token handling</li>
        </ul>

        <h2>5. Data Sharing</h2>
        <p>We do NOT share, sell, or transfer your QuickBooks data to third parties. Data flows only between:</p>
        <ul>
          <li>Your QuickBooks account</li>
          <li>This MCP Server application</li>
          <li>Microsoft Copilot Studio (to display responses)</li>
        </ul>

        <h2>6. Your Rights and Control</h2>
        <p>You have complete control:</p>
        <ul>
          <li>Revoke access at any time through QuickBooks or the disconnect URL</li>
          <li>Your QuickBooks data remains in your QuickBooks account</li>
          <li>Request deletion of stored user mappings by contacting your administrator</li>
        </ul>

        <h2>7. Contact Information</h2>
        <p>For privacy concerns or questions about this policy, contact your system administrator.</p>

        <p><small><em>This is a test document for production approval and will be updated with final privacy policy.</em></small></p>
      </body>
      </html>
    `);
  });

  // Main MCP endpoint (with rate limiting)
  app.post('/mcp', mcpLimiter, async (req, res) => {
    try {
      console.log(`\n→ Incoming MCP request from Claude Desktop`);

      // Parse MCP JSON-RPC request
      const { jsonrpc, method, params, id } = req.body;

      console.log(`  → Method: ${method}`);

      // Extract MCP token from Authorization header
      const authHeader = req.headers.authorization || req.headers.Authorization;
      const mcpToken = authHeader ? extractBearerToken(authHeader as string) : undefined;

      if (!mcpToken) {
        console.error('  ✗ Missing Authorization header');
        return res.status(401).json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32001,
            message: 'Missing Authorization header. Please authenticate first.',
          },
        });
      }

      console.log(`  ✓ MCP token validated`);

      // Import Claude Desktop auth utilities
      const { getMCPTokenStorage } = await import('./storage/mcp-token-storage.js');
      const { getQuickBooksSessionStorage } = await import('./storage/quickbooks-session-storage.js');
      const { getTokenRefreshService } = await import('./services/token-refresh-service.js');

      // Validate MCP token
      const mcpTokenStorage = getMCPTokenStorage();
      await mcpTokenStorage.initialize();
      const tokenSession = mcpTokenStorage.getToken(mcpToken);

      if (!tokenSession || tokenSession.expiresAt < Date.now()) {
        console.error('  ✗ Invalid or expired MCP token');
        return res.status(401).json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32002,
            message: 'Invalid or expired token. Please re-authenticate.',
          },
        });
      }

      console.log(`  ✓ Token valid, session: ${tokenSession.sessionId}`);

      // Get QuickBooks session (contains realmId + tokens)
      const qbSessionStorage = getQuickBooksSessionStorage();
      await qbSessionStorage.initialize();
      const qbSession = qbSessionStorage.getSession(tokenSession.sessionId);

      if (!qbSession) {
        console.error(`  ✗ QuickBooks session not found: ${tokenSession.sessionId}`);
        return res.status(403).json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32003,
            message: 'QuickBooks session not found. Please re-authenticate.',
          },
        });
      }

      console.log(`  ✓ QuickBooks session found → realmId: ${qbSession.realmId}`);

      // Auto-refresh QuickBooks tokens if needed (< 5 min remaining)
      const tokenRefreshService = getTokenRefreshService(quickbooksClient);
      await tokenRefreshService.refreshQuickBooksTokenIfNeeded(tokenSession.sessionId);

      // Reload session after potential refresh
      const refreshedSession = qbSessionStorage.getSession(tokenSession.sessionId);
      if (!refreshedSession) {
        console.error('  ✗ Session lost after refresh');
        return res.status(500).json({
          jsonrpc: '2.0',
          id,
          error: { code: -32004, message: 'Session error' },
        });
      }

      // Set QuickBooks credentials for this request
      console.log('  → Configuring QuickBooks client with session credentials');
      quickbooksClient.setExternalAuth(refreshedSession.qbAccessToken, refreshedSession.realmId);
      console.log('  ✓ QuickBooks client configured - ready for API calls!');

      if (jsonrpc !== '2.0') {
        return res.status(400).json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32600,
            message: 'Invalid JSON-RPC version',
          },
        });
      }

      // Handle the request
      const result = await handleMCPRequest(method, params);

      // Send JSON-RPC response
      res.json({
        jsonrpc: '2.0',
        id,
        result,
      });
    } catch (error: any) {
      // Enhanced error logging
      console.error('Error handling MCP request:', {
        error: error.message || 'Unknown error',
        method: req.body?.method,
        timestamp: new Date().toISOString(),
        stack: error.stack,
      });

      // Special handling for missing realm ID (should not happen with Claude Desktop OAuth)
      if (error.message === 'REALM_ID_REQUIRED') {
        console.log(`  → Realm ID missing - user needs to re-authenticate`);

        return res.json({
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32603,
            message: 'QuickBooks authentication required. Please re-authenticate with Claude Desktop.',
          },
        });
      }

      // Default error handling
      res.json({
        jsonrpc: '2.0',
        id: req.body.id,
        error: {
          code: -32603,
          message: error.message || 'Internal error',
        },
      });
    }
  });

  // Start HTTP server
  app.listen(config.port, () => {
    console.log(`\n🚀 Server running on http://localhost:${config.port}`);
    console.log(`📡 MCP endpoint: http://localhost:${config.port}/mcp`);
    console.log(`💓 Health check: http://localhost:${config.port}/health`);
    console.log(`\n💡 Ready for Copilot Studio connections!\n`);
  });
};

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
