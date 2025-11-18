/**
 * Workspace manager implementation.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { Workspace, WorkspaceManager as IWorkspaceManager } from '../types/index.js';

export class WorkspaceManager implements IWorkspaceManager {
  private workspaces = new Map<string, Workspace>();
  private nextId = 1;

  getWorkspace(id: string): Workspace | undefined {
    return this.workspaces.get(id);
  }

  async addWorkspace(rootPath: string, name?: string): Promise<Workspace> {
    // Validate input
    if (!rootPath || rootPath.trim() === '') {
      throw new Error('Workspace path cannot be empty');
    }

    // Normalize and validate the path
    const normalizedPath = path.resolve(rootPath);

    // Check if directory exists
    try {
      const stat = await fs.stat(normalizedPath);
      if (!stat.isDirectory()) {
        throw new Error(`Path is not a directory: ${normalizedPath}`);
      }
    } catch (error) {
      throw new Error(`Invalid workspace path: ${normalizedPath} - ${String(error)}`);
    }

    // Check if workspace already exists with this path
    for (const workspace of this.workspaces.values()) {
      if (workspace.rootPath === normalizedPath) {
        // Update last accessed time
        workspace.lastAccessed = new Date();
        return workspace;
      }
    }

    // Create new workspace
    const id = `ws-${String(this.nextId++)}`;
    const workspaceName = name ?? path.basename(normalizedPath);

    const workspace: Workspace = {
      id,
      rootPath: normalizedPath,
      name: workspaceName,
      createdAt: new Date(),
      lastAccessed: new Date(),
    };

    this.workspaces.set(id, workspace);
    return workspace;
  }

  removeWorkspace(id: string): Promise<boolean> {
    return Promise.resolve(this.workspaces.delete(id));
  }

  listWorkspaces(): Workspace[] {
    return Array.from(this.workspaces.values());
  }

  hasWorkspace(id: string): boolean {
    return this.workspaces.has(id);
  }

  updateLastAccessed(id: string): void {
    const workspace = this.workspaces.get(id);
    if (workspace) {
      workspace.lastAccessed = new Date();
    }
  }
}
