/**
 * Comprehensive error handling and edge case tests
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { TextSearchService } from '../../src/symbol-search/text-search-service.js';
import { SymbolSearchService } from '../../src/symbol-search/symbol-search-service.js';
import { SymbolIndexer } from '../../src/symbol-search/symbol-indexer.js';
import { validateDirectory, validateAllowedPath, pathToWorkspaceId } from '../../src/utils/workspace-path.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DIR = path.join(__dirname, 'error-handling-test');
const TEST_CACHE_DIR = path.join(__dirname, 'error-handling-cache');

describe('Error Handling and Edge Cases', () => {
  let textSearchService: TextSearchService;
  let symbolSearchService: SymbolSearchService;

  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

    textSearchService = new TextSearchService();
    const symbolIndexer = new SymbolIndexer();
    symbolSearchService = new SymbolSearchService(symbolIndexer);
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.rm(TEST_CACHE_DIR, { recursive: true, force: true });
  });

  describe('Path Validation', () => {
    it('should reject null path', async () => {
      await expect(
        validateDirectory(null as any)
      ).rejects.toThrow();
    });

    it('should reject undefined path', async () => {
      await expect(
        validateDirectory(undefined as any)
      ).rejects.toThrow();
    });

    it('should reject empty path', async () => {
      await expect(
        validateDirectory('')
      ).rejects.toThrow();
    });

    it('should handle path with only whitespace', async () => {
      await expect(
        validateDirectory('   ')
      ).rejects.toThrow();
    });

    it('should reject non-existent directory', async () => {
      await expect(
        validateDirectory('/path/that/does/not/exist')
      ).rejects.toThrow();
    });

    it('should reject file instead of directory', async () => {
      const filePath = path.join(TEST_DIR, 'not-a-dir.txt');
      await fs.writeFile(filePath, 'content');

      await expect(
        validateDirectory(filePath)
      ).rejects.toThrow();
    });

    it('should generate consistent workspace IDs', () => {
      const testPath = '/some/test/path';
      const id1 = pathToWorkspaceId(testPath);
      const id2 = pathToWorkspaceId(testPath);
      expect(id1).toBe(id2);
      expect(id1.length).toBe(16);
    });

    it('should generate different IDs for different paths', () => {
      const id1 = pathToWorkspaceId('/path/one');
      const id2 = pathToWorkspaceId('/path/two');
      expect(id1).not.toBe(id2);
    });
  });

  describe('Allowed Workspace Validation', () => {
    it('should allow paths within allowed workspaces', () => {
      const allowed = ['/allowed/workspace'];
      const result = validateAllowedPath('/allowed/workspace/subdir', allowed);
      expect(result).toBeDefined();
    });

    it('should reject paths outside allowed workspaces', () => {
      const allowed = ['/allowed/workspace'];
      expect(() =>
        validateAllowedPath('/not/allowed/path', allowed)
      ).toThrow(/Access denied/);
    });

    it('should deny any path when no workspaces are configured', () => {
      expect(() =>
        validateAllowedPath('/any/path', [])
      ).toThrow(/Access denied/);
    });

    it('should allow exact match of allowed workspace', () => {
      const allowed = ['/allowed/workspace'];
      const result = validateAllowedPath('/allowed/workspace', allowed);
      expect(result).toBeDefined();
    });
  });

  describe('File System Errors', () => {
    it('should handle non-existent directory for text search', async () => {
      await expect(
        textSearchService.searchText('/path/that/does/not/exist', {
          pattern: 'test',
          limit: 10,
        })
      ).rejects.toThrow();
    });

    it('should handle directory with no read permissions', async () => {
      const restrictedDir = path.join(TEST_DIR, 'restricted');
      await fs.mkdir(restrictedDir, { recursive: true });

      try {
        await fs.chmod(restrictedDir, 0o000);

        // Should return empty results or throw - either is acceptable
        try {
          const results = await textSearchService.searchText(restrictedDir, {
            pattern: 'test',
            limit: 10,
          });
          // If it doesn't throw, should return empty results
          expect(results).toBeDefined();
          expect(Array.isArray(results)).toBe(true);
        } catch (error) {
          // Throwing an error is also acceptable behavior
          expect(error).toBeDefined();
        }
      } finally {
        await fs.chmod(restrictedDir, 0o755);
      }
    });
  });

  describe('Search Pattern Errors', () => {
    it('should handle invalid regex patterns', async () => {
      const projectDir = path.join(TEST_DIR, 'regex-error');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'file.txt'), 'test');

      // Invalid regex patterns
      const invalidPatterns = [
        '[unclosed',
        '(unclosed',
        '*invalid',
        '(?invalid)',
        '\\',
      ];

      for (const pattern of invalidPatterns) {
        await expect(
          textSearchService.searchText(projectDir, {
            pattern,
            limit: 10,
          })
        ).rejects.toThrow();
      }
    });

    it('should handle empty search pattern', async () => {
      const projectDir = path.join(TEST_DIR, 'empty-pattern');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'file.txt'), 'test');

      await expect(
        textSearchService.searchText(projectDir, {
          pattern: '',
          limit: 10,
        })
      ).rejects.toThrow();
    });

    it('should handle null search pattern', async () => {
      const projectDir = path.join(TEST_DIR, 'null-pattern');
      await fs.mkdir(projectDir, { recursive: true });

      await expect(
        textSearchService.searchText(projectDir, {
          pattern: null as any,
          limit: 10,
        })
      ).rejects.toThrow();
    });

    it('should handle extremely long search pattern', async () => {
      const projectDir = path.join(TEST_DIR, 'long-pattern');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'file.txt'), 'test');

      const longPattern = 'a'.repeat(10000);
      const results = await textSearchService.searchText(projectDir, {
        pattern: longPattern,
        limit: 10,
      });

      expect(results).toEqual([]);
    });
  });

  describe('Resource Limits', () => {
    it('should respect limit of 0', async () => {
      const projectDir = path.join(TEST_DIR, 'limit-zero');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'file.txt'), 'test');

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'test',
        limit: 0,
      });

      expect(results).toEqual([]);
    });

    it('should handle negative limit', async () => {
      const projectDir = path.join(TEST_DIR, 'limit-negative');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'file.txt'), 'test');

      // Should treat negative as 0 or throw error
      const results = await textSearchService.searchText(projectDir, {
        pattern: 'test',
        limit: -1,
      });

      expect(results).toEqual([]);
    });

    it('should handle extremely large limit', async () => {
      const projectDir = path.join(TEST_DIR, 'limit-large');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'file.txt'), 'test');

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'test',
        limit: Number.MAX_SAFE_INTEGER,
      });

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Special Characters in Paths', () => {
    it('should handle spaces in directory names', async () => {
      const spaceDir = path.join(TEST_DIR, 'dir with spaces');
      await fs.mkdir(spaceDir, { recursive: true });
      await fs.writeFile(path.join(spaceDir, 'file.txt'), 'test content');

      const normalized = await validateDirectory(spaceDir);
      expect(normalized).toBe(spaceDir);

      const results = await textSearchService.searchText(spaceDir, {
        pattern: 'test',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle special characters in directory names', async () => {
      const specialDir = path.join(TEST_DIR, 'special-@#$-dir');
      await fs.mkdir(specialDir, { recursive: true });
      await fs.writeFile(path.join(specialDir, 'file.txt'), 'test content');

      const normalized = await validateDirectory(specialDir);
      expect(normalized).toBeDefined();

      const results = await textSearchService.searchText(specialDir, {
        pattern: 'test',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle Unicode in directory names', async () => {
      const unicodeDir = path.join(TEST_DIR, '测试目录-🚀');
      await fs.mkdir(unicodeDir, { recursive: true });
      await fs.writeFile(path.join(unicodeDir, 'file.txt'), 'test content');

      const normalized = await validateDirectory(unicodeDir);
      expect(normalized).toBeDefined();

      const results = await textSearchService.searchText(unicodeDir, {
        pattern: 'test',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle dots and double dots in paths', async () => {
      const dotDir = path.join(TEST_DIR, 'dir...with...dots');
      await fs.mkdir(dotDir, { recursive: true });
      await fs.writeFile(path.join(dotDir, 'file.txt'), 'test content');

      const normalized = await validateDirectory(dotDir);
      expect(normalized).toBeDefined();
    });
  });

  describe('Corrupted or Invalid Files', () => {
    it('should handle corrupted JSON files gracefully', async () => {
      const projectDir = path.join(TEST_DIR, 'corrupted-json');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'package.json'),
        '{ "name": "test", invalid json content'
      );

      // Should not crash when searching
      const results = await textSearchService.searchText(projectDir, {
        pattern: 'test',
        limit: 10,
      });

      expect(results).toBeDefined();
    });

    it('should handle files with null bytes', async () => {
      const projectDir = path.join(TEST_DIR, 'null-bytes');
      await fs.mkdir(projectDir, { recursive: true });
      const content = 'test\x00content\x00with\x00nulls';
      await fs.writeFile(path.join(projectDir, 'file.txt'), content);

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'test',
        limit: 10,
      });

      expect(results).toBeDefined();
    });

    it('should handle files with mixed line endings', async () => {
      const projectDir = path.join(TEST_DIR, 'mixed-line-endings');
      await fs.mkdir(projectDir, { recursive: true });
      const content = 'line1\nline2\r\nline3\nline4';
      await fs.writeFile(path.join(projectDir, 'file.txt'), content);

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'line',
        limit: 10,
      });

      // Should find all 4 lines despite mixed endings (\n vs \r\n)
      expect(results.length).toBe(4);
    });

    it('should handle zero-byte files', async () => {
      const projectDir = path.join(TEST_DIR, 'zero-byte');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'empty.txt'), '');

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'anything',
        limit: 10,
      });

      expect(results).toEqual([]);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent searches on same directory', async () => {
      const projectDir = path.join(TEST_DIR, 'concurrent-search');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'file.txt'), 'test content');

      const promises = Array.from({ length: 20 }, () =>
        textSearchService.searchText(projectDir, {
          pattern: 'test',
          limit: 10,
        })
      );

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Symbol Search Error Handling', () => {
    it('should handle non-existent workspace for symbol search', async () => {
      await expect(
        symbolSearchService.searchSymbols('ws-nonexistent', {
          language: 'typescript',
          name: 'Test',
          match: 'exact',
        })
      ).rejects.toThrow();
    });
  });

  describe('Memory and Performance Edge Cases', () => {
    it('should handle deeply nested directory structure', async () => {
      const depth = 20;
      let currentPath = TEST_DIR;

      for (let i = 0; i < depth; i++) {
        currentPath = path.join(currentPath, `level${i}`);
        await fs.mkdir(currentPath, { recursive: true });
      }

      await fs.writeFile(path.join(currentPath, 'deep.txt'), 'deep content');

      const results = await textSearchService.searchText(TEST_DIR, {
        pattern: 'deep',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle directory with many files', async () => {
      const manyFilesDir = path.join(TEST_DIR, 'many-files');
      await fs.mkdir(manyFilesDir, { recursive: true });

      // Create 500 files
      const promises = Array.from({ length: 500 }, (_, i) =>
        fs.writeFile(path.join(manyFilesDir, `file${i}.txt`), `content ${i}`)
      );
      await Promise.all(promises);

      const results = await textSearchService.searchText(manyFilesDir, {
        pattern: 'content',
        limit: 100,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle file with very long lines', async () => {
      const projectDir = path.join(TEST_DIR, 'long-lines');
      await fs.mkdir(projectDir, { recursive: true });

      const longLine = 'x'.repeat(100000) + ' target ' + 'y'.repeat(100000);
      await fs.writeFile(path.join(projectDir, 'long.txt'), longLine);

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'target',
        limit: 10,
      });

      expect(results.length).toBe(1);
    });
  });

  describe('Race Conditions', () => {
    it('should handle file deletion during search', async () => {
      const projectDir = path.join(TEST_DIR, 'file-deletion');
      await fs.mkdir(projectDir, { recursive: true });
      const filePath = path.join(projectDir, 'temp.txt');
      await fs.writeFile(filePath, 'test content');

      // Start search
      const searchPromise = textSearchService.searchText(projectDir, {
        pattern: 'test',
        limit: 10,
      });

      // Delete file during search (might not affect search due to timing)
      setTimeout(async () => {
        try {
          await fs.unlink(filePath);
        } catch {
          // File might already be processed
        }
      }, 10);

      // Should not crash
      const results = await searchPromise;
      expect(results).toBeDefined();
    });
  });
});
