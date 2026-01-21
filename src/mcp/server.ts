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
import { StackDetectionEngine } from '../stack-detection/index.js';
import { SymbolIndexer } from '../symbol-search/symbol-indexer.js';
import { SymbolSearchService } from '../symbol-search/symbol-search-service.js';
import { TextSearchService } from '../symbol-search/text-search-service.js';
import { isCTagsAvailable } from '../symbol-search/ctags-integration.js';
import { FileSearchService } from '../file-search/index.js';
import { DependencyAnalyzer } from '../dependency-analysis/index.js';
import type { DependencyAnalysisOptions } from '../types/dependency-analysis.js';
import { ASTSearchService } from '../ast-search/index.js';
import type { ASTRule } from '../types/ast-search.js';
import { validateWorkspacePath, pathToWorkspaceId } from '../utils/workspace-path.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CodeSearchMCPServerOptions {
  allowedWorkspaces?: string[];
}

export class CodeSearchMCPServer {
  // Note: Using Server (low-level API) intentionally for precise control over tool registration
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  private server: Server;
  private allowedWorkspaces: string[];
  private stackRegistry: StackRegistry | null = null;
  private detectionEngine: StackDetectionEngine | null = null;
  private symbolIndexer: SymbolIndexer;
  private symbolSearchService: SymbolSearchService;
  private textSearchService: TextSearchService;
  private fileSearchService: FileSearchService;
  private dependencyAnalyzer: DependencyAnalyzer;
  private astSearchService: ASTSearchService;

  constructor(options: CodeSearchMCPServerOptions = {}) {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
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

    this.allowedWorkspaces = options.allowedWorkspaces ?? [];
    this.symbolIndexer = new SymbolIndexer();
    this.symbolSearchService = new SymbolSearchService(this.symbolIndexer);
    this.textSearchService = new TextSearchService();
    this.fileSearchService = new FileSearchService();
    this.dependencyAnalyzer = new DependencyAnalyzer();
    this.astSearchService = new ASTSearchService();

    // Initialize cache system
    this.symbolIndexer.initialize().catch(() => {
      // Silently fail - indexing will work without cache
    });

    this.setupHandlers();
  }

