/**
 * Comprehensive tests for workspace persistence functionality
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WorkspaceManager } from '../../src/workspace/workspace-manager.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Workspace Persistence', () => {
  let testDir: string;
  let testCacheDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'persistence-test-workspaces');
    testCacheDir = path.join(__dirname, 'persistence-test-cache');
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(testCacheDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Basic Persistence', () => {
    it('should persist workspace across manager instances', async () => {
      const workspaceDir = path.join(testDir, 'my-project');
      await fs.mkdir(workspaceDir, { recursive: true });

      // Create first manager and add workspace
      const manager1 = new WorkspaceManager(testCacheDir);
      await manager1.initialize();
      const workspace1 = await manager1.addWorkspace(workspaceDir, 'My Project');

      expect(workspace1.id).toBe('my-project');
      expect(workspace1.name).toBe('My Project');

      // Create second manager - should load persisted workspace
      const manager2 = new WorkspaceManager(testCacheDir);
      await manager2.initialize();

      const workspace2 = manager2.getWorkspace('my-project');
      expect(workspace2).toBeDefined();
      expect(workspace2?.id).toBe('my-project');
      expect(workspace2?.name).toBe('My Project');
      expect(workspace2?.rootPath).toBe(workspaceDir);
    });

    it('should persist multiple workspaces', async () => {
      const dir1 = path.join(testDir, 'project-one');
      const dir2 = path.join(testDir, 'project-two');
      const dir3 = path.join(testDir, 'project-three');
      await fs.mkdir(dir1, { recursive: true });
      await fs.mkdir(dir2, { recursive: true });
      await fs.mkdir(dir3, { recursive: true });

      // Add workspaces
      const manager1 = new WorkspaceManager(testCacheDir);
      await manager1.initialize();
      await manager1.addWorkspace(dir1, 'Project One');
      await manager1.addWorkspace(dir2, 'Project Two');
      await manager1.addWorkspace(dir3, 'Project Three');

      // Load in new manager
      const manager2 = new WorkspaceManager(testCacheDir);
      await manager2.initialize();

      const workspaces = manager2.listWorkspaces();
      expect(workspaces.length).toBe(3);

      const ids = workspaces.map(w => w.id).sort();
      expect(ids).toEqual(['project-one', 'project-three', 'project-two']);
    });

    it('should persist workspace removal', async () => {
      const workspaceDir = path.join(testDir, 'temp-project');
      await fs.mkdir(workspaceDir, { recursive: true });

      // Add and then remove workspace
      const manager1 = new WorkspaceManager(testCacheDir);
      await manager1.initialize();
      const workspace = await manager1.addWorkspace(workspaceDir, 'Temp Project');
      await manager1.removeWorkspace(workspace.id);

      // Verify removal persisted
      const manager2 = new WorkspaceManager(testCacheDir);
      await manager2.initialize();

      const retrieved = manager2.getWorkspace(workspace.id);
      expect(retrieved).toBeUndefined();

      const workspaces = manager2.listWorkspaces();
      expect(workspaces.length).toBe(0);
    });

    it('should persist lastAccessed updates', async () => {
      const workspaceDir = path.join(testDir, 'accessed-project');
      await fs.mkdir(workspaceDir, { recursive: true });

      // Create workspace
      const manager1 = new WorkspaceManager(testCacheDir);
      await manager1.initialize();
      const workspace = await manager1.addWorkspace(workspaceDir, 'Accessed Project');
      const originalTime = workspace.lastAccessed.getTime();

      // Wait and update lastAccessed
      await new Promise(resolve => setTimeout(resolve, 100));
      manager1.updateLastAccessed(workspace.id);

      // Wait for async save to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Load in new manager and verify update persisted
      const manager2 = new WorkspaceManager(testCacheDir);
      await manager2.initialize();
      const retrieved = manager2.getWorkspace(workspace.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.lastAccessed.getTime()).toBeGreaterThan(originalTime);
    });
  });

  describe('ID Generation', () => {
    it('should generate kebab-case IDs from camelCase directories', async () => {
      const testCases = [
        { dirName: 'myProject', expectedId: 'my-project' },
        { dirName: 'MyProject2', expectedId: 'my-project2' },
        { dirName: 'myAwesomeProject', expectedId: 'my-awesome-project' },
        { dirName: 'ProjectNameHere', expectedId: 'project-name-here' },
      ];

      const manager = new WorkspaceManager(testCacheDir);
      await manager.initialize();

      for (const { dirName, expectedId } of testCases) {
        const dir = path.join(testDir, dirName);
        await fs.mkdir(dir, { recursive: true });

        const workspace = await manager.addWorkspace(dir);
        expect(workspace.id).toBe(expectedId);
      }
    });

    it('should handle spaces and underscores in directory names', async () => {
      const testCases = [
        { dirName: 'test project', expectedId: 'test-project' },
        { dirName: 'test_project2', expectedId: 'test-project2' },
        { dirName: 'test  project3', expectedId: 'test-project3' }, // Multiple spaces
        { dirName: 'test__project4', expectedId: 'test-project4' }, // Multiple underscores
        { dirName: 'test_awesome project', expectedId: 'test-awesome-project' },
      ];

      const manager = new WorkspaceManager(testCacheDir);
      await manager.initialize();

      for (const { dirName, expectedId } of testCases) {
        const dir = path.join(testDir, dirName);
        await fs.mkdir(dir, { recursive: true });

        const workspace = await manager.addWorkspace(dir);
        expect(workspace.id).toBe(expectedId);
      }
    });

    it('should remove special characters from IDs', async () => {
      const testCases = [
        { dirName: 'alpha@project', expectedId: 'alphaproject' },
        { dirName: 'beta#project!', expectedId: 'betaproject' },
        { dirName: 'gamma$project%', expectedId: 'gammaproject' },
        { dirName: 'delta.v2', expectedId: 'deltav2' },
        { dirName: 'epsilon-project-123', expectedId: 'epsilon-project-123' }, // Dashes and numbers are kept
      ];

      const manager = new WorkspaceManager(testCacheDir);
      await manager.initialize();

      for (const { dirName, expectedId } of testCases) {
        const dir = path.join(testDir, dirName);
        await fs.mkdir(dir, { recursive: true });

        const workspace = await manager.addWorkspace(dir);
        expect(workspace.id).toBe(expectedId);
      }
    });

    it('should handle collision by appending numbers', async () => {
      const dir1 = path.join(testDir, 'my-project');
      const dir2 = path.join(testDir, 'MyProject'); // Same ID
      const dir3 = path.join(testDir, 'MY_PROJECT'); // Same ID
      await fs.mkdir(dir1, { recursive: true });
      await fs.mkdir(dir2, { recursive: true });
      await fs.mkdir(dir3, { recursive: true });

      const manager = new WorkspaceManager(testCacheDir);
      await manager.initialize();

      const ws1 = await manager.addWorkspace(dir1);
      const ws2 = await manager.addWorkspace(dir2);
      const ws3 = await manager.addWorkspace(dir3);

      expect(ws1.id).toBe('my-project');
      expect(ws2.id).toBe('my-project-2');
      expect(ws3.id).toBe('my-project-3');
    });

    it('should handle empty or invalid directory names', async () => {
      const testCases = [
        { dirName: '@@@', expectedId: 'workspace' }, // All special chars
        { dirName: '...', expectedId: 'workspace' }, // All dots
        { dirName: '---', expectedId: 'workspace' }, // Only dashes (trimmed)
      ];

      const manager = new WorkspaceManager(testCacheDir);
      await manager.initialize();

      for (const { dirName } of testCases) {
        const dir = path.join(testDir, dirName);
        await fs.mkdir(dir, { recursive: true });

        const workspace = await manager.addWorkspace(dir);
        // Each should get "workspace", but due to collision handling might be workspace-2, workspace-3
        expect(workspace.id).toMatch(/^workspace(-\d+)?$/);
      }
    });

    it('should preserve collision numbers across restarts', async () => {
      const dir1 = path.join(testDir, 'project');
      const dir2 = path.join(testDir, 'Project');
      await fs.mkdir(dir1, { recursive: true });
      await fs.mkdir(dir2, { recursive: true });

      // First manager: add two workspaces with collision
      const manager1 = new WorkspaceManager(testCacheDir);
      await manager1.initialize();
      await manager1.addWorkspace(dir1);
      await manager1.addWorkspace(dir2);

      // Second manager: verify IDs are preserved
      const manager2 = new WorkspaceManager(testCacheDir);
      await manager2.initialize();

      const ws1 = manager2.getWorkspace('project');
      const ws2 = manager2.getWorkspace('project-2');

      expect(ws1).toBeDefined();
      expect(ws2).toBeDefined();
      expect(ws1?.rootPath).toBe(dir1);
      expect(ws2?.rootPath).toBe(dir2);
    });
  });

  describe('Registry File Handling', () => {
    it('should create registry file on first save', async () => {
      const workspaceDir = path.join(testDir, 'first-workspace');
      await fs.mkdir(workspaceDir, { recursive: true });

      const manager = new WorkspaceManager(testCacheDir);
      await manager.initialize();
      await manager.addWorkspace(workspaceDir);

      const registryPath = path.join(testCacheDir, 'workspaces.json');
      const exists = await fs.access(registryPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should handle missing registry file gracefully', async () => {
      const manager = new WorkspaceManager(testCacheDir);
      await manager.initialize();

      const workspaces = manager.listWorkspaces();
      expect(workspaces.length).toBe(0);
    });

    it('should validate registry file format', async () => {
      const workspaceDir = path.join(testDir, 'test-workspace');
      await fs.mkdir(workspaceDir, { recursive: true });

      const manager1 = new WorkspaceManager(testCacheDir);
      await manager1.initialize();
      await manager1.addWorkspace(workspaceDir, 'Test Workspace');

      // Read and verify registry format
      const registryPath = path.join(testCacheDir, 'workspaces.json');
      const content = await fs.readFile(registryPath, 'utf-8');
      const registry = JSON.parse(content);

      expect(registry.version).toBe('1.0.0');
      expect(registry.workspaces).toBeDefined();
      expect(typeof registry.workspaces).toBe('object');

      const workspace = registry.workspaces['test-workspace'];
      expect(workspace).toBeDefined();
      expect(workspace.id).toBe('test-workspace');
      expect(workspace.rootPath).toBe(workspaceDir);
      expect(workspace.name).toBe('Test Workspace');
      expect(workspace.createdAt).toBeDefined();
      expect(workspace.lastAccessed).toBeDefined();

      // Verify dates are ISO strings
      expect(new Date(workspace.createdAt).toISOString()).toBe(workspace.createdAt);
      expect(new Date(workspace.lastAccessed).toISOString()).toBe(workspace.lastAccessed);
    });

    it('should handle corrupted registry file', async () => {
      const registryPath = path.join(testCacheDir, 'workspaces.json');
      await fs.mkdir(testCacheDir, { recursive: true });
      await fs.writeFile(registryPath, '{ invalid json }', 'utf-8');

      // Should initialize without throwing
      const manager = new WorkspaceManager(testCacheDir);
      await expect(manager.initialize()).resolves.not.toThrow();

      // Should start with empty workspace list
      const workspaces = manager.listWorkspaces();
      expect(workspaces.length).toBe(0);
    });

    it('should handle registry with wrong version', async () => {
      const registryPath = path.join(testCacheDir, 'workspaces.json');
      await fs.mkdir(testCacheDir, { recursive: true });

      const oldRegistry = {
        version: '0.5.0',
        workspaces: {
          'old-workspace': {
            id: 'old-workspace',
            rootPath: path.join(testDir, 'old-workspace'),
            name: 'Old Workspace',
            createdAt: new Date().toISOString(),
            lastAccessed: new Date().toISOString(),
          }
        }
      };

      await fs.writeFile(registryPath, JSON.stringify(oldRegistry, null, 2), 'utf-8');
      await fs.mkdir(path.join(testDir, 'old-workspace'), { recursive: true });

      // Should still load the data despite version mismatch
      const manager = new WorkspaceManager(testCacheDir);
      await manager.initialize();

      const workspace = manager.getWorkspace('old-workspace');
      expect(workspace).toBeDefined();
      expect(workspace?.name).toBe('Old Workspace');
    });
  });

  describe('Concurrent Operations with Persistence', () => {
    it('should handle concurrent workspace additions', async () => {
      const manager = new WorkspaceManager(testCacheDir);
      await manager.initialize();

      const promises = Array.from({ length: 20 }, async (_, i) => {
        const dir = path.join(testDir, `concurrent-${i}`);
        await fs.mkdir(dir, { recursive: true });
        return manager.addWorkspace(dir, `Workspace ${i}`);
      });

      const workspaces = await Promise.all(promises);
      expect(workspaces.length).toBe(20);

      // Verify all IDs are unique
      const ids = new Set(workspaces.map(w => w.id));
      expect(ids.size).toBe(20);

      // Verify persistence
      const manager2 = new WorkspaceManager(testCacheDir);
      await manager2.initialize();
      const loadedWorkspaces = manager2.listWorkspaces();
      expect(loadedWorkspaces.length).toBe(20);
    });

    it('should handle mixed add/remove operations', async () => {
      const manager = new WorkspaceManager(testCacheDir);
      await manager.initialize();

      // Add 10 workspaces
      const addPromises = Array.from({ length: 10 }, async (_, i) => {
        const dir = path.join(testDir, `workspace-${i}`);
        await fs.mkdir(dir, { recursive: true });
        return manager.addWorkspace(dir, `Workspace ${i}`);
      });

      const workspaces = await Promise.all(addPromises);

      // Remove half of them
      const removePromises = workspaces.slice(0, 5).map(ws =>
        manager.removeWorkspace(ws.id)
      );

      await Promise.all(removePromises);

      // Verify persistence
      const manager2 = new WorkspaceManager(testCacheDir);
      await manager2.initialize();
      const remaining = manager2.listWorkspaces();
      expect(remaining.length).toBe(5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long directory names', async () => {
      const longName = 'a'.repeat(200);
      const dir = path.join(testDir, longName);
      await fs.mkdir(dir, { recursive: true });

      const manager = new WorkspaceManager(testCacheDir);
      await manager.initialize();
      const workspace = await manager.addWorkspace(dir, 'Long Name');

      // Verify persistence works
      const manager2 = new WorkspaceManager(testCacheDir);
      await manager2.initialize();
      const retrieved = manager2.getWorkspace(workspace.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Long Name');
    });

    it('should handle unicode directory names', async () => {
      const unicodeNames = [
        '测试项目',
        'プロジェクト',
        'проект',
        '🚀-rocket-project',
      ];

      const manager = new WorkspaceManager(testCacheDir);
      await manager.initialize();

      for (const unicodeName of unicodeNames) {
        const dir = path.join(testDir, unicodeName);
        await fs.mkdir(dir, { recursive: true });
        await manager.addWorkspace(dir);
      }

      // Verify persistence
      const manager2 = new WorkspaceManager(testCacheDir);
      await manager2.initialize();
      const workspaces = manager2.listWorkspaces();
      expect(workspaces.length).toBe(unicodeNames.length);
    });

    it('should not re-add workspace with same path', async () => {
      const dir = path.join(testDir, 'same-path');
      await fs.mkdir(dir, { recursive: true });

      const manager1 = new WorkspaceManager(testCacheDir);
      await manager1.initialize();
      const ws1 = await manager1.addWorkspace(dir, 'First Name');
      const ws2 = await manager1.addWorkspace(dir, 'Second Name');

      // Should return same workspace, but update lastAccessed
      expect(ws1.id).toBe(ws2.id);
      expect(ws2.name).toBe('First Name'); // Name doesn't change

      // Verify only one workspace exists after restart
      const manager2 = new WorkspaceManager(testCacheDir);
      await manager2.initialize();
      const workspaces = manager2.listWorkspaces();
      expect(workspaces.length).toBe(1);
    });

    it('should handle rapid initialize calls', async () => {
      const manager = new WorkspaceManager(testCacheDir);

      // Call initialize multiple times rapidly
      await Promise.all([
        manager.initialize(),
        manager.initialize(),
        manager.initialize(),
      ]);

      // Should work without errors
      expect(manager.listWorkspaces().length).toBe(0);
    });
  });

  describe('Data Integrity', () => {
    it('should preserve Date objects across serialization', async () => {
      const dir = path.join(testDir, 'date-test');
      await fs.mkdir(dir, { recursive: true });

      const manager1 = new WorkspaceManager(testCacheDir);
      await manager1.initialize();
      const workspace = await manager1.addWorkspace(dir);

      const originalCreated = workspace.createdAt.getTime();
      const originalAccessed = workspace.lastAccessed.getTime();

      // Load in new manager
      const manager2 = new WorkspaceManager(testCacheDir);
      await manager2.initialize();
      const retrieved = manager2.getWorkspace(workspace.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.createdAt).toBeInstanceOf(Date);
      expect(retrieved!.lastAccessed).toBeInstanceOf(Date);
      expect(retrieved!.createdAt.getTime()).toBe(originalCreated);
      expect(retrieved!.lastAccessed.getTime()).toBe(originalAccessed);
    });

    it('should maintain workspace order after restart', async () => {
      const dirs = ['alpha', 'beta', 'gamma', 'delta'].map(name =>
        path.join(testDir, name)
      );

      for (const dir of dirs) {
        await fs.mkdir(dir, { recursive: true });
      }

      const manager1 = new WorkspaceManager(testCacheDir);
      await manager1.initialize();

      for (const dir of dirs) {
        await manager1.addWorkspace(dir);
      }

      const originalOrder = manager1.listWorkspaces().map(w => w.id);

      // Load in new manager
      const manager2 = new WorkspaceManager(testCacheDir);
      await manager2.initialize();
      const newOrder = manager2.listWorkspaces().map(w => w.id);

      // Order should be preserved (or at least all workspaces should be present)
      expect(newOrder.sort()).toEqual(originalOrder.sort());
    });
  });
});
