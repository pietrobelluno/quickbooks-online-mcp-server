#!/usr/bin/env node

/**
 * QuickBooks MCP Server - HTTP Entry Point
 *
 * Production-ready Express server for Copilot Studio integration.
 * Supports OAuth 2.0 tokens from Copilot Studio (multi-user).
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { QuickbooksMCPServer } from "./server/qbo-mcp-server.js";
import { RegisterTool } from "./helpers/register-tool.js";
import { config } from "./config/server-config.js";
import { createAuthContext, storeUserRealmId } from "./middleware/auth-middleware.js";
import { quickbooksClient } from "./clients/quickbooks-client.js";
import { getUserRealmStorage } from "./storage/user-realm-storage.js";

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

// Tool registry (will be populated by RegisterTool)
const toolRegistry = new Map<string, any>();

// Register a tool in our HTTP server's registry
export function registerHTTPTool(name: string, handler: any) {
  toolRegistry.set(name, handler);
}

// Simple MCP request/response handler
async function handleMCPRequest(method: string, params: any): Promise<any> {
  switch (method) {
    case 'tools/list':
      // Return list of registered tools
      const tools = Array.from(toolRegistry.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.schema,
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

  // Register all read-only tools in both MCP server and HTTP registry
  const tools = [
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
    SearchAccountsTool
  ];

  for (const tool of tools) {
    RegisterTool(server, tool as any); // Register with MCP server
    registerHTTPTool(tool.name, tool); // Register with HTTP server
  }

  console.log(`✓ Registered ${tools.length} read-only QuickBooks tools`);

  // Create Express app
  const app = express();

  // Trust proxy (ALB is 1 hop away)
  app.set('trust proxy', 1);

  app.use(express.json());

  // Rate limiting for MCP endpoint (prevent abuse/DoS)
  const mcpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', server: 'QuickBooks MCP Server' });
  });

  // OAuth initiation endpoint for realm ID capture
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

  // OAuth callback intercept endpoint
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

      console.log(`  ✓ Captured realmId: ${realmId}`);
      console.log(`  ✓ State token: ${state.substring(0, 20)}...`);

      // Try to decode state to extract userId
      let userId: string | undefined;
      let isFromStartOAuth = false;

      try {
        const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
        if (decodedState.userId) {
          userId = decodedState.userId;
          isFromStartOAuth = true;
          console.log(`  ✓ Decoded userId from state: ${userId}`);
        }
      } catch (e) {
        // Not base64 JSON - might be from internal OAuth flow (state="testState")
        console.log(`  → State is not base64 JSON (internal OAuth or direct access)`);
      }

      if (isFromStartOAuth && userId) {
        // This is our realm ID capture flow from /start-oauth
        storeUserRealmId(userId, realmId);
        console.log(`  ✓ Stored permanent mapping: ${userId} → ${realmId}`);

        return res.status(200).send(`
          <html>
            <body style="font-family: Arial; padding: 40px; text-align: center;">
              <h2 style="color: #2E8B57;">✓ QuickBooks Setup Complete!</h2>
              <p>Your QuickBooks company has been linked successfully.</p>
              <p>Realm ID: <code>${realmId}</code></p>
              <p><strong>You can now close this window and retry your request in the chat.</strong></p>
            </body>
          </html>
        `);
      } else {
        // Internal OAuth flow or direct access - just show realm ID
        console.log(`  → Internal OAuth callback (no user mapping)`);

        // Update .env with realm ID for backward compatibility
        console.log(`  → Realm ID captured: ${realmId}`);
        console.log(`  → To use this, add to .env: QUICKBOOKS_REALM_ID=${realmId}`);

        return res.status(200).send(`
          <html>
            <body style="font-family: Arial; padding: 40px; text-align: center;">
              <h2 style="color: #2E8B57;">✓ QuickBooks Connected!</h2>
              <p>Realm ID: <code>${realmId}</code></p>
              <p>To use this realm ID, add it to your <code>.env</code> file:</p>
              <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px;">QUICKBOOKS_REALM_ID=${realmId}</pre>
              <p><small>This was an internal OAuth flow. For multi-user support, please use the setup link from the chat agent.</small></p>
            </body>
          </html>
        `);
      }

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
  app.get('/disconnect', (req, res) => {
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

      // Find user with this realm ID (reverse lookup)
      const storage = getUserRealmStorage(config.realmIdStoragePath);
      const userId = storage.getUserIdByRealmId(realmId);

      if (userId) {
        // Remove the mapping from storage
        storage.removeRealmId(userId);
        console.log(`  ✓ Removed mapping for user: ${userId}`);
        console.log(`  ✓ User can now reconnect with a different company`);

        return res.status(200).send(`
          <html>
            <body style="font-family: Arial; padding: 40px; text-align: center;">
              <h2 style="color: #2E8B57;">✓ QuickBooks Disconnected</h2>
              <p>Your QuickBooks connection has been successfully removed.</p>
              <p>To reconnect with a different company, use the chat agent and click the setup link.</p>
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
    // Extract auth context from headers (declare outside try block for error handling)
    let authContext;

    try {
      console.log(`\n→ Incoming request from Copilot Studio`);

      // Create auth context
      authContext = createAuthContext(req.headers as Record<string, string>);

      // Parse MCP JSON-RPC request first
      const { jsonrpc, method, params, id } = req.body;

      // Configure QuickBooks client with external tokens if available
      if (authContext.accessToken) {
        // We have an access token from Copilot Studio
        const realmId = authContext.realmId || process.env.QUICKBOOKS_REALM_ID || '';

        if (!realmId && method === 'tools/call') {
          // Realm ID is required for tool execution but missing
          // Return setup link as successful response so Copilot Studio displays it
          const userId = authContext.userId || 'unknown';
          const publicUrl = process.env.PUBLIC_SERVER_URL || `http://localhost:${config.port}`;
          const setupUrl = `${publicUrl}/start-oauth?userId=${encodeURIComponent(userId)}`;

          console.warn(`  ⚠ Access token provided but realm ID missing`);
          console.log(`  → Realm ID setup required for user: ${userId}`);
          console.log(`  → Setup URL: ${setupUrl}`);

          // Return setup message as successful MCP tools/call result
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `🔐 QuickBooks Setup Required\n\nPlease click this link to connect your QuickBooks account:\n${setupUrl}\n\nAfter authorizing, please retry your request.`,
                },
              ],
            },
          });
        }

        if (realmId) {
          console.log(`  ✓ Using external OAuth token for realm: ${realmId}`);
        }

        // Set external auth with realm ID (even if empty for non-tool calls)
        quickbooksClient.setExternalAuth(authContext.accessToken, realmId);
      } else {
        console.log(`  → Using internal OAuth (.env tokens)`);
        quickbooksClient.clearExternalAuth();
      }

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
      // Enhanced error logging with context
      console.error('Error handling MCP request:', {
        error: error.message || 'Unknown error',
        method: req.body?.method,
        userId: authContext?.userId,
        realmId: authContext?.realmId,
        timestamp: new Date().toISOString(),
        stack: error.stack,
      });

      // Special handling for missing realm ID
      if (error.message === 'REALM_ID_REQUIRED') {
        const userId = authContext?.userId || 'unknown';
        const publicUrl = process.env.PUBLIC_SERVER_URL || `http://localhost:${config.port}`;
        const setupUrl = `${publicUrl}/start-oauth?userId=${encodeURIComponent(userId)}`;

        console.log(`  → Realm ID setup required for user: ${userId}`);
        console.log(`  → Setup URL: ${setupUrl}`);

        return res.json({
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32603,
            message: `QuickBooks setup required. Please complete authorization: ${setupUrl}\n\nAfter authorizing, please retry your request.`,
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
