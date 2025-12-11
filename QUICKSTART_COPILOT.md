# QuickBooks MCP Server - Quick Start for Copilot Studio

Get up and running with QuickBooks Online in Copilot Studio in under 10 minutes!

## Prerequisites

- Node.js v18+
- Python 3.x
- Intuit Developer Account (free)
- Microsoft Copilot Studio access

---

## Step 1: Configure Intuit Developer App (5 min)

1. Go to https://developer.intuit.com/ and sign in
2. Create a new app: **My Apps** → **Create an app** → **QuickBooks Online**
3. Add redirect URI: `http://localhost:8000/callback`
4. Copy your **Client ID** and **Client Secret**

---

## Step 2: Configure .env File (1 min)

Edit `.env` in the project root:

```env
QUICKBOOKS_CLIENT_ID=paste_your_client_id_here
QUICKBOOKS_CLIENT_SECRET=paste_your_client_secret_here
QUICKBOOKS_ENVIRONMENT=sandbox
```

---

## Step 3: Build and Install (2 min)

```bash
# Build the server
npm install
npm run build

# Install mcp-proxy
pipx install mcp-proxy
```

---

## Step 4: Start the Server (1 min)

```bash
# Start mcp-proxy with QuickBooks server
mcp-proxy --port 8080 --stateless node dist/index.js
```

Keep this terminal open!

---

## Step 5: Create Tunnel (1 min)

**In a new terminal:**

### Option A: ngrok
```bash
# Install ngrok
brew install ngrok  # or download from ngrok.com

# Start tunnel
ngrok http 8080

# Copy the HTTPS URL shown (e.g., https://abc123.ngrok.io)
```

### Option B: cloudflared
```bash
# Install cloudflared
brew install cloudflared

# Start tunnel
cloudflared tunnel --url http://localhost:8080

# Copy the HTTPS URL shown
```

---

## Step 6: Configure Copilot Studio (3 min)

1. Go to https://copilotstudio.microsoft.com/
2. Open your agent/copilot
3. Go to **Settings** → **Connections** → **Add MCP Server**
4. Fill in:
   - **Name**: `QuickBooks Online`
   - **Transport**: `Streamable HTTP`
   - **URL**: `YOUR_TUNNEL_URL/mcp` (e.g., `https://abc123.ngrok.io/mcp`)
5. Click **Test connection** - should show success!

---

## Step 7: Test It! (2 min)

In Copilot Studio, try:

```
"List my QuickBooks customers"
```

**First Time Only:**
- Browser will open automatically for QuickBooks login
- Sign in and authorize the app
- Tokens are saved automatically
- Future requests work instantly!

---

## Common Commands to Try

```
1. "Show me all customers"
2. "Create a customer named 'Test Corp'"
3. "List unpaid invoices"
4. "Search for invoices from this month"
5. "Get all items"
6. "Create a new invoice for customer 123"
```

---

## Troubleshooting

**Connection failed?**
- Check mcp-proxy is running (`curl http://localhost:8080/mcp`)
- Verify tunnel URL is correct
- Ensure Transport is "Streamable HTTP" (NOT SSE)

**OAuth not working?**
- Verify Client ID/Secret in `.env`
- Check redirect URI in Intuit portal: `http://localhost:8000/callback`
- Make sure port 8000 isn't in use

**For detailed troubleshooting, see [COPILOT_STUDIO_SETUP.md](./COPILOT_STUDIO_SETUP.md)**

---

## Next Steps

- 📖 **Full Tutorial**: [COPILOT_STUDIO_SETUP.md](./COPILOT_STUDIO_SETUP.md)
- 🔐 **OAuth Details**: [OAUTH_FLOW.md](./OAUTH_FLOW.md)
- 📚 **QuickBooks API Docs**: https://developer.intuit.com/app/developer/qbo/docs/

---

## Quick Reference

```bash
# Start server
mcp-proxy --port 8080 --stateless node dist/index.js

# Start tunnel (ngrok)
ngrok http 8080

# Start tunnel (cloudflared)
cloudflared tunnel --url http://localhost:8080

# Test endpoint
curl http://localhost:8080/mcp

# Check running processes
lsof -i :8080
```

---

**That's it!** You now have QuickBooks Online integrated with Copilot Studio. 🎉
