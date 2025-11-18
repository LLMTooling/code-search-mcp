# Code Search MCP Server Blueprint
Universal MCP (Model Context Protocol) server that works with any programming language, to help LLMs find things in large codebases without filling up their context window

Goals & constraints for your MCP code-search server

High-level goals:

- Context-efficient
- Simple + lightweight + fast (very optimized)
- Works on any language: C, Rust, TS, Java, Kotlin, Python, etc.
- Works on any operating system (code in TypeScript using the official MCP SDK)
- No language-server dependency; all analysis is text-based + generic indexing.
- Encourage progressive discovery: search → select file(s) → fetch tight snippets.
- Accurate method for determining the primary coding language used in the workspace

- Identify specific tech "stacks" by the presence of various configuration files (read STACK_DETECTION_SYSTEM.md)
- Language aware search (read LANGUAGE_AWARE_SEARCH.md)