  /**
   * Validate and resolve a workspace path.
   * Throws if the path is not allowed or doesn't exist.
   */
  private async resolveWorkspace(requestedPath: string): Promise<{ path: string; workspaceId: string }> {
    return validateWorkspacePath(requestedPath, this.allowedWorkspaces);
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, () => {
      const tools: Tool[] = [
        {
          name: 'detect_stacks',
          description: 'Detect technology stacks in a directory',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Absolute path to the directory to analyze',
              },
              scan_mode: {
                type: 'string',
                enum: ['fast', 'thorough'],
                description: 'Scanning thoroughness (default: thorough)',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'search_symbols',
          description: 'Search for code symbols (classes, functions, methods, etc.)',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Absolute path to the directory to search',
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
            required: ['path', 'language', 'name'],
          },
        },
        {
          name: 'search_text',
          description: 'Search for text/code patterns using ripgrep',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Absolute path to the directory to search',
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
              paths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Specific file paths or glob patterns to search (relative to the workspace root)',
              },
            },
            required: ['path', 'pattern'],
          },
        },
        {
          name: 'search_files',
          description: 'Search for files by name, pattern, or extension',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Absolute path to the directory to search',
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
            required: ['path'],
          },
        },
        {
          name: 'refresh_index',
          description: 'Rebuild the symbol index for a directory',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Absolute path to the directory to reindex',
              },
              force_rebuild: {
                type: 'boolean',
                description: 'Force rebuild from scratch, ignoring cache (default: false)',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'cache_stats',
          description: 'Get cache statistics for indexed directories',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Absolute path to the directory (optional - if not provided, returns stats for all cached directories)',
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
              path: {
                type: 'string',
                description: 'Absolute path to the directory to clear cache for (optional - if not provided, clears all caches)',
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
              path: {
                type: 'string',
                description: 'Absolute path to the directory to analyze',
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
            required: ['path'],
          },
        },
        {
          name: 'search_ast_pattern',
          description: 'Search code using AST pattern matching with metavariables ($VAR for capture, $$VAR for single anonymous, $$$VAR for multiple)',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Absolute path to the directory to search',
              },
              language: {
                type: 'string',
                enum: ['javascript', 'typescript', 'tsx', 'python', 'rust', 'go', 'java', 'c', 'cpp', 'csharp', 'ruby', 'php', 'kotlin', 'swift'],
                description: 'Programming language to search',
              },
              pattern: {
                type: 'string',
                description: 'AST pattern to match (e.g., "function $FUNC($ARG) { $$$ }" or "async function $NAME() { $$$ }" for functions without await)',
              },
              paths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Specific file paths or glob patterns to search (optional)',
              },
              limit: {
                type: 'number',
                description: 'Maximum results to return (default: 100)',
              },
              max_lines: {
                type: 'number',
                description: 'Maximum number of lines to include in match text (default: 3)',
              },
            },
            required: ['path', 'language', 'pattern'],
          },
        },
        {
          name: 'search_ast_rule',
          description: 'Search code using complex AST rules with relational (inside, has, precedes, follows) and composite (all, any, not) operators',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Absolute path to the directory to search',
              },
              language: {
                type: 'string',
                enum: ['javascript', 'typescript', 'tsx', 'python', 'rust', 'go', 'java', 'c', 'cpp', 'csharp', 'ruby', 'php', 'kotlin', 'swift'],
                description: 'Programming language to search',
              },
              rule: {
                type: 'object',
                description: 'AST rule object with pattern, kind, regex, relational rules (inside, has, precedes, follows), or composite rules (all, any, not, matches)',
              },
              paths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Specific file paths or glob patterns to search (optional)',
              },
              limit: {
                type: 'number',
                description: 'Maximum results to return (default: 100)',
              },
              max_lines: {
                type: 'number',
                description: 'Maximum number of lines to include in match text (default: 3)',
              },
              debug: {
                type: 'boolean',
                description: 'Enable debug mode to show AST structure (default: false)',
              },
            },
            required: ['path', 'language', 'rule'],
          },
        },
        {
          name: 'check_ast_grep',
          description: 'Check if ast-grep is available and get version information',
          inputSchema: {
            type: 'object',
            properties: {},
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
          case 'search_ast_pattern':
            return await this.handleSearchASTPattern(toolArgs);
          case 'search_ast_rule':
            return await this.handleSearchASTRule(toolArgs);
          case 'check_ast_grep':
            return this.handleCheckASTGrep();
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

  private async handleDetectStacks(args: Record<string, unknown>) {
    await this.ensureStackRegistry();

    const { path: workspacePath, workspaceId } = await this.resolveWorkspace(args.path as string);
    const scanMode = (args.scan_mode as 'fast' | 'thorough' | undefined) ?? 'thorough';

    if (!this.detectionEngine) {
      throw new Error('Stack detection engine not initialized');
    }

    const result = await this.detectionEngine.detectStacks(
      workspaceId,
      workspacePath,
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
    const { path: workspacePath, workspaceId } = await this.resolveWorkspace(args.path as string);

    // Ensure index exists
    if (!this.symbolSearchService.hasIndex(workspaceId)) {
      // Check if ctags is available
      if (!(await isCTagsAvailable())) {
        throw new Error('universal-ctags is not installed. Please install it to use symbol search.');
      }

      await this.symbolSearchService.refreshIndex(workspaceId, workspacePath);
    }

    const result = this.symbolSearchService.searchSymbols(workspaceId, {
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
    const { path: workspacePath } = await this.resolveWorkspace(args.path as string);

    const rawPaths = args.paths as string[] | string | undefined;
    const includeGlobs = this.normalizeSearchPathFilters(
      Array.isArray(rawPaths) ? rawPaths : rawPaths ? [rawPaths] : undefined,
      workspacePath
    );

    const results = await this.textSearchService.searchText(workspacePath, {
      pattern: args.pattern as string,
      language: args.language as never,
      caseInsensitive: args.case_insensitive as boolean | undefined,
      literal: args.literal as boolean | undefined,
      limit: args.limit as number | undefined,
      include: includeGlobs,
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

  private normalizeSearchPathFilters(
    paths: string[] | undefined,
    workspaceRoot: string
  ): string[] | undefined {
    if (!paths || paths.length === 0) {
      return undefined;
    }

    const normalizedRoot = path.resolve(workspaceRoot);
    const includeGlobs: string[] = [];
    const seen = new Set<string>();

    for (const rawPath of paths) {
      if (!rawPath || typeof rawPath !== 'string') {
        continue;
      }

      const trimmed = rawPath.trim();
      if (!trimmed) {
        continue;
      }

      if (trimmed.startsWith('!')) {
        throw new Error(`paths entries cannot start with "!": ${rawPath}`);
      }

      const absoluteCandidate = path.isAbsolute(trimmed)
        ? path.normalize(trimmed)
        : path.normalize(path.join(normalizedRoot, trimmed));

      const relativePath = path.relative(normalizedRoot, absoluteCandidate);

      if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error(`Path "${rawPath}" is outside the workspace root`);
      }

      const glob = relativePath.split(path.sep).join('/');

      if (!glob) {
        throw new Error(`Path "${rawPath}" must resolve to a file or glob within the workspace`);
      }

      if (!seen.has(glob)) {
        includeGlobs.push(glob);
        seen.add(glob);
      }
    }

    return includeGlobs.length > 0 ? includeGlobs : undefined;
  }

  private async handleSearchFiles(args: Record<string, unknown>) {
    const { path: workspacePath } = await this.resolveWorkspace(args.path as string);

    const result = await this.fileSearchService.searchFiles(workspacePath, {
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
    const { path: workspacePath, workspaceId } = await this.resolveWorkspace(args.path as string);
    const forceRebuild = (args.force_rebuild as boolean | undefined) ?? false;

    // Check if ctags is available
    if (!(await isCTagsAvailable())) {
      throw new Error('universal-ctags is not installed. Please install it to use symbol search.');
    }

    await this.symbolSearchService.refreshIndex(workspaceId, workspacePath, forceRebuild);

    const stats = this.symbolSearchService.getIndexStats(workspaceId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              path: workspacePath,
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
    const requestedPath = args.path as string | undefined;
    const cacheManager = this.symbolIndexer.getCacheManager();

    if (requestedPath) {
      // Get stats for specific directory
      const { path: workspacePath, workspaceId } = await this.resolveWorkspace(requestedPath);

      const stats = await cacheManager.getCacheStats(workspaceId, workspacePath);
      if (!stats) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  path: workspacePath,
                  message: 'No cache found for this directory',
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
                path: stats.workspacePath,
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
      // Get stats for all cached directories
      const allStats = await cacheManager.getAllCacheStats();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total_cached: allStats.length,
                caches: allStats.map(stats => ({
                  path: stats.workspacePath,
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
    const requestedPath = args.path as string | undefined;
    const cacheManager = this.symbolIndexer.getCacheManager();

    if (requestedPath) {
      // Clear cache for specific directory
      const { path: workspacePath } = await this.resolveWorkspace(requestedPath);
      const workspaceId = pathToWorkspaceId(workspacePath);

      await cacheManager.clearCache(workspaceId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                path: workspacePath,
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
    const { path: workspacePath, workspaceId } = await this.resolveWorkspace(args.path as string);

    const options: DependencyAnalysisOptions = {
      includeTransitive: args.include_transitive as boolean | undefined,
      checkOutdated: args.check_outdated as boolean | undefined,
      securityAnalysis: args.security_analysis as boolean | undefined,
      maxDepth: args.max_depth as number | undefined,
    };

    const result = await this.dependencyAnalyzer.analyzeDependencies(
      workspaceId,
      workspacePath,
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

  private async handleSearchASTPattern(args: Record<string, unknown>) {
    const { path: workspacePath, workspaceId } = await this.resolveWorkspace(args.path as string);

    // Check if ast-grep is available (should always be true since it's bundled)
    const astGrepInfo = this.astSearchService.isAvailable();
    if (!astGrepInfo.available) {
      throw new Error(`ast-grep failed to load: ${astGrepInfo.error ?? 'unknown error'}`);
    }

    const result = await this.astSearchService.searchPattern(workspaceId, workspacePath, {
      language: args.language as never,
      pattern: args.pattern as string,
      paths: args.paths as string[] | undefined,
      limit: args.limit as number | undefined,
      maxLines: args.max_lines as number | undefined,
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

  private async handleSearchASTRule(args: Record<string, unknown>) {
    const { path: workspacePath, workspaceId } = await this.resolveWorkspace(args.path as string);

    // Check if ast-grep is available (should always be true since it's bundled)
    const astGrepInfo = this.astSearchService.isAvailable();
    if (!astGrepInfo.available) {
      throw new Error(`ast-grep failed to load: ${astGrepInfo.error ?? 'unknown error'}`);
    }

    const rule = args.rule as ASTRule;

    // Validate rule
    const validation = this.astSearchService.validateRule(rule);
    if (!validation.valid) {
      throw new Error(`Invalid AST rule: ${validation.errors.join(', ')}`);
    }

    const result = await this.astSearchService.searchRule(workspaceId, workspacePath, {
      language: args.language as never,
      rule,
      paths: args.paths as string[] | undefined,
      limit: args.limit as number | undefined,
      maxLines: args.max_lines as number | undefined,
      debug: args.debug as boolean | undefined,
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

  private handleCheckASTGrep() {
    const astGrepInfo = this.astSearchService.isAvailable();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(astGrepInfo, null, 2),
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
  }
}
