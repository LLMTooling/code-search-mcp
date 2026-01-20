# Sentinel Journal

## 2026-01-20 - Default File System Exposure
**Vulnerability:** The MCP server defaulted to allowing access to the entire file system (path traversal) when no `--allowed-workspace` arguments were provided.
**Learning:** "Fail open" defaults are dangerous, especially for tools exposed to LLMs which might explore the system. The developers likely intended this for ease of use but underestimated the risk.
**Prevention:** Always implement "fail closed" security. If configuration is missing, default to the most restrictive safe option (cwd) or deny access completely, rather than allowing everything.
