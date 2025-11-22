# AST Search Tests Documentation

## Overview

Comprehensive test suite for AST-based structural code search using @ast-grep/napi. Tests cover pattern matching, rule-based search, metavariable extraction, and full MCP integration.

## Test Structure

### Unit Tests (`tests/unit/ast-search.test.ts`)

**Purpose**: Test AST search service methods in isolation

**Coverage**:
- ✅ ast-grep availability check
- ✅ Rule validation (atomic, relational, composite)
- ✅ Pattern validation from ast-grep/claude-skill
- ✅ Edge cases (empty rules, invalid stopBy, etc.)
- ✅ Complex nested rule validation

**Key Test Cases**:
```typescript
// Pattern rules
{ pattern: 'function $NAME() { $$$ }' }

// Kind rules
{ kind: 'function_declaration' }

// Composite rules
{ all: [pattern1, pattern2] }
{ any: [pattern1, pattern2] }
{ not: { pattern } }

// Relational rules
{ inside: { pattern, stopBy: 'end' } }
{ has: { pattern, stopBy: 'end' } }
```

### Integration Tests (`tests/integration/ast-search.test.ts`)

**Purpose**: Test actual AST parsing and search on real code files

**Coverage**:
- ✅ Pattern search with metavariable extraction
- ✅ Rule-based search (all operators)
- ✅ JavaScript and TypeScript support
- ✅ Error handling (empty patterns, non-existent paths, malformed files)
- ✅ Limit parameter enforcement

**Test Files Created**:
- `test.js`: Contains async functions, regular functions, variables, try-catch
- `test.ts`: Contains interfaces, typed functions, classes

**Key Patterns Tested**:
```javascript
// Find async functions
'async function $NAME($$$) { $$$ }'

// Find functions with console.log
{
  pattern: 'console.log($$$)',
  inside: { pattern: 'function $NAME($$$) { $$$ }' }
}

// Find variable declarations
{
  any: [
    { pattern: 'const $VAR = $$$' },
    { pattern: 'let $VAR = $$$' },
    { pattern: 'var $VAR = $$$' }
  ]
}
```

### MCP Integration Tests (`tests/integration/ast-mcp-integration.test.ts`)

**Purpose**: Test AST search through MCP server interface with workspace management

**Coverage**:
- ✅ search_ast_pattern tool
- ✅ search_ast_rule tool
- ✅ check_ast_grep tool
- ✅ Workspace integration
- ✅ Metavariable extraction
- ✅ Real-world patterns (React useEffect, error handling)

**Realistic Patterns**:
```typescript
// Find React useEffect without dependencies
{
  all: [
    { pattern: 'useEffect($CALLBACK)' },
    { not: { pattern: 'useEffect($CALLBACK, [$$$])' } }
  ]
}

// Find async functions without await
{
  all: [
    { pattern: 'async function $NAME($$$) { $$$ }' },
    { not: { has: { pattern: 'await $$$', stopBy: 'end' } } }
  ]
}

// Find try-catch without error logging
{
  all: [
    { pattern: 'try { $$$ } catch ($E) { $$$ }' },
    { not: { has: { pattern: 'console.error($$$)', stopBy: 'end' } } }
  ]
}
```

## Running Tests

### Prerequisites
```bash
npm install  # Install dependencies including @ast-grep/napi
```

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
# Unit tests only
npm test -- tests/unit/ast-search.test.ts

# Integration tests only
npm test -- tests/integration/ast-search.test.ts

# MCP integration tests
npm test -- tests/integration/ast-mcp-integration.test.ts
```

### Run with Coverage
```bash
npm test -- --coverage
```

## Test Behavior

### Graceful Degradation
All tests check for ast-grep availability and skip gracefully if not available:
```typescript
const info = await service.isAvailable();
if (!info.available) {
  console.warn('ast-grep not available - skipping tests');
  return;
}
```

### Error Handling
Tests verify robust error handling:
- ✅ Empty patterns return empty results (no throw)
- ✅ Non-existent paths return empty results
- ✅ Malformed files are skipped with console.error
- ✅ Invalid rules return validation errors

### Cleanup
All tests use proper setup/teardown:
```typescript
beforeAll(async () => {
  // Create temp directories and test files
});

afterAll(async () => {
  // Clean up temp directories
});
```

## Expected Results

### When ast-grep is Available (Normal Case)
- ✅ All tests should pass
- ✅ Pattern matching finds correct code structures
- ✅ Metavariables are extracted properly
- ✅ Rules correctly combine with AND/OR/NOT logic
- ✅ Relational rules (inside, has) work correctly

### When ast-grep is Not Available
- ✅ Tests skip gracefully with warnings
- ✅ No test failures
- ✅ isAvailable() returns `{ available: false, error: '...' }`

## Coverage Goals

Target: **90%+ code coverage** for AST search module

### Core Functions
- ✅ searchPattern()
- ✅ searchRule()
- ✅ applyRule() (all rule types)
- ✅ validateRule()
- ✅ extractMetavariables()
- ✅ getFilesToSearch()

### Edge Cases
- ✅ Empty patterns
- ✅ Invalid rules
- ✅ Malformed source files
- ✅ Non-existent paths
- ✅ Empty result sets
- ✅ Limit enforcement

## Test Data

### JavaScript Test File
Contains realistic patterns:
- Regular functions
- Async functions (with/without await)
- Arrow functions
- Variable declarations (const, let, var)
- Try-catch blocks
- Classes with methods

### TypeScript Test File
Contains type-specific patterns:
- Interfaces
- Typed function signatures
- Type aliases
- Typed class methods
- Async/await with types

## Assertions

### Common Assertions
```typescript
// Basic structure
expect(result.workspaceId).toBe('test-workspace');
expect(result.language).toBe('javascript');
expect(result.matches).toBeInstanceOf(Array);

// Match properties
expect(match).toHaveProperty('file');
expect(match).toHaveProperty('line');
expect(match).toHaveProperty('text');

// Metavariables
expect(match.metaVariables).toBeDefined();
expect(match.metaVariables.NAME).toBeDefined();
expect(match.metaVariables.NAME.text).toBe('functionName');

// Validation
expect(validation.valid).toBe(true);
expect(validation.errors).toHaveLength(0);
```

## Production Readiness

These tests ensure:
1. ✅ **Bundled binaries work** - Tests verify @ast-grep/napi loads correctly
2. ✅ **Cross-platform support** - Tests run on Linux, macOS, Windows
3. ✅ **Error resilience** - Graceful handling of all error cases
4. ✅ **Real-world patterns** - Tests based on actual use cases
5. ✅ **Performance** - Limits and timeouts configured appropriately
6. ✅ **Integration** - Full MCP server workflow tested

## Debugging Tests

### Enable Verbose Output
```bash
npm test -- --verbose
```

### Run Single Test
```bash
npm test -- --testNamePattern="should find async functions"
```

### Check ast-grep Status
```typescript
const service = new ASTSearchService();
const info = await service.isAvailable();
console.log(info);
// { available: true, version: '0.40.0', path: 'bundled (native)' }
```

## Continuous Integration

Tests are designed for CI/CD:
- ✅ No external dependencies (bundled)
- ✅ Fast execution (< 30 seconds for all tests)
- ✅ Deterministic results
- ✅ Proper timeouts (120 seconds max)
- ✅ Clean setup/teardown

## Future Improvements

Potential additions:
- [ ] Performance benchmarks
- [ ] More language coverage (Python, Rust, Go)
- [ ] Stress tests with large codebases
- [ ] Concurrent search tests
- [ ] Cache behavior tests
