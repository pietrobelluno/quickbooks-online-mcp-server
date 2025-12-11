# QuickBooks OAuth 2.0 Authentication Flow

Quick reference guide for understanding the OAuth authentication in the QuickBooks MCP Server.

## Overview

The QuickBooks MCP Server uses OAuth 2.0 for secure authentication. This flow is **fully automated** and happens **automatically** on first use - no manual intervention needed!

---

## Authentication Sequence

```
┌─────────────────────────────────────────────────────────────┐
│ 1. First API Call                                           │
│    Copilot Studio → mcp-proxy → QuickBooks MCP Server       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Check for Tokens                                         │
│    Server reads .env file                                   │
│    - QUICKBOOKS_REFRESH_TOKEN exists? → Use it ✓           │
│    - Missing? → Start OAuth flow ↓                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Start OAuth Server                                       │
│    - Spawn HTTP server on localhost:8000                    │
│    - Generate authorization URL                             │
│    - Automatically open browser                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. User Authorization (Browser)                             │
│    URL: https://appcenter.intuit.com/app/connect/oauth2     │
│    - User sees QuickBooks login page                        │
│    - User enters credentials                                │
│    - User selects company (if multiple)                     │
│    - User clicks "Authorize"                                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. OAuth Callback                                           │
│    QuickBooks redirects to:                                 │
│    http://localhost:8000/callback?code=XXX&realmId=YYY      │
│    - Server receives authorization code                     │
│    - Server receives company ID (realm ID)                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Token Exchange                                           │
│    Server → QuickBooks OAuth endpoint                       │
│    POST https://oauth.platform.intuit.com/oauth2/v1/tokens/ │
│    Request:                                                 │
│      - grant_type: authorization_code                       │
│      - code: [authorization code]                           │
│      - redirect_uri: http://localhost:8000/callback         │
│    Response:                                                │
│      - access_token: [1 hour TTL]                           │
│      - refresh_token: [100 days TTL]                        │
│      - token_type: Bearer                                   │
│      - expires_in: 3600                                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. Save Tokens                                              │
│    Server writes to .env file:                              │
│      QUICKBOOKS_REFRESH_TOKEN=XXX                           │
│      QUICKBOOKS_REALM_ID=YYY                                │
│    Browser shows: "Success! You can close this window"      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. Complete Original Request                                │
│    Server continues with original API call                  │
│    Response → mcp-proxy → Copilot Studio                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Token Lifecycle

### Access Token

- **Duration**: 1 hour
- **Purpose**: Used for API calls to QuickBooks
- **Storage**: In-memory only (not saved to .env)
- **Renewal**: Automatic using refresh token

### Refresh Token

- **Duration**: 100 days (resets on each use)
- **Purpose**: Get new access tokens without user interaction
- **Storage**: Saved in `.env` file
- **Renewal**: Automatic with each token refresh

### Token Refresh Flow

```
API Call → Check Access Token → Expired?
                                    ↓ Yes
                         Use Refresh Token → Get New Access Token
                                    ↓
                         Update In-Memory Token
                                    ↓
                         Continue with API Call
```

**Automatic Refresh Happens:**
- Before each API call if access token expired
- Silently in background
- No user interaction needed
- Refresh token extended by 100 days

---

## Code Implementation

The OAuth flow is implemented in `src/clients/quickbooks-client.ts`:

### Key Methods

1. **`authenticate()`** - Main entry point
   ```typescript
   // Called before each API operation
   // Checks for tokens, starts OAuth if needed
   ```

2. **`startOAuthFlow()`** - OAuth initialization
   ```typescript
   // Creates HTTP server on port 8000
   // Generates auth URL with scopes
   // Opens browser automatically
   // Waits for callback
   ```

3. **`refreshAccessToken()`** - Token renewal
   ```typescript
   // Uses refresh token to get new access token
   // Happens automatically when access token expires
   ```

4. **`saveTokensToEnv()`** - Persistence
   ```typescript
   // Writes QUICKBOOKS_REFRESH_TOKEN to .env
   // Writes QUICKBOOKS_REALM_ID to .env
   ```

---

## Configuration

### Required Environment Variables

```env
# From Intuit Developer Portal
QUICKBOOKS_CLIENT_ID=your_client_id
QUICKBOOKS_CLIENT_SECRET=your_client_secret
QUICKBOOKS_ENVIRONMENT=sandbox

