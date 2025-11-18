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
import { FileSearchService } from '../file-search/index.js';
import { DependencyAnalyzer } from '../dependency-analysis/index.js';
import type { DependencyAnalysisOptions } from '../types/dependency-analysis.js';

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
  private fileSearchService: FileSearchService;
  private dependencyAnalyzer: DependencyAnalyzer;

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
    this.fileSearchService = new FileSearchService();
    this.dependencyAnalyzer = new DependencyAnalyzer();

    // Initialize cache system
    this.symbolIndexer.initialize().catch((error) => {
      console.error('Failed to initialize cache system:', error);
    });

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
                enum: ['java', 'python', 'javascript', 'typescript', 'csharp', 'go', 'rust', 'c', 'cpp', 'php', 'ruby', 'kotlin'],
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
          name: 'search_files',
          description: 'Search for files by name, pattern, or extension',
          inputSchema: {
            type: 'object',
            properties: {
              workspace_id: {
                type: 'string',
                description: 'ID of the workspace to search',
              },
              pattern: {
                type: 'string',
                description: 'Glob pattern to match files (e.g., "**/*.json", "src/**/*.ts")',
              },
              name: {
                type: 'string',
                description: 'File name to search for (supports wildcards, e.g., "config.*")',
              },
              extension: {
                type: 'string',
                description: 'File extension to filter by (e.g., "ts", "json")',
              },
              directory: {
                type: 'string',
                description: 'Restrict search to this directory (relative to workspace root)',
              },
              case_sensitive: {
                type: 'boolean',
                description: 'Case-sensitive search (default: false)',
              },
              limit: {
                type: 'number',
                description: 'Maximum results to return (default: 100)',
              },
            },
            required: ['workspace_id'],
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
              force_rebuild: {
                type: 'boolean',
                description: 'Force rebuild from scratch, ignoring cache (default: false)',
              },
            },
            required: ['workspace_id'],
          },
        },
        {
          name: 'cache_stats',
          description: 'Get cache statistics for workspaces',
          inputSchema: {
            type: 'object',
            properties: {
              workspace_id: {
                type: 'string',
                description: 'ID of the workspace (optional - if not provided, returns stats for all workspaces)',
              },
            },
          },
        },
        {
          name: 'clear_cache',
          description: 'Clear cached indices',
          inputSchema: {
            type: 'object',
            properties: {
              workspace_id: {
                type: 'string',
                description: 'ID of the workspace to clear cache for (optional - if not provided, clears all caches)',
              },
            },
          },
        },
        {
          name: 'analyze_dependencies',
          description: 'Analyze project dependencies from manifest files (package.json, Cargo.toml, pom.xml, etc.)',
          inputSchema: {
            type: 'object',
            properties: {
              workspace_id: {
                type: 'string',
                description: 'ID of the workspace to analyze',
              },
              include_transitive: {
                type: 'boolean',
                description: 'Include transitive dependencies (requires package manager, default: false)',
              },
              check_outdated: {
                type: 'boolean',
                description: 'Check for outdated versions (requires network, default: false)',
              },
              security_analysis: {
                type: 'boolean',
                description: 'Perform security analysis (default: false)',
              },
              max_depth: {
                type: 'number',
                description: 'Maximum depth for transitive dependencies (default: 5)',
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
          case 'search_files':
            return await this.handleSearchFiles(toolArgs);
          case 'refresh_index':
            return await this.handleRefreshIndex(toolArgs);
          case 'cache_stats':
            return await this.handleCacheStats(toolArgs);
          case 'clear_cache':
            return await this.handleClearCache(toolArgs);
          case 'analyze_dependencies':
            return await this.handleAnalyzeDependencies(toolArgs);
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

  private async handleSearchFiles(args: Record<string, unknown>) {
    const workspaceId = args.workspace_id as string;

    const workspace = this.workspaceManager.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const result = await this.fileSearchService.searchFiles(workspace.rootPath, {
      pattern: args.pattern as string | undefined,
      name: args.name as string | undefined,
      extension: args.extension as string | undefined,
      directory: args.directory as string | undefined,
      case_sensitive: args.case_sensitive as boolean | undefined,
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

  private async handleRefreshIndex(args: Record<string, unknown>) {
    const workspaceId = args.workspace_id as string;
    const forceRebuild = (args.force_rebuild as boolean) ?? false;

    const workspace = this.workspaceManager.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // Check if ctags is available
    if (!(await isCTagsAvailable())) {
      throw new Error('universal-ctags is not installed. Please install it to use symbol search.');
    }

    await this.symbolSearchService.refreshIndex(workspaceId, workspace.rootPath, forceRebuild);

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
              message: forceRebuild ? 'Index rebuilt from scratch' : 'Index refreshed successfully',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleCacheStats(args: Record<string, unknown>) {
    const workspaceId = args.workspace_id as string | undefined;
    const cacheManager = this.symbolIndexer.getCacheManager();

    if (workspaceId) {
      // Get stats for specific workspace
      const workspace = this.workspaceManager.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }

      const stats = await cacheManager.getCacheStats(workspaceId, workspace.rootPath);
      if (!stats) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  workspace_id: workspaceId,
                  message: 'No cache found for this workspace',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                workspace_id: stats.workspaceId,
                workspace_path: stats.workspacePath,
                total_symbols: stats.totalSymbols,
                last_indexed: stats.lastIndexed,
                cache_size_bytes: stats.cacheSize,
                cache_age_ms: stats.cacheAge,
                file_count: stats.fileCount,
                is_cached: stats.isCached,
              },
              null,
              2
            ),
          },
        ],
      };
    } else {
      // Get stats for all workspaces
      const allStats = await cacheManager.getAllCacheStats();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total_workspaces: allStats.length,
                workspaces: allStats.map(stats => ({
                  workspace_id: stats.workspaceId,
                  workspace_path: stats.workspacePath,
                  total_symbols: stats.totalSymbols,
                  last_indexed: stats.lastIndexed,
                  cache_size_bytes: stats.cacheSize,
                  cache_age_ms: stats.cacheAge,
                  file_count: stats.fileCount,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  private async handleClearCache(args: Record<string, unknown>) {
    const workspaceId = args.workspace_id as string | undefined;
    const cacheManager = this.symbolIndexer.getCacheManager();

    if (workspaceId) {
      // Clear cache for specific workspace
      const workspace = this.workspaceManager.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }

      await cacheManager.clearCache(workspaceId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                workspace_id: workspaceId,
                message: 'Cache cleared successfully',
              },
              null,
              2
            ),
          },
        ],
      };
    } else {
      // Clear all caches
      await cacheManager.clearAllCaches();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                message: 'All caches cleared successfully',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  private async handleAnalyzeDependencies(args: Record<string, unknown>) {
    const workspaceId = args.workspace_id as string;

    const workspace = this.workspaceManager.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const options: DependencyAnalysisOptions = {
      includeTransitive: args.include_transitive as boolean | undefined,
      checkOutdated: args.check_outdated as boolean | undefined,
      securityAnalysis: args.security_analysis as boolean | undefined,
      maxDepth: args.max_depth as number | undefined,
    };

    const result = await this.dependencyAnalyzer.analyzeDependencies(
      workspaceId,
      workspace.rootPath,
      options
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
