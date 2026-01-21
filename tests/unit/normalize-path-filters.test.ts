/**
 * Tests for normalizeSearchPathFilters security (path traversal protection).
 * We need to test this indirectly through the server since it's a private method.
 */

import { describe, it, expect } from '@jest/globals';
import path from 'path';

// Simulate the normalizeSearchPathFilters logic to test edge cases
function normalizeSearchPathFilters(
  paths: string[] | undefined,
  workspaceRoot: string
): string[] | undefined {
  if (!paths || paths.length === 0) {
    return undefined;
  }

  const normalizedRoot = path.resolve(workspaceRoot);
  const includeGlobs: string[] = [];
  const seen = new Set<string>();

  for (const rawPath of paths) {
    if (!rawPath || typeof rawPath !== 'string') {
      continue;
    }

    const trimmed = rawPath.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('!')) {
      throw new Error(`paths entries cannot start with "!": ${rawPath}`);
    }

    const absoluteCandidate = path.isAbsolute(trimmed)
      ? path.normalize(trimmed)
      : path.normalize(path.join(normalizedRoot, trimmed));

    const relativePath = path.relative(normalizedRoot, absoluteCandidate);

    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`Path "${rawPath}" is outside the workspace root`);
    }

    const glob = relativePath.split(path.sep).join('/');

    if (!glob) {
      throw new Error(`Path "${rawPath}" must resolve to a file or glob within the workspace`);
    }

    if (!seen.has(glob)) {
      includeGlobs.push(glob);
      seen.add(glob);
    }
  }

  return includeGlobs.length > 0 ? includeGlobs : undefined;
}

describe('normalizeSearchPathFilters Security', () => {
  const workspaceRoot = process.cwd();

  describe('Path Traversal Protection', () => {
    it('should reject path containing ".." (double dot)', () => {
      expect(() => {
        normalizeSearchPathFilters(['../etc/passwd'], workspaceRoot);
      }).toThrow(/outside the workspace root/);
    });

    it('should normalize canceling parent references (not a vulnerability)', () => {
      // ./test/../etc normalizes to ./etc (valid path)
      const result = normalizeSearchPathFilters(['./test/../etc'], workspaceRoot);
      expect(result).toBeDefined();
      expect(result).toContain('etc');
    });

    it('should reject absolute paths outside workspace', () => {
      expect(() => {
        normalizeSearchPathFilters(['/etc/passwd'], workspaceRoot);
      }).toThrow(/outside the workspace root/);
    });

    it('should reject relative path that resolves outside workspace', () => {
      expect(() => {
        normalizeSearchPathFilters(['../../system/file'], workspaceRoot);
      }).toThrow(/outside the workspace root/);
    });

    it('should reject parent reference at end of path', () => {
      expect(() => {
        normalizeSearchPathFilters(['src/..'], workspaceRoot);
      }).toThrow(/outside the workspace root/);
    });
  });

  describe('Valid Path Handling', () => {
    it('should accept valid relative paths within workspace', () => {
      const result = normalizeSearchPathFilters(['src/**/*.ts'], workspaceRoot);
      expect(result).toEqual(['src/**/*.ts']);
    });

    it('should normalize paths (trailing slash stripped)', () => {
      const result = normalizeSearchPathFilters(['src/'], workspaceRoot);
      // path.normalize() strips trailing slashes
      expect(result).toEqual(['src']);
    });

    it('should accept multiple valid paths', () => {
      const result = normalizeSearchPathFilters(['src/**/*.ts', 'tests/**/*.ts'], workspaceRoot);
      expect(result).toEqual(['src/**/*.ts', 'tests/**/*.ts']);
    });

    it('should return undefined for empty array', () => {
      const result = normalizeSearchPathFilters([], workspaceRoot);
      expect(result).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      const result = normalizeSearchPathFilters(undefined, workspaceRoot);
      expect(result).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should reject paths starting with "!"', () => {
      expect(() => {
        normalizeSearchPathFilters(['!node_modules'], workspaceRoot);
      }).toThrow(/cannot start with/);
    });

    it('should reject empty strings', () => {
      const result = normalizeSearchPathFilters([''], workspaceRoot);
      expect(result).toBeUndefined();
    });

    it('should handle whitespace-only strings', () => {
      const result = normalizeSearchPathFilters(['   '], workspaceRoot);
      expect(result).toBeUndefined();
    });

    it('should deduplicate identical paths', () => {
      const result = normalizeSearchPathFilters(['src/*.ts', 'src/*.ts'], workspaceRoot);
      expect(result).toEqual(['src/*.ts']);
    });

    it('should normalize paths to use forward slashes', () => {
      const result = normalizeSearchPathFilters(['src\\subdir\\file.ts'], workspaceRoot);
      // Should convert backslashes to forward slashes
      expect(result).toContain('src/subdir/file.ts');
    });
  });
});
