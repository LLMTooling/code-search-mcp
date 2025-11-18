/**
 * Unit tests for CacheManager.
 * Tests serialization, versioning, invalidation, and corruption handling.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CacheManager } from '../../src/cache/cache-manager.js';
import type { SymbolIndex } from '../../src/types/index.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DIR = path.join(__dirname, 'cache-test-workspace');
const CACHE_DIR = path.join(os.tmpdir(), `.code-search-mcp-cache-test-${Date.now()}`);

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(async () => {
    cacheManager = new CacheManager(CACHE_DIR, true);
    await cacheManager.initialize();
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.rm(CACHE_DIR, { recursive: true, force: true });
  });

  describe('Serialization and Deserialization', () => {
    it('should serialize and deserialize a simple index correctly', async () => {
      const workspaceId = 'test-ws-1';
      const workspacePath = TEST_DIR;

      // Create a test file
      await fs.writeFile(path.join(TEST_DIR, 'test.js'), 'function test() {}', 'utf-8');

      // Create a test index
      const testIndex: SymbolIndex = {
        byLanguage: new Map([
          [
            'javascript',
            new Map([
              [
                'function',
                new Map([
                  [
                    'test',
                    [
                      {
                        name: 'test',
                        language: 'javascript',
                        kind: 'function',
                        file: path.join(TEST_DIR, 'test.js'),
                        line: 1,
                      },
                    ],
                  ],
                ]),
              ],
            ]),
          ],
        ]),
        totalSymbols: 1,
        lastIndexed: new Date(),
      };

      // Save to cache
      await cacheManager.saveCache(workspaceId, workspacePath, testIndex);

      // Load from cache
      const loadedIndex = await cacheManager.loadCache(workspaceId, workspacePath);

      expect(loadedIndex).not.toBeNull();
      expect(loadedIndex!.totalSymbols).toBe(1);
      expect(loadedIndex!.byLanguage.size).toBe(1);
      expect(loadedIndex!.byLanguage.has('javascript')).toBe(true);

      const jsMap = loadedIndex!.byLanguage.get('javascript');
      expect(jsMap).toBeDefined();
      expect(jsMap!.has('function')).toBe(true);

      const funcMap = jsMap!.get('function');
      expect(funcMap).toBeDefined();
      expect(funcMap!.has('test')).toBe(true);

      const symbols = funcMap!.get('test');
      expect(symbols).toBeDefined();
      expect(symbols!.length).toBe(1);
      expect(symbols![0].name).toBe('test');
    });

    it('should serialize and deserialize a complex multi-language index', async () => {
      const workspaceId = 'test-ws-2';
      const workspacePath = TEST_DIR;

      // Create test files
      await fs.writeFile(path.join(TEST_DIR, 'test.js'), 'function test() {}', 'utf-8');
      await fs.writeFile(path.join(TEST_DIR, 'test.py'), 'def test(): pass', 'utf-8');

      // Create a complex test index
      const testIndex: SymbolIndex = {
        byLanguage: new Map([
          [
            'javascript',
            new Map([
              [
                'function',
                new Map([
                  [
                    'foo',
                    [
                      {
                        name: 'foo',
                        language: 'javascript',
                        kind: 'function',
                        file: path.join(TEST_DIR, 'test.js'),
                        line: 1,
                      },
                    ],
                  ],
                  [
                    'bar',
                    [
                      {
                        name: 'bar',
                        language: 'javascript',
                        kind: 'function',
                        file: path.join(TEST_DIR, 'test.js'),
                        line: 5,
                      },
                    ],
                  ],
                ]),
              ],
              [
                'class',
                new Map([
                  [
                    'MyClass',
                    [
                      {
                        name: 'MyClass',
                        language: 'javascript',
                        kind: 'class',
                        file: path.join(TEST_DIR, 'test.js'),
                        line: 10,
                      },
                    ],
                  ],
                ]),
              ],
            ]),
          ],
          [
            'python',
            new Map([
              [
                'function',
                new Map([
                  [
                    'test',
                    [
                      {
                        name: 'test',
                        language: 'python',
                        kind: 'function',
                        file: path.join(TEST_DIR, 'test.py'),
                        line: 1,
                      },
                    ],
                  ],
                ]),
              ],
            ]),
          ],
        ]),
        totalSymbols: 4,
        lastIndexed: new Date(),
      };

      // Save to cache
      await cacheManager.saveCache(workspaceId, workspacePath, testIndex);

      // Load from cache
      const loadedIndex = await cacheManager.loadCache(workspaceId, workspacePath);

      expect(loadedIndex).not.toBeNull();
      expect(loadedIndex!.totalSymbols).toBe(4);
      expect(loadedIndex!.byLanguage.size).toBe(2);
      expect(loadedIndex!.byLanguage.has('javascript')).toBe(true);
      expect(loadedIndex!.byLanguage.has('python')).toBe(true);
    });

    it('should preserve symbol metadata (containerName, signature)', async () => {
      const workspaceId = 'test-ws-3';
      const workspacePath = TEST_DIR;

      await fs.writeFile(path.join(TEST_DIR, 'test.java'), 'class Test {}', 'utf-8');

      const testIndex: SymbolIndex = {
        byLanguage: new Map([
          [
            'java',
            new Map([
              [
                'method',
                new Map([
                  [
                    'getValue',
                    [
                      {
                        name: 'getValue',
                        language: 'java',
                        kind: 'method',
                        file: path.join(TEST_DIR, 'test.java'),
                        line: 5,
                        containerName: 'MyClass',
                        signature: '()',
                      },
                    ],
                  ],
                ]),
              ],
            ]),
          ],
        ]),
        totalSymbols: 1,
        lastIndexed: new Date(),
      };

      await cacheManager.saveCache(workspaceId, workspacePath, testIndex);
      const loadedIndex = await cacheManager.loadCache(workspaceId, workspacePath);

      expect(loadedIndex).not.toBeNull();
      const javaMap = loadedIndex!.byLanguage.get('java');
      const methodMap = javaMap!.get('method');
      const symbols = methodMap!.get('getValue');
      expect(symbols![0].containerName).toBe('MyClass');
      expect(symbols![0].signature).toBe('()');
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate cache when a file is modified', async () => {
      const workspaceId = 'test-ws-4';
      const workspacePath = TEST_DIR;
      const testFile = path.join(TEST_DIR, 'test.js');

      // Create initial file
      await fs.writeFile(testFile, 'function test() {}', 'utf-8');

      const testIndex: SymbolIndex = {
        byLanguage: new Map(),
        totalSymbols: 1,
        lastIndexed: new Date(),
      };

      await cacheManager.saveCache(workspaceId, workspacePath, testIndex);

      // Verify cache is valid
      let isValid = await cacheManager.isCacheValid(workspaceId, workspacePath);
      expect(isValid).toBe(true);

      // Wait a bit to ensure mtime changes
      await new Promise(resolve => setTimeout(resolve, 100));

      // Modify the file
      await fs.writeFile(testFile, 'function test() { return 42; }', 'utf-8');

      // Cache should now be invalid
      isValid = await cacheManager.isCacheValid(workspaceId, workspacePath);
      expect(isValid).toBe(false);
    });

    it('should invalidate cache when a new file is added', async () => {
      const workspaceId = 'test-ws-5';
      const workspacePath = TEST_DIR;

      // Create initial file
      await fs.writeFile(path.join(TEST_DIR, 'test1.js'), 'function test1() {}', 'utf-8');

      const testIndex: SymbolIndex = {
        byLanguage: new Map(),
        totalSymbols: 1,
        lastIndexed: new Date(),
      };

      await cacheManager.saveCache(workspaceId, workspacePath, testIndex);

      // Verify cache is valid
      let isValid = await cacheManager.isCacheValid(workspaceId, workspacePath);
      expect(isValid).toBe(true);

      // Add a new file
      await fs.writeFile(path.join(TEST_DIR, 'test2.js'), 'function test2() {}', 'utf-8');

      // Cache should now be invalid
      isValid = await cacheManager.isCacheValid(workspaceId, workspacePath);
      expect(isValid).toBe(false);
    });

    it('should invalidate cache when a file is deleted', async () => {
      const workspaceId = 'test-ws-6';
      const workspacePath = TEST_DIR;
      const testFile1 = path.join(TEST_DIR, 'test1.js');
      const testFile2 = path.join(TEST_DIR, 'test2.js');

      // Create initial files
      await fs.writeFile(testFile1, 'function test1() {}', 'utf-8');
      await fs.writeFile(testFile2, 'function test2() {}', 'utf-8');

      const testIndex: SymbolIndex = {
        byLanguage: new Map(),
        totalSymbols: 2,
        lastIndexed: new Date(),
      };

      await cacheManager.saveCache(workspaceId, workspacePath, testIndex);

      // Verify cache is valid
      let isValid = await cacheManager.isCacheValid(workspaceId, workspacePath);
      expect(isValid).toBe(true);

      // Delete a file
      await fs.unlink(testFile2);

      // Cache should now be invalid
      isValid = await cacheManager.isCacheValid(workspaceId, workspacePath);
      expect(isValid).toBe(false);
    });

    it('should invalidate cache if workspace path changes', async () => {
      const workspaceId = 'test-ws-7';
      const workspacePath1 = TEST_DIR;
      const workspacePath2 = path.join(TEST_DIR, 'subdir');

      await fs.mkdir(workspacePath2, { recursive: true });

      // Create file in first workspace
      await fs.writeFile(path.join(workspacePath1, 'test.js'), 'function test() {}', 'utf-8');

      const testIndex: SymbolIndex = {
        byLanguage: new Map(),
        totalSymbols: 1,
        lastIndexed: new Date(),
      };

      await cacheManager.saveCache(workspaceId, workspacePath1, testIndex);

      // Verify cache is valid for original path
      let isValid = await cacheManager.isCacheValid(workspaceId, workspacePath1);
      expect(isValid).toBe(true);

      // Cache should be invalid for different path
      isValid = await cacheManager.isCacheValid(workspaceId, workspacePath2);
      expect(isValid).toBe(false);
    });
  });

  describe('Version Handling', () => {
    it('should reject cache with different version', async () => {
      const workspaceId = 'test-ws-8';
      const workspacePath = TEST_DIR;

      await fs.writeFile(path.join(TEST_DIR, 'test.js'), 'function test() {}', 'utf-8');

      // Create a cache with old version manually
      const cacheFilePath = path.join(CACHE_DIR, `${workspaceId}.json`);
      const oldCache = {
        metadata: {
          version: '0.0.1', // Old version
          workspaceId,
          workspacePath,
          workspaceHash: 'somehash',
          lastIndexed: new Date().toISOString(),
          fileMtimes: {},
          totalSymbols: 1,
        },
        index: {
          byLanguage: {},
          totalSymbols: 1,
          lastIndexed: new Date().toISOString(),
        },
      };

      await fs.writeFile(cacheFilePath, JSON.stringify(oldCache), 'utf-8');

      // Cache should be invalid due to version mismatch
      const isValid = await cacheManager.isCacheValid(workspaceId, workspacePath);
      expect(isValid).toBe(false);

      // Loading should return null
      const loadedIndex = await cacheManager.loadCache(workspaceId, workspacePath);
      expect(loadedIndex).toBeNull();
    });
  });

  describe('Corruption Handling', () => {
    it('should handle corrupted JSON gracefully', async () => {
      const workspaceId = 'test-ws-9';
      const workspacePath = TEST_DIR;

      await fs.writeFile(path.join(TEST_DIR, 'test.js'), 'function test() {}', 'utf-8');

      // Write corrupted cache file
      const cacheFilePath = path.join(CACHE_DIR, `${workspaceId}.json`);
      await fs.writeFile(cacheFilePath, '{ invalid json }', 'utf-8');

      // Should return null instead of throwing
      const loadedIndex = await cacheManager.loadCache(workspaceId, workspacePath);
      expect(loadedIndex).toBeNull();

      // isCacheValid should return false
      const isValid = await cacheManager.isCacheValid(workspaceId, workspacePath);
      expect(isValid).toBe(false);
    });

    it('should handle missing cache file gracefully', async () => {
      const workspaceId = 'test-ws-10';
      const workspacePath = TEST_DIR;

      // Try to load non-existent cache
      const loadedIndex = await cacheManager.loadCache(workspaceId, workspacePath);
      expect(loadedIndex).toBeNull();

      // isCacheValid should return false
      const isValid = await cacheManager.isCacheValid(workspaceId, workspacePath);
      expect(isValid).toBe(false);
    });

    it('should handle incomplete cache metadata gracefully', async () => {
      const workspaceId = 'test-ws-11';
      const workspacePath = TEST_DIR;

      await fs.writeFile(path.join(TEST_DIR, 'test.js'), 'function test() {}', 'utf-8');

      // Write cache with missing fields
      const cacheFilePath = path.join(CACHE_DIR, `${workspaceId}.json`);
      const incompleteCache = {
        metadata: {
          version: '1.0.0',
          workspaceId,
          // Missing other required fields
        },
        index: {},
      };

      await fs.writeFile(cacheFilePath, JSON.stringify(incompleteCache), 'utf-8');

      // Should handle gracefully
      const loadedIndex = await cacheManager.loadCache(workspaceId, workspacePath);
      expect(loadedIndex).toBeNull();
    });
  });

  describe('Cache Statistics', () => {
    it('should return correct cache stats', async () => {
      const workspaceId = 'test-ws-12';
      const workspacePath = TEST_DIR;

      await fs.writeFile(path.join(TEST_DIR, 'test.js'), 'function test() {}', 'utf-8');

      const testIndex: SymbolIndex = {
        byLanguage: new Map(),
        totalSymbols: 42,
        lastIndexed: new Date(),
      };

      await cacheManager.saveCache(workspaceId, workspacePath, testIndex);

      const stats = await cacheManager.getCacheStats(workspaceId, workspacePath);

      expect(stats).not.toBeNull();
      expect(stats!.workspaceId).toBe(workspaceId);
      expect(stats!.workspacePath).toBe(workspacePath);
      expect(stats!.totalSymbols).toBe(42);
      expect(stats!.isCached).toBe(true);
      expect(stats!.cacheSize).toBeGreaterThan(0);
      expect(stats!.fileCount).toBeGreaterThan(0);
    });

    it('should return null stats for non-existent cache', async () => {
      const workspaceId = 'test-ws-13';
      const workspacePath = TEST_DIR;

      const stats = await cacheManager.getCacheStats(workspaceId, workspacePath);

      expect(stats).not.toBeNull();
      expect(stats!.isCached).toBe(false);
      expect(stats!.totalSymbols).toBe(0);
    });

    it('should return stats for all caches', async () => {
      const workspaceId1 = 'test-ws-14';
      const workspaceId2 = 'test-ws-15';
      const workspacePath = TEST_DIR;

      await fs.writeFile(path.join(TEST_DIR, 'test.js'), 'function test() {}', 'utf-8');

      const testIndex1: SymbolIndex = {
        byLanguage: new Map(),
        totalSymbols: 10,
        lastIndexed: new Date(),
      };

      const testIndex2: SymbolIndex = {
        byLanguage: new Map(),
        totalSymbols: 20,
        lastIndexed: new Date(),
      };

      await cacheManager.saveCache(workspaceId1, workspacePath, testIndex1);
      await cacheManager.saveCache(workspaceId2, workspacePath, testIndex2);

      const allStats = await cacheManager.getAllCacheStats();

      expect(allStats.length).toBeGreaterThanOrEqual(2);
      const ws1Stats = allStats.find(s => s.workspaceId === workspaceId1);
      const ws2Stats = allStats.find(s => s.workspaceId === workspaceId2);

      expect(ws1Stats).toBeDefined();
      expect(ws2Stats).toBeDefined();
      expect(ws1Stats!.totalSymbols).toBe(10);
      expect(ws2Stats!.totalSymbols).toBe(20);
    });
  });

  describe('Cache Clearing', () => {
    it('should clear cache for specific workspace', async () => {
      const workspaceId = 'test-ws-16';
      const workspacePath = TEST_DIR;

      await fs.writeFile(path.join(TEST_DIR, 'test.js'), 'function test() {}', 'utf-8');

      const testIndex: SymbolIndex = {
        byLanguage: new Map(),
        totalSymbols: 1,
        lastIndexed: new Date(),
      };

      await cacheManager.saveCache(workspaceId, workspacePath, testIndex);

      // Verify cache exists
      let stats = await cacheManager.getCacheStats(workspaceId, workspacePath);
      expect(stats!.isCached).toBe(true);

      // Clear cache
      await cacheManager.clearCache(workspaceId);

      // Verify cache is gone
      stats = await cacheManager.getCacheStats(workspaceId, workspacePath);
      expect(stats!.isCached).toBe(false);
    });

    it('should clear all caches', async () => {
      const workspaceId1 = 'test-ws-17';
      const workspaceId2 = 'test-ws-18';
      const workspacePath = TEST_DIR;

      await fs.writeFile(path.join(TEST_DIR, 'test.js'), 'function test() {}', 'utf-8');

      const testIndex: SymbolIndex = {
        byLanguage: new Map(),
        totalSymbols: 1,
        lastIndexed: new Date(),
      };

      await cacheManager.saveCache(workspaceId1, workspacePath, testIndex);
      await cacheManager.saveCache(workspaceId2, workspacePath, testIndex);

      // Verify caches exist
      let allStats = await cacheManager.getAllCacheStats();
      expect(allStats.length).toBeGreaterThanOrEqual(2);

      // Clear all caches
      await cacheManager.clearAllCaches();

      // Verify all caches are gone
      allStats = await cacheManager.getAllCacheStats();
      expect(allStats.length).toBe(0);
    });
  });

  describe('Disabled Cache', () => {
    it('should not save or load when cache is disabled', async () => {
      const disabledCacheManager = new CacheManager(CACHE_DIR, false);
      const workspaceId = 'test-ws-19';
      const workspacePath = TEST_DIR;

      await fs.writeFile(path.join(TEST_DIR, 'test.js'), 'function test() {}', 'utf-8');

      const testIndex: SymbolIndex = {
        byLanguage: new Map(),
        totalSymbols: 1,
        lastIndexed: new Date(),
      };

      // Try to save
      await disabledCacheManager.saveCache(workspaceId, workspacePath, testIndex);

      // Try to load
      const loadedIndex = await disabledCacheManager.loadCache(workspaceId, workspacePath);
      expect(loadedIndex).toBeNull();
    });
  });
});
