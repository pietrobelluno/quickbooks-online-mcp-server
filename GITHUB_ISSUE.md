## What happened?

After the Claude Desktop update on December 18, 2024, custom connectors using remote MCP servers with OAuth 2.0 stopped working. When clicking "Connect" on a custom connector, Claude Desktop now opens its own internal OAuth URL (`https://claude.ai/api/organizations/.../mcp/start-auth/...`) instead of calling the MCP server's OAuth endpoints as specified in the MCP specification.

The error displayed is: **"There was an error connecting to the MCP server. Please check your server URL and make sure your server handles auth correctly."**

Server logs show Claude Desktop only makes health check requests (`GET /health`) and does NOT call any OAuth endpoints:
- ❌ No requests to `/.well-known/oauth-authorization-server`
- ❌ No requests to `/register` (dynamic client registration)
- ❌ No requests to `/authorize` with OAuth parameters
- ❌ No requests to `/token`

## What did you expect to happen?

According to the [MCP Specification (2025-03-26)](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization#2-10-third-party-authorization-flow), Claude Desktop should:

1. Discover OAuth endpoints via RFC 8414: `GET /.well-known/oauth-authorization-server`
2. Optionally register via RFC 7591: `POST /register`
3. Initiate OAuth flow: `GET /authorize?response_type=code&client_id=...&code_challenge=...&state=...`
4. Exchange authorization code: `POST /token` with `grant_type=authorization_code`
5. Use returned MCP access token for `/mcp` requests

**This was working correctly before the December 18, 2024 update.** The same server configuration successfully completed OAuth flows with QuickBooks integration earlier the same day.

## Steps to reproduce

1. Set up a remote MCP server with OAuth 2.0 endpoints:
   - Implement `/.well-known/oauth-authorization-server` (RFC 8414)
   - Implement `/authorize`, `/token`, `/register` endpoints
   - Use PKCE with S256
   - Example server: https://quickbooks.gnarlysoft-mcp.com/mcp

2. In Claude Desktop (after Dec 18, 2024 update):
   - Navigate to Settings → Connectors
   - Click "Add custom connector"
   - Enter Name: "QuickBooks MCP"
   - Enter URL: `https://quickbooks.gnarlysoft-mcp.com/mcp`
   - Leave OAuth Client ID/Secret blank (for dynamic registration)
   - Click "Connect"

3. **Observe**:
   - Browser opens `https://claude.ai/api/organizations/{org_id}/mcp/start-auth/{session_id}?redirect_url=...`
   - Error displayed: "There was an error connecting to the MCP server"
   - Server receives NO OAuth-related requests (only health checks)

4. **Try with manual OAuth credentials**:
   - Enter OAuth Client ID: `ABpGhVYm2eeC9kElcXiQUkbjWjT2ufhW00J7z7w9lOzCNexREx`
   - Enter OAuth Client Secret: (QuickBooks client secret)
   - Click "Connect"
   - Same result: Claude's internal OAuth URL, no server requests

## Area

**Remote MCP Servers - OAuth Authentication**

Specifically: Custom connectors with third-party OAuth integration (e.g., QuickBooks, Salesforce, GitHub Enterprise)

## Which MCP server were you using?

**Custom server**: QuickBooks Online MCP Server
- Built with Node.js/TypeScript + Express
- Implements MCP specification 2025-03-26
- OAuth 2.0 compliant (RFC 8414, RFC 7591, RFC 7636 PKCE)
- Third-party authorization via QuickBooks OAuth
- Server URL: https://quickbooks.gnarlysoft-mcp.com/mcp
- GitHub: [Link if public]

The server implements all required endpoints per MCP spec:
```bash
# OAuth metadata discovery
GET /.well-known/oauth-authorization-server
# Returns: authorization_endpoint, token_endpoint, registration_endpoint

# Dynamic client registration (RFC 7591)
POST /register
# Returns: client_id, client_secret

# OAuth authorization
GET /authorize?response_type=code&client_id=...&redirect_uri=...&code_challenge=...
# Redirects to QuickBooks OAuth

# Token exchange
POST /token
# Body: grant_type, code, code_verifier, client_id
# Returns: access_token, refresh_token, expires_in
```

## Error messages or logs

**Claude Desktop Error (UI):**
```
There was an error connecting to the MCP server. Please check your
server URL and make sure your server handles auth correctly.
```

**Server Logs (AWS CloudWatch):**
```
# Only health checks received:
2025-12-18T21:04:05 [2025-12-18T21:04:05.104Z] GET /health
2025-12-18T21:04:35 [2025-12-18T21:04:35.135Z] GET /health
2025-12-18T21:05:05 [2025-12-18T21:05:05.143Z] GET /health
# ... repeated every 30 seconds

# No OAuth endpoints called

# Exception: One call to /authorize with NO parameters:
2025-12-18T21:13:26 [2025-12-18T21:13:26.415Z] GET /authorize
2025-12-18T21:13:26 → OAuth /authorize request from Claude Desktop
2025-12-18T21:13:26   → response_type: undefined
2025-12-18T21:13:26   → client_id: undefined
2025-12-18T21:13:26   → redirect_uri: undefined
2025-12-18T21:13:26   → code_challenge: missing
2025-12-18T21:13:26   → state: missing
2025-12-18T21:13:26   → scope: undefined
2025-12-18T21:13:26   ✗ Validation error: Missing required parameter: response_type
```

This suggests Claude Desktop checks if `/authorize` exists but doesn't initiate a proper OAuth flow.

## Additional context

### Environment
- **Claude Desktop Version**: Latest (updated December 18, 2024)
- **macOS Version**: Darwin 23.6.0
- **MCP Server**: Node.js 20, Express, AWS ECS Fargate
- **OAuth Specs Implemented**: RFC 8414, RFC 7591, RFC 7636 (PKCE)

### What Changed
The Claude Desktop update on December 18, 2024 appears to have changed how custom connectors handle OAuth:

**Before Update (Working)**:
1. Claude calls `/.well-known/oauth-authorization-server` to discover endpoints
2. Claude calls `/authorize` with proper OAuth parameters (response_type, client_id, redirect_uri, code_challenge, state)
3. User completes OAuth at QuickBooks
4. Server exchanges authorization code for MCP token at `/token`
5. Claude uses MCP token for authenticated requests
6. ✅ **Connection successful**

**After Update (Broken)**:
1. Claude opens its own OAuth URL: `https://claude.ai/api/organizations/.../mcp/start-auth/...`
2. No requests to MCP server's OAuth endpoints
3. Error displayed
4. ❌ **Connection fails**

### Workarounds Attempted
- ✗ Leaving OAuth Client ID/Secret blank
- ✗ Entering OAuth Client ID/Secret manually
- ✗ Using direct load balancer URL instead of domain name
- ✗ Clearing all server-side sessions and tokens
- ✗ Adding `/register` endpoint for dynamic client registration
- ✗ Returning OAuth metadata from `/authorize` when called without parameters
- ✗ Handling MCP requests on both `/` and `/mcp` paths

**None worked.**

### Impact
This breaks ALL remote MCP servers using custom OAuth for third-party integrations:
- QuickBooks integrations
- Salesforce integrations
- GitHub Enterprise integrations
- Any OAuth-based SaaS MCP connectors

Users cannot connect to previously working MCP servers after the Claude Desktop update.

### Server Configuration Example
```json
{
  "name": "QuickBooks MCP",
  "url": "https://quickbooks.gnarlysoft-mcp.com/mcp",
  "oauth2": {
    "authUrl": "https://quickbooks.gnarlysoft-mcp.com/authorize",
    "tokenUrl": "https://quickbooks.gnarlysoft-mcp.com/token",
    "clientId": "ABpGhVYm2eeC9kElcXiQUkbjWjT2ufhW00J7z7w9lOzCNexREx"
  }
}
```

### Screenshots
[User can add screenshot of the error message here]

### References
- [MCP Spec - Third-Party Authorization](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization#2-10-third-party-authorization-flow)
- [RFC 8414 - OAuth Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC 7591 - Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
- [Claude Support - Building Custom Connectors](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
