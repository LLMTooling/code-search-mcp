/**
 * Comprehensive error handling and edge case tests
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { CodeSearchMCPServer } from '../../src/mcp/server.js';
import { WorkspaceManager } from '../../src/workspace/workspace-manager.js';
import { TextSearchService } from '../../src/symbol-search/text-search-service.js';
import { SymbolSearchService } from '../../src/symbol-search/symbol-search-service.js';
import { SymbolIndexer } from '../../src/symbol-search/symbol-indexer.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DIR = path.join(__dirname, 'error-handling-test');

describe('Error Handling and Edge Cases', () => {
  let workspaceManager: WorkspaceManager;
  let textSearchService: TextSearchService;
  let symbolSearchService: SymbolSearchService;

  beforeAll(async () => {
    workspaceManager = new WorkspaceManager();
    textSearchService = new TextSearchService();
    const symbolIndexer = new SymbolIndexer();
    symbolSearchService = new SymbolSearchService(symbolIndexer);

    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('Invalid Input Handling', () => {
    it('should reject null workspace path', async () => {
      await expect(
        workspaceManager.addWorkspace(null as any, 'Test')
      ).rejects.toThrow();
    });

    it('should reject undefined workspace path', async () => {
      await expect(
        workspaceManager.addWorkspace(undefined as any, 'Test')
      ).rejects.toThrow();
    });

    it('should reject empty workspace path', async () => {
      await expect(
        workspaceManager.addWorkspace('', 'Test')
      ).rejects.toThrow();
    });

    it('should handle workspace path with only whitespace', async () => {
      await expect(
        workspaceManager.addWorkspace('   ', 'Test')
      ).rejects.toThrow();
    });

    it('should reject invalid workspace ID format', () => {
      const workspace = workspaceManager.getWorkspace('invalid-id-format');
      expect(workspace).toBeUndefined();
    });

    it('should reject negative workspace ID numbers', () => {
      const workspace = workspaceManager.getWorkspace('ws--1');
      expect(workspace).toBeUndefined();
    });

    it('should handle extremely long workspace IDs', () => {
      const longId = 'ws-' + '9'.repeat(1000);
      const workspace = workspaceManager.getWorkspace(longId);
      expect(workspace).toBeUndefined();
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

    it('should handle file instead of directory for workspace', async () => {
      const filePath = path.join(TEST_DIR, 'not-a-dir.txt');
      await fs.writeFile(filePath, 'content');

      await expect(
        workspaceManager.addWorkspace(filePath, 'File Path')
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

      const workspace = await workspaceManager.addWorkspace(spaceDir, 'Spaces');
      expect(workspace.rootPath).toBe(spaceDir);

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

      const workspace = await workspaceManager.addWorkspace(specialDir, 'Special');
      expect(workspace).toBeDefined();

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

      const workspace = await workspaceManager.addWorkspace(unicodeDir, 'Unicode');
      expect(workspace).toBeDefined();

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

      const workspace = await workspaceManager.addWorkspace(dotDir, 'Dots');
      expect(workspace).toBeDefined();
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
    it('should handle concurrent workspace additions', async () => {
      const promises = Array.from({ length: 50 }, (_, i) => {
        const dir = path.join(TEST_DIR, `concurrent-${i}`);
        return fs.mkdir(dir, { recursive: true }).then(() =>
          workspaceManager.addWorkspace(dir, `Workspace ${i}`)
        );
      });

      const results = await Promise.all(promises);

      expect(results.length).toBe(50);
      const ids = results.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(50);
    });

    it('should handle concurrent searches on same workspace', async () => {
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

    it('should handle invalid language for symbol search', async () => {
      const projectDir = path.join(TEST_DIR, 'invalid-lang');
      await fs.mkdir(projectDir, { recursive: true });
      const workspace = await workspaceManager.addWorkspace(projectDir, 'Test');

      await expect(
        symbolSearchService.searchSymbols(workspace.id, {
          language: 'invalid-language' as any,
          name: 'Test',
          match: 'exact',
        })
      ).rejects.toThrow();
    });

    it('should handle empty symbol name', async () => {
      const projectDir = path.join(TEST_DIR, 'empty-symbol');
      await fs.mkdir(projectDir, { recursive: true });
      const workspace = await workspaceManager.addWorkspace(projectDir, 'Test');

      await expect(
        symbolSearchService.searchSymbols(workspace.id, {
          language: 'typescript',
          name: '',
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
    it('should handle workspace removal during search', async () => {
      const projectDir = path.join(TEST_DIR, 'race-condition');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'file.txt'), 'test');

      const workspace = await workspaceManager.addWorkspace(projectDir, 'Race');

      // Start search
      const searchPromise = textSearchService.searchText(workspace.rootPath, {
        pattern: 'test',
        limit: 10,
      });

      // Remove workspace while searching
      workspaceManager.removeWorkspace(workspace.id);

      // Search should still complete
      const results = await searchPromise;
      expect(results).toBeDefined();
    });

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
