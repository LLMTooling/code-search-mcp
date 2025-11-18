# Code Search MCP Server - Next Phase Features

## Current State (v1.0.0 - Production Ready ✅)
- **6 MCP Tools**: Workspace management, stack detection, symbol search, text search, index management
- **5 Symbol Search Languages**: Java, Python, JavaScript, TypeScript, C#
- **50+ Stack Detection**: Comprehensive framework and technology detection
- **118 Tests Passing**: Full unit and integration test coverage

## Phase 2 Features - Expanding Capabilities

### Priority 1: Core Search Enhancements

#### 1.1 Expanded Language Support for Symbol Search
**Goal**: Extend symbol indexing and search to 10+ additional languages

**Languages to Add**:
- Go
- Rust
- C/C++
- PHP
- Ruby
- Kotlin
- Swift
- Scala
- Dart
- Lua

**Implementation**:
- Add language configs to `symbol-indexer.ts` with ctags language mappings
- Define symbol kind mappings for each language (class, function, interface, struct, trait, etc.)
- Update `search_symbols` MCP tool schema to include new languages in enum
- Ensure proper file extension and glob patterns for each language

**Test Coverage**:
- **Unit Tests** (`tests/unit/symbol-indexer-extended.test.ts`):
  - Test indexing for each new language using sample code
  - Verify correct symbol kinds are extracted
  - Test language-specific scoping (Go packages, Rust modules, etc.)
  - Edge cases: nested structures, generics, macros

- **Integration Tests** (`tests/integration/multilang-repos.test.ts`):
  - Clone and index real repos for each language:
    - Go: `kubernetes/kubernetes` or `golang/go`
    - Rust: `rust-lang/rust` or `tokio-rs/tokio`
    - C++: `bitcoin/bitcoin` or `grpc/grpc`
    - PHP: `laravel/laravel` or `symfony/symfony`
    - Ruby: `rails/rails` or `jekyll/jekyll`
  - Verify symbol extraction and search accuracy
  - Performance benchmarks (index time, search time)

---

#### 1.2 File Search Tool
**Goal**: Add ability to find files by name pattern, complementing symbol and text search

**New MCP Tool**: `search_files`

**Features**:
- Find files by name pattern (glob/wildcard)
- Find files by exact name
- Find files by extension
- Filter by directory path
- Case-sensitive/insensitive options
- Result limiting and sorting

**Input Schema**:
```typescript
{
  workspace_id: string;
  pattern?: string;          // e.g., "*.test.ts", "Controller.java"
  name?: string;             // Exact filename
  extension?: string;        // e.g., ".rs", ".go"
  directory?: string;        // Filter to specific directory
  case_sensitive?: boolean;  // Default: false
  limit?: number;           // Default: 100
}
```

**Output Format**:
```typescript
{
  total_matches: number;
  files: Array<{
    path: string;
    relative_path: string;
    size_bytes: number;
    modified: string;      // ISO timestamp
  }>;
  search_time_ms: number;
}
```

**Implementation**:
- Create `src/file-search/file-search-service.ts`
- Use `fast-glob` (already in dependencies) for efficient file pattern matching
- Support multiple workspace search
- Cache file listings with invalidation on refresh

**Test Coverage**:
- **Unit Tests** (`tests/unit/file-search.test.ts`):
  - Pattern matching (wildcards, globs, extensions)
  - Case sensitivity handling
  - Directory filtering
  - Result limiting and sorting
  - Edge cases: symlinks, hidden files, large directories
  - Error handling: invalid patterns, missing workspaces

- **Integration Tests** (add to `tests/integration/mcp-server.test.ts`):
  - Search files in cloned repos (TypeScript, Flask, Spring, etc.)
  - Find config files (package.json, Cargo.toml, pom.xml)
  - Find test files (*.test.ts, *_test.go, test_*.py)
  - Cross-reference with known file structure

---

#### 1.3 Multi-Workspace Search
**Goal**: Search across all registered workspaces simultaneously

**Enhancement**: Add `all_workspaces` option to existing search tools

**Modified Tools**:
- `search_symbols`: Add optional `all_workspaces: boolean` parameter
- `search_text`: Add optional `all_workspaces: boolean` parameter
- `search_files`: Add optional `all_workspaces: boolean` parameter

**Behavior**:
- When `all_workspaces: true` and `workspace_id` is omitted, search all workspaces
- Results grouped by workspace with workspace metadata
- Aggregate statistics across all workspaces
- Parallel search execution for performance

**Output Format Enhancement**:
```typescript
{
  workspaces_searched: string[];
  total_matches: number;
  results_by_workspace: {
    [workspace_id: string]: {
      workspace_name: string;
      matches: Array<...>;  // Existing result format
    }
  };
  search_time_ms: number;
}
```

