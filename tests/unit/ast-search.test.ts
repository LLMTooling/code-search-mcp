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
});
