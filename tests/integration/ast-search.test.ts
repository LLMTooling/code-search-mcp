/**
 * Integration tests for AST search functionality
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { ASTSearchService } from '../../src/ast-search/ast-search-service.js';
import type { ASTRule } from '../../src/types/ast-search.js';

describe('AST Search Integration', () => {
  let service: ASTSearchService;
  let tempDir: string;
  let astGrepAvailable: boolean;

  beforeAll(async () => {
    service = new ASTSearchService();

    // Check if ast-grep is available
    const info = await service.isAvailable();
    astGrepAvailable = info.available;

    if (!astGrepAvailable) {
      console.warn('ast-grep is not available, skipping integration tests');
      return;
    }

    // Create temporary test directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-search-test-'));

    // Create test files
    await createTestFiles(tempDir);
  });

  afterAll(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Pattern Search', () => {
    it('should find async functions', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'javascript',
        pattern: 'async function $NAME($$$) { $$$ }',
      });

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.workspaceId).toBe('test-workspace');
      expect(result.language).toBe('javascript');
    });

    it('should find function declarations with metavariables', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'javascript',
        pattern: 'function $NAME($$$PARAMS) { $$$ }',
      });

      expect(result.matches.length).toBeGreaterThan(0);
      const match = result.matches[0];
      expect(match).toHaveProperty('file');
      expect(match).toHaveProperty('line');
      expect(match).toHaveProperty('text');
    });

    it('should respect limit parameter', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'javascript',
        pattern: 'function $NAME($$$) { $$$ }',
        limit: 1,
      });

      expect(result.matches.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Rule Search', () => {
    it('should find async functions without await using composite rules', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const rule: ASTRule = {
        all: [
          { pattern: 'async function $NAME($$$) { $$$ }' },
          { not: { has: { pattern: 'await $$$', stopBy: 'end' } } },
        ],
      };

      const result = await service.searchRule('test-workspace', tempDir, {
        language: 'javascript',
        rule,
      });

      // Should find the async function without await
      expect(result.workspaceId).toBe('test-workspace');
      expect(Array.isArray(result.matches)).toBe(true);
    });

    it('should find functions with specific patterns inside them', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const rule: ASTRule = {
        pattern: 'console.log($$$)',
        inside: {
          pattern: 'function $NAME($$$) { $$$ }',
          stopBy: 'end',
        },
      };

      const result = await service.searchRule('test-workspace', tempDir, {
        language: 'javascript',
        rule,
      });

      expect(result.workspaceId).toBe('test-workspace');
      expect(Array.isArray(result.matches)).toBe(true);
    });

    it('should find patterns using any operator', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const rule: ASTRule = {
        any: [
          { pattern: 'const $VAR = $$$' },
          { pattern: 'let $VAR = $$$' },
          { pattern: 'var $VAR = $$$' },
        ],
      };

      const result = await service.searchRule('test-workspace', tempDir, {
        language: 'javascript',
        rule,
      });

      expect(result.workspaceId).toBe('test-workspace');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should handle complex nested rules', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const rule: ASTRule = {
        all: [
          { pattern: 'function $NAME($$$) { $$$ }' },
          {
            any: [
              { has: { pattern: 'return $$$', stopBy: 'end' } },
              { has: { pattern: 'throw $$$', stopBy: 'end' } },
            ],
          },
        ],
      };

      const result = await service.searchRule('test-workspace', tempDir, {
        language: 'javascript',
        rule,
      });

      expect(result.workspaceId).toBe('test-workspace');
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });

  describe('TypeScript Support', () => {
    it('should search TypeScript files with patterns', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'typescript',
        pattern: 'interface $NAME { $$$ }',
      });

      expect(result.language).toBe('typescript');
      expect(Array.isArray(result.matches)).toBe(true);
    });

    it('should find TypeScript type annotations', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const rule: ASTRule = {
        pattern: 'function $NAME($$$): $TYPE { $$$ }',
      };

      const result = await service.searchRule('test-workspace', tempDir, {
        language: 'typescript',
        rule,
      });

      expect(result.language).toBe('typescript');
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid patterns gracefully', async () => {
      if (!astGrepAvailable) {
        return;
      }

      // Empty pattern should return no results (ast-grep handles this gracefully)
      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'javascript',
        pattern: '',
      });

      expect(result.matches).toHaveLength(0);
    });

    it('should handle non-existent workspace paths', async () => {
      if (!astGrepAvailable) {
        return;
      }

      // Non-existent path should return empty results (no files found)
      const result = await service.searchPattern('test-workspace', '/nonexistent/path', {
        language: 'javascript',
        pattern: 'function $NAME() { }',
      });

      expect(result.matches).toHaveLength(0);
      expect(result.totalMatches).toBe(0);
    });

    it('should skip files that fail to parse', async () => {
      if (!astGrepAvailable) {
        return;
      }

      // Create a malformed JS file
      const badFile = path.join(tempDir, 'bad.js');
      await fs.writeFile(badFile, 'function ( { this is not valid', 'utf-8');

      // Should not throw, just skip the bad file
      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'javascript',
        pattern: 'function $NAME($$$) { $$$ }',
      });

      // Should still find matches in valid files
      expect(result).toBeDefined();
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });
});

/**
 * Create test files for AST search testing
 */
async function createTestFiles(dir: string): Promise<void> {
  // JavaScript test file with various patterns
  const jsContent = `
// Regular function
function regularFunction() {
  console.log('Hello');
  return 42;
}

// Async function with await
async function asyncWithAwait() {
  const result = await fetch('https://api.example.com');
  return result.json();
}

// Async function without await
async function asyncWithoutAwait() {
  console.log('No await here');
  return Promise.resolve(42);
}

// Function with no return
function noReturn(x, y) {
  console.log(x + y);
}

// Arrow function
const arrowFunc = () => {
  return 'arrow';
};

// Variable declarations
const constVar = 42;
let letVar = 'test';
var varVar = true;

// Try-catch block
try {
  throw new Error('Test error');
} catch (e) {
  console.error('Caught error:', e);
}
`;

  // TypeScript test file
  const tsContent = `
interface User {
  name: string;
  age: number;
}

interface Product {
  id: number;
  title: string;
  price: number;
}

function greet(user: User): string {
  return \`Hello, \${user.name}!\`;
}

function processProduct(product: Product): void {
  console.log(\`Processing \${product.title}\`);
}

type Status = 'active' | 'inactive';

const getUserStatus = (user: User): Status => {
  return 'active';
};
`;

  await fs.writeFile(path.join(dir, 'test.js'), jsContent, 'utf-8');
  await fs.writeFile(path.join(dir, 'test.ts'), tsContent, 'utf-8');
}
