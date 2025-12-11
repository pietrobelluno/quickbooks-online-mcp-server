/**
 * Realm ID Discovery Helper
 *
 * When a user authenticates via Copilot Studio OAuth, we get their access token
 * but not their realm ID (company ID). This helper makes a QuickBooks API call
 * to discover the user's company and extract the realm ID.
 */

import axios from 'axios';

/**
 * Discover realm ID by calling QuickBooks API
 *
 * Strategy: Make a minimal API call to QuickBooks and extract realm ID from the response
 * or use the CompanyInfo endpoint which returns company details.
 */
export async function discoverRealmId(
  accessToken: string,
  environment: 'sandbox' | 'production' = 'sandbox'
): Promise<string> {
  // We need to try different approaches since we don't know the realm ID yet

  // Approach 1: Try to get user info from Intuit OAuth endpoint
  try {
    const response = await axios.get('https://sandbox-accounts.platform.intuit.com/v1/openid_connect/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    // The userinfo endpoint might include the realmId
    if (response.data && response.data.realmId) {
      return response.data.realmId;
    }
  } catch (error) {
    console.log('Userinfo endpoint did not return realm ID, trying alternative approach...');
  }

  // Approach 2: The token introspection might include it
  // Unfortunately, we need the realm ID to make QuickBooks API calls...

  // This is a chicken-and-egg problem!
  // The only way to get realm ID is from the OAuth callback URL parameter

  throw new Error(
    'Cannot discover realm ID automatically. ' +
    'The realm ID must be captured from the OAuth callback URL when the user authorizes. ' +
    'QuickBooks sends it as: ?code=XXX&realmId=YYY&state=ZZZ'
  );
}

/**
 * Check if Copilot Studio provides realm ID in custom headers
 * Some platforms send OAuth callback parameters in custom headers
 */
export function extractRealmIdFromHeaders(headers: Record<string, string>): string | undefined {
  // Check common header names that might contain realm ID
  return (
    headers['x-quickbooks-realm-id'] ||
    headers['x-realm-id'] ||
    headers['x-qbo-realm-id'] ||
    undefined
  );
}
