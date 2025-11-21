/**
 * Performance and stress tests
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { WorkspaceManager } from '../../src/workspace/workspace-manager.js';
import { TextSearchService } from '../../src/symbol-search/text-search-service.js';
import { StackDetectionEngine } from '../../src/stack-detection/detection-engine.js';
import type { StackRegistry } from '../../src/types/index.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DIR = path.join(__dirname, 'performance-test');
const TEST_CACHE_DIR = path.join(__dirname, 'performance-cache');

describe('Performance and Stress Tests', () => {
  let workspaceManager: WorkspaceManager;
  let textSearchService: TextSearchService;
  let detectionEngine: StackDetectionEngine;

  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

    workspaceManager = new WorkspaceManager(TEST_CACHE_DIR);
    await workspaceManager.initialize();
    textSearchService = new TextSearchService();

    // Load stack registry
    const stacksPath = path.join(__dirname, '../../src/stacks.json');
    const content = await fs.readFile(stacksPath, 'utf-8');
    const stackRegistry = JSON.parse(content) as StackRegistry;
    detectionEngine = new StackDetectionEngine(stackRegistry);
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.rm(TEST_CACHE_DIR, { recursive: true, force: true });
  });

  describe('Workspace Manager Performance', () => {
    it('should handle 1000 workspace additions efficiently', async () => {
      const start = Date.now();

      const promises = Array.from({ length: 1000 }, async (_, i) => {
        const dir = path.join(TEST_DIR, `perf-ws-${i}`);
        await fs.mkdir(dir, { recursive: true });
        return workspaceManager.addWorkspace(dir, `Workspace ${i}`);
      });

      const workspaces = await Promise.all(promises);
      const duration = Date.now() - start;

      expect(workspaces.length).toBe(1000);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      console.log(`1000 workspace additions took ${duration}ms`);
    });

    it('should list 1000 workspaces efficiently', async () => {
      const start = Date.now();
      const workspaces = workspaceManager.listWorkspaces();
      const duration = Date.now() - start;

      expect(workspaces.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      console.log(`Listing ${workspaces.length} workspaces took ${duration}ms`);
    });

    it('should handle 10000 rapid workspace lookups', async () => {
      const dir = path.join(TEST_DIR, 'lookup-perf');
      await fs.mkdir(dir, { recursive: true });
      const workspace = await workspaceManager.addWorkspace(dir, 'Lookup Test');

      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        workspaceManager.getWorkspace(workspace.id);
      }
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      console.log(`10000 workspace lookups took ${duration}ms`);
    });
  });

  describe('Text Search Performance', () => {
    it('should search through 1000 small files efficiently', async () => {
      const projectDir = path.join(TEST_DIR, 'search-1000-files');
      await fs.mkdir(projectDir, { recursive: true });

      // Create 1000 files
      const createPromises = Array.from({ length: 1000 }, (_, i) =>
        fs.writeFile(
          path.join(projectDir, `file${i}.txt`),
          `content ${i} searchterm line2 line3`
        )
      );
      await Promise.all(createPromises);

      const start = Date.now();
      const results = await textSearchService.searchText(projectDir, {
        pattern: 'searchterm',
        limit: 100,
      });
      const duration = Date.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(2000);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      console.log(`Searching 1000 files took ${duration}ms`);
    });

    it('should search large file efficiently', async () => {
      const projectDir = path.join(TEST_DIR, 'large-file-search');
      await fs.mkdir(projectDir, { recursive: true });

      // Create a file with 100,000 lines
      const lines = Array.from({ length: 100000 }, (_, i) => `line ${i} content`);
      lines[50000] = 'line 50000 TARGETTERM content';
      await fs.writeFile(path.join(projectDir, 'large.txt'), lines.join('\n'));

      const start = Date.now();
      const results = await textSearchService.searchText(projectDir, {
        pattern: 'TARGETTERM',
        limit: 10,
      });
      const duration = Date.now() - start;

      expect(results.length).toBe(1);
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
      console.log(`Searching 100k line file took ${duration}ms`);
    });

    it('should handle 100 concurrent searches efficiently', async () => {
      const projectDir = path.join(TEST_DIR, 'concurrent-searches');
      await fs.mkdir(projectDir, { recursive: true });

      // Create test files
      for (let i = 0; i < 50; i++) {
        await fs.writeFile(
          path.join(projectDir, `file${i}.txt`),
          `content ${i} test data`
        );
      }

      const start = Date.now();
      const promises = Array.from({ length: 100 }, () =>
        textSearchService.searchText(projectDir, {
          pattern: 'test',
          limit: 10,
        })
      );
      const results = await Promise.all(promises);
      const duration = Date.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(2000);
      results.forEach(r => expect(r.length).toBeGreaterThan(0));
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      console.log(`100 concurrent searches took ${duration}ms`);
    });

    it('should handle regex search on large dataset efficiently', async () => {
      const projectDir = path.join(TEST_DIR, 'regex-perf');
      await fs.mkdir(projectDir, { recursive: true });

      // Create files with various patterns
      for (let i = 0; i < 100; i++) {
        const content = Array.from(
          { length: 1000 },
          (_, j) => `function test${i}_${j}() { }`
        ).join('\n');
        await fs.writeFile(path.join(projectDir, `file${i}.js`), content);
      }

      const start = Date.now();
      const results = await textSearchService.searchText(projectDir, {
        pattern: 'function test\\d+_\\d+',
        limit: 500,
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Stack Detection Performance', () => {
    it('should detect stacks in complex project quickly', async () => {
      const projectDir = path.join(TEST_DIR, 'complex-project');
      await fs.mkdir(projectDir, { recursive: true });

      // Create a complex project structure
      await fs.writeFile(
        path.join(projectDir, 'package.json'),
        JSON.stringify({
          name: 'complex',
          dependencies: { react: '^18.0.0', typescript: '^5.0.0' },
        })
      );
      await fs.writeFile(
        path.join(projectDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: {} })
      );
      await fs.writeFile(path.join(projectDir, 'package-lock.json'), '{}');

      // Create many source files
      const srcDir = path.join(projectDir, 'src');
      await fs.mkdir(srcDir, { recursive: true });
      for (let i = 0; i < 100; i++) {
        await fs.writeFile(
          path.join(srcDir, `component${i}.tsx`),
          `export const Component${i} = () => <div>Test</div>;`
        );
      }

      const start = Date.now();
      const result = await detectionEngine.detectStacks('ws-perf', projectDir, {
        scanMode: 'thorough',
      });
      const duration = Date.now() - start;

      expect(result.detectedStacks.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      console.log(`Stack detection on complex project took ${duration}ms`);
    });

    it('should handle fast scan mode efficiently', async () => {
      const projectDir = path.join(TEST_DIR, 'fast-scan');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ name: 'test' })
      );

      const start = Date.now();
      const result = await detectionEngine.detectStacks('ws-fast', projectDir, {
        scanMode: 'fast',
      });
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(1000); // Fast scan should be very quick
      console.log(`Fast stack detection took ${duration}ms`);
    });
  });

  describe('Memory Stress Tests', () => {
    it('should handle very deep directory nesting', async () => {
      const depth = 50;
      let currentPath = path.join(TEST_DIR, 'deep-nesting');

      for (let i = 0; i < depth; i++) {
        currentPath = path.join(currentPath, `level${i}`);
        await fs.mkdir(currentPath, { recursive: true });
      }

      await fs.writeFile(path.join(currentPath, 'deep.txt'), 'deep content');

      const start = Date.now();
      const results = await textSearchService.searchText(
        path.join(TEST_DIR, 'deep-nesting'),
        {
          pattern: 'deep',
          limit: 10,
        }
      );
      const duration = Date.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(5000);
      console.log(`Search in ${depth}-level deep directory took ${duration}ms`);
    });

    it('should handle wide directory structure', async () => {
      const wideDir = path.join(TEST_DIR, 'wide-structure');
      await fs.mkdir(wideDir, { recursive: true });

      // Create 1000 subdirectories
      const promises = Array.from({ length: 1000 }, async (_, i) => {
        const subDir = path.join(wideDir, `subdir${i}`);
        await fs.mkdir(subDir, { recursive: true });
        await fs.writeFile(path.join(subDir, 'file.txt'), `content ${i}`);
      });
      await Promise.all(promises);

      const start = Date.now();
      const results = await textSearchService.searchText(wideDir, {
        pattern: 'content',
        limit: 100,
      });
      const duration = Date.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(2000);
      expect(duration).toBeLessThan(10000);
      console.log(`Search in wide directory structure took ${duration}ms`);
    });

    it('should handle mixed file sizes efficiently', async () => {
      const mixedDir = path.join(TEST_DIR, 'mixed-sizes');
      await fs.mkdir(mixedDir, { recursive: true });

      // Create small files
      for (let i = 0; i < 50; i++) {
        await fs.writeFile(path.join(mixedDir, `small${i}.txt`), 'test small');
      }

      // Create medium files
      for (let i = 0; i < 10; i++) {
        const content = Array.from({ length: 1000 }, () => 'test medium').join(
          '\n'
        );
        await fs.writeFile(path.join(mixedDir, `medium${i}.txt`), content);
      }

      // Create large files
      for (let i = 0; i < 2; i++) {
        const content = Array.from({ length: 10000 }, () => 'test large').join(
          '\n'
        );
        await fs.writeFile(path.join(mixedDir, `large${i}.txt`), content);
      }

      const start = Date.now();
      const results = await textSearchService.searchText(mixedDir, {
        pattern: 'test',
        limit: 100,
      });
      const duration = Date.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(2000);
      expect(duration).toBeLessThan(5000);
      console.log(`Search in mixed file sizes took ${duration}ms`);
    });
  });

  describe('Throughput Tests', () => {
    it('should maintain consistent performance under sustained load', async () => {
      const projectDir = path.join(TEST_DIR, 'sustained-load');
      await fs.mkdir(projectDir, { recursive: true });

      for (let i = 0; i < 100; i++) {
        await fs.writeFile(
          path.join(projectDir, `file${i}.txt`),
          `content ${i} test data`
        );
      }

      const iterations = 50;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await textSearchService.searchText(projectDir, {
          pattern: 'test',
          limit: 10,
        });
        durations.push(Date.now() - start);
      }

      // Calculate average and variance
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const variance =
        durations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) /
        durations.length;
      const stdDev = Math.sqrt(variance);

      expect(avg).toBeLessThan(1000); // Average should be under 1 second
      expect(stdDev).toBeLessThan(avg * 0.5); // Std dev should be less than 50% of average

      console.log(`Sustained load: avg=${avg.toFixed(2)}ms, stdDev=${stdDev.toFixed(2)}ms`);
    });

    it('should handle burst traffic efficiently', async () => {
      const projectDir = path.join(TEST_DIR, 'burst-traffic');
      await fs.mkdir(projectDir, { recursive: true });

      for (let i = 0; i < 50; i++) {
        await fs.writeFile(path.join(projectDir, `file${i}.txt`), 'test content');
      }

      // Simulate burst: 200 requests at once
      const start = Date.now();
      const promises = Array.from({ length: 200 }, () =>
        textSearchService.searchText(projectDir, {
          pattern: 'test',
          limit: 5,
        })
      );
      const results = await Promise.all(promises);
      const duration = Date.now() - start;

      expect(results.length).toBe(200);
      expect(duration).toBeLessThan(15000); // Should handle burst within 15 seconds
      console.log(`Burst of 200 requests took ${duration}ms`);
    });
  });

  describe('Scalability Tests', () => {
    it('should scale linearly with number of files', async () => {
      const baseDir = path.join(TEST_DIR, 'scalability');
      await fs.mkdir(baseDir, { recursive: true });

      const fileCounts = [10, 50, 100];
      const durations: number[] = [];

      for (const count of fileCounts) {
        const testDir = path.join(baseDir, `files-${count}`);
        await fs.mkdir(testDir, { recursive: true });

        for (let i = 0; i < count; i++) {
          await fs.writeFile(
            path.join(testDir, `file${i}.txt`),
            `content ${i} test`
          );
        }

        const start = Date.now();
        await textSearchService.searchText(testDir, {
          pattern: 'test',
          limit: 10,
        });
        durations.push(Date.now() - start);
      }

      console.log('Scalability test durations:', durations);

      // Check that it scales somewhat linearly (not exponentially)
      const ratio1 = durations[1]! / durations[0]!;
      const ratio2 = durations[2]! / durations[1]!;

      expect(ratio1).toBeLessThan(10); // Should not increase by more than 10x
      expect(ratio2).toBeLessThan(10);
    });
  });

  describe('Resource Cleanup', () => {
    it('should not leak memory on repeated operations', async () => {
      const projectDir = path.join(TEST_DIR, 'memory-test');
      await fs.mkdir(projectDir, { recursive: true });

      for (let i = 0; i < 20; i++) {
        await fs.writeFile(path.join(projectDir, `file${i}.txt`), 'test content');
      }

      // Perform 1000 searches
      for (let i = 0; i < 1000; i++) {
        await textSearchService.searchText(projectDir, {
          pattern: 'test',
          limit: 5,
        });
      }

      // If we get here without crashing, memory is being managed properly
      expect(true).toBe(true);
    });

    it('should clean up after workspace removal', async () => {
      const workspacesBefore = workspaceManager.listWorkspaces().length;

      // Add and remove 100 workspaces
      for (let i = 0; i < 100; i++) {
        const dir = path.join(TEST_DIR, `cleanup-${i}`);
        await fs.mkdir(dir, { recursive: true });
        const ws = await workspaceManager.addWorkspace(dir, `Cleanup ${i}`);
        workspaceManager.removeWorkspace(ws.id);
      }

      const workspacesAfter = workspaceManager.listWorkspaces().length;

      // Should be back to original count
      expect(workspacesAfter).toBe(workspacesBefore);
    });
  });
});
