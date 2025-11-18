#!/usr/bin/env node

/**
 * Main entry point for the Code Search MCP Server.
 */

import { CodeSearchMCPServer } from './mcp/server.js';

async function main() {
  const server = new CodeSearchMCPServer();
  await server.start();
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
