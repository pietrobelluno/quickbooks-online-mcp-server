# QuickBooks MCP Server - Installation Guide

A plug-and-play MCP server for QuickBooks Online that works with Claude Desktop. Install once, authenticate automatically on first use!

## Quick Start (2 Steps)

### Step 1: Install the Package

Configure npm to use GitHub Packages. Create or edit `~/.npmrc`:

```bash
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
@qboapi:registry=https://npm.pkg.github.com
```

Then install globally:

```bash
npm install -g @qboapi/qbo-mcp-server
```

### Step 2: Configure Claude Desktop

Add this to your Claude Desktop config file at:
- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "quickbooks": {
      "command": "qbo-mcp-server"
    }
  }
}
```

Then **restart Claude Desktop** (completely quit and reopen).

## First Use - Automatic Authentication

When you first ask Claude about QuickBooks data, authentication happens automatically:

1. A browser window will open to QuickBooks sign-in
2. Sign in with your QuickBooks account
3. Select your company
4. Click **"Authorize"**
5. Close the browser tab
6. Return to Claude - your request will complete automatically!

Your credentials are saved locally in `~/.qbo-mcp-server/tokens.json`. You won't need to authenticate again unless tokens expire (after 100 days of inactivity).

## Usage Examples

Try asking Claude:

- "Show me my QuickBooks customers"
- "What are my recent invoices?"
- "Find invoices from last month"
- "Search for vendors in California"
- "Get my chart of accounts"
- "Show me unpaid bills"
- "Create a new customer named ABC Company"

## Available Operations

The server exposes 50+ QuickBooks operations:

### Customers
- Create, Read, Update, Delete, Search customers

### Invoices
- Create, Read, Update, Search invoices

### Bills & Payments
- Create, Read, Update, Delete, Search bills
- Create, Read, Update, Delete, Search bill payments

### Vendors
- Create, Read, Update, Delete, Search vendors

### Employees
- Create, Read, Update, Search employees

### Estimates
- Create, Read, Update, Delete, Search estimates

### Items & Products
- Create, Read, Update, Search items

### Accounts (Chart of Accounts)
- Create, Update, Search accounts

### Journal Entries
- Create, Read, Update, Delete, Search journal entries

### Purchases
- Create, Read, Update, Delete, Search purchases

## Troubleshooting

### "Authentication timeout"
**Problem**: Browser was opened but authentication didn't complete

**Solutions:**
- Make sure you clicked "Authorize" in the browser
- Check that you selected the correct company
- Try again - sometimes tokens take a moment to process

### "QuickBooks tools not available in Claude"
**Problem**: Claude Desktop can't find the MCP server

**Solutions:**
- Verify your config file syntax is correct (valid JSON)
- Make sure the server is installed: `which qbo-mcp-server`
- Completely restart Claude Desktop (Cmd+Q or Ctrl+Q, then reopen)
- Check Claude Desktop logs for errors

### "Command not found: qbo-mcp-server"
**Problem**: Package not installed or not in PATH

**Solutions:**
- Run: `npm install -g @qboapi/qbo-mcp-server` again
- Make sure npm global bin is in your PATH
- Try: `npm config get prefix` to find where global packages are installed
- On Mac, you may need to add `/usr/local/bin` to your PATH

### "Need to re-authenticate"
**Problem**: Your tokens expired

**Solutions:**
- Tokens expire after 100 days of inactivity
- Just ask Claude any QuickBooks question - the browser will open automatically
- Authenticate again following the same flow

### Testing the Server Manually

To test if the server can start:

```bash
qbo-mcp-server
```

You should see output from the MCP server initializing. Press Ctrl+C to stop.

## Advanced Configuration

### Custom OAuth Redirect Endpoint

If you're using a custom hosted OAuth redirect service:

```json
{
  "mcpServers": {
    "quickbooks": {
      "command": "qbo-mcp-server",
      "env": {
        "QUICKBOOKS_REDIRECT_URI": "https://your-domain.com/qbo/callback",
        "QUICKBOOKS_TOKEN_ENDPOINT": "https://your-domain.com/qbo/tokens"
      }
    }
  }
}
```

### Custom Credentials

If you have your own QuickBooks app credentials:

```json
{
  "mcpServers": {
    "quickbooks": {
      "command": "qbo-mcp-server",
      "env": {
        "QUICKBOOKS_CLIENT_ID": "your_client_id",
        "QUICKBOOKS_CLIENT_SECRET": "your_client_secret",
        "QUICKBOOKS_ENVIRONMENT": "production"
      }
    }
  }
}
```

### Using Sandbox Environment

To use QuickBooks Sandbox for testing:

```json
{
  "mcpServers": {
    "quickbooks": {
      "command": "qbo-mcp-server",
      "env": {
        "QUICKBOOKS_ENVIRONMENT": "sandbox"
      }
    }
  }
}
```

## Token Management

### Where are tokens stored?

Tokens are stored locally at:
- **Mac/Linux**: `~/.qbo-mcp-server/tokens.json`
- **Windows**: `%USERPROFILE%/.qbo-mcp-server/tokens.json`

### Token Security

- Tokens are stored per-user (each team member has their own)
- File permissions are set to be readable only by your user account
- Each user must authenticate with their own QuickBooks account
- The OAuth flow requires user authorization (can't be bypassed)

### Manually Reset Authentication

If you need to re-authenticate from scratch:

```bash
# Mac/Linux
rm -rf ~/.qbo-mcp-server

# Windows
rmdir /s %USERPROFILE%\.qbo-mcp-server
```

Then restart Claude Desktop and use any QuickBooks query to trigger re-authentication.

## For Developers

### Running from Source

```bash
# Clone the repository
git clone https://github.com/pietrobellunopilau/quickbooks-online-mcp-server.git
cd quickbooks-online-mcp-server

# Install dependencies
npm install

# Build
npm run build

# Test locally
node dist/src/index.js
```

### Local Testing with Claude Desktop

Add to your config:

```json
{
  "mcpServers": {
    "quickbooks-local": {
      "command": "node",
      "args": ["/full/path/to/quickbooks-online-mcp-server/dist/src/index.js"],
      "cwd": "/full/path/to/quickbooks-online-mcp-server"
    }
  }
}
```

### Building Changes

After making code changes:

```bash
npm run build
```

Restart Claude Desktop to see changes.

## Support

For issues or questions:
- Check the [GitHub Issues](https://github.com/pietrobellunopilau/quickbooks-online-mcp-server/issues)
- Review the [QuickBooks API Documentation](https://developer.intuit.com/app/developer/qbo/docs/get-started)

## Security Notes

- This package includes embedded OAuth credentials for plug-and-play setup
- Each user still must authenticate with their own QuickBooks account
- OAuth requires user authorization - credentials alone cannot access data
- Suitable for internal company use
- For production external use, consider using environment-based credentials

## License

MIT
