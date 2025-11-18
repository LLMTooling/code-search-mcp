/**
 * Types for workspace management.
 */

export interface Workspace {
  /** Unique identifier for this workspace. */
  id: string;
  /** Absolute path to the workspace root. */
  rootPath: string;
  /** Human-friendly name. */
  name: string;
  /** When this workspace was added. */
  createdAt: Date;
  /** Last time this workspace was accessed. */
  lastAccessed: Date;
}

export interface WorkspaceManager {
  /** Get a workspace by ID. */
  getWorkspace(id: string): Workspace | undefined;
  /** Add a new workspace. */
  addWorkspace(rootPath: string, name?: string): Promise<Workspace>;
  /** Remove a workspace. */
  removeWorkspace(id: string): Promise<boolean>;
  /** List all workspaces. */
  listWorkspaces(): Workspace[];
  /** Check if a workspace exists. */
  hasWorkspace(id: string): boolean;
}