**Implementation**:
- Update search services to support workspace array input
- Implement parallel search with `Promise.all()`
- Add result aggregation logic
- Update MCP tool handlers to detect `all_workspaces` flag

**Test Coverage**:
- **Unit Tests** (add to existing service tests):
  - Multi-workspace search execution
  - Result aggregation and formatting
  - Parallel execution performance
  - Partial failure handling (some workspaces fail)

- **Integration Tests** (add to `mcp-server.test.ts`):
  - Search symbols across TypeScript + Flask + Spring repos
  - Search text across all test repositories
  - Search files across multiple workspaces
  - Verify correct workspace attribution

---

### Priority 2: Advanced Code Analysis

#### 2.1 Symbol References and Cross-References
**Goal**: Find where symbols are used/referenced throughout the codebase

**New MCP Tool**: `find_references`

**Features**:
- Find all references to a class, function, variable, etc.
- Import/dependency analysis
- Call hierarchy (who calls this function)
- Inheritance hierarchy (subclasses/implementations)

**Input Schema**:
```typescript
{
  workspace_id: string;
  language: string;
  symbol_name: string;
  symbol_kind?: string;     // class, function, etc.
  include_imports?: boolean; // Include import statements
  include_comments?: boolean; // Include references in comments
  limit?: number;
}
```

**Implementation**:
- Create `src/code-analysis/reference-finder.ts`
- Use ripgrep for fast text-based reference finding
- Apply language-specific import pattern matching
- Cross-reference with symbol index for accuracy
- Support qualified names (package.Class, module.function)

**Test Coverage**:
- **Unit Tests** (`tests/unit/reference-finder.test.ts`):
  - Find class references
  - Find function call sites
  - Import statement detection
  - Language-specific patterns (import vs require vs use)
  - False positive filtering

- **Integration Tests**:
  - Find references in real codebases
  - Verify accuracy against known references
  - Performance on large repos

---

#### 2.2 File Outline and Structure
**Goal**: Get structured outline of a file showing all symbols

**New MCP Tool**: `get_file_outline`

**Features**:
- Extract all symbols from a file in hierarchical order
- Show symbol relationships (methods in classes, nested functions)
- Include symbol metadata (line numbers, signatures, docstrings)
- Support all indexed languages

**Input Schema**:
```typescript
{
  workspace_id: string;
  file_path: string;        // Relative to workspace root
  include_private?: boolean; // Include private members (default: true)
  include_docs?: boolean;    // Include documentation (default: false)
}
```

**Output Format**:
```typescript
{
  file_path: string;
  language: string;
  outline: Array<{
    name: string;
    kind: string;
    line: number;
    signature?: string;
    scope?: string;
    children?: Array<...>;  // Nested symbols
    documentation?: string;
  }>;
}
```

**Implementation**:
- Create `src/code-analysis/outline-extractor.ts`
- Use ctags output to build hierarchical structure
- Parse scope information to determine parent-child relationships
- Optional: Extract docstrings/comments with language-specific parsers

**Test Coverage**:
- **Unit Tests** (`tests/unit/outline-extractor.test.ts`):
  - Hierarchical structure building
  - Nested class/function handling
  - Multiple languages
  - Edge cases: anonymous functions, closures, lambdas

- **Integration Tests**:
  - Extract outlines from real files
  - Verify hierarchy correctness
  - Compare against known file structures

---

### Priority 3: Performance and Persistence

#### 3.1 Index Persistence and Caching
**Goal**: Cache symbol indices to disk for faster startup and reduced reindexing

**Features**:
- Save indices to disk after indexing
- Load cached indices on startup
- Incremental updates (detect changed files)
- Cache invalidation strategies
- Compression for storage efficiency

**Implementation**:
- Create `src/cache/index-cache.ts`
- Use JSON or MessagePack for serialization
- Store in `~/.cache/code-search-mcp/` or workspace `.code-search/` directory
- Include cache metadata (version, timestamp, ctags version)
- Implement file watching for auto-invalidation

**New MCP Tools**:
- `clear_cache`: Clear cached indices for workspace
- `cache_stats`: Show cache statistics and status

**Test Coverage**:
- **Unit Tests** (`tests/unit/index-cache.test.ts`):
  - Cache serialization/deserialization
  - Cache invalidation logic
  - Version compatibility
  - Corruption handling
  - Storage limits

- **Integration Tests**:
  - Index → cache → load cycle
  - Verify loaded index matches original
  - Performance comparison (cold vs cached)
  - Incremental update accuracy

---

#### 3.2 File Change Watching and Incremental Updates
**Goal**: Automatically update indices when files change

**Features**:
- Watch workspace directories for file changes
- Incremental reindexing (only changed files)
- Debouncing for rapid changes
- Optional: Real-time updates during editing

