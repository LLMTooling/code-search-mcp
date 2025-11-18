/**
 * Unit tests for WorkspaceManager
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WorkspaceManager } from '../../src/workspace/workspace-manager.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('WorkspaceManager', () => {
  let workspaceManager: WorkspaceManager;
  let testDir: string;

  beforeEach(async () => {
    workspaceManager = new WorkspaceManager();
    testDir = path.join(__dirname, 'test-workspaces');
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('addWorkspace', () => {
    it('should add a workspace with valid path', async () => {
      const workspace = await workspaceManager.addWorkspace(testDir, 'Test Workspace');

      expect(workspace).toBeDefined();
      expect(workspace.id).toMatch(/^ws-\d+$/);
      expect(workspace.name).toBe('Test Workspace');
      expect(workspace.rootPath).toBe(testDir);
      expect(workspace.createdAt).toBeInstanceOf(Date);
      expect(workspace.lastAccessed).toBeInstanceOf(Date);
    });

    it('should generate a name if not provided', async () => {
      const workspace = await workspaceManager.addWorkspace(testDir);

      expect(workspace.name).toBeDefined();
      expect(workspace.name.length).toBeGreaterThan(0);
    });

    it('should throw error for non-existent path', async () => {
      const nonExistentPath = path.join(testDir, 'non-existent');

      await expect(
        workspaceManager.addWorkspace(nonExistentPath, 'Invalid')
      ).rejects.toThrow();
    });

    it('should throw error for file path instead of directory', async () => {
      const filePath = path.join(testDir, 'file.txt');
      await fs.writeFile(filePath, 'test content');

      await expect(
        workspaceManager.addWorkspace(filePath, 'File Path')
      ).rejects.toThrow();
    });

    it('should handle paths with special characters', async () => {
      const specialDir = path.join(testDir, 'special-@#$-dir');
      await fs.mkdir(specialDir, { recursive: true });

      const workspace = await workspaceManager.addWorkspace(specialDir, 'Special');

      expect(workspace.rootPath).toBe(specialDir);
    });

    it('should assign unique IDs to multiple workspaces with different paths', async () => {
      const dir1 = path.join(testDir, 'workspace1');
      const dir2 = path.join(testDir, 'workspace2');
      await fs.mkdir(dir1, { recursive: true });
      await fs.mkdir(dir2, { recursive: true });

      const workspace1 = await workspaceManager.addWorkspace(dir1, 'Workspace 1');
      const workspace2 = await workspaceManager.addWorkspace(dir2, 'Workspace 2');

      expect(workspace1.id).not.toBe(workspace2.id);
    });
  });

  describe('listWorkspaces', () => {
    it('should return empty array when no workspaces exist', () => {
      const workspaces = workspaceManager.listWorkspaces();

      expect(workspaces).toEqual([]);
    });

    it('should list all added workspaces', async () => {
      const dir1 = path.join(testDir, 'list-workspace1');
      const dir2 = path.join(testDir, 'list-workspace2');
      await fs.mkdir(dir1, { recursive: true });
      await fs.mkdir(dir2, { recursive: true });

      await workspaceManager.addWorkspace(dir1, 'Workspace 1');
      await workspaceManager.addWorkspace(dir2, 'Workspace 2');

      const workspaces = workspaceManager.listWorkspaces();

      expect(workspaces.length).toBe(2);
      expect(workspaces.map(w => w.name)).toContain('Workspace 1');
      expect(workspaces.map(w => w.name)).toContain('Workspace 2');
    });

    it('should return all workspaces', async () => {
      const dir1 = path.join(testDir, 'sorted-workspace1');
      const dir2 = path.join(testDir, 'sorted-workspace2');
      await fs.mkdir(dir1, { recursive: true });
      await fs.mkdir(dir2, { recursive: true });

      const ws1 = await workspaceManager.addWorkspace(dir1, 'Old');
      const ws2 = await workspaceManager.addWorkspace(dir2, 'New');

      const workspaces = workspaceManager.listWorkspaces();

      // Should contain both workspaces
      const ids = workspaces.map(w => w.id);
      expect(ids).toContain(ws1.id);
      expect(ids).toContain(ws2.id);
    });
  });

  describe('getWorkspace', () => {
    it('should retrieve workspace by ID', async () => {
      const added = await workspaceManager.addWorkspace(testDir, 'Test');
      const retrieved = workspaceManager.getWorkspace(added.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(added.id);
      expect(retrieved?.name).toBe('Test');
    });

    it('should return undefined for non-existent ID', () => {
      const retrieved = workspaceManager.getWorkspace('ws-999999');

      expect(retrieved).toBeUndefined();
    });

    it('should not automatically update lastAccessed when retrieving workspace', async () => {
      const added = await workspaceManager.addWorkspace(testDir, 'Test');
      const originalAccessTime = added.lastAccessed.getTime();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      const retrieved = workspaceManager.getWorkspace(added.id);

      // getWorkspace doesn't update lastAccessed - use updateLastAccessed() for that
      expect(retrieved?.lastAccessed.getTime()).toBe(originalAccessTime);
    });
  });

  describe('removeWorkspace', () => {
    it('should remove workspace by ID', async () => {
      const dir = path.join(testDir, 'remove-test');
      await fs.mkdir(dir, { recursive: true });
      const workspace = await workspaceManager.addWorkspace(dir, 'Test');

      const removed = await workspaceManager.removeWorkspace(workspace.id);
      expect(removed).toBe(true);

      const retrieved = workspaceManager.getWorkspace(workspace.id);
      expect(retrieved).toBeUndefined();
    });

    it('should return false when removing non-existent workspace', async () => {
      const removed = await workspaceManager.removeWorkspace('ws-999999');

      expect(removed).toBe(false);
    });

    it('should not affect other workspaces when removing one', async () => {
      const dir1 = path.join(testDir, 'keep-workspace');
      const dir2 = path.join(testDir, 'remove-workspace');
      await fs.mkdir(dir1, { recursive: true });
      await fs.mkdir(dir2, { recursive: true });

      const ws1 = await workspaceManager.addWorkspace(dir1, 'Keep');
      const ws2 = await workspaceManager.addWorkspace(dir2, 'Remove');

      await workspaceManager.removeWorkspace(ws2.id);

      const retrieved = workspaceManager.getWorkspace(ws1.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(ws1.id);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long workspace names', async () => {
      const longName = 'A'.repeat(1000);
      const workspace = await workspaceManager.addWorkspace(testDir, longName);

      expect(workspace.name).toBe(longName);
    });

    it('should handle workspace names with special characters', async () => {
      const specialName = '测试工作区 🚀 @#$%^&*()';
      const workspace = await workspaceManager.addWorkspace(testDir, specialName);

      expect(workspace.name).toBe(specialName);
    });

    it('should handle empty workspace name', async () => {
      const dir = path.join(testDir, 'empty-name');
      await fs.mkdir(dir, { recursive: true });
      const workspace = await workspaceManager.addWorkspace(dir, '');

      // Empty string is used as provided
      expect(workspace.name).toBe('');
    });

    it('should return same workspace for duplicate path additions', async () => {
      const dir = path.join(testDir, 'duplicate-path');
      await fs.mkdir(dir, { recursive: true });

      const ws1 = await workspaceManager.addWorkspace(dir, 'First');
      const ws2 = await workspaceManager.addWorkspace(dir, 'Second');

      // Should return the same workspace when adding same path
      expect(ws1.id).toBe(ws2.id);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent workspace additions', async () => {
      const promises = Array.from({ length: 10 }, async (_, i) => {
        const dir = path.join(testDir, `concurrent-${i}`);
        await fs.mkdir(dir, { recursive: true });
        return workspaceManager.addWorkspace(dir, `Workspace ${i}`);
      });

      const workspaces = await Promise.all(promises);

      expect(workspaces.length).toBe(10);
      const ids = workspaces.map(w => w.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10); // All IDs should be unique
    });

    it('should handle concurrent read operations', async () => {
      const workspace = await workspaceManager.addWorkspace(testDir, 'Test');

      const promises = Array.from({ length: 100 }, () =>
        Promise.resolve(workspaceManager.getWorkspace(workspace.id))
      );

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result?.id).toBe(workspace.id);
      });
    });
  });
});
