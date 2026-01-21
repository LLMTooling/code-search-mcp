# Security Audit Command for Code Search MCP

You are performing a comprehensive security audit of the Code Search MCP server - a Node.js application that provides code search capabilities via the Model Context Protocol. This is a security-sensitive tool that accepts path inputs and spawns external processes.

## Project Context

This project:
- Is a Node.js MCP server accepting workspace paths from external clients
- Spawns external processes (ctags, ripgrep) via `child_process.execFile`
- Writes temporary files to user-controlled directories
- Implements an allow-list-based workspace access control system
- Caches symbol indices to disk in `~/.code-search-mcp-cache/`

## Phase 1: Parallel Exploration

Launch multiple Explore agents in parallel to review different focused security areas:

### Agent 1: Path Traversal & Workspace Access Control
Focus: `src/utils/workspace-path.ts`, `src/mcp/server.ts`
- Check for path traversal bypasses in `validateAllowedPath()`
- Look for symlink-based escape vulnerabilities
- Verify Windows vs Unix path separator handling
- Check if `..` or path separator edge cases are handled
- Look for cases where workspace validation is bypassed

### Agent 2: Command Injection & Process Spawning
Focus: `src/symbol-search/ctags-integration.ts`, `src/symbol-search/text-search-service.ts`, `src/ast-search/`
- Verify all `execFile` calls use safe argument passing
- Check if workspace paths passed as `cwd` are properly validated
- Look for shell command injection via pattern/regex inputs
- Verify ripgrep glob patterns can't escape the workspace

### Agent 3: Temporary File & Symlink Attacks
Focus: `src/symbol-search/ctags-integration.ts`, `src/cache/cache-manager.ts`
- Check `.code-search-tags` file creation for symlink vulnerabilities
- Verify cache directory creation is safe from TOCTOU races
- Check if temporary files use secure permissions
- Look for arbitrary file write vulnerabilities

### Agent 4: Input Validation & Injection
Focus: `src/mcp/server.ts` - all tool handlers
- Verify all MCP tool inputs are validated before use
- Check regex/pattern injection points (ripgrep, AST search)
- Verify glob pattern sanitization in file/text search
- Look for unsafe JSON parsing

### Agent 5: Cache Security & Information Disclosure
Focus: `src/cache/cache-manager.ts`
- Check if cached data contains sensitive file contents
- Verify cache files are not world-readable
- Check for information disclosure in error messages
- Look for workspace path leakage in responses

### Agent 6: Dependency Vulnerabilities
Focus: `package.json`, all `src/dependency-analysis/parsers/*.ts`
- Check for known vulnerabilities in dependencies
- Verify dependency manifests are parsed safely
- Look for malicious package detection capabilities
- Check if `analyze_dependencies` has network exposure

### Agent 7: Denial of Service & Resource Limits
Focus: All services
- Check for missing timeout constraints on operations
- Verify search result limits are enforced
- Look for memory exhaustion via large file inputs
- Check if unbounded loops exist in parsers

### Agent 8: Access Control Bypasses
Focus: `src/mcp/server.ts`, `src/utils/workspace-path.ts`
- Verify all file operations go through workspace validation
- Check for direct file reads bypassing `validateAllowedPath()`
- Look for cases where `normalizeSearchPathFilters` can be bypassed
- Verify cache operations can't access arbitrary workspaces

## Phase 2: Collect and Analyze

Wait for all agents to complete. Organize findings by severity:
- **Critical**: Path traversal, arbitrary file read/write, command execution
- **High**: Symlink attacks, significant DoS vectors, information disclosure
- **Medium**: DoS resource exhaustion, minor injection risks
- **Low**: Best practice violations, minor issues
- **Info**: Security considerations

For each finding, gather:
- File path and line number
- Vulnerability type (e.g., CWE-22, CWE-78, CWE-20)
- Severity level
- Brief description with exploit scenario
- Recommended fix with code snippet

## Phase 3: Present Results

If NO issues are found:
```
╔══════════════════════════════════════════════════════════════╗
║              SECURITY AUDIT PASSED                          ║
║                                                              ║
║  No critical security issues detected in code-search-mcp.   ║
╚══════════════════════════════════════════════════════════════╝
```

If issues are found, present an ASCII table:
```
╔══════════════════╤════════════════════════════╤═══════════════════════════╤════════════╗
║ Severity         │ Issue Type (CWE)          │ Location                  │ Description ║
╠══════════════════╪════════════════════════════╪═══════════════════════════╪════════════╣
║ CRITICAL         │ Path Traversal (CWE-22)   │ workspace-path.ts:68      │ Symlink    ║
║                  │                          │                           │ bypass via  ║
║                  │                          │                           │ junction    ║
╠══════════════════╪════════════════════════════╪═══════════════════════════╪════════════╣
║ HIGH             │ Symlink Attack (CWE-59)   │ ctags-integration.ts:19   │ .code-     ║
║                  │                          │                           │ search-tags ║
║                  │                          │                           │ link target ║
╚══════════════════╧════════════════════════════╧═══════════════════════════╧════════════╝
```

## Phase 4: Remediation Planning

After presenting findings, gather fix details ahead of time, then use AskUserQuestion to confirm:

1. **Fix scope**: Critical only? Critical+High? All issues?
2. **Fix approach**: Implement fixes directly, create PR, or review together?
3. **Testing**: Add security tests? Verify existing tests pass?

Proceed with implementation based on user responses.

## Key Security Considerations for This Project

1. **Path Validation is Critical**: This tool's primary security boundary is `validateAllowedPath()`. Any bypass allows reading arbitrary files.

2. **Process Spinning**: Every `execFile` call with user-controlled `cwd` is a potential vulnerability.

3. **MCP Protocol**: The server accepts input from external MCP clients - assume all input is hostile.

4. **Temporary Files**: Files written to user-controlled directories are symlink attack targets.

5. **Workspace Enumeration**: Error messages should not leak valid workspace paths.
