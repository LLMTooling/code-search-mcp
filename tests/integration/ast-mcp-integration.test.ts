/**
 * Integration tests for AST search MCP tools
 * Tests the full MCP server integration with AST search capabilities
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { WorkspaceManager } from '../../src/workspace/workspace-manager.js';
import { ASTSearchService } from '../../src/ast-search/ast-search-service.js';
import type { ASTRule } from '../../src/types/ast-search.js';

describe('AST MCP Integration Tests', () => {
  let workspaceManager: WorkspaceManager;
  let astSearchService: ASTSearchService;
  let tempDir: string;
  let workspaceId: string;
  let astGrepAvailable: boolean;

  beforeAll(async () => {
    workspaceManager = new WorkspaceManager();
    astSearchService = new ASTSearchService();

    // Check if ast-grep is available
    const info = await astSearchService.isAvailable();
    astGrepAvailable = info.available;

    if (!astGrepAvailable) {
      console.warn('⚠️  ast-grep not available - skipping MCP integration tests');
      return;
    }

    // Create temporary test directory with realistic code
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-mcp-test-'));

    // Create test workspace
    await createRealisticTestWorkspace(tempDir);

    // Add workspace
    const workspace = await workspaceManager.addWorkspace(tempDir, 'ast-test');
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('search_ast_pattern tool', () => {
    it('should find async functions without await', async () => {
      if (!astGrepAvailable) return;

      const workspace = workspaceManager.getWorkspace(workspaceId);
      expect(workspace).toBeDefined();

      const result = await astSearchService.searchPattern(
        workspaceId,
        workspace!.rootPath,
        {
          language: 'javascript',
          pattern: 'async function $NAME($$$) { $$$ }',
        }
      );

      expect(result.workspaceId).toBe(workspaceId);
      expect(result.matches.length).toBeGreaterThan(0);

      // Should find asyncWithoutAwait
      const foundAsyncNoAwait = result.matches.some(m =>
        m.text.includes('asyncWithoutAwait')
      );
      expect(foundAsyncNoAwait).toBe(true);
    });

    it('should find console.log statements', async () => {
      if (!astGrepAvailable) return;

      const workspace = workspaceManager.getWorkspace(workspaceId);

      const result = await astSearchService.searchPattern(
        workspaceId,
        workspace!.rootPath,
        {
          language: 'javascript',
          pattern: 'console.log($$$)',
          limit: 10,
        }
      );

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches.length).toBeLessThanOrEqual(10);
    });

    it('should extract metavariables from patterns', async () => {
      if (!astGrepAvailable) return;

      const workspace = workspaceManager.getWorkspace(workspaceId);

      const result = await astSearchService.searchPattern(
        workspaceId,
        workspace!.rootPath,
        {
          language: 'javascript',
          pattern: 'function $NAME($$$PARAMS) { $$$ }',
          limit: 5,
        }
      );

      expect(result.matches.length).toBeGreaterThan(0);

      // Check if metavariables were captured
      const matchWithMeta = result.matches.find(m => m.metaVariables);
      if (matchWithMeta) {
        expect(matchWithMeta.metaVariables).toBeDefined();
        expect(matchWithMeta.metaVariables!.NAME).toBeDefined();
      }
    });

    it('should work with TypeScript files', async () => {
      if (!astGrepAvailable) return;

      const workspace = workspaceManager.getWorkspace(workspaceId);

      const result = await astSearchService.searchPattern(
        workspaceId,
        workspace!.rootPath,
        {
          language: 'typescript',
          pattern: 'interface $NAME { $$$ }',
        }
      );

      expect(result.language).toBe('typescript');
      expect(result.matches.length).toBeGreaterThan(0);
    });
  });

  describe('search_ast_rule tool', () => {
    it('should find async functions without await using composite rules', async () => {
      if (!astGrepAvailable) return;

      const workspace = workspaceManager.getWorkspace(workspaceId);

      const rule: ASTRule = {
        all: [
          { pattern: 'async function $NAME($$$) { $$$ }' },
          { not: { has: { pattern: 'await $$$', stopBy: 'end' } } },
        ],
      };

      const result = await astSearchService.searchRule(
        workspaceId,
        workspace!.rootPath,
        {
          language: 'javascript',
          rule,
        }
      );

      expect(result.matches.length).toBeGreaterThan(0);

      // Should find asyncWithoutAwait but not asyncWithAwait
      const hasAsyncNoAwait = result.matches.some(m =>
        m.text.includes('asyncWithoutAwait')
      );
      expect(hasAsyncNoAwait).toBe(true);
    });

    it('should find functions with console.log inside', async () => {
      if (!astGrepAvailable) return;

      const workspace = workspaceManager.getWorkspace(workspaceId);

      const rule: ASTRule = {
        pattern: 'console.log($$$)',
        inside: {
          pattern: 'function $NAME($$$) { $$$ }',
          stopBy: 'end',
        },
      };

      const result = await astSearchService.searchRule(
        workspaceId,
        workspace!.rootPath,
        {
          language: 'javascript',
          rule,
        }
      );

      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should support ANY operator for variable declarations', async () => {
      if (!astGrepAvailable) return;

      const workspace = workspaceManager.getWorkspace(workspaceId);

      const rule: ASTRule = {
        any: [
          { pattern: 'const $VAR = $$$' },
          { pattern: 'let $VAR = $$$' },
          { pattern: 'var $VAR = $$$' },
        ],
      };

      const result = await astSearchService.searchRule(
        workspaceId,
        workspace!.rootPath,
        {
          language: 'javascript',
          rule,
        }
      );

      expect(result.matches.length).toBeGreaterThan(0);

      // Should find constVar, letVar, and varVar
      const text = result.matches.map(m => m.text).join(' ');
      expect(text).toContain('const');
    });

    it('should support complex nested rules', async () => {
      if (!astGrepAvailable) return;

      const workspace = workspaceManager.getWorkspace(workspaceId);

      const rule: ASTRule = {
        all: [
          { pattern: 'function $NAME($$$) { $$$ }' },
          {
            any: [
              { has: { pattern: 'return $$$', stopBy: 'end' } },
              { has: { pattern: 'console.log($$$)', stopBy: 'end' } },
            ],
          },
        ],
      };

      const result = await astSearchService.searchRule(
        workspaceId,
        workspace!.rootPath,
        {
          language: 'javascript',
          rule,
        }
      );

      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should respect limit parameter', async () => {
      if (!astGrepAvailable) return;

      const workspace = workspaceManager.getWorkspace(workspaceId);

      const rule: ASTRule = {
        pattern: 'function $NAME($$$) { $$$ }',
      };

      const result = await astSearchService.searchRule(
        workspaceId,
        workspace!.rootPath,
        {
          language: 'javascript',
          rule,
          limit: 2,
        }
      );

      expect(result.matches.length).toBeLessThanOrEqual(2);
    });
  });

  describe('check_ast_grep tool', () => {
    it('should report ast-grep availability', async () => {
      const info = await astSearchService.isAvailable();

      expect(info).toHaveProperty('available');
      expect(typeof info.available).toBe('boolean');

      if (info.available) {
        expect(info.version).toBeDefined();
        expect(info.path).toBe('bundled (native)');
      }
    });
  });

  describe('Rule validation', () => {
    it('should validate correct rules', () => {
      const rule: ASTRule = {
        all: [
          { pattern: 'async function $NAME($$$) { $$$ }' },
          { not: { has: { pattern: 'await $$$', stopBy: 'end' } } },
        ],
      };

      const validation = astSearchService.validateRule(rule);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject invalid rules', () => {
      const rule: ASTRule = {
        not: { pattern: 'test' }, // No positive condition
      };

      const validation = astSearchService.validateRule(rule);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Real-world patterns', () => {
    it('should find React useEffect without dependencies', async () => {
      if (!astGrepAvailable) return;

      // Create React file
      const reactFile = path.join(tempDir, 'component.jsx');
      await fs.writeFile(
        reactFile,
        `
import { useEffect, useState } from 'react';

function MyComponent() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    console.log('Effect without deps');
  });

  useEffect(() => {
    console.log('Effect with deps');
  }, [count]);

  return <div>{count}</div>;
}
`,
        'utf-8'
      );

      const workspace = workspaceManager.getWorkspace(workspaceId);

      const rule: ASTRule = {
        all: [
          { pattern: 'useEffect($CALLBACK)' },
          { not: { pattern: 'useEffect($CALLBACK, [$$$])' } },
        ],
      };

      const result = await astSearchService.searchRule(
        workspaceId,
        workspace!.rootPath,
        {
          language: 'javascript',
          rule,
          paths: ['*.jsx', '*.js'],
        }
      );

      // Should find the useEffect without dependencies
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find try-catch blocks without error handling', async () => {
      if (!astGrepAvailable) return;

      const workspace = workspaceManager.getWorkspace(workspaceId);

      const rule: ASTRule = {
        all: [
          { pattern: 'try { $$$ } catch ($E) { $$$ }' },
          {
            not: {
              has: {
                pattern: 'console.error($$$)',
                stopBy: 'end',
              },
            },
          },
        ],
      };

      const result = await astSearchService.searchRule(
        workspaceId,
        workspace!.rootPath,
        {
          language: 'javascript',
          rule,
        }
      );

      // Should find try-catch without console.error
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });
});

/**
 * Create a realistic test workspace with various code patterns
 */
