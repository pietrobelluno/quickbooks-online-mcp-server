#!/bin/bash
# Start QuickBooks MCP Server with proxy

echo "Starting QuickBooks MCP Server on port 8080..."
echo "Press Ctrl+C to stop"
echo ""

mcp-proxy --port 8080 --stateless node dist/index.js
