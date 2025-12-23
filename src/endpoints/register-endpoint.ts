/**
 * OAuth 2.0 Dynamic Client Registration Endpoint (RFC 7591)
 * Allows Claude Desktop to dynamically register as an OAuth client
 */

import { Request, Response } from 'express';
import crypto from 'crypto';

export async function handleRegisterEndpoint(req: Request, res: Response): Promise<any> {
  try {
    console.log('\n→ OAuth /register request (Dynamic Client Registration)');
    console.log('  Request body:', JSON.stringify(req.body, null, 2));

    const { client_name, redirect_uris, response_types, grant_types } = req.body;

    // Generate client credentials
    const client_id = crypto.randomBytes(32).toString('hex');
    const client_secret = crypto.randomBytes(48).toString('hex');

    console.log(`  ✓ Generated client_id: ${client_id.substring(0, 16)}...`);
    console.log(`  ✓ Generated client_secret: [hidden]`);
    console.log(`  ✓ Client name: ${client_name || 'not provided'}`);
    console.log(`  ✓ Redirect URIs: ${redirect_uris ? redirect_uris.join(', ') : 'not provided'}`);

    // Return client registration response (RFC 7591)
    const registrationResponse = {
      client_id,
      client_secret,
      client_name: client_name || 'Claude MCP Client',
      redirect_uris: redirect_uris || ['https://claude.ai/api/mcp/auth_callback'],
      response_types: response_types || ['code'],
      grant_types: grant_types || ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: 'none'
    };

    console.log('  ✓ Client registration successful');
    res.json(registrationResponse);
  } catch (error) {
    console.error('Error in /register endpoint:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to register client'
    });
  }
}
