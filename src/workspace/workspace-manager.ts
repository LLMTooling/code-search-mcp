/**
 * Workspace manager implementation.
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { Workspace, WorkspaceManager as IWorkspaceManager } from '../types/index.js';

const REGISTRY_VERSION = '1.0.0';
const CACHE_DIR_NAME = '.code-search-mcp-cache';
const REGISTRY_FILE_NAME = 'workspaces.json';

interface WorkspaceRegistry {
  version: string;
  workspaces: Record<string, {
    id: string;
    rootPath: string;
    name: string;
    createdAt: string;
    lastAccessed: string;
  }>;
}

export class WorkspaceManager implements IWorkspaceManager {
  private workspaces = new Map<string, Workspace>();
  private cacheDir: string;
  private registryFilePath: string;
  private initialized = false;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir ?? path.join(os.homedir(), CACHE_DIR_NAME);
    this.registryFilePath = path.join(this.cacheDir, REGISTRY_FILE_NAME);
  }

  /**
   * Initialize the workspace manager by loading persisted workspaces.
   * This should be called once when the server starts.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await this.loadRegistry();
      this.initialized = true;
    } catch {
      // Continue without persisted workspaces
      this.initialized = true;
    }
  }

  /**
   * Generate a workspace ID from a directory path.
   * Converts the directory name to kebab-case and handles collisions.
   */
  private generateWorkspaceId(dirPath: string): string {
    const dirName = path.basename(dirPath);

    // Convert to kebab-case
    let baseId = dirName
      .replace(/([a-z])([A-Z])/g, '$1-$2')  // camelCase to kebab-case
      .replace(/[\s_]+/g, '-')               // spaces and underscores to dashes
      .toLowerCase()                          // lowercase
      .replace(/[^a-z0-9-]/g, '')            // remove non-alphanumeric except dashes
      .replace(/-+/g, '-')                   // collapse multiple dashes
      .replace(/^-+|-+$/g, '');              // trim dashes from start/end

    // Ensure we have a valid ID
    if (!baseId) {
      baseId = 'workspace';
    }

    // Handle collisions by appending a number
    let id = baseId;
    let counter = 2;
    while (this.workspaces.has(id)) {
      id = `${baseId}-${counter}`;
      counter++;
    }

    return id;
  }

  /**
   * Load workspace registry from disk.
   */
  private async loadRegistry(): Promise<void> {
    try {
      const registryContent = await fs.readFile(this.registryFilePath, 'utf-8');
      const registry: WorkspaceRegistry = JSON.parse(registryContent);

      // Validate version
      if (registry.version !== REGISTRY_VERSION) {
        // Continue anyway - we can handle the data
      }

      // Load workspaces into memory
      for (const [id, wsData] of Object.entries(registry.workspaces)) {
        const workspace: Workspace = {
          id: wsData.id,
          rootPath: wsData.rootPath,
          name: wsData.name,
          createdAt: new Date(wsData.createdAt),
          lastAccessed: new Date(wsData.lastAccessed),
        };
        this.workspaces.set(id, workspace);
      }
    } catch {
      // Registry file doesn't exist yet or failed to load - that's okay
    }
  }

  /**
   * Save workspace registry to disk.
   */
  private async saveRegistry(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });

      const registry: WorkspaceRegistry = {
        version: REGISTRY_VERSION,
        workspaces: {},
      };

      for (const [id, workspace] of this.workspaces.entries()) {
        registry.workspaces[id] = {
          id: workspace.id,
          rootPath: workspace.rootPath,
          name: workspace.name,
          createdAt: workspace.createdAt.toISOString(),
          lastAccessed: workspace.lastAccessed.toISOString(),
        };
      }

      await fs.writeFile(this.registryFilePath, JSON.stringify(registry, null, 2), 'utf-8');
    } catch {
      // Don't throw - persistence is optional
    }
  }

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
        // Update last accessed time and save
        workspace.lastAccessed = new Date();
        await this.saveRegistry();
        return workspace;
      }
    }

    // Generate ID from directory name
    const id = this.generateWorkspaceId(normalizedPath);
    const workspaceName = name ?? path.basename(normalizedPath);

    const workspace: Workspace = {
      id,
      rootPath: normalizedPath,
      name: workspaceName,
      createdAt: new Date(),
      lastAccessed: new Date(),
    };

    this.workspaces.set(id, workspace);
    await this.saveRegistry();
    return workspace;
  }

  async removeWorkspace(id: string): Promise<boolean> {
    const deleted = this.workspaces.delete(id);
    if (deleted) {
      await this.saveRegistry();
    }
    return deleted;
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
      // Save asynchronously without blocking
      this.saveRegistry().catch(() => {
        // Silently handle errors
      });
    }
  }
}
