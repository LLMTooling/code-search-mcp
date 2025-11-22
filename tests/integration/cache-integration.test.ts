/**
 * Integration tests for cache system with full indexing cycle.
 * Tests the complete workflow: index -> cache -> load -> invalidate -> re-index
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { SymbolIndexer } from '../../src/symbol-search/symbol-indexer.js';
import { SymbolSearchService } from '../../src/symbol-search/symbol-search-service.js';
import { CacheManager } from '../../src/cache/cache-manager.js';
import { isCTagsAvailable } from '../../src/symbol-search/ctags-integration.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DIR = path.join(__dirname, 'cache-integration-test');
const CACHE_DIR = path.join(os.tmpdir(), `.code-search-mcp-cache-integration-test-${Date.now()}`);

describe('Cache Integration Tests', () => {
  let ctagsAvailable = false;
  let cacheManager: CacheManager;
  let symbolIndexer: SymbolIndexer;
  let symbolSearchService: SymbolSearchService;

  beforeAll(async () => {
    ctagsAvailable = await isCTagsAvailable();
    if (!ctagsAvailable) {
      console.warn('⚠️  ctags not available - skipping cache integration tests');
    }
  });

  beforeEach(async () => {
    cacheManager = new CacheManager(CACHE_DIR, true);
    symbolIndexer = new SymbolIndexer(cacheManager);
    symbolSearchService = new SymbolSearchService(symbolIndexer);
    await cacheManager.initialize();
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.rm(CACHE_DIR, { recursive: true, force: true });
  });

  describe('Full Cache Cycle', () => {
    it('should complete full cache cycle: index -> cache -> load', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }

      const workspaceId = 'cache-cycle-ws-1';

      // Create test files
      await fs.writeFile(
        path.join(TEST_DIR, 'test.js'),
        `
function hello() {
  return "Hello, World!";
}

class Greeter {
  greet(name) {
    return \`Hello, \${name}!\`;
  }
}
        `,
        'utf-8'
      );

      // Step 1: Build index from scratch
      const buildStart = Date.now();
      await symbolIndexer.buildIndex(workspaceId, TEST_DIR);
      const buildTime = Date.now() - buildStart;

      expect(symbolIndexer.hasIndex(workspaceId)).toBe(true);
      const index1 = symbolIndexer.getIndex(workspaceId);
      expect(index1).toBeDefined();
      expect(index1!.totalSymbols).toBeGreaterThan(0);

      console.log(`Initial build time: ${buildTime}ms (${index1!.totalSymbols} symbols)`);

      // Step 2: Verify cache was created
      const stats = await cacheManager.getCacheStats(workspaceId, TEST_DIR);
      expect(stats).not.toBeNull();
      expect(stats!.isCached).toBe(true);
      expect(stats!.totalSymbols).toBe(index1!.totalSymbols);

      // Step 3: Clear in-memory index and load from cache
      await symbolIndexer.removeIndex(workspaceId);
      expect(symbolIndexer.hasIndex(workspaceId)).toBe(false);

      const loadStart = Date.now();
      await symbolIndexer.buildIndex(workspaceId, TEST_DIR);
      const loadTime = Date.now() - loadStart;

      expect(symbolIndexer.hasIndex(workspaceId)).toBe(true);
      const index2 = symbolIndexer.getIndex(workspaceId);
      expect(index2).toBeDefined();
      expect(index2!.totalSymbols).toBe(index1!.totalSymbols);

      console.log(`Cache load time: ${loadTime}ms (${index2!.totalSymbols} symbols)`);

      // Step 4: Report cache performance (informational only - can vary in CI)
      const speedup = buildTime / loadTime;
      if (loadTime < buildTime) {
        console.log(`✓ Cache speedup: ${speedup.toFixed(2)}x faster`);
      } else {
        console.log(`ℹ Cache load: ${speedup.toFixed(2)}x (timing varies in CI)`);
      }

      // Step 5: Search should work with cached index
      const results = await symbolSearchService.searchSymbols(workspaceId, {
        language: 'javascript',
        name: 'hello',
        match: 'exact',
      });

      expect(results.symbols.length).toBeGreaterThan(0);
      expect(results.symbols[0].name).toBe('hello');
    });

    it('should handle incremental updates (file modification)', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }

      const workspaceId = 'cache-cycle-ws-2';
      const testFile = path.join(TEST_DIR, 'test.py');

      // Create initial file
      await fs.writeFile(
        testFile,
        `
def function1():
    pass

def function2():
    pass
        `,
        'utf-8'
      );

      // Build initial index
      await symbolIndexer.buildIndex(workspaceId, TEST_DIR);
      const index1 = symbolIndexer.getIndex(workspaceId);
      const initialSymbols = index1!.totalSymbols;

      console.log(`Initial index: ${initialSymbols} symbols`);

      // Verify cache is valid
      let isValid = await cacheManager.isCacheValid(workspaceId, TEST_DIR);
      expect(isValid).toBe(true);

      // Wait to ensure mtime changes
      await new Promise(resolve => setTimeout(resolve, 100));

      // Modify file - add new function
      await fs.writeFile(
        testFile,
        `
def function1():
    pass

def function2():
    pass

def function3():
    pass
        `,
        'utf-8'
      );

      // Cache should be invalid now
      isValid = await cacheManager.isCacheValid(workspaceId, TEST_DIR);
      expect(isValid).toBe(false);

      // Clear in-memory index
      await symbolIndexer.removeIndex(workspaceId);

      // Rebuild - should not use cache
      await symbolIndexer.buildIndex(workspaceId, TEST_DIR);
      const index2 = symbolIndexer.getIndex(workspaceId);
      const newSymbols = index2!.totalSymbols;

      console.log(`After modification: ${newSymbols} symbols`);

      // Should have more symbols now
      expect(newSymbols).toBeGreaterThan(initialSymbols);

      // New cache should be valid
      isValid = await cacheManager.isCacheValid(workspaceId, TEST_DIR);
      expect(isValid).toBe(true);
    });

    it('should handle file additions', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }

      const workspaceId = 'cache-cycle-ws-3';

      // Create initial file
      await fs.writeFile(
        path.join(TEST_DIR, 'file1.js'),
        'function func1() {}',
        'utf-8'
      );

      // Build initial index
      await symbolIndexer.buildIndex(workspaceId, TEST_DIR);
      const index1 = symbolIndexer.getIndex(workspaceId);
      const initialSymbols = index1!.totalSymbols;

      // Add new file
      await fs.writeFile(
        path.join(TEST_DIR, 'file2.js'),
        'function func2() {}',
        'utf-8'
      );

      // Cache should be invalid
      const isValid = await cacheManager.isCacheValid(workspaceId, TEST_DIR);
      expect(isValid).toBe(false);

      // Rebuild
      await symbolIndexer.removeIndex(workspaceId);
      await symbolIndexer.buildIndex(workspaceId, TEST_DIR);
      const index2 = symbolIndexer.getIndex(workspaceId);
      const newSymbols = index2!.totalSymbols;

      // Should have more symbols
      expect(newSymbols).toBeGreaterThan(initialSymbols);
    });

    it('should handle file deletions', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }

      const workspaceId = 'cache-cycle-ws-4';
      const file1 = path.join(TEST_DIR, 'file1.js');
      const file2 = path.join(TEST_DIR, 'file2.js');

      // Create initial files
      await fs.writeFile(file1, 'function func1() {}', 'utf-8');
      await fs.writeFile(file2, 'function func2() {}', 'utf-8');

      // Build initial index
      await symbolIndexer.buildIndex(workspaceId, TEST_DIR);
      const index1 = symbolIndexer.getIndex(workspaceId);
      const initialSymbols = index1!.totalSymbols;

      // Delete a file
      await fs.unlink(file2);

      // Cache should be invalid
      const isValid = await cacheManager.isCacheValid(workspaceId, TEST_DIR);
      expect(isValid).toBe(false);

      // Rebuild
      await symbolIndexer.removeIndex(workspaceId);
      await symbolIndexer.buildIndex(workspaceId, TEST_DIR);
      const index2 = symbolIndexer.getIndex(workspaceId);
      const newSymbols = index2!.totalSymbols;

      // Should have fewer symbols
      expect(newSymbols).toBeLessThan(initialSymbols);
    });
  });

  describe('Force Rebuild', () => {
    it('should force rebuild even with valid cache', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }

      const workspaceId = 'cache-cycle-ws-5';

      // Create test file
      await fs.writeFile(
        path.join(TEST_DIR, 'test.js'),
        'function test() {}',
        'utf-8'
      );

      // Build initial index
      await symbolIndexer.buildIndex(workspaceId, TEST_DIR);

      // Verify cache is valid
      let isValid = await cacheManager.isCacheValid(workspaceId, TEST_DIR);
      expect(isValid).toBe(true);

      // Clear in-memory index
      await symbolIndexer.removeIndex(workspaceId);

      // Force rebuild
      const buildStart = Date.now();
      await symbolIndexer.buildIndex(workspaceId, TEST_DIR, true);
      const buildTime = Date.now() - buildStart;

      console.log(`Force rebuild time: ${buildTime}ms`);

      expect(symbolIndexer.hasIndex(workspaceId)).toBe(true);

      // Cache should still be valid (it was updated)
      isValid = await cacheManager.isCacheValid(workspaceId, TEST_DIR);
      expect(isValid).toBe(true);
    });
  });

  describe('Multi-Language Support', () => {
    it('should cache and restore indices for all supported languages', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }

      const workspaceId = 'cache-cycle-ws-6';

      // Create files for multiple languages
      await fs.writeFile(
        path.join(TEST_DIR, 'test.js'),
        'function jsFunc() {}',
        'utf-8'
      );

      await fs.writeFile(
        path.join(TEST_DIR, 'test.py'),
        'def py_func(): pass',
        'utf-8'
      );

      await fs.writeFile(
        path.join(TEST_DIR, 'test.java'),
        'class JavaClass { void method() {} }',
        'utf-8'
      );

      await fs.writeFile(
        path.join(TEST_DIR, 'test.go'),
        'package main\nfunc goFunc() {}',
        'utf-8'
      );

      // Build index
      await symbolIndexer.buildIndex(workspaceId, TEST_DIR);
      const index1 = symbolIndexer.getIndex(workspaceId);

      // Count languages in index
      const languageCount = index1!.byLanguage.size;
      console.log(`Indexed ${languageCount} languages`);

      // Clear and reload from cache
      await symbolIndexer.removeIndex(workspaceId);
      await symbolIndexer.buildIndex(workspaceId, TEST_DIR);
      const index2 = symbolIndexer.getIndex(workspaceId);

      // Should have same number of languages
      expect(index2!.byLanguage.size).toBe(languageCount);
      expect(index2!.totalSymbols).toBe(index1!.totalSymbols);

      // Verify each language is preserved
      for (const [lang, kindMap] of index1!.byLanguage.entries()) {
        expect(index2!.byLanguage.has(lang)).toBe(true);
        const kindMap2 = index2!.byLanguage.get(lang);
        expect(kindMap2!.size).toBe(kindMap.size);
      }
    });
  });

  describe('Large Index Performance', () => {
    it('should efficiently cache and load large indices', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }

      const workspaceId = 'cache-cycle-ws-7';

      // Create multiple files with many symbols
      for (let i = 0; i < 10; i++) {
        const functions = Array.from({ length: 10 }, (_, j) =>
          `function func_${i}_${j}() { return ${j}; }`
        ).join('\n\n');

        await fs.writeFile(
          path.join(TEST_DIR, `file_${i}.js`),
          functions,
          'utf-8'
        );
      }

      // Build index
      const buildStart = Date.now();
      await symbolIndexer.buildIndex(workspaceId, TEST_DIR);
      const buildTime = Date.now() - buildStart;

      const index1 = symbolIndexer.getIndex(workspaceId);
      console.log(`Built index with ${index1!.totalSymbols} symbols in ${buildTime}ms`);

      // Clear and load from cache
      await symbolIndexer.removeIndex(workspaceId);

      const loadStart = Date.now();
      await symbolIndexer.buildIndex(workspaceId, TEST_DIR);
      const loadTime = Date.now() - loadStart;

      const index2 = symbolIndexer.getIndex(workspaceId);
      console.log(`Loaded ${index2!.totalSymbols} symbols from cache in ${loadTime}ms`);

      // Verify correctness
      expect(index2!.totalSymbols).toBe(index1!.totalSymbols);

      // Report performance (informational only - can vary in CI)
      const speedup = buildTime / loadTime;
      if (loadTime < buildTime) {
        console.log(`✓ Cache speedup: ${speedup.toFixed(2)}x faster`);
      } else {
        console.log(`ℹ Cache load: ${speedup.toFixed(2)}x (timing varies in CI)`);
      }
    });
  });

  describe('Concurrent Cache Operations', () => {
    it('should handle multiple workspaces independently', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping - ctags not available');
        return;
      }

      const ws1Dir = path.join(TEST_DIR, 'ws1');
      const ws2Dir = path.join(TEST_DIR, 'ws2');

      await fs.mkdir(ws1Dir, { recursive: true });
      await fs.mkdir(ws2Dir, { recursive: true });

      // Create different files in each workspace
      await fs.writeFile(
        path.join(ws1Dir, 'test.js'),
        'function ws1Func() {}',
        'utf-8'
      );

      await fs.writeFile(
        path.join(ws2Dir, 'test.js'),
        'function ws2Func() {}',
        'utf-8'
      );

      // Build both indices
      await symbolIndexer.buildIndex('ws1', ws1Dir);
      await symbolIndexer.buildIndex('ws2', ws2Dir);

      // Both should be cached
      const stats1 = await cacheManager.getCacheStats('ws1', ws1Dir);
      const stats2 = await cacheManager.getCacheStats('ws2', ws2Dir);

      expect(stats1!.isCached).toBe(true);
      expect(stats2!.isCached).toBe(true);

      // Clear in-memory indices
      await symbolIndexer.removeIndex('ws1');
      await symbolIndexer.removeIndex('ws2');

      // Load both from cache
      await symbolIndexer.buildIndex('ws1', ws1Dir);
      await symbolIndexer.buildIndex('ws2', ws2Dir);

      // Both should be restored
      expect(symbolIndexer.hasIndex('ws1')).toBe(true);
      expect(symbolIndexer.hasIndex('ws2')).toBe(true);

      // Search should work in each workspace
      const results1 = await symbolSearchService.searchSymbols('ws1', {
        language: 'javascript',
        name: 'ws1Func',
        match: 'exact',
      });

      const results2 = await symbolSearchService.searchSymbols('ws2', {
        language: 'javascript',
        name: 'ws2Func',
        match: 'exact',
      });

      expect(results1.symbols.length).toBeGreaterThan(0);
      expect(results2.symbols.length).toBeGreaterThan(0);
    });
  });
});