# Auto-populated by OAuth flow
QUICKBOOKS_REFRESH_TOKEN=generated_on_first_auth
QUICKBOOKS_REALM_ID=company_id_from_quickbooks
```

### Intuit Developer Portal Setup

**Redirect URI Configuration:**
```
http://localhost:8000/callback
```

**Required Scopes:**
- `com.intuit.quickbooks.accounting` - Full access to accounting data

**Important:**
- Redirect URI must match exactly (including protocol, port, path)
- For production, add additional redirect URIs if needed
- Scopes determine what data your app can access

---

## Security Considerations

### What's Secure

✓ **OAuth 2.0 Protocol**: Industry standard authorization
✓ **Short-Lived Access Tokens**: 1 hour expiry minimizes risk
✓ **Refresh Token Rotation**: Extended on each use (100 days)
✓ **Local Callback Server**: Temporary, closed after auth
✓ **No Password Storage**: User credentials never stored

### What to Protect

⚠️ **Client Secret**: Keep secure, never commit to git
⚠️ **Refresh Token**: Treat like a password, never share
⚠️ **.env File**: Add to .gitignore, restrict file permissions
⚠️ **Access Tokens**: In-memory only, not persisted

### Best Practices

1. **Never commit .env to version control**
   ```bash
   # Add to .gitignore
   echo ".env" >> .gitignore
   ```

2. **Restrict .env file permissions**
   ```bash
   chmod 600 .env
   ```

3. **Use environment-specific credentials**
   - Sandbox for development/testing
   - Production for live data (after app review)

4. **Rotate tokens regularly**
   - Delete refresh token from .env to force re-auth
   - Revoke old tokens in Intuit Developer Portal

5. **Monitor token usage**
   - Check for unauthorized access in QuickBooks audit logs
   - Review connected apps in QuickBooks settings

---

## Troubleshooting OAuth Issues

### Issue: Browser Doesn't Open

**Cause**: `open` package fails to launch browser

**Solution**:
```bash
# Manually visit the URL shown in terminal:
https://appcenter.intuit.com/connect/oauth2?client_id=XXX&response_type=code&scope=...
```

### Issue: "Invalid Client" Error

**Cause**: Wrong Client ID or Secret

**Solution**:
1. Verify credentials in Intuit Developer Portal
2. Check for typos in `.env`
3. Ensure no extra spaces or quotes
4. Regenerate credentials if needed

### Issue: "Redirect URI Mismatch"

**Cause**: Intuit Developer Portal config doesn't match callback URL

**Solution**:
1. Go to Intuit Developer Portal → Your App → Keys & OAuth
2. Add redirect URI: `http://localhost:8000/callback`
3. Ensure exact match (including protocol and port)

### Issue: "Unauthorized" After OAuth

**Cause**: Environment mismatch (sandbox vs production)

**Solution**:
1. Verify `QUICKBOOKS_ENVIRONMENT` in `.env`
2. Match with QuickBooks account type:
   - `sandbox` → QuickBooks Developer Test Company
   - `production` → Real QuickBooks Company

### Issue: Token Expired

**Cause**: Refresh token not used for >100 days

**Solution**:
1. Delete tokens from `.env`:
   ```bash
   # Remove these lines:
   QUICKBOOKS_REFRESH_TOKEN=...
   QUICKBOOKS_REALM_ID=...
   ```
2. Restart server - new OAuth flow will start
3. Re-authorize in browser

### Issue: Port 8000 Already in Use

**Cause**: Another process using port 8000

**Solution**:
```bash
# Find and kill process
lsof -ti:8000 | xargs kill -9

# Or change OAuth port in code (not recommended)
```

---

## OAuth URLs Reference

### Sandbox Environment

**Authorization URL:**
```
https://appcenter-sandbox.intuit.com/connect/oauth2
```

**Token Exchange URL:**
```
https://oauth-sandbox.platform.intuit.com/oauth2/v1/tokens/bearer
```

**API Base URL:**
```
https://sandbox-quickbooks.api.intuit.com/v3/company/{realmId}
```

### Production Environment

**Authorization URL:**
```
https://appcenter.intuit.com/connect/oauth2
```

**Token Exchange URL:**
```
https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
```

**API Base URL:**
```
https://quickbooks.api.intuit.com/v3/company/{realmId}
```

---

## Testing OAuth Flow

### Manual Test

1. Delete tokens from `.env`:
   ```bash
   # Remove these lines if they exist:
   QUICKBOOKS_REFRESH_TOKEN=...
   QUICKBOOKS_REALM_ID=...
   ```

2. Start the server:
   ```bash
   npm run build
   mcp-proxy --port 8080 --stateless node dist/index.js
   ```

3. Make any API call via Copilot Studio or curl:
   ```bash
   curl -X POST http://localhost:8080/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
   ```

4. Watch for browser to open automatically

5. Authorize in browser

6. Verify tokens added to `.env`

### Automated Test

The OAuth flow is automatically triggered on first use. No special testing needed.

---

## FAQ

**Q: Do I need to manually get tokens?**
A: No! The OAuth flow is fully automated.

**Q: How often do I need to re-authenticate?**
A: Only if:
- Refresh token expires (unused for 100+ days)
- Token revoked manually
- Client credentials changed

**Q: Can I use existing tokens from another app?**
A: No. Each app has unique tokens tied to Client ID.

**Q: What happens if authentication fails mid-operation?**
A: Server returns error to Copilot Studio. User must retry, triggering OAuth flow.

**Q: Can I pre-authenticate before first use?**
A: Yes! Just make any API call - the browser will open for auth.

**Q: Is the OAuth callback secure on localhost?**
A: Yes, for local development. For production, use HTTPS with proper domain.

**Q: Can multiple users authenticate?**
A: Not simultaneously. Each instance stores one set of tokens. For multi-user, deploy separate instances or implement user-specific token storage.

---

## Additional Resources

- [Intuit OAuth 2.0 Guide](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)
- [QuickBooks API Authentication](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization)
- [intuit-oauth NPM Package](https://www.npmjs.com/package/intuit-oauth)
- [OAuth 2.0 RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)

---

**Last Updated**: November 2025
