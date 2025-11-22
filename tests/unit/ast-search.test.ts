/**
 * Unit tests for AST search service
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ASTSearchService } from '../../src/ast-search/ast-search-service.js';
import type { ASTRule } from '../../src/types/ast-search.js';

describe('ASTSearchService', () => {
  let service: ASTSearchService;

  beforeEach(() => {
    service = new ASTSearchService();
  });

  describe('isAvailable', () => {
    it('should check if ast-grep is available', async () => {
      const info = await service.isAvailable();
      expect(info).toHaveProperty('available');
      expect(typeof info.available).toBe('boolean');

      if (info.available) {
        expect(info).toHaveProperty('version');
        expect(info).toHaveProperty('path');
      } else {
        expect(info).toHaveProperty('error');
      }
    });
  });

  describe('validateRule', () => {
    it('should validate a valid pattern rule', () => {
      const rule: ASTRule = {
        pattern: 'function $NAME() { $$$ }',
      };

      const result = service.validateRule(rule);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a valid kind rule', () => {
      const rule: ASTRule = {
        kind: 'function_declaration',
      };

      const result = service.validateRule(rule);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a valid composite rule with all', () => {
      const rule: ASTRule = {
        all: [
          { pattern: 'async function $NAME() { $$$ }' },
          { not: { pattern: 'await $$$' } },
        ],
      };

      const result = service.validateRule(rule);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a valid relational rule with inside', () => {
      const rule: ASTRule = {
        pattern: '$VAR',
        inside: {
          pattern: 'class $CLASS { $$$ }',
          stopBy: 'end',
        },
      };

      const result = service.validateRule(rule);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject a rule without positive conditions', () => {
      const rule: ASTRule = {
        not: { pattern: 'test' },
      };

      const result = service.validateRule(rule);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('at least one positive condition');
    });

    it('should reject invalid stopBy value', () => {
      const rule: ASTRule = {
        pattern: '$VAR',
        inside: {
          pattern: 'class $CLASS { $$$ }',
          stopBy: 'invalid' as never,
        },
      };

      const result = service.validateRule(rule);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject empty all array', () => {
      const rule: ASTRule = {
        all: [],
      };

      const result = service.validateRule(rule);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('non-empty array');
    });

    it('should reject empty any array', () => {
      const rule: ASTRule = {
        any: [],
      };

      const result = service.validateRule(rule);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('non-empty array');
    });
  });

  describe('Complex rule validation', () => {
    it('should validate complex nested rules', () => {
      const rule: ASTRule = {
        all: [
          { pattern: 'function $NAME($$$ARGS) { $$$ }' },
          {
            any: [
              { kind: 'function_declaration' },
              { kind: 'arrow_function' },
            ],
          },
          {
            not: {
              has: {
                pattern: 'return $$$',
                stopBy: 'end',
              },
            },
          },
        ],
      };

      const result = service.validateRule(rule);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate rules with multiple relational operators', () => {
      const rule: ASTRule = {
        pattern: '$CALL($$$)',
        inside: {
          pattern: 'try { $$$ } catch ($ERR) { $$$ }',
          stopBy: 'end',
        },
        has: {
          pattern: 'throw $$$',
        },
      };

      const result = service.validateRule(rule);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Pattern examples from ast-grep skill', () => {
    it('should validate async function without await pattern', () => {
      const rule: ASTRule = {
        all: [
          { pattern: 'async function $NAME($$$) { $$$ }' },
          { not: { has: { pattern: 'await $$$', stopBy: 'end' } } },
        ],
      };

      const result = service.validateRule(rule);
      expect(result.valid).toBe(true);
    });

    it('should validate React component with useEffect but no deps pattern', () => {
      const rule: ASTRule = {
        all: [
          { pattern: 'function $COMPONENT($$$) { $$$ }' },
          {
            has: {
              pattern: 'useEffect($$$)',
              stopBy: 'end',
            },
          },
          {
            not: {
              has: {
                pattern: 'useEffect($CALLBACK, [$$$DEPS])',
                stopBy: 'end',
              },
            },
          },
        ],
      };

      const result = service.validateRule(rule);
      expect(result.valid).toBe(true);
    });

    it('should validate try-catch without specific error handling pattern', () => {
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

      const result = service.validateRule(rule);
      expect(result.valid).toBe(true);
    });
  });

  describe('Text truncation', () => {
    it('should not truncate text shorter than maxLines', async () => {
      const workspace = process.cwd();
      const result = await service.searchPattern('test', workspace, {
        language: 'typescript',
        pattern: 'import { $$$ } from "$MODULE"',
        maxLines: 10,
        limit: 1,
      });

      // Most import statements are single line
      if (result.matches.length > 0) {
        const match = result.matches[0];
        expect(match.totalLines).toBeLessThanOrEqual(10);
        expect(match.text.split('\n').length).toBe(match.totalLines);
      }
    });

    it('should truncate text longer than maxLines', async () => {
      const workspace = process.cwd();
      const result = await service.searchPattern('test', workspace, {
        language: 'typescript',
        pattern: 'export class $CLASS { $$$ }',
        maxLines: 3,
        limit: 1,
      });

      if (result.matches.length > 0) {
        const match = result.matches[0];
        // Classes are typically longer than 3 lines
        if (match.totalLines > 3) {
          const lines = match.text.split('\n');
          expect(lines.length).toBe(3);
          expect(match.totalLines).toBeGreaterThan(3);
        }
      }
    });

    it('should handle maxLines = 1', async () => {
      const workspace = process.cwd();
      const result = await service.searchPattern('test', workspace, {
        language: 'typescript',
        pattern: 'export class $CLASS { $$$ }',
        maxLines: 1,
        limit: 1,
      });

      if (result.matches.length > 0) {
        const match = result.matches[0];
        const lines = match.text.split('\n');
        expect(lines.length).toBe(1);
        expect(match.totalLines).toBeGreaterThanOrEqual(1);
      }
    });

    it('should default to maxLines = 3 when not specified', async () => {
      const workspace = process.cwd();
      const result = await service.searchPattern('test', workspace, {
        language: 'typescript',
        pattern: 'export class $CLASS { $$$ }',
        limit: 1,
      });

      if (result.matches.length > 0) {
        const match = result.matches[0];
        // If class is longer than 3 lines, text should be truncated to 3
        if (match.totalLines > 3) {
          const lines = match.text.split('\n');
          expect(lines.length).toBe(3);
        }
      }
    });

    it('should populate totalLines accurately', async () => {
      const workspace = process.cwd();
      const result = await service.searchPattern('test', workspace, {
        language: 'typescript',
        pattern: 'export class $CLASS { $$$ }',
        maxLines: 5,
        limit: 1,
      });

      if (result.matches.length > 0) {
        const match = result.matches[0];
        expect(match.totalLines).toBeGreaterThan(0);
        expect(typeof match.totalLines).toBe('number');
        // totalLines should match the line range
        expect(match.totalLines).toBe(match.endLine - match.line + 1);
      }
    });

    it('should handle match with exactly maxLines lines', async () => {
      const workspace = process.cwd();
      // Find a small function that's likely 3-5 lines
      const result = await service.searchPattern('test', workspace, {
        language: 'typescript',
        pattern: 'async isAvailable(): Promise<$TYPE> { $$$ }',
        maxLines: 20,
        limit: 1,
      });

      if (result.matches.length > 0) {
        const match = result.matches[0];
        // When text is not truncated, lines should equal totalLines
        if (match.totalLines <= 20) {
          const lines = match.text.split('\n');
          expect(lines.length).toBe(match.totalLines);
        }
      }
    });

    it('should work with searchRule and maxLines', async () => {
      const workspace = process.cwd();
      const result = await service.searchRule('test', workspace, {
        language: 'typescript',
        rule: {
          pattern: 'export class $CLASS { $$$ }',
        },
        maxLines: 2,
        limit: 1,
      });

      if (result.matches.length > 0) {
        const match = result.matches[0];
        if (match.totalLines > 2) {
          const lines = match.text.split('\n');
          expect(lines.length).toBe(2);
        }
        expect(match.totalLines).toBeGreaterThan(0);
      }
    });

    it('should preserve metavariables with truncation', async () => {
      const workspace = process.cwd();
      const result = await service.searchPattern('test', workspace, {
        language: 'typescript',
        pattern: 'export class $CLASS { $$$ }',
        maxLines: 2,
        limit: 1,
      });

      if (result.matches.length > 0) {
        const match = result.matches[0];
        expect(match.metaVariables).toBeDefined();
        expect(match.metaVariables?.CLASS).toBeDefined();
        expect(match.metaVariables?.CLASS.text).toBeTruthy();
      }
    });
  });
});
