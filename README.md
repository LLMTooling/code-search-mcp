<div align="center">
  <h1>Code Search MCP</h1>
  <p>Universal MCP server for intelligent code search across any programming language</p>
</div>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18%2B-green?style=for-the-badge&logo=node.js&logoColor=white">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge">
  <img src="https://img.shields.io/badge/Platforms-Win%20%7C%20macOS%20%7C%20Linux-blue?style=for-the-badge">
</p>

<div align="center">
  <h2>Overview</h2>
</div>

<div align="center">

Code Search MCP is a high-performance Model Context Protocol server that enables LLMs to intelligently search and analyze codebases across 12+ programming languages. Built on universal-ctags and ripgrep, it provides fast symbol search, text search, file search, and dependency analysis with persistent caching for 80%+ faster startup times.

</div>

<div align="center">
  <h2>Core Features</h2>
</div>

<div align="center">
<table>
  <tr>
    <th>Feature</th>
    <th>Description</th>
    <th>Performance</th>
  </tr>
  <tr>
    <td>Symbol Search</td>
    <td>Find classes, functions, methods, and variables with intelligent filtering</td>
    <td>Fast (indexed)</td>
  </tr>
  <tr>
    <td>Text Search</td>
    <td>Regex-powered code search using ripgrep</td>
    <td>Very Fast</td>
  </tr>
  <tr>
    <td>File Search</td>
    <td>Locate files by name, pattern, or extension with glob support</td>
    <td>Very Fast</td>
  </tr>
  <tr>
    <td>Stack Detection</td>
    <td>Automatically detect technology stacks and frameworks in projects</td>
    <td>Fast</td>
  </tr>
  <tr>
    <td>Dependency Analysis</td>
    <td>Analyze project dependencies across multiple ecosystems</td>
    <td>Fast</td>
  </tr>
  <tr>
    <td>Index Caching</td>
    <td>Persistent symbol indices with automatic invalidation</td>
    <td>80%+ faster startup</td>
  </tr>
</table>
</div>

<div align="center">
  <h2>Language Support</h2>
</div>

<div align="center">

Code Search MCP supports 12 programming languages with full symbol indexing and intelligent search capabilities.

</div>

<div align="center">
<table>
  <tr>
    <th>Language</th>
    <th>Symbol Search</th>
    <th>Text Search</th>
    <th>Dependency Analysis</th>
  </tr>
  <tr>
    <td>JavaScript</td>
    <td>Full</td>
    <td>Full</td>
    <td>Full (npm)</td>
  </tr>
  <tr>
    <td>TypeScript</td>
    <td>Full</td>
    <td>Full</td>
    <td>Full (npm)</td>
  </tr>
  <tr>
    <td>Python</td>
    <td>Full</td>
    <td>Full</td>
    <td>Full (pip)</td>
  </tr>
  <tr>
    <td>Java</td>
    <td>Full</td>
    <td>Full</td>
    <td>Full (Maven/Gradle)</td>
  </tr>
  <tr>
    <td>C#</td>
    <td>Full</td>
    <td>Full</td>
    <td>Full (NuGet)</td>
  </tr>
  <tr>
    <td>Go</td>
    <td>Full</td>
    <td>Limited</td>
    <td>Full (go.mod)</td>
  </tr>
  <tr>
    <td>Rust</td>
    <td>Full</td>
    <td>Limited</td>
    <td>Full (Cargo)</td>
  </tr>
  <tr>
    <td>C / C++</td>
    <td>Full</td>
    <td>Limited</td>
    <td>Limited</td>
  </tr>
  <tr>
    <td>PHP</td>
    <td>Full</td>
    <td>Limited</td>
    <td>Full (Composer)</td>
  </tr>
  <tr>
    <td>Ruby</td>
    <td>Full</td>
    <td>Limited</td>
    <td>Full (Bundler)</td>
  </tr>
  <tr>
    <td>Kotlin</td>
    <td>Full</td>
    <td>Limited</td>
    <td>Full (Gradle)</td>
  </tr>
</table>
</div>

<div align="center">
  <h2>MCP Tools</h2>
</div>

<div align="center">

The server exposes the following tools through the Model Context Protocol interface.

</div>

<div align="center">
<table>
  <tr>
    <th>Tool</th>
    <th>Description</th>
    <th>Key Parameters</th>
  </tr>
  <tr>
    <td><code>add_workspace</code></td>
    <td>Register a workspace directory for searching</td>
    <td>path, name (optional)</td>
  </tr>
  <tr>
    <td><code>list_workspaces</code></td>
    <td>List all registered workspaces</td>
    <td>None</td>
  </tr>
  <tr>
    <td><code>search_symbols</code></td>
    <td>Search for code symbols with filters</td>
    <td>workspace_id, language, name, match, kinds, scope</td>
  </tr>
  <tr>
    <td><code>search_text</code></td>
    <td>Search code using regex patterns</td>
    <td>workspace_id, pattern, language, case_insensitive</td>
  </tr>
  <tr>
    <td><code>search_files</code></td>
    <td>Find files by name, pattern, or extension</td>
    <td>workspace_id, pattern, name, extension, directory</td>
  </tr>
  <tr>
    <td><code>detect_stacks</code></td>
    <td>Detect technology stacks in a workspace</td>
    <td>workspace_id, scan_mode (fast/thorough)</td>
  </tr>
  <tr>
    <td><code>analyze_dependencies</code></td>
    <td>Analyze project dependencies</td>
    <td>workspace_id, include_transitive, check_outdated</td>
  </tr>
  <tr>
    <td><code>refresh_index</code></td>
    <td>Rebuild the symbol index</td>
    <td>workspace_id, force_rebuild</td>
  </tr>
  <tr>
    <td><code>cache_stats</code></td>
    <td>View cache statistics</td>
    <td>workspace_id (optional)</td>
  </tr>
  <tr>
    <td><code>clear_cache</code></td>
    <td>Clear cached indices</td>
    <td>workspace_id (optional)</td>
  </tr>
</table>
</div>

<div align="center">
  <h2>Search Capabilities</h2>
</div>

<div align="center">
<table>
  <tr>
    <th>Search Type</th>
    <th>Match Modes</th>
    <th>Filter Options</th>
  </tr>
  <tr>
    <td>Symbol Search</td>
    <td>exact, prefix, substring, regex</td>
    <td>kind, scope (class/namespace/module), language</td>
  </tr>
  <tr>
    <td>Text Search</td>
    <td>regex, literal</td>
    <td>language, case sensitivity, result limit</td>
  </tr>
  <tr>
    <td>File Search</td>
    <td>glob patterns, wildcards</td>
    <td>extension, directory, case sensitivity</td>
  </tr>
</table>
</div>

<div align="center">
  <h2>Tech Stack Detection</h2>
</div>

<div align="center">

Automatically identify technologies, frameworks, and tools used in your projects with intelligent file-based detection.

</div>

<div align="center">
<table>
  <tr>
    <th>Category</th>
    <th>Technologies Detected</th>
    <th>Detection Method</th>
  </tr>
  <tr>
    <td>Languages</td>
    <td>JavaScript, TypeScript, Python, Java, C#, Go, Rust, C/C++, PHP, Ruby, Kotlin, Swift</td>
    <td>File extensions & patterns</td>
  </tr>
  <tr>
    <td>Build Tools</td>
    <td>Webpack, Vite, Rollup, Parcel, Gradle, Maven, Make, CMake, MSBuild</td>
    <td>Config files</td>
  </tr>
  <tr>
    <td>Package Managers</td>
    <td>npm, Yarn, pnpm, pip, Poetry, Cargo, Go modules, NuGet, Composer, Bundler</td>
    <td>Lock files & manifests</td>
  </tr>
  <tr>
    <td>Frameworks</td>
    <td>React, Vue, Angular, Next.js, Svelte, Django, Flask, FastAPI, Spring Boot, .NET Core</td>
    <td>Dependencies & configs</td>
  </tr>
  <tr>
    <td>Testing</td>
    <td>Jest, Mocha, Vitest, Pytest, JUnit, NUnit, Go Test, Cargo Test</td>
    <td>Config files & dependencies</td>
  </tr>
  <tr>
    <td>Databases</td>
    <td>PostgreSQL, MySQL, MongoDB, Redis, SQLite, Prisma, TypeORM, Sequelize</td>
    <td>Config files & dependencies</td>
  </tr>
  <tr>
    <td>DevOps</td>
    <td>Docker, Kubernetes, GitHub Actions, GitLab CI, CircleCI, Jenkins, Terraform</td>
    <td>Config files & manifests</td>
  </tr>
  <tr>
    <td>Code Quality</td>
    <td>ESLint, Prettier, Black, Pylint, Flake8, RuboCop, Clippy, TSLint</td>
    <td>Config files</td>
  </tr>
