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

  describe('Rust Support', () => {
    it('should search Rust files with patterns', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'rust',
        pattern: 'fn $NAME($$$) { $$$ }',
      });

      expect(result.language).toBe('rust');
      expect(result.matches.length).toBeGreaterThan(0);
      expect(Array.isArray(result.matches)).toBe(true);
    });

    it('should find Rust struct definitions', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const rule: ASTRule = {
        pattern: 'struct $NAME { $$$ }',
      };

      const result = await service.searchRule('test-workspace', tempDir, {
        language: 'rust',
        rule,
      });

      expect(result.language).toBe('rust');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find Rust impl blocks', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'rust',
        pattern: 'impl $NAME { $$$ }',
      });

      expect(result.language).toBe('rust');
      expect(Array.isArray(result.matches)).toBe(true);
    });

    it('should find Rust async functions', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const rule: ASTRule = {
        pattern: 'async fn $NAME($$$) { $$$ }',
      };

      const result = await service.searchRule('test-workspace', tempDir, {
        language: 'rust',
        rule,
      });

      expect(result.language).toBe('rust');
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });

  describe('Python Support', () => {
    it('should search Python files with patterns', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'python',
        pattern: 'def $NAME($$$): $$$',
      });

      expect(result.language).toBe('python');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find Python class definitions', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'python',
        pattern: 'class $NAME: $$$',
      });

      expect(result.language).toBe('python');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find Python async functions', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'python',
        pattern: 'async def $NAME($$$): $$$',
      });

      expect(result.language).toBe('python');
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });

  describe('Go Support', () => {
    it('should search Go files with patterns', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'go',
        pattern: 'func $NAME($$$) $$$',
      });

      expect(result.language).toBe('go');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find Go struct definitions', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'go',
        pattern: 'type $NAME struct { $$$ }',
      });

      expect(result.language).toBe('go');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find Go methods', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'go',
        pattern: 'func ($$$) $NAME($$$) $$$',
      });

      expect(result.language).toBe('go');
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });

  describe('Java Support', () => {
    it('should search Java files with patterns', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'java',
        pattern: 'public class $NAME { $$$ }',
      });

      expect(result.language).toBe('java');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find Java methods', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'java',
        pattern: 'public $TYPE $NAME($$$) { $$$ }',
      });

      expect(result.language).toBe('java');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find Java interfaces', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'java',
        pattern: 'interface $NAME { $$$ }',
      });

      expect(result.language).toBe('java');
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });

  describe('C Support', () => {
    it('should search C files with patterns', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'c',
        pattern: 'int $NAME($$$) { $$$ }',
      });

      expect(result.language).toBe('c');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find C struct definitions', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'c',
        pattern: 'struct $NAME',
      });

      expect(result.language).toBe('c');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find C function declarations', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'c',
        pattern: 'void $NAME($$$)',
      });

      expect(result.language).toBe('c');
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });

  describe('C++ Support', () => {
    it('should search C++ files with patterns', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'cpp',
        pattern: 'class $NAME',
      });

      expect(result.language).toBe('cpp');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find C++ template functions', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'cpp',
        pattern: 'template<$$$> $$$',
      });

      expect(result.language).toBe('cpp');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find C++ namespaces', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'cpp',
        pattern: 'namespace $NAME { $$$ }',
      });

      expect(result.language).toBe('cpp');
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });

  describe('C# Support', () => {
    it('should search C# files with patterns', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'csharp',
        pattern: 'public class $NAME { $$$ }',
      });

      expect(result.language).toBe('csharp');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find C# interfaces', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'csharp',
        pattern: 'public interface $NAME { $$$ }',
      });

      expect(result.language).toBe('csharp');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find C# static methods', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'csharp',
        pattern: 'public static $TYPE $NAME($$$)',
      });

      expect(result.language).toBe('csharp');
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });

  describe('Kotlin Support', () => {
    it('should search Kotlin files with patterns', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'kotlin',
        pattern: 'fun $NAME($$$): $$$',
      });

      expect(result.language).toBe('kotlin');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find Kotlin data classes', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'kotlin',
        pattern: 'data class $NAME($$$)',
      });

      expect(result.language).toBe('kotlin');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find Kotlin objects', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'kotlin',
        pattern: 'object $NAME { $$$ }',
      });

      expect(result.language).toBe('kotlin');
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });

  describe('Scala Support', () => {
    it('should search Scala files with patterns', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'scala',
        pattern: 'def $NAME($$$): $$$',
      });

      expect(result.language).toBe('scala');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find Scala case classes', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'scala',
        pattern: 'case class $NAME($$$)',
      });

      expect(result.language).toBe('scala');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find Scala traits', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'scala',
        pattern: 'trait $NAME { $$$ }',
      });

      expect(result.language).toBe('scala');
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });

  describe('Swift Support', () => {
    it('should search Swift files with patterns', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'swift',
        pattern: 'func $NAME($$$) -> $$$',
      });

      expect(result.language).toBe('swift');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find Swift structs', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'swift',
        pattern: 'struct $NAME { $$$ }',
      });

      expect(result.language).toBe('swift');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find Swift protocols', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'swift',
        pattern: 'protocol $NAME { $$$ }',
      });

      expect(result.language).toBe('swift');
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });

  describe('Bash Support', () => {
    it('should search Bash files with patterns', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'bash',
        pattern: 'echo $$$',
      });

      expect(result.language).toBe('bash');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find Bash conditionals', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'bash',
        pattern: 'if $$$',
      });

      expect(result.language).toBe('bash');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find Bash case statements', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'bash',
        pattern: 'case $$$',
      });

      expect(result.language).toBe('bash');
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });

  describe('JSON Support', () => {
    it('should search JSON files with patterns', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'json',
        pattern: '"name"',
      });

      expect(result.language).toBe('json');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find JSON object properties', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'json',
        pattern: '"dependencies"',
      });

      expect(result.language).toBe('json');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find JSON arrays', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'json',
        pattern: '"keywords": $ARRAY',
      });

      expect(result.language).toBe('json');
      expect(Array.isArray(result.matches)).toBe(true);
    });
  });

  describe('YAML Support', () => {
    it('should search YAML files with patterns', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'yaml',
        pattern: 'name: $VALUE',
      });

      expect(result.language).toBe('yaml');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find YAML nested objects', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'yaml',
        pattern: 'author: $$$',
      });

      expect(result.language).toBe('yaml');
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it('should find YAML arrays', async () => {
      if (!astGrepAvailable) {
        return;
      }

      const result = await service.searchPattern('test-workspace', tempDir, {
        language: 'yaml',
        pattern: 'keywords: $$$',
      });

      expect(result.language).toBe('yaml');
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

  describe('Text Truncation', () => {
    describe('maxLines parameter', () => {
      it('should truncate large class to 3 lines by default', async () => {
        if (!astGrepAvailable) {
          return;
        }

        const result = await service.searchPattern('test', tempDir, {
          language: 'typescript',
          pattern: 'export class $CLASS { $$$ }',
        });

        expect(result.matches.length).toBeGreaterThan(0);
        const match = result.matches.find(m => m.file.includes('large.ts'));
        expect(match).toBeDefined();

        if (match) {
          const lines = match.text.split('\n');
          expect(lines.length).toBe(3);
          expect(match.totalLines).toBeGreaterThan(3);
          expect(match.text).toContain('export class LargeClass');
        }
      });

      it('should respect custom maxLines value', async () => {
        if (!astGrepAvailable) {
          return;
        }

        const result = await service.searchPattern('test', tempDir, {
          language: 'typescript',
          pattern: 'export class $CLASS { $$$ }',
          maxLines: 5,
        });

        const match = result.matches.find(m => m.file.includes('large.ts'));
        expect(match).toBeDefined();

        if (match) {
          const lines = match.text.split('\n');
          expect(lines.length).toBe(5);
          expect(match.totalLines).toBeGreaterThan(5);
        }
      });

      it('should handle maxLines = 1', async () => {
        if (!astGrepAvailable) {
          return;
        }

        const result = await service.searchPattern('test', tempDir, {
          language: 'typescript',
          pattern: 'export class $CLASS { $$$ }',
          maxLines: 1,
        });

        const match = result.matches.find(m => m.file.includes('large.ts'));
        expect(match).toBeDefined();

        if (match) {
          const lines = match.text.split('\n');
          expect(lines.length).toBe(1);
          expect(match.text).toContain('export class LargeClass');
        }
      });

      it('should not truncate if match is shorter than maxLines', async () => {
        if (!astGrepAvailable) {
          return;
        }

        const result = await service.searchPattern('test', tempDir, {
          language: 'typescript',
          pattern: 'async function $NAME() { $$$ }',
          maxLines: 50,
        });

        if (result.matches.length > 0) {
          const match = result.matches[0];
          const lines = match.text.split('\n');
          expect(lines.length).toBe(match.totalLines);
        }
      });

      it('should work with searchRule', async () => {
        if (!astGrepAvailable) {
          return;
        }

        const result = await service.searchRule('test', tempDir, {
          language: 'typescript',
          rule: {
            pattern: 'export class $CLASS { $$$ }',
          },
          maxLines: 4,
        });

        const match = result.matches.find(m => m.file.includes('large.ts'));
        expect(match).toBeDefined();

        if (match) {
          const lines = match.text.split('\n');
          expect(lines.length).toBe(4);
          expect(match.totalLines).toBeGreaterThan(4);
        }
      });
    });

    describe('totalLines field', () => {
      it('should accurately report total lines before truncation', async () => {
        if (!astGrepAvailable) {
          return;
        }

        const result = await service.searchPattern('test', tempDir, {
          language: 'typescript',
          pattern: 'export class $CLASS { $$$ }',
          maxLines: 2,
        });

        const match = result.matches.find(m => m.file.includes('large.ts'));
        expect(match).toBeDefined();

        if (match) {
          // The large class is 31 lines total
          expect(match.totalLines).toBe(31);
          expect(match.endLine - match.line + 1).toBe(31);
        }
      });

      it('should match line range for non-truncated matches', async () => {
        if (!astGrepAvailable) {
          return;
        }

        const result = await service.searchPattern('test', tempDir, {
          language: 'typescript',
          pattern: 'async function $NAME() { $$$ }',
          maxLines: 100,
        });

        if (result.matches.length > 0) {
          for (const match of result.matches) {
            expect(match.totalLines).toBe(match.endLine - match.line + 1);
          }
        }
      });
    });

    describe('metavariables with truncation', () => {
      it('should preserve metavariables when truncating', async () => {
        if (!astGrepAvailable) {
          return;
        }

        const result = await service.searchPattern('test', tempDir, {
          language: 'typescript',
          pattern: 'export class $CLASS { $$$ }',
          maxLines: 2,
        });

        const match = result.matches.find(m => m.file.includes('large.ts'));
        expect(match).toBeDefined();

        if (match) {
          expect(match.metaVariables).toBeDefined();
          expect(match.metaVariables?.CLASS).toBeDefined();
          expect(match.metaVariables?.CLASS.text).toBe('LargeClass');
        }
      });
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

  // Create a large class for testing truncation
  const largeClassContent = `export class LargeClass {
  private field1: string;
  private field2: number;
  private field3: boolean;

  constructor() {
    this.field1 = 'test';
    this.field2 = 42;
    this.field3 = true;
  }

  method1(): void {
    console.log('method1');
  }

  method2(): void {
    console.log('method2');
  }

  method3(): void {
    console.log('method3');
  }

  method4(): void {
    console.log('method4');
  }

  method5(): void {
    console.log('method5');
  }
}`;
  await fs.writeFile(path.join(dir, 'large.ts'), largeClassContent, 'utf-8');

  // Rust test file
  const rustContent = `
// Basic struct
struct User {
    name: String,
    age: u32,
}

// Struct with lifetime
struct Product<'a> {
    id: u32,
    title: &'a str,
    price: f64,
}

// Regular function
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

// Function with multiple parameters
fn add(a: i32, b: i32) -> i32 {
    a + b
}

// Async function
async fn fetch_data() -> Result<String, Box<dyn std::error::Error>> {
    Ok("data".to_string())
}

// Implementation block
impl User {
    fn new(name: String, age: u32) -> Self {
        User { name, age }
    }

    fn greet(&self) -> String {
        format!("Hello, I'm {} and I'm {} years old", self.name, self.age)
    }
}

// Generic function
fn first<T>(items: Vec<T>) -> Option<T> {
    items.into_iter().next()
}

// Trait definition
trait Printable {
    fn print(&self);
}

// Trait implementation
impl Printable for User {
    fn print(&self) {
        println!("{}: {}", self.name, self.age);
    }
}
`;
  await fs.writeFile(path.join(dir, 'test.rs'), rustContent, 'utf-8');

  // Python test file
  const pythonContent = `
# Basic class
class User:
    def __init__(self, name: str, age: int):
        self.name = name
        self.age = age

    def greet(self) -> str:
        return f"Hello, I'm {self.name}"

# Function with type hints
def process_data(data: list[str]) -> dict[str, int]:
    result = {}
    for item in data:
        result[item] = len(item)
    return result

# Async function
async def fetch_user(user_id: int) -> User:
    # Simulate async operation
    await asyncio.sleep(0.1)
    return User("Alice", 30)

# Decorator
@staticmethod
def validate(value: str) -> bool:
    return len(value) > 0
`;
  await fs.writeFile(path.join(dir, 'test.py'), pythonContent, 'utf-8');

  // Go test file
  const goContent = `
package main

import "fmt"

// Basic struct
type User struct {
    Name string
    Age  int
}

// Method on struct
func (u *User) Greet() string {
    return fmt.Sprintf("Hello, I'm %s", u.Name)
}

// Function
func processData(data []string) map[string]int {
    result := make(map[string]int)
    for _, item := range data {
        result[item] = len(item)
    }
    return result
}

// Interface
type Greeter interface {
    Greet() string
}
`;
  await fs.writeFile(path.join(dir, 'test.go'), goContent, 'utf-8');

  // Java test file
  const javaContent = `
package com.example;

import java.util.List;
import java.util.Map;

// Basic class
public class User {
    private String name;
    private int age;

    public User(String name, int age) {
        this.name = name;
        this.age = age;
    }

    public String greet() {
        return String.format("Hello, I'm %s", this.name);
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }
}

// Interface
interface Greeter {
    String greet();
}

// Static method
public class Utils {
    public static boolean validate(String value) {
        return value != null && !value.isEmpty();
    }
}
`;
  await fs.writeFile(path.join(dir, 'test.java'), javaContent, 'utf-8');

  // C test file
  const cContent = `
#include <stdio.h>
#include <stdlib.h>

// Struct definition
struct User {
    char name[50];
    int age;
};

// Function declaration
int add(int a, int b);

// Function definition
int add(int a, int b) {
    return a + b;
}

// Function with struct
void greet(struct User *user) {
    printf("Hello, %s!\\n", user->name);
}

// Main function
int main() {
    struct User user = {"Alice", 30};
    greet(&user);
    return 0;
}
`;
  await fs.writeFile(path.join(dir, 'test.c'), cContent, 'utf-8');

  // C++ test file
  const cppContent = `
#include <iostream>
#include <string>
#include <vector>

// Class definition
class User {
private:
    std::string name;
    int age;

public:
    User(std::string name, int age) : name(name), age(age) {}

    std::string greet() {
        return "Hello, I'm " + name;
    }

    std::string getName() const {
        return name;
    }
};

// Template function
template<typename T>
T max(T a, T b) {
    return (a > b) ? a : b;
}

// Namespace
namespace utils {
    bool validate(std::string value) {
        return !value.empty();
    }
}

// Main function
int main() {
    User user("Alice", 30);
    std::cout << user.greet() << std::endl;
    return 0;
}
`;
  await fs.writeFile(path.join(dir, 'test.cpp'), cppContent, 'utf-8');

  // C# test file
  const csharpContent = `
using System;
using System.Collections.Generic;

namespace Example
{
    // Class definition
    public class User
    {
        private string name;
        private int age;

        public User(string name, int age)
        {
            this.name = name;
            this.age = age;
        }

        public string Greet()
        {
            return $"Hello, I'm {name}";
        }

        public string Name
        {
            get { return name; }
            set { name = value; }
        }
    }

    // Interface
    public interface IGreeter
    {
        string Greet();
    }

    // Static class
    public static class Utils
    {
        public static bool Validate(string value)
        {
            return !string.IsNullOrEmpty(value);
        }
    }

    // Program class with Main
    class Program
    {
        static void Main(string[] args)
        {
            var user = new User("Alice", 30);
            Console.WriteLine(user.Greet());
        }
    }
}
`;
  await fs.writeFile(path.join(dir, 'test.cs'), csharpContent, 'utf-8');

  // Kotlin test file
  const kotlinContent = `
package com.example

// Data class
data class User(val name: String, val age: Int) {
    fun greet(): String {
        return "Hello, I'm $name"
    }
}

// Regular class
class Product(val id: Int, val title: String) {
    fun getDescription(): String {
        return "$id: $title"
    }
}

// Function
fun processData(data: List<String>): Map<String, Int> {
    return data.associateWith { it.length }
}

// Extension function
fun String.isValidEmail(): Boolean {
    return this.contains("@")
}

// Interface
interface Greeter {
    fun greet(): String
}

// Object (singleton)
object Utils {
    fun validate(value: String): Boolean {
        return value.isNotEmpty()
    }
}
`;
  await fs.writeFile(path.join(dir, 'test.kt'), kotlinContent, 'utf-8');

  // Scala test file
  const scalaContent = `
package com.example

// Case class
case class User(name: String, age: Int) {
  def greet(): String = s"Hello, I'm $name"
}

// Regular class
class Product(val id: Int, val title: String) {
  def getDescription: String = s"$id: $title"
}

// Object (singleton)
object Utils {
  def validate(value: String): Boolean = {
    value.nonEmpty
  }
}

// Trait (interface)
trait Greeter {
  def greet(): String
}

// Function
def processData(data: List[String]): Map[String, Int] = {
  data.map(s => s -> s.length).toMap
}
`;
  await fs.writeFile(path.join(dir, 'test.scala'), scalaContent, 'utf-8');

  // Swift test file
  const swiftContent = `
import Foundation

// Struct
struct User {
    var name: String
    var age: Int

    func greet() -> String {
        return "Hello, I'm \\(name)"
    }
}

// Class
class Product {
    var id: Int
    var title: String

    init(id: Int, title: String) {
        self.id = id
        self.title = title
    }

    func getDescription() -> String {
        return "\\(id): \\(title)"
    }
}

// Protocol (interface)
protocol Greeter {
    func greet() -> String
}

// Extension
extension String {
    func isValidEmail() -> Bool {
        return self.contains("@")
    }
}

// Function
func processData(_ data: [String]) -> [String: Int] {
    return data.reduce(into: [:]) { $0[$1] = $1.count }
}
`;
  await fs.writeFile(path.join(dir, 'test.swift'), swiftContent, 'utf-8');

  // Bash test file
  const bashContent = `#!/bin/bash

# Function definition
greet() {
    local name=$1
    echo "Hello, $name!"
}

# Function with return
add() {
    local a=$1
    local b=$2
    echo $((a + b))
}

# Conditional
if [ "$USER" = "root" ]; then
    echo "Running as root"
else
    echo "Running as regular user"
fi

# Loop
for i in {1..5}; do
    echo "Iteration $i"
done

# Case statement
case "$1" in
    start)
        echo "Starting..."
        ;;
    stop)
        echo "Stopping..."
        ;;
    *)
        echo "Usage: $0 {start|stop}"
        ;;
esac

# Call function
greet "Alice"
`;
  await fs.writeFile(path.join(dir, 'test.sh'), bashContent, 'utf-8');

  // JSON test file
  const jsonContent = `{
  "name": "test-project",
  "version": "1.0.0",
  "description": "A test project",
  "author": {
    "name": "Alice",
    "email": "alice@example.com"
  },
  "dependencies": {
    "express": "^4.18.0",
    "lodash": "^4.17.21"
  },
  "scripts": {
    "start": "node index.js",
    "test": "jest"
  },
  "keywords": ["test", "example"],
  "license": "MIT"
}`;
  await fs.writeFile(path.join(dir, 'test.json'), jsonContent, 'utf-8');

  // YAML test file
  const yamlContent = `name: test-project
version: 1.0.0
description: A test project

author:
  name: Alice
  email: alice@example.com

dependencies:
  - express: ^4.18.0
  - lodash: ^4.17.21

scripts:
  start: node index.js
  test: jest

keywords:
  - test
  - example

license: MIT

config:
  port: 3000
  debug: true
`;
  await fs.writeFile(path.join(dir, 'test.yaml'), yamlContent, 'utf-8');
}