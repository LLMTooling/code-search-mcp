# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Pre-Commit Checklist

**ALWAYS run the following before committing:**
```bash
npm run build      # TypeScript compilation + asset copy
npm run typecheck  # Strict type checking (tsc --noEmit)
npm run lint        # ESLint on src/
npm test           # Full test suite
```

**Quick single-test command:**
```bash
npm test -- <path-to-test-file>  # Run specific test file
```

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript and copy assets to `dist/` |
| `npm run dev` | Watch mode compilation (tsc --watch) |
| `npm run lint` | Run ESLint on TypeScript files |
| `npm run lint:fix` | Auto-fix ESLint issues |
| `npm run typecheck` | Type check without emitting files (`tsc --noEmit`) |
| `npm test` | Run all tests (Jest with ts-jest preset) |
| `npm run test:integration` | Run integration tests only |

## Architecture Overview

**Code Search MCP** is a Model Context Protocol (MCP) server that provides intelligent code search capabilities across 12+ programming languages. It integrates universal-ctags, ripgrep, and ast-grep to deliver:

- **Symbol Search** - Indexed lookup of classes, functions, methods, variables
- **AST Search** - Structural code pattern matching with metavariables and relational rules
- **Text Search** - Fast regex-based code search via ripgrep
- **File Search** - Glob-based file navigation
- **Stack Detection** - Technology stack identification
- **Dependency Analysis** - Multi-ecosystem package analysis
- **Index Caching** - Persistent symbol indices (80%+ faster startup)

## Core Components

### MCP Server (`src/mcp/server.ts`)
- Entry point for all MCP tool calls
- Routes requests to appropriate services
- Enforces workspace security via `allowedWorkspaces` configuration
- Exposes 10 tools: `detect_stacks`, `search_symbols`, `search_text`, `search_files`, `refresh_index`, `cache_stats`, `clear_cache`, `analyze_dependencies`, `search_ast_pattern`, `search_ast_rule`, `check_ast_grep`

### Symbol Search (`src/symbol-search/`)
- **SymbolIndexer** - Manages ctags integration and cache orchestration
- **SymbolSearchService** - Handles symbol search with match modes (exact, prefix, substring, regex)
- **TextSearchService** - Ripgrep wrapper for text/code pattern search
- **ctags-integration.ts** - Spawns universal-ctags in temp directory (security hardening)

### AST Search (`src/ast-search/`)
- **ASTSearchService** - Bundled ast-grep NAPI for structural code search
- Supports 15 languages with dynamic language registration
- Provides pattern matching with metavariables (`$VAR`, `$$VAR`, `$$$VAR`)
- Supports complex rules with relational operators (`inside`, `has`, `precedes`, `follows`)

### Cache System (`src/cache/`)
- **CacheManager** - Persistent symbol index caching in `~/.code-search-mcp-cache/`
- Automatic invalidation based on file modification times
- Workspace isolation via hash-based IDs

### Security (`src/utils/security.ts`)
- **ReDoS prevention** - Regex complexity validation to prevent catastrophic backtracking
- **Path validation** - UNC extended-length path blocking, traversal prevention
- **Resource limits** - Max file sizes (100MB), recursion depths (100), timeouts (30s)
- Created during security audit - always validate user inputs

## Project Structure

```
src/
├── mcp/                    # MCP server implementation, tool handlers
├── symbol-search/          # Symbol indexing, text search
├── ast-search/             # AST pattern matching (ast-grep NAPI)
├── file-search/            # File system navigation (fast-glob)
├── stack-detection/       # Technology stack detection engine
├── dependency-analysis/    # Multi-ecosystem dependency parsing
├── cache/                  # Persistent index caching
├── types/                  # TypeScript type definitions
├── utils/                  # Utilities: security, workspace validation
└── stacks.json             # Stack definitions for detection
```

## Important Conventions

### TypeScript Configuration
- **Strict mode enabled** - `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- **ESM modules** - `module: "NodeNext"`, `moduleResolution: "NodeNext"`
- **Compilation target** - `ES2022`, Node.js 18+ required

### Import Convention
- Always use `.js` extensions in imports (ESM requirement): `import { foo } from './foo.js'`
- Type-only imports: `import type { Foo } from './types/foo.js'`

### Security Model
- **Workspace validation** - All paths validated against `allowedWorkspaces` list
- **Path traversal blocking** - Checks for `..` and absolute paths before resolution
- **UNC path blocking** - Windows `\\?\` and `\\.\` paths rejected explicitly
- **Symlink hardening** - Temp files use system temp directory, symlink checks before writes

### Testing
- Unit tests in `tests/unit/`, integration tests in `tests/integration/`
- Uses `ts-jest` with ESM preset: `--experimental-vm-modules`
- Tests include 61 security-specific tests across 3 test files

## MCP Tools Reference

| Tool | Purpose |
|------|---------|
| `detect_stacks` | Auto-detect technology stacks in a directory |
| `search_symbols` | Find classes, functions, methods by name/pattern |
| `search_text` | Regex code search using ripgrep |
| `search_files` | Find files by name, extension, or glob pattern |
| `refresh_index` | Rebuild symbol index for a workspace |
| `cache_stats` | Get cache statistics for workspaces |
| `clear_cache` | Clear cached indices |
| `analyze_dependencies` | Analyze project dependencies |
| `search_ast_pattern` | AST pattern matching with metavariables |
| `search_ast_rule` | Complex AST rules with relational/composite operators |
| `check_ast_grep` | Verify ast-grep availability |

## External Dependencies

- **@ast-grep/napi** - Bundled native binaries (no installation required)
- **@vscode/ripgrep** - Bundled ripgrep binary
- **@LLMTooling/universal-ctags-node** - Bundled universal-ctags binary
- **fast-glob** - Fast glob pattern matching
- **@modelcontextprotocol/sdk** - MCP SDK for server implementation

All external binaries are bundled - no external ctags/ripgrep installation needed by end users.