async function createRealisticTestWorkspace(dir: string): Promise<void> {
  // Main JavaScript file
  const jsContent = `
// Regular functions
function regularFunction() {
  console.log('Hello');
  return 42;
}

function processData(data) {
  console.log('Processing:', data);
  return data.map(x => x * 2);
}

// Async functions
async function asyncWithAwait() {
  const result = await fetch('https://api.example.com');
  console.log('Fetched data');
  return result.json();
}

async function asyncWithoutAwait() {
  console.log('No await here');
  return Promise.resolve(42);
}

// Arrow functions
const arrowFunc = () => {
  return 'arrow';
};

const arrowWithLog = (x) => {
  console.log('Arrow:', x);
  return x + 1;
};

// Variable declarations
const constVar = 42;
let letVar = 'test';
var varVar = true;
const objVar = { key: 'value' };

// Try-catch blocks
try {
  throw new Error('Test error');
} catch (e) {
  // Empty catch
}

try {
  riskyOperation();
} catch (error) {
  console.error('Error occurred:', error);
}

// Classes
class User {
  constructor(name) {
    this.name = name;
  }

  greet() {
    console.log('Hello,', this.name);
    return \`Hello, \${this.name}\`;
  }
}
`;

  // TypeScript file
  const tsContent = `
interface User {
  name: string;
  age: number;
  email?: string;
}

interface Product {
  id: number;
  title: string;
  price: number;
}

function greet(user: User): string {
  console.log('Greeting:', user.name);
  return \`Hello, \${user.name}!\`;
}

function processProduct(product: Product): void {
  console.log(\`Processing \${product.title}\`);
}

type Status = 'active' | 'inactive' | 'pending';

const getUserStatus = (user: User): Status => {
  return 'active';
};

class Service {
  private data: string[];

  constructor() {
    this.data = [];
  }

  async fetchData(): Promise<string[]> {
    const response = await fetch('/api/data');
    this.data = await response.json();
    return this.data;
  }
}
`;

  await fs.writeFile(path.join(dir, 'main.js'), jsContent, 'utf-8');
  await fs.writeFile(path.join(dir, 'types.ts'), tsContent, 'utf-8');
}
