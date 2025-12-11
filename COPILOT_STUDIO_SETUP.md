# QuickBooks MCP Server - Copilot Studio Integration Guide

This guide will walk you through setting up the QuickBooks Online MCP Server for use with Microsoft Copilot Studio using a local tunnel.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Step 1: Configure Intuit Developer Account](#step-1-configure-intuit-developer-account)
4. [Step 2: Configure Environment Variables](#step-2-configure-environment-variables)
5. [Step 3: Build the MCP Server](#step-3-build-the-mcp-server)
6. [Step 4: Run with mcp-proxy](#step-4-run-with-mcp-proxy)
7. [Step 5: Set Up Local Tunnel](#step-5-set-up-local-tunnel)
8. [Step 6: Configure Copilot Studio](#step-6-configure-copilot-studio)
9. [Step 7: Test the Integration](#step-7-test-the-integration)
10. [OAuth Authentication Flow](#oauth-authentication-flow)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:

- **Node.js** (v18 or later)
- **Python 3.x** (for mcp-proxy)
- **pipx** (Python package installer)
- **Intuit Developer Account** (free at https://developer.intuit.com/)
- **Microsoft Copilot Studio** access
- **Tunnel tool**: ngrok or cloudflared

---

## Architecture Overview

```
┌─────────────────────┐
│  Copilot Studio     │ (Cloud)
│  (Microsoft Cloud)  │
└──────────┬──────────┘
           │ HTTPS (Streamable HTTP)
           │
┌──────────▼──────────┐
│   Tunnel Service    │ (ngrok/cloudflared)
│   Public URL        │
└──────────┬──────────┘
           │ HTTP
           │
┌──────────▼──────────┐
│   mcp-proxy         │ Port 8080
│   (HTTP Bridge)     │
│   Endpoints:        │
│   - /mcp            │ Streamable HTTP
│   - /sse            │ Server-Sent Events
└──────────┬──────────┘
           │ stdio (stdin/stdout)
           │
┌──────────▼──────────┐
│  QuickBooks MCP     │
│  Server             │
│  (No modifications) │
└─────────────────────┘
           │
           │ OAuth 2.0 (Port 8000)
           │
┌──────────▼──────────┐
│  QuickBooks Online  │
│  API                │
└─────────────────────┘
```

**Key Points:**
- QuickBooks MCP server runs unchanged (stdio transport)
- mcp-proxy bridges stdio ↔ HTTP/SSE
- Tunnel exposes local server to Copilot Studio
- OAuth happens separately on port 8000

---

## Step 1: Configure Intuit Developer Account

### 1.1 Create an App

1. Go to https://developer.intuit.com/
2. Sign in or create a free account
3. Click **My Apps** → **Create an app**
4. Select **QuickBooks Online and Payments**
5. Name your app (e.g., "MCP Integration")

### 1.2 Configure OAuth Settings

1. In your app dashboard, go to **Keys & OAuth**
2. Under **Redirect URIs**, add:
   ```
   http://localhost:8000/callback
   ```
3. Set the scope to include:
   - `com.intuit.quickbooks.accounting`
4. Note your **Client ID** and **Client Secret**

### 1.3 Choose Environment

- **Sandbox**: For testing (recommended to start)
- **Production**: For live data (requires app verification)

---

## Step 2: Configure Environment Variables

The `.env` file in your project root should contain:

```env
# Required: Intuit Developer Credentials
QUICKBOOKS_CLIENT_ID=your_client_id_here
QUICKBOOKS_CLIENT_SECRET=your_client_secret_here
QUICKBOOKS_ENVIRONMENT=sandbox

# Optional: Auto-populated after OAuth authentication
# QUICKBOOKS_REFRESH_TOKEN=auto_generated
# QUICKBOOKS_REALM_ID=auto_generated
```

**Important:**
- Replace `your_client_id_here` and `your_client_secret_here` with values from Step 1.2
- Use `sandbox` for testing, `production` for live data
- Do NOT manually set `QUICKBOOKS_REFRESH_TOKEN` or `QUICKBOOKS_REALM_ID` - they will be auto-populated

---

## Step 3: Build the MCP Server

```bash
# Navigate to project directory
cd quickbooks-online-mcp-server

# Install dependencies (if not already done)
npm install

# Build the TypeScript code
npm run build
```

**Expected Output:**
```
> @qboapi/qbo-mcp-server@0.0.1 build
> tsc && shx chmod +x dist/*.js
```

---

## Step 4: Run with mcp-proxy

### 4.1 Install mcp-proxy

```bash
# Option A: Using pipx (recommended)
pipx install mcp-proxy

# Option B: Using pip (less ideal)
pip install mcp-proxy
```

### 4.2 Start the Server

```bash
# From the project directory, run:
mcp-proxy --port 8080 --stateless node dist/index.js
```

**Command Breakdown:**
- `--port 8080`: Exposes HTTP server on port 8080
- `--stateless`: Enables stateless mode for Streamable HTTP (required for Copilot Studio)
- `node dist/index.js`: The QuickBooks MCP server command

**Expected Output:**
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8080 (Press CTRL+C to quit)
```

### 4.3 Verify Endpoints

Open a new terminal and test:

```bash
# Test the /mcp endpoint
curl http://localhost:8080/mcp

# Expected: Should return MCP protocol response
```

**Available Endpoints:**
- `http://localhost:8080/mcp` - Streamable HTTP (use this for Copilot Studio)
- `http://localhost:8080/sse` - Server-Sent Events (legacy)

---

## Step 5: Set Up Local Tunnel

You need to expose your local server to the internet so Copilot Studio can access it.

### Option A: Using ngrok (Easiest)

1. **Install ngrok:**
   ```bash
   # macOS
   brew install ngrok

   # Windows (via Chocolatey)
   choco install ngrok

   # Or download from https://ngrok.com/download
   ```

2. **Create free account at https://ngrok.com/**

3. **Authenticate ngrok:**
   ```bash
   ngrok config add-authtoken YOUR_AUTHTOKEN
   ```

4. **Start tunnel:**
   ```bash
   ngrok http 8080
   ```

5. **Note the public URL:**
   ```
   Forwarding   https://abc123.ngrok.io -> http://localhost:8080
   ```
   Your MCP endpoint will be: `https://abc123.ngrok.io/mcp`

### Option B: Using cloudflared

1. **Install cloudflared:**
   ```bash
   # macOS
   brew install cloudflared

   # Windows
   # Download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
   ```

2. **Start tunnel:**
   ```bash
   cloudflared tunnel --url http://localhost:8080
   ```

3. **Note the public URL:**
   ```
   Your quick Tunnel has been created! Visit it at:
   https://xyz789.trycloudflare.com
   ```
   Your MCP endpoint will be: `https://xyz789.trycloudflare.com/mcp`

---

## Step 6: Configure Copilot Studio

### 6.1 Access Copilot Studio

1. Go to https://copilotstudio.microsoft.com/
2. Sign in with your Microsoft account
3. Select or create an agent/copilot

### 6.2 Add MCP Server Connection

1. In your agent, go to **Settings** → **Connections** or **Integrations**
2. Look for **Model Context Protocol (MCP)** or **Custom Connector**
3. Click **Add new MCP server**

### 6.3 Configure Connection

Fill in the connection details:

- **Name**: `QuickBooks Online`
- **Transport Type**: `Streamable HTTP` (NOT SSE)
- **URL**: Your tunnel URL + `/mcp`
  - Example: `https://abc123.ngrok.io/mcp`
- **Authentication**: None (OAuth is handled separately)
- **Headers**: Leave empty (unless you added custom auth to mcp-proxy)

### 6.4 Test Connection

1. Click **Test connection** or **Validate**
2. Should show: "Connection successful"
3. You should see available tools listed (55+ QuickBooks operations)

**Available Tools Include:**
- Customer operations (create, get, update, delete, search)
- Invoice operations (create, read, update, search)
- Bill operations (create, get, update, delete, search)
- Vendor operations (create, get, update, delete, search)
- Account operations (create, update, search)
- Item operations (create, read, update, search)
- Estimate, Employee, Journal Entry, Bill Payment, Purchase operations
- And more...

---

## Step 7: Test the Integration

### 7.1 Trigger OAuth Flow

The first time Copilot Studio calls any QuickBooks operation, OAuth authentication will automatically trigger:

1. **In Copilot Studio**, create a test message like:
   ```
   "List my QuickBooks customers"
   ```

2. **Watch your terminal** where mcp-proxy is running
   - You'll see authentication logs
   - A browser window will open automatically

3. **Authorize in Browser**:
   - Browser opens to QuickBooks login page
   - Sign in with your QuickBooks credentials
   - Grant permissions to your app
   - You'll see "Success! You can close this window"

4. **Tokens Saved**:
   - Check your `.env` file
   - `QUICKBOOKS_REFRESH_TOKEN` and `QUICKBOOKS_REALM_ID` are now populated
   - Future requests will use these tokens automatically

### 7.2 Test Operations

Try these commands in Copilot Studio:

```
1. "Show me all customers in QuickBooks"
2. "Create a new customer named 'Acme Corp' with email acme@example.com"
3. "List all unpaid invoices"
4. "Search for invoices from last month"
5. "Get details for customer ID 123"
```

### 7.3 Verify in QuickBooks

1. Log into your QuickBooks account (sandbox or production)
2. Check that data created via Copilot Studio appears correctly
3. Verify that queries return expected results

---

## OAuth Authentication Flow

### How It Works

```
1. Copilot Studio sends request
   ↓
2. mcp-proxy forwards to QuickBooks MCP server
   ↓
3. Server checks for refresh token in .env
   ↓
4. If missing: Start OAuth flow
   - Spawn HTTP server on port 8000
   - Open browser to QuickBooks auth URL
   - Wait for callback
   ↓
5. User authorizes in browser
   ↓
6. QuickBooks redirects to http://localhost:8000/callback
   ↓
7. Server exchanges code for tokens
   ↓
8. Tokens saved to .env file
   ↓
9. Server continues with original request
   ↓
10. Response sent back to Copilot Studio
```

### Token Management

- **Access Token**: Short-lived (1 hour), used for API calls
- **Refresh Token**: Long-lived, used to get new access tokens
- **Automatic Refresh**: Server automatically refreshes expired access tokens
- **Manual Re-auth**: Only needed if refresh token expires (requires new OAuth flow)

### Security Notes

- OAuth callback runs on `localhost:8000` (separate from mcp-proxy port 8080)
- Tunnel only exposes port 8080 (MCP server), NOT port 8000 (OAuth callback)
- Tokens stored in `.env` file (keep secure, don't commit to git)
- Add `.env` to `.gitignore` to prevent accidental commits

---

## Troubleshooting

### Common Issues

#### 1. Connection Failed in Copilot Studio

**Symptoms:**
- "Unable to connect to MCP server"
- Timeout errors

**Solutions:**
- Verify mcp-proxy is running: `curl http://localhost:8080/mcp`
- Check tunnel is active: Visit tunnel URL in browser
- Ensure Streamable HTTP transport is selected (NOT SSE)
- Check firewall settings aren't blocking the tunnel

#### 2. OAuth Browser Doesn't Open

**Symptoms:**
- Terminal shows "Starting OAuth flow..." but browser doesn't open
- Timeout waiting for authorization

**Solutions:**
- Manually visit the URL shown in terminal logs
- Check `QUICKBOOKS_CLIENT_ID` is correct in `.env`
- Verify redirect URI in Intuit Developer Portal: `http://localhost:8000/callback`
- Ensure port 8000 isn't already in use: `lsof -i :8000`

#### 3. "Invalid Client" Error

**Symptoms:**
- Browser shows "Invalid client credentials"
- OAuth fails immediately

**Solutions:**
- Double-check `QUICKBOOKS_CLIENT_ID` and `QUICKBOOKS_CLIENT_SECRET` in `.env`
- Verify credentials match Intuit Developer Portal (Keys & OAuth section)
- Ensure no extra spaces or quotes in `.env` values
- For production, verify app is published and approved

#### 4. "Unauthorized" Error After OAuth

**Symptoms:**
- OAuth succeeds but API calls fail with 401 Unauthorized

**Solutions:**
- Check `QUICKBOOKS_ENVIRONMENT` matches your QuickBooks account type
  - Use `sandbox` for test companies
  - Use `production` for live companies
- Verify `QUICKBOOKS_REALM_ID` is correct (Company ID)
- Try deleting tokens from `.env` and re-authenticating

#### 5. mcp-proxy Not Found

**Symptoms:**
- `command not found: mcp-proxy`

**Solutions:**
- Ensure pipx is installed: `pipx --version`
- Run `pipx ensurepath` and restart terminal
- Try installing again: `pipx install mcp-proxy --force`
- Check PATH includes pipx binaries: `echo $PATH`

#### 6. "Port Already in Use"

**Symptoms:**
- `Address already in use` when starting mcp-proxy

**Solutions:**
- Kill process on port 8080: `lsof -ti:8080 | xargs kill -9`
- Use a different port: `mcp-proxy --port 8081 node dist/index.js`
- Update tunnel to use new port: `ngrok http 8081`

#### 7. Tunnel URL Changes (ngrok Free Tier)

**Symptoms:**
- Tunnel URL changes every time you restart ngrok
- Have to reconfigure Copilot Studio repeatedly

**Solutions:**
- Upgrade to ngrok paid plan for static domain
- Use cloudflared (gives longer-lived URLs)
- Consider deploying to cloud (Azure, AWS, etc.) for permanent URL

---

## Production Deployment Considerations

For production use, consider:

### 1. Persistent Hosting

Instead of local tunnel, deploy to:
- **Azure**: App Service, Container Instances, or AKS
- **AWS**: EC2, ECS, or Lambda (with adapter)
- **Google Cloud**: Cloud Run, Compute Engine, or GKE
- **Heroku**, **Render**, **Railway**, or similar PaaS

### 2. Static URLs

- Use custom domain with SSL certificate
- Configure DNS properly
- Ensure HTTPS is enabled

### 3. Environment Variables

- Use secure secret management (Azure Key Vault, AWS Secrets Manager, etc.)
- Never commit `.env` to version control
- Rotate tokens regularly

### 4. Monitoring

- Add logging and monitoring (Application Insights, CloudWatch, etc.)
- Set up alerts for authentication failures
- Monitor API rate limits

### 5. High Availability

- Run multiple instances behind load balancer
- Implement health checks
- Configure auto-scaling

### 6. Security

- Enable authentication on mcp-proxy (API keys, OAuth, etc.)
- Use firewall rules to restrict access
- Implement rate limiting
- Regular security audits

---

## Additional Resources

- [QuickBooks API Documentation](https://developer.intuit.com/app/developer/qbo/docs/get-started)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [mcp-proxy GitHub](https://github.com/sparfenyuk/mcp-proxy)
- [Microsoft Copilot Studio Docs](https://learn.microsoft.com/en-us/microsoft-copilot-studio/)
- [ngrok Documentation](https://ngrok.com/docs)
- [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)

---

## Support

For issues:
- **QuickBooks MCP Server**: Check the [GitHub repository](https://github.com/intuit/quickbooks-online-mcp-server)
- **mcp-proxy**: Check [mcp-proxy GitHub](https://github.com/sparfenyuk/mcp-proxy)
- **QuickBooks API**: Visit [Intuit Developer Community](https://help.developer.intuit.com/)
- **Copilot Studio**: Check [Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-copilot-studio/)

---

## Quick Reference Commands

```bash
# Build server
npm run build

# Start mcp-proxy
mcp-proxy --port 8080 --stateless node dist/index.js

# Start ngrok tunnel
ngrok http 8080

# Start cloudflared tunnel
cloudflared tunnel --url http://localhost:8080

# Test local endpoint
curl http://localhost:8080/mcp

# Check running processes
lsof -i :8080
lsof -i :8000

# View logs (if running in background)
tail -f logs/mcp-proxy.log
```

---

**Last Updated**: November 2025
**Version**: 1.0
