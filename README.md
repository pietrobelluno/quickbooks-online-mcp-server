# QuickBooks Online MCP Server

This is a Model Context Protocol (MCP) server implementation for QuickBooks Online integration.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```env
QUICKBOOKS_CLIENT_ID=your_client_id
QUICKBOOKS_CLIENT_SECRET=your_client_secret
QUICKBOOKS_ENVIRONMENT=sandbox
```

3. Get your Client ID and Client Secret:
   - Go to the [Intuit Developer Portal](https://developer.intuit.com/)
   - Create a new app or select an existing one
   - Get the Client ID and Client Secret from the app's keys section
   - Add `http://localhost:8000/callback` to the app's Redirect URIs

## Authentication

There are two ways to authenticate with QuickBooks Online:

### Option 1: Using Environment Variables

If you already have a refresh token and realm ID, you can add them directly to your `.env` file:

```env
QUICKBOOKS_REFRESH_TOKEN=your_refresh_token
QUICKBOOKS_REALM_ID=your_realm_id
```

### Option 2: Using the OAuth Flow

If you don't have a refresh token, you can use the built-in OAuth flow:

This will:
- Start a temporary local server
- Open your default browser automatically
- Redirect you to QuickBooks for authentication
- Save the tokens to your `.env` file once authenticated
- Close automatically when complete

## Usage

After authentication is set up, you can use the MCP server to interact with QuickBooks Online. The server provides various tools for managing customers, estimates, bills, and more.

## Available Tools

**Note**: As of Issue #2, most tools have been disabled to prevent Claude Desktop from hanging due to large data responses. Only the QueryReports tool is currently active.

### Active Tools

- **QueryReports** - Flexible report generation for QuickBooks data (recommended for all queries)

### Disabled Tools

The following tools are currently disabled but can be re-enabled in the future with pagination support:

- Search tools: SearchCustomers, SearchInvoices, SearchItems, SearchVendors, SearchBills, SearchEstimates, SearchBillPayments, SearchPurchases, SearchEmployees, SearchJournalEntries, SearchAccounts
- Get/Read tools: GetCustomer, ReadInvoice, ReadItem, GetVendor, GetBill, GetEstimate, GetBillPayment, GetPurchase, GetEmployee, GetJournalEntry
- Create tools: CreateCustomer, CreateInvoice, CreateItem, CreateVendor, CreateBill, CreateEstimate, CreateBillPayment, CreatePurchase, CreateEmployee, CreateJournalEntry, CreateAccount
- Update tools: UpdateCustomer, UpdateInvoice, UpdateItem, UpdateVendor, UpdateBill, UpdateEstimate, UpdateBillPayment, UpdatePurchase, UpdateEmployee, UpdateJournalEntry, UpdateAccount
- Delete tools: DeleteCustomer, DeleteVendor, DeleteBill, DeleteEstimate, DeleteBillPayment, DeletePurchase, DeleteJournalEntry

**Why?** These tools fetch large amounts of data per request, which exceeds Claude's context window and causes the integration to hang. The QueryReports tool provides efficient access to QuickBooks data through report queries.


## Error Handling

If you see an error message like "QuickBooks not connected", make sure to:

1. Check that your `.env` file contains all required variables
2. Verify that your tokens are valid and not expired