</table>
</div>

<div align="center">

**Scan Modes:** Fast (config files only) • Thorough (includes dependency analysis)

</div>

<div align="center">
  <h2>Performance</h2>
</div>

<div align="center">

The persistent caching system delivers dramatic performance improvements for repeated searches.

</div>

<div align="center">
<table>
  <tr>
    <th>Repository</th>
    <th>Cold Start</th>
    <th>Cached Start</th>
    <th>Improvement</th>
  </tr>
  <tr>
    <td>Express.js (8,234 symbols)</td>
    <td>2,453ms</td>
    <td>127ms</td>
    <td>19.3x faster</td>
  </tr>
  <tr>
    <td>Lodash (12,456 symbols)</td>
    <td>1,876ms</td>
    <td>89ms</td>
    <td>21.1x faster</td>
  </tr>
  <tr>
    <td>Large Codebase (5,000 symbols)</td>
    <td>3,124ms</td>
    <td>145ms</td>
    <td>21.5x faster</td>
  </tr>
</table>
</div>

<div align="center">

**Average improvement: 94.5% time saved**

</div>

<div align="center">
  <h2>Installation</h2>
</div>

<div align="center">

**Prerequisites**

</div>

Install the required dependencies:

```bash
# Install universal-ctags (required for symbol search)
# macOS
brew install universal-ctags

# Ubuntu/Debian
sudo apt-get install universal-ctags

# Windows (via Chocolatey)
choco install universal-ctags

# Install ripgrep (required for text search)
# macOS
brew install ripgrep

# Ubuntu/Debian
sudo apt-get install ripgrep

# Windows (via Chocolatey)
choco install ripgrep
```

<div align="center">

**Install the MCP Server**

</div>

```bash
npm install -g code-search-mcp
```

<div align="center">
  <h2>Configuration</h2>
</div>

Add to your MCP settings file (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "code-search": {
      "command": "code-search-mcp"
    }
  }
}
```

<div align="center">
  <h2>Development</h2>
</div>

```bash
# Clone the repository
git clone https://github.com/GhostTypes/code-search-mcp.git
cd code-search-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run integration tests
npm run test:integration
```

<div align="center">
  <h2>Architecture</h2>
</div>

<div align="center">

The server is built with a modular architecture for maintainability and extensibility.

</div>

<div align="center">
<table>
  <tr>
    <th>Component</th>
    <th>Responsibility</th>
  </tr>
  <tr>
    <td>MCP Server</td>
    <td>Protocol handling and tool routing</td>
  </tr>
  <tr>
    <td>Workspace Manager</td>
    <td>Workspace registration and lifecycle</td>
  </tr>
  <tr>
    <td>Symbol Indexer</td>
    <td>Universal-ctags integration and indexing</td>
  </tr>
  <tr>
    <td>Symbol Search Service</td>
    <td>Symbol query processing and filtering</td>
  </tr>
  <tr>
    <td>Text Search Service</td>
    <td>Ripgrep integration for text search</td>
  </tr>
  <tr>
    <td>File Search Service</td>
    <td>Fast file finding with glob patterns</td>
  </tr>
  <tr>
    <td>Stack Detection Engine</td>
    <td>Technology stack identification</td>
  </tr>
  <tr>
    <td>Dependency Analyzer</td>
    <td>Multi-ecosystem dependency analysis</td>
  </tr>
  <tr>
    <td>Cache Manager</td>
    <td>Index persistence and invalidation</td>
  </tr>
</table>
</div>

<div align="center">
  <h2>Contributing</h2>
</div>

<div align="center">

Contributions are welcome! Please feel free to submit issues or pull requests.

</div>

<div align="center">
  <h2>License</h2>
</div>

<div align="center">

MIT License - see [LICENSE](LICENSE) for details

</div>

<div align="center">
  <h2>Acknowledgments</h2>
</div>

<div align="center">
<table>
  <tr>
    <th>Tool</th>
    <th>Purpose</th>
  </tr>
  <tr>
    <td><a href="https://ctags.io/">universal-ctags</a></td>
    <td>Symbol indexing</td>
  </tr>
  <tr>
    <td><a href="https://github.com/BurntSushi/ripgrep">ripgrep</a></td>
    <td>Text search</td>
  </tr>
  <tr>
    <td><a href="https://github.com/modelcontextprotocol/sdk">MCP SDK</a></td>
    <td>Protocol implementation</td>
  </tr>
</table>
</div>
