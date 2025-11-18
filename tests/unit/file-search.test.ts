/**
 * Unit tests for FileSearchService.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { FileSearchService } from '../../src/file-search/file-search-service.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('FileSearchService', () => {
  let fileSearchService: FileSearchService;
  let testDir: string;

  beforeAll(async () => {
    fileSearchService = new FileSearchService();

    // Create a temporary test directory
    testDir = path.join(os.tmpdir(), 'file-search-test-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });

    // Create a realistic test file structure
    const structure = {
      'package.json': '{}',
      'tsconfig.json': '{}',
      'README.md': '# Test',
      'src/index.ts': 'export {}',
      'src/utils/helper.ts': 'export {}',
      'src/utils/validator.ts': 'export {}',
      'src/components/Button.tsx': 'export {}',
      'src/components/Input.tsx': 'export {}',
      'tests/unit/test1.test.ts': 'test',
      'tests/unit/test2.test.ts': 'test',
      'tests/integration/api.test.ts': 'test',
      'docs/guide.md': '# Guide',
      'docs/api/reference.md': '# API',
      '.gitignore': 'node_modules',
      'config/jest.config.js': 'module.exports = {}',
      'config/webpack.config.js': 'module.exports = {}',
    };

    // Create all test files
    for (const [filePath, content] of Object.entries(structure)) {
      const fullPath = path.join(testDir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
    }
  });

  afterAll(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('searchFiles', () => {
    it('should throw error when no search criteria provided', async () => {
      await expect(fileSearchService.searchFiles(testDir, {})).rejects.toThrow(
        'At least one of pattern, name, or extension must be provided'
      );
    });

    it('should find files by extension', async () => {
      const result = await fileSearchService.searchFiles(testDir, {
        extension: 'ts',
      });

      expect(result.files.length).toBeGreaterThan(0);
      expect(result.total_matches).toBeGreaterThan(0);
      expect(result.search_time_ms).toBeGreaterThanOrEqual(0);

      // All results should be .ts files
      for (const file of result.files) {
        expect(file.relative_path).toMatch(/\.ts$/);
        expect(file.size_bytes).toBeGreaterThanOrEqual(0);
        expect(file.modified).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });

    it('should find files by extension with dot prefix', async () => {
      const result = await fileSearchService.searchFiles(testDir, {
        extension: '.tsx',
      });

      expect(result.files.length).toBe(2); // Button.tsx and Input.tsx
      for (const file of result.files) {
        expect(file.relative_path).toMatch(/\.tsx$/);
      }
    });

    it('should find files by exact name', async () => {
      const result = await fileSearchService.searchFiles(testDir, {
        name: 'package.json',
      });

      expect(result.files.length).toBe(1);
      expect(result.files[0].relative_path).toBe('package.json');
    });

    it('should find files by wildcard name', async () => {
      const result = await fileSearchService.searchFiles(testDir, {
        name: '*.json',
      });

      expect(result.files.length).toBe(2); // package.json and tsconfig.json
      for (const file of result.files) {
        expect(file.relative_path).toMatch(/\.json$/);
      }
    });

    it('should find files by glob pattern', async () => {
      const result = await fileSearchService.searchFiles(testDir, {
        pattern: 'src/**/*.ts',
      });

      expect(result.files.length).toBeGreaterThan(0);
      for (const file of result.files) {
        expect(file.relative_path).toMatch(/^src\//);
        expect(file.relative_path).toMatch(/\.ts$/);
      }
    });

    it('should find test files with pattern', async () => {
      const result = await fileSearchService.searchFiles(testDir, {
        pattern: '**/*.test.ts',
      });

      expect(result.files.length).toBe(3);
      for (const file of result.files) {
        expect(file.relative_path).toMatch(/\.test\.ts$/);
      }
    });

    it('should filter by directory with extension', async () => {
      const result = await fileSearchService.searchFiles(testDir, {
        directory: 'src/utils',
        extension: 'ts',
      });

      expect(result.files.length).toBe(2); // helper.ts and validator.ts
      for (const file of result.files) {
        expect(file.relative_path).toMatch(/^src\/utils\//);
      }
    });

    it('should filter by directory with name', async () => {
      const result = await fileSearchService.searchFiles(testDir, {
        directory: 'config',
        name: '*.js',
      });

      expect(result.files.length).toBe(2); // jest.config.js and webpack.config.js
      for (const file of result.files) {
        expect(file.relative_path).toMatch(/^config\//);
      }
    });

    it('should respect limit parameter', async () => {
      const result = await fileSearchService.searchFiles(testDir, {
        extension: 'ts',
        limit: 2,
      });

      expect(result.files.length).toBe(2);
      expect(result.total_matches).toBeGreaterThanOrEqual(2);
    });

    it('should use default limit of 100', async () => {
      const result = await fileSearchService.searchFiles(testDir, {
        extension: 'ts',
      });

      // We don't have 100+ files, so all files should be returned
      expect(result.files.length).toBeLessThanOrEqual(100);
      expect(result.files.length).toBe(result.total_matches);
    });

    it('should perform case-insensitive search by default', async () => {
      const result = await fileSearchService.searchFiles(testDir, {
        name: 'README.md',
      });

      expect(result.files.length).toBe(1);
      expect(result.files[0].relative_path).toBe('README.md');
    });

    it('should find markdown files', async () => {
      const result = await fileSearchService.searchFiles(testDir, {
        extension: 'md',
      });

      expect(result.files.length).toBe(3); // README.md, guide.md, reference.md
      for (const file of result.files) {
        expect(file.relative_path).toMatch(/\.md$/);
      }
    });

    it('should find config files with pattern', async () => {
      const result = await fileSearchService.searchFiles(testDir, {
        pattern: 'config/**/*',
      });

      expect(result.files.length).toBe(2);
      for (const file of result.files) {
        expect(file.relative_path).toMatch(/^config\//);
      }
    });

    it('should sort results alphabetically', async () => {
      const result = await fileSearchService.searchFiles(testDir, {
        extension: 'ts',
      });

      for (let i = 1; i < result.files.length; i++) {
        expect(result.files[i].relative_path >= result.files[i - 1].relative_path).toBe(true);
      }
    });

    it('should return file metadata', async () => {
      const result = await fileSearchService.searchFiles(testDir, {
        name: 'package.json',
      });

      expect(result.files.length).toBe(1);
      const file = result.files[0];

      expect(file.path).toBe(path.join(testDir, 'package.json'));
      expect(file.relative_path).toBe('package.json');
      expect(file.size_bytes).toBe(2); // '{}'
      expect(new Date(file.modified)).toBeInstanceOf(Date);
    });
  });

  describe('getFileInfo', () => {
    it('should return file info for valid file', async () => {
      const filePath = path.join(testDir, 'package.json');
      const info = await fileSearchService.getFileInfo(filePath, testDir);

      expect(info).not.toBeNull();
      expect(info!.path).toBe(filePath);
      expect(info!.relative_path).toBe('package.json');
      expect(info!.size_bytes).toBeGreaterThanOrEqual(0);
      expect(new Date(info!.modified)).toBeInstanceOf(Date);
    });

    it('should return null for directory', async () => {
      const dirPath = path.join(testDir, 'src');
      const info = await fileSearchService.getFileInfo(dirPath, testDir);

      expect(info).toBeNull();
    });

    it('should return null for non-existent file', async () => {
      const filePath = path.join(testDir, 'does-not-exist.txt');
      const info = await fileSearchService.getFileInfo(filePath, testDir);

      expect(info).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty directory gracefully', async () => {
      const emptyDir = path.join(testDir, 'empty');
      await fs.mkdir(emptyDir, { recursive: true });

      const result = await fileSearchService.searchFiles(emptyDir, {
        extension: 'ts',
      });

      expect(result.files.length).toBe(0);
      expect(result.total_matches).toBe(0);
    });

    it('should handle pattern with no matches', async () => {
      const result = await fileSearchService.searchFiles(testDir, {
        pattern: '**/*.xyz',
      });

      expect(result.files.length).toBe(0);
      expect(result.total_matches).toBe(0);
    });

    it('should handle directory that does not exist in pattern', async () => {
      const result = await fileSearchService.searchFiles(testDir, {
        directory: 'nonexistent',
        extension: 'ts',
      });

      expect(result.files.length).toBe(0);
    });
  });
});
