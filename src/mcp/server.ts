/**
 * MCP Server implementation for code search.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { StackRegistry } from '../types/index.js';
import { WorkspaceManager } from '../workspace/index.js';
import { StackDetectionEngine } from '../stack-detection/index.js';
import { SymbolIndexer } from '../symbol-search/symbol-indexer.js';
import { SymbolSearchService } from '../symbol-search/symbol-search-service.js';
import { TextSearchService } from '../symbol-search/text-search-service.js';
import { isCTagsAvailable } from '../symbol-search/ctags-integration.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CodeSearchMCPServer {
  private server: Server;
  private workspaceManager: WorkspaceManager;
  private stackRegistry: StackRegistry | null = null;
  private detectionEngine: StackDetectionEngine | null = null;
  private symbolIndexer: SymbolIndexer;
  private symbolSearchService: SymbolSearchService;
  private textSearchService: TextSearchService;

  constructor() {
    this.server = new Server(
      {
        name: 'code-search-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.workspaceManager = new WorkspaceManager();
    this.symbolIndexer = new SymbolIndexer();
    this.symbolSearchService = new SymbolSearchService(this.symbolIndexer);
    this.textSearchService = new TextSearchService();

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'add_workspace',
          description: 'Add a workspace directory to search',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Absolute path to the workspace root directory',
              },
              name: {
                type: 'string',
                description: 'Optional name for the workspace',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'list_workspaces',
          description: 'List all registered workspaces',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'detect_stacks',
          description: 'Detect technology stacks in a workspace',
          inputSchema: {
            type: 'object',
            properties: {
              workspace_id: {
                type: 'string',
                description: 'ID of the workspace to analyze',
              },
              scan_mode: {
                type: 'string',
                enum: ['fast', 'thorough'],
                description: 'Scanning thoroughness (default: thorough)',
              },
            },
            required: ['workspace_id'],
          },
        },
        {
          name: 'search_symbols',
          description: 'Search for code symbols (classes, functions, methods, etc.)',
          inputSchema: {
            type: 'object',
            properties: {
              workspace_id: {
                type: 'string',
                description: 'ID of the workspace to search',
              },
              language: {
                type: 'string',
                enum: ['java', 'python', 'javascript', 'typescript', 'csharp'],
                description: 'Programming language to search',
              },
              name: {
                type: 'string',
                description: 'Symbol name to search for',
              },
              match: {
                type: 'string',
                enum: ['exact', 'prefix', 'substring', 'regex'],
                description: 'How to match the name (default: exact)',
              },
              kinds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Symbol kinds to filter by (e.g., ["class", "method"])',
              },
              scope: {
                type: 'object',
                properties: {
                  in_class: { type: 'string' },
                  in_namespace: { type: 'string' },
                  in_module: { type: 'string' },
                },
                description: 'Scope filters',
              },
              limit: {
                type: 'number',
                description: 'Maximum results to return (default: 100)',
              },
            },
            required: ['workspace_id', 'language', 'name'],
          },
        },
        {
          name: 'search_text',
          description: 'Search for text/code patterns using ripgrep',
          inputSchema: {
            type: 'object',
            properties: {
              workspace_id: {
                type: 'string',
                description: 'ID of the workspace to search',
              },
              pattern: {
                type: 'string',
                description: 'Search pattern (regex or literal)',
              },
              language: {
                type: 'string',
                enum: ['java', 'python', 'javascript', 'typescript', 'csharp'],
                description: 'Restrict search to specific language files',
              },
              case_insensitive: {
                type: 'boolean',
                description: 'Case-insensitive search (default: false)',
              },
              literal: {
                type: 'boolean',
                description: 'Treat pattern as literal string, not regex (default: false)',
              },
              limit: {
                type: 'number',
                description: 'Maximum results to return',
              },
            },
            required: ['workspace_id', 'pattern'],
          },
        },
        {
          name: 'refresh_index',
          description: 'Rebuild the symbol index for a workspace',
          inputSchema: {
            type: 'object',
            properties: {
              workspace_id: {
                type: 'string',
                description: 'ID of the workspace to reindex',
              },
            },
            required: ['workspace_id'],
          },
        },
      ];

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const toolArgs = args ?? {};

      try {
        switch (name) {
          case 'add_workspace':
            return await this.handleAddWorkspace(toolArgs);
          case 'list_workspaces':
            return await this.handleListWorkspaces();
          case 'detect_stacks':
            return await this.handleDetectStacks(toolArgs);
          case 'search_symbols':
            return await this.handleSearchSymbols(toolArgs);
          case 'search_text':
            return await this.handleSearchText(toolArgs);
          case 'refresh_index':
            return await this.handleRefreshIndex(toolArgs);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    });
  }

  private async handleAddWorkspace(args: Record<string, unknown>) {
    const path = args.path as string;
    const name = args.name as string | undefined;

    const workspace = await this.workspaceManager.addWorkspace(path, name);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              workspace_id: workspace.id,
              name: workspace.name,
              root_path: workspace.rootPath,
              message: 'Workspace added successfully',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleListWorkspaces() {
    const workspaces = this.workspaceManager.listWorkspaces();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ workspaces }, null, 2),
        },
      ],
    };
  }

  private async handleDetectStacks(args: Record<string, unknown>) {
    await this.ensureStackRegistry();

    const workspaceId = args.workspace_id as string;
    const scanMode = (args.scan_mode as 'fast' | 'thorough') ?? 'thorough';

    const workspace = this.workspaceManager.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    if (!this.detectionEngine) {
      throw new Error('Stack detection engine not initialized');
    }

    const result = await this.detectionEngine.detectStacks(
      workspaceId,
      workspace.rootPath,
      { scanMode }
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleSearchSymbols(args: Record<string, unknown>) {
    const workspaceId = args.workspace_id as string;

    const workspace = this.workspaceManager.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // Ensure index exists
    if (!this.symbolSearchService.hasIndex(workspaceId)) {
      // Check if ctags is available
      if (!(await isCTagsAvailable())) {
        throw new Error('universal-ctags is not installed. Please install it to use symbol search.');
      }

      await this.symbolSearchService.refreshIndex(workspaceId, workspace.rootPath);
    }

    const result = await this.symbolSearchService.searchSymbols(workspaceId, {
      language: args.language as never,
      name: args.name as string,
      match: args.match as never,
      kinds: args.kinds as string[] | undefined,
      scope: args.scope as never,
      limit: args.limit as number | undefined,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleSearchText(args: Record<string, unknown>) {
    const workspaceId = args.workspace_id as string;

    const workspace = this.workspaceManager.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const results = await this.textSearchService.searchText(workspace.rootPath, {
      pattern: args.pattern as string,
      language: args.language as never,
      caseInsensitive: args.case_insensitive as boolean | undefined,
      literal: args.literal as boolean | undefined,
      limit: args.limit as number | undefined,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ results }, null, 2),
        },
      ],
    };
  }

  private async handleRefreshIndex(args: Record<string, unknown>) {
    const workspaceId = args.workspace_id as string;

    const workspace = this.workspaceManager.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // Check if ctags is available
    if (!(await isCTagsAvailable())) {
      throw new Error('universal-ctags is not installed. Please install it to use symbol search.');
    }

    await this.symbolSearchService.refreshIndex(workspaceId, workspace.rootPath);

    const stats = this.symbolSearchService.getIndexStats(workspaceId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              workspace_id: workspaceId,
              total_symbols: stats.totalSymbols,
              last_indexed: stats.lastIndexed,
              message: 'Index refreshed successfully',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async ensureStackRegistry(): Promise<void> {
    if (this.stackRegistry) {
      return;
    }

    // Load stack registry from bundled JSON file
    const stacksPath = path.join(__dirname, '..', 'stacks.json');
    const content = await fs.readFile(stacksPath, 'utf-8');
    this.stackRegistry = JSON.parse(content) as StackRegistry;
    this.detectionEngine = new StackDetectionEngine(this.stackRegistry);
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Code Search MCP Server running on stdio');
  }
}