**Implementation**:
- Create `src/workspace/file-watcher.ts`
- Use Node.js `fs.watch()` or `chokidar` library
- Queue changes and batch process
- Update symbol index incrementally
- Emit events for index updates

**New MCP Tool Parameter**:
- Add `watch: boolean` option to `add_workspace`

**Test Coverage**:
- **Unit Tests** (`tests/unit/file-watcher.test.ts`):
  - Change detection (create, modify, delete)
  - Debouncing logic
  - Incremental update correctness
  - Event emission

- **Integration Tests**:
  - Simulate file changes in test workspaces
  - Verify index updates correctly
  - Performance under rapid changes

---

### Priority 4: Enhanced Stack Detection

#### 4.1 Dependency Analysis
**Goal**: Extract and analyze project dependencies

**New MCP Tool**: `analyze_dependencies`

**Features**:
- Parse dependency files (package.json, Cargo.toml, pom.xml, etc.)
- List direct and transitive dependencies
- Detect outdated dependencies
- Security vulnerability scanning (integrate with npm audit, cargo audit)
- License analysis

**Implementation**:
- Create `src/dependencies/dependency-analyzer.ts`
- Parse various manifest formats
- Optional: Call package manager tools for detailed info
- Cache dependency trees

**Test Coverage**:
- **Unit Tests** (`tests/unit/dependency-analyzer.test.ts`):
  - Parse various manifest formats
  - Dependency tree construction
  - Version parsing and comparison

- **Integration Tests**:
  - Analyze dependencies in real repos
  - Verify against known dependencies

---

#### 4.2 Code Metrics and Quality Analysis
**Goal**: Provide code quality metrics and insights

**New MCP Tool**: `analyze_code_quality`

**Features**:
- File and function complexity metrics
- Code duplication detection
- Dead code identification
- Test coverage estimation
- Documentation coverage

**Implementation**:
- Create `src/code-analysis/quality-analyzer.ts`
- Implement cyclomatic complexity calculation
- Use text search for duplication detection
- Cross-reference symbols with references for dead code

**Test Coverage**:
- **Unit Tests** (`tests/unit/quality-analyzer.test.ts`):
  - Complexity calculation algorithms
  - Duplication detection
  - Accuracy on known examples

- **Integration Tests**:
  - Analyze real codebases
  - Verify metrics reasonableness

---

## Implementation Strategy

### Phase 2.1 (Weeks 1-2)
1. Expanded language support (1.1)
2. File search tool (1.2)
3. Multi-workspace search (1.3)

**Goal**: 15+ languages, 3 new search capabilities, 150+ tests passing

### Phase 2.2 (Weeks 3-4)
1. Symbol references (2.1)
2. File outline (2.2)

**Goal**: Advanced code navigation, 175+ tests passing

### Phase 2.3 (Weeks 5-6)
1. Index persistence (3.1)
2. File watching (3.2)

**Goal**: Performance optimization, 200+ tests passing

### Phase 2.4 (Weeks 7-8)
1. Dependency analysis (4.1)
2. Code quality metrics (4.2)

**Goal**: Full code intelligence platform, 225+ tests passing

---

## Testing Requirements

### For Each Feature:
1. **Unit Tests** - Test core logic in isolation
   - Happy paths
   - Edge cases
   - Error conditions
   - Performance benchmarks

2. **Integration Tests** - Test with real code
   - Multiple languages
   - Various project structures
   - Large repositories (stress testing)
   - Cross-feature interactions

3. **MCP Tool Tests** - Direct tool invocation
   - Input validation
   - Output format verification
   - Error messages
   - Tool composition (using multiple tools together)

### Quality Gates:
- 100% of new code covered by tests
- All tests passing before merge
- Performance benchmarks established
- Documentation updated

---

## Success Metrics

### Coverage:
- **Languages**: 15+ with symbol search
- **Tools**: 12+ MCP tools
- **Tests**: 225+ passing
- **Stacks**: 75+ detected

### Performance:
- Index 100K LOC in <5s
- Search response in <100ms
- Support 100+ workspaces
- Cache reduces startup time by 80%

### Quality:
- Zero test failures
- Comprehensive error handling
- Full TypeScript type safety
- Production-ready reliability

---

## Future Considerations (Phase 3+)

- Git integration (search in branches, history)
- LSP integration for richer analysis
- AI-powered code understanding
- Collaborative workspace sharing
- Plugin system for extensibility
- Web UI for visualization
- Real-time collaboration features
- Cloud storage integration

---

## Backward Compatibility

All new features are **additive only**:
- Existing tools maintain current behavior
- New optional parameters don't break existing clients
- Index format versioning for cache compatibility
- Graceful degradation for missing dependencies

No breaking changes to existing APIs or behavior.
