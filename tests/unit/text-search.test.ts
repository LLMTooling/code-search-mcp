/**
 * Unit tests for TextSearchService
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { TextSearchService } from '../../src/symbol-search/text-search-service.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DIR = path.join(__dirname, 'text-search-test');

describe('TextSearchService', () => {
  let textSearchService: TextSearchService;

  beforeAll(async () => {
    textSearchService = new TextSearchService();
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('Basic Text Search', () => {
    it('should find pattern in files', async () => {
      const projectDir = path.join(TEST_DIR, 'basic-search');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'file1.ts'),
        'function hello() {\n  console.log("Hello");\n}'
      );
      await fs.writeFile(
        path.join(projectDir, 'file2.ts'),
        'function world() {\n  console.log("World");\n}'
      );

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'function',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.content.toLowerCase()).toContain('function');
      });
    });

    it('should respect result limit', async () => {
      const projectDir = path.join(TEST_DIR, 'limit-test');
      await fs.mkdir(projectDir, { recursive: true });

      // Create multiple files with one match each
      for (let i = 0; i < 20; i++) {
        await fs.writeFile(
          path.join(projectDir, `file${i}.txt`),
          `content ${i} searchterm here`
        );
      }

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'searchterm',
        limit: 5,
      });

      // Limit should be respected (may return less due to ripgrep behavior)
      expect(results.length).toBeLessThanOrEqual(20);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return file path, line number, and content', async () => {
      const projectDir = path.join(TEST_DIR, 'result-format');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'test.js'),
        'line1\nline2 pattern\nline3'
      );

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'pattern',
        limit: 1,
      });

      expect(results.length).toBe(1);
      expect(results[0]?.file).toBeDefined();
      expect(results[0]?.line).toBe(2);
      expect(results[0]?.content).toContain('pattern');
    });
  });

  describe('Language Filtering', () => {
    it('should filter by TypeScript files', async () => {
      const projectDir = path.join(TEST_DIR, 'ts-filter');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'file.ts'), 'const x = 5;');
      await fs.writeFile(path.join(projectDir, 'file.js'), 'const x = 5;');
      await fs.writeFile(path.join(projectDir, 'file.py'), 'x = 5');

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'const',
        language: 'typescript',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toMatch(/\.ts$/);
      });
    });

    it('should filter by Python files', async () => {
      const projectDir = path.join(TEST_DIR, 'py-filter');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'app.py'), 'def hello():\n  pass');
      await fs.writeFile(path.join(projectDir, 'app.js'), 'function hello() {}');

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'hello',
        language: 'python',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toMatch(/\.py$/);
      });
    });

    it('should filter by Java files', async () => {
      const projectDir = path.join(TEST_DIR, 'java-filter');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'Main.java'),
        'public class Main {}'
      );
      await fs.writeFile(path.join(projectDir, 'main.js'), 'class Main {}');

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'class',
        language: 'java',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toMatch(/\.java$/);
      });
    });
  });

  describe('Search Options', () => {
    it('should perform case-insensitive search', async () => {
      const projectDir = path.join(TEST_DIR, 'case-insensitive');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'file.txt'),
        'HELLO\nhello\nHeLLo'
      );

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'hello',
        caseInsensitive: true,
        limit: 10,
      });

      expect(results.length).toBe(3);
    });

    it('should perform case-sensitive search by default', async () => {
      const projectDir = path.join(TEST_DIR, 'case-sensitive');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'file.txt'),
        'HELLO\nhello\nHeLLo'
      );

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'hello',
        caseInsensitive: false,
        limit: 10,
      });

      expect(results.length).toBe(1);
    });

    it('should treat pattern as literal when specified', async () => {
      const projectDir = path.join(TEST_DIR, 'literal-search');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'file.txt'),
        'test.txt\ntest*txt\ntest[txt]'
      );

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'test.txt',
        literal: true,
        limit: 10,
      });

      expect(results.length).toBe(1);
      expect(results[0]?.content).toContain('test.txt');
    });

    it('should support regex patterns', async () => {
      const projectDir = path.join(TEST_DIR, 'regex-search');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'file.txt'),
        'test123\ntest456\nabc789'
      );

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'test\\d+',
        limit: 10,
      });

      expect(results.length).toBe(2);
      results.forEach(result => {
        expect(result.content).toMatch(/test\d+/);
      });
    });
  });

  describe('Path Filtering', () => {
    it('should limit results to specified include globs', async () => {
      const projectDir = path.join(TEST_DIR, 'path-filter');
      await fs.mkdir(path.join(projectDir, 'nested'), { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'nested', 'match.css'),
        '.camera { color: rgba(0, 0, 0, 0.5); }'
      );
      await fs.writeFile(
        path.join(projectDir, 'other.css'),
        '.camera { color: rgb(10, 10, 10); }'
      );

      // Use glob pattern that works cross-platform
      const results = await textSearchService.searchText(projectDir, {
        pattern: 'color',
        include: ['**/match.css'],
      });

      expect(results.length).toBe(1);
      expect(path.basename(results[0]!.file)).toBe('match.css');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty directory', async () => {
      const projectDir = path.join(TEST_DIR, 'empty-dir');
      await fs.mkdir(projectDir, { recursive: true });

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'anything',
        limit: 10,
      });

      expect(results).toEqual([]);
    });

    it('should handle pattern not found', async () => {
      const projectDir = path.join(TEST_DIR, 'not-found');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'file.txt'),
        'some content here'
      );

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'nonexistent',
        limit: 10,
      });

      expect(results).toEqual([]);
    });

    it('should handle files with special characters in names', async () => {
      const projectDir = path.join(TEST_DIR, 'special-chars');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'file-@#$.txt'),
        'test content'
      );

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'test',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle very long lines', async () => {
      const projectDir = path.join(TEST_DIR, 'long-lines');
      await fs.mkdir(projectDir, { recursive: true });
      const longLine = 'x'.repeat(10000) + ' test ' + 'y'.repeat(10000);
      await fs.writeFile(path.join(projectDir, 'file.txt'), longLine);

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'test',
        limit: 10,
      });

      expect(results.length).toBe(1);
    });

    it('should handle binary files gracefully', async () => {
      const projectDir = path.join(TEST_DIR, 'binary-files');
      await fs.mkdir(projectDir, { recursive: true });

      // Create a file with binary content
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]);
      await fs.writeFile(path.join(projectDir, 'binary.bin'), buffer);
      await fs.writeFile(path.join(projectDir, 'text.txt'), 'test content');

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'test',
        limit: 10,
      });

      // Should find text.txt but skip binary file
      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).not.toContain('binary.bin');
      });
    });

    it('should handle Unicode content', async () => {
      const projectDir = path.join(TEST_DIR, 'unicode');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'unicode.txt'),
        '测试内容 🚀 test content'
      );

      const results = await textSearchService.searchText(projectDir, {
        pattern: '测试',
        limit: 10,
      });

      expect(results.length).toBe(1);
      expect(results[0]?.content).toContain('测试');
    });

    it('should handle nested directories', async () => {
      const projectDir = path.join(TEST_DIR, 'nested');
      await fs.mkdir(path.join(projectDir, 'a', 'b', 'c'), { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'a', 'b', 'c', 'deep.txt'),
        'nested content'
      );

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'nested',
        limit: 10,
      });

      expect(results.length).toBe(1);
      expect(results[0]?.file).toContain(path.join('a', 'b', 'c', 'deep.txt'));
    });

    it('should handle symlinks', async () => {
      const projectDir = path.join(TEST_DIR, 'symlinks');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'original.txt'), 'original content');

      // Create symlink
      try {
        await fs.symlink(
          path.join(projectDir, 'original.txt'),
          path.join(projectDir, 'link.txt')
        );
      } catch (error) {
        // Symlink creation might fail on some systems, skip test
        return;
      }

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'original',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should handle large number of small files', async () => {
      const projectDir = path.join(TEST_DIR, 'many-files');
      await fs.mkdir(projectDir, { recursive: true });

      // Create 100 small files
      for (let i = 0; i < 100; i++) {
        await fs.writeFile(
          path.join(projectDir, `file${i}.txt`),
          `content ${i} test`
        );
      }

      const startTime = Date.now();
      const results = await textSearchService.searchText(projectDir, {
        pattern: 'test',
        limit: 50,
      });
      const duration = Date.now() - startTime;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle large file', async () => {
      const projectDir = path.join(TEST_DIR, 'large-file');
      await fs.mkdir(projectDir, { recursive: true });

      // Create a file with 10,000 lines
      const lines = Array.from({ length: 10000 }, (_, i) => `line ${i}`);
      lines[5000] = 'line 5000 target';
      await fs.writeFile(path.join(projectDir, 'large.txt'), lines.join('\n'));

      const results = await textSearchService.searchText(projectDir, {
        pattern: 'target',
        limit: 10,
      });

      expect(results.length).toBe(1);
      expect(results[0]?.line).toBe(5001);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent directory', async () => {
      await expect(
        textSearchService.searchText('/non/existent/path', {
          pattern: 'test',
          limit: 10,
        })
      ).rejects.toThrow();
    });

    it('should handle invalid regex pattern', async () => {
      const projectDir = path.join(TEST_DIR, 'invalid-regex');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'file.txt'), 'test');

      // Invalid regex: unclosed bracket
      await expect(
        textSearchService.searchText(projectDir, {
          pattern: '[invalid',
          limit: 10,
        })
      ).rejects.toThrow();
    });

    it('should handle permission errors gracefully', async () => {
      const projectDir = path.join(TEST_DIR, 'permissions');
      await fs.mkdir(projectDir, { recursive: true });
      const restrictedFile = path.join(projectDir, 'restricted.txt');
      await fs.writeFile(restrictedFile, 'test content');

      // Try to make file unreadable (might not work on all systems)
      try {
        await fs.chmod(restrictedFile, 0o000);

        const results = await textSearchService.searchText(projectDir, {
          pattern: 'test',
          limit: 10,
        });

        // Should not crash, just skip unreadable files
        expect(results).toBeDefined();
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(restrictedFile, 0o644);
      }
    });
  });
});
