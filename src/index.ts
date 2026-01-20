#!/usr/bin/env node

/**
 * Main entry point for the Code Search MCP Server.
 */

import { CodeSearchMCPServer } from './mcp/server.js';

/**
 * Parse command-line arguments.
 * Supports:
 *   --allowed-workspace <path>  (can be specified multiple times)
 */
function parseArgs(args: string[]): { allowedWorkspaces: string[] } {
  const allowedWorkspaces: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--allowed-workspace' || arg === '-w') {
      const value = args[++i];
      if (!value || value.startsWith('-')) {
        throw new Error(`Missing value for ${arg}`);
      }
      allowedWorkspaces.push(value);
    } else if (arg.startsWith('--allowed-workspace=')) {
      const value = arg.split('=')[1];
      if (!value) {
        throw new Error(`Missing value for --allowed-workspace`);
      }
      allowedWorkspaces.push(value);
    }
  }

  return { allowedWorkspaces };
}

async function main() {
  const { allowedWorkspaces } = parseArgs(process.argv.slice(2));

  // If no allowed workspaces are specified, default to the current working directory
  if (allowedWorkspaces.length === 0) {
    const cwd = process.cwd();
    console.error(`⚠️ No allowed workspaces specified. Defaulting to current working directory: ${cwd}`);
    console.error('To allow other directories, use --allowed-workspace <path>');
    allowedWorkspaces.push(cwd);
  }

  const server = new CodeSearchMCPServer({ allowedWorkspaces });
  await server.start();
}

main().catch(() => {
  process.exit(1);
});
