# Custom Connector OAuth Broken After Claude Desktop Update (December 18, 2024)

## Summary

After a Claude Desktop update on December 18, 2024, custom connectors using remote MCP servers with OAuth 2.0 stopped working. Claude Desktop now uses its own internal OAuth flow (`https://claude.ai/api/organizations/.../mcp/start-auth/...`) instead of discovering and using the MCP server's OAuth endpoints as specified in the MCP specification.

## What Was Working Before

- **Setup**: Remote MCP server at `https://quickbooks.gnarlysoft-mcp.com/mcp`
- **OAuth Implementation**:
  - RFC 8414 OAuth Authorization Server Metadata at `/.well-known/oauth-authorization-server`
  - OAuth endpoints: `/authorize`, `/token`, `/register` (RFC 7591)
  - PKCE support with S256
  - QuickBooks third-party authorization integration
- **Behavior**: When clicking "Connect" in custom connector UI, Claude Desktop would:
  1. Discover OAuth endpoints from metadata
  2. Redirect to `/authorize` with proper OAuth parameters
  3. Complete OAuth flow with QuickBooks
  4. Exchange authorization code for MCP token
  5. Successfully connect and use MCP tools

**This was working as of December 18, 2024 morning.**

## What Broke After Update

### Current Behavior

When clicking "Connect" on a custom connector (with or without OAuth Client ID/Secret):

1. ❌ Claude Desktop opens: `https://claude.ai/api/organizations/{org_id}/mcp/start-auth/{session_id}?redirect_url=claude://claude.ai/settings/connectors?&open_in_browser=1`
2. ❌ User sees error: "There was an error connecting to the MCP server. Please check your server URL and make sure your server handles auth correctly."
3. ❌ Claude Desktop does NOT call server's OAuth endpoints

### Server Logs Show

**Only health checks are being called:**
```
2025-12-18T21:04:05 GET /health (repeated every 30 seconds)
```

**No OAuth discovery or flow initiated:**
- ❌ No requests to `/.well-known/oauth-authorization-server`
- ❌ No requests to `/register` (dynamic client registration)
- ❌ No requests to `/authorize` (with proper OAuth parameters)
- ❌ No requests to `/token`

**One exception**: Claude Desktop DID call `/authorize` once, but with NO parameters:
```
2025-12-18T21:13:26 GET /authorize
  → response_type: undefined
  → client_id: undefined
  → redirect_uri: undefined
  → code_challenge: missing
  → state: missing
  → scope: undefined
```

This suggests Claude is checking if the endpoint exists but not actually initiating OAuth.

## Expected Behavior (Per MCP Spec)

According to [MCP Specification 2025-03-26 - Third-Party Authorization](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization#2-10-third-party-authorization-flow):

### 1. OAuth Discovery (RFC 8414)

Clients MUST follow RFC 8414 for discovering OAuth endpoints:
```
GET https://api.example.com/.well-known/oauth-authorization-server
```

Response should include:
```json
{
  "authorization_endpoint": "https://api.example.com/authorize",
  "token_endpoint": "https://api.example.com/token",
  "registration_endpoint": "https://api.example.com/register",
  "code_challenge_methods_supported": ["S256"]
}
```

### 2. Dynamic Client Registration (RFC 7591)

Clients SHOULD support RFC 7591 for automatic registration:
```
POST /register
{
  "client_name": "Claude MCP Client",
  "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"]
}
```

### 3. OAuth Authorization Flow

After registration/discovery, client should:
1. Redirect to `/authorize` with PKCE challenge
2. User authorizes at third-party (QuickBooks)
3. Callback to `/oauth/callback` with authorization code
4. Exchange code at `/token` for MCP access token
5. Use MCP access token for all `/mcp` requests

## Server Implementation (Compliant with MCP Spec)

Our server correctly implements all required endpoints:

✅ **OAuth Metadata Discovery**:
```bash
curl https://quickbooks.gnarlysoft-mcp.com/.well-known/oauth-authorization-server
# Returns proper RFC 8414 metadata
```

✅ **Dynamic Client Registration**:
```bash
POST https://quickbooks.gnarlysoft-mcp.com/register
# Generates client_id and client_secret per RFC 7591
```

✅ **OAuth Authorization**:
```bash
GET /authorize?response_type=code&client_id=...&redirect_uri=...&code_challenge=...&state=...
# Redirects to QuickBooks OAuth
```

✅ **Token Exchange**:
```bash
POST /token
{
  "grant_type": "authorization_code",
  "code": "...",
  "code_verifier": "...",
  "client_id": "..."
}
# Returns MCP access token
```

## Steps to Reproduce

1. Set up remote MCP server with OAuth 2.0 (example: https://github.com/your-repo/quickbooks-mcp-server)
2. Implement RFC 8414 metadata endpoint at `/.well-known/oauth-authorization-server`
3. Implement OAuth endpoints: `/authorize`, `/token`, `/register`
4. In Claude Desktop (after Dec 18, 2024 update):
   - Go to Settings → Connectors
   - Click "Add custom connector"
   - Enter: Name: "Test", URL: "https://your-server.com/mcp"
   - Click "Connect"
5. **Observe**: Claude opens its own OAuth URL instead of server's `/authorize`
6. **Error**: "There was an error connecting to the MCP server"

## Environment

- **Claude Desktop Version**: Latest (updated December 18, 2024)
- **OS**: macOS
- **MCP Server**: Node.js/TypeScript, Express
- **OAuth Spec Compliance**: RFC 8414, RFC 7591, RFC 7636 (PKCE)
- **MCP Spec Version**: 2025-03-26

## Impact

This breaks ALL remote MCP servers that use custom OAuth for third-party integrations (QuickBooks, Salesforce, GitHub, etc.). Users cannot connect to their existing working MCP servers after the Claude Desktop update.

## Workaround Attempted

None found. Tried:
- ✗ Leaving OAuth Client ID/Secret blank
- ✗ Entering OAuth Client ID/Secret manually
- ✗ Using direct ALB URL instead of domain
- ✗ Clearing server-side sessions/tokens
- ✗ Adding `/register` endpoint for dynamic client registration
- ✗ Returning OAuth metadata from `/authorize` when called without parameters

## Request

Please restore support for custom OAuth in remote MCP servers as specified in the MCP specification, or provide updated documentation on the new OAuth flow expected by Claude Desktop.

## Additional Context

**Before the update**, the same server configuration was working correctly. The OAuth flow would:
1. Call `/.well-known/oauth-authorization-server` for discovery
2. Call `/authorize` with proper parameters
3. Complete OAuth with QuickBooks
4. Exchange code for MCP token
5. Successfully connect

**After the update**, Claude Desktop bypasses all of this and uses its own internal OAuth system that doesn't work with custom MCP servers.

---

**Related Links**:
- [MCP Specification - Third-Party Authorization](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization#2-10-third-party-authorization-flow)
- [RFC 8414 - OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC 7591 - OAuth 2.0 Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
- [Claude Support - Building Custom Connectors](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
