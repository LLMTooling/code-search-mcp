# code-search-mcp
MCP server to help LLMs search any codebase

## Features

- **Universal Language Support**: Search code in 12+ programming languages
- **Fast Symbol Search**: Find classes, functions, methods, and more
- **Text Search**: Powerful regex-based code search using ripgrep
- **File Search**: Locate files by name, pattern, or extension
- **Stack Detection**: Automatically detect technology stacks in projects
- **⚡ Index Caching**: 80%+ faster startup with persistent index caching

## New: Index Persistence & Caching

The server now includes a production-grade caching system that persists symbol indices to disk, dramatically improving performance:

- **80%+ faster startup** for large workspaces
- Automatic cache invalidation on file changes
- Robust corruption handling and version control
- Cross-platform support (Windows, macOS, Linux)

See [CACHE_FEATURE.md](./CACHE_FEATURE.md) for detailed documentation.

### New MCP Tools

- `cache_stats` - View cache statistics for workspaces
- `clear_cache` - Clear cached indices
- `refresh_index` - Enhanced with force rebuild option
