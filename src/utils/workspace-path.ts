/**
 * Utility functions for workspace path validation and ID generation.
 */

import { createHash } from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';

/**
 * Generate a deterministic workspace ID from an absolute path.
 * Uses a hash of the normalized path to ensure uniqueness and consistency.
 */
export function pathToWorkspaceId(absolutePath: string): string {
  const normalized = path.resolve(absolutePath);
  return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Validates that a path exists and is a directory.
 * Returns the normalized absolute path if valid.
 * Throws an error if the path is invalid.
 */
export async function validateDirectory(dirPath: string): Promise<string> {
  if (!dirPath || dirPath.trim() === '') {
    throw new Error('Path cannot be empty');
  }

  const normalized = path.resolve(dirPath);

  try {
    const stat = await fs.stat(normalized);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${normalized}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Directory does not exist: ${normalized}`);
    }
    throw error;
  }

  return normalized;
}

/**
 * Validates that a path is within one of the allowed workspace directories.
 * Returns the normalized path if valid.
 * Throws an error if the path is not allowed.
 */
export function validateAllowedPath(
  requestedPath: string,
  allowedWorkspaces: string[]
): string {
  const normalized = path.resolve(requestedPath);

  // If no allowed workspaces are configured, deny all access
  if (allowedWorkspaces.length === 0) {
    throw new Error(
      `Access denied: No allowed workspaces configured. Access to ${normalized} is denied.`
    );
  }

  const isAllowed = allowedWorkspaces.some(allowed => {
    const normalizedAllowed = path.resolve(allowed);
    // Check if the requested path is the allowed path or a subdirectory of it
    return (
      normalized === normalizedAllowed ||
      normalized.startsWith(normalizedAllowed + path.sep)
    );
  });

  if (!isAllowed) {
    throw new Error(
      `Access denied: ${normalized} is not within allowed workspaces. ` +
      `Allowed paths: ${allowedWorkspaces.join(', ')}`
    );
  }

  return normalized;
}

/**
 * Validates a workspace path: checks it exists, is a directory, and is allowed.
 * Returns the normalized path and generated workspace ID.
 */
export async function validateWorkspacePath(
  requestedPath: string,
  allowedWorkspaces: string[]
): Promise<{ path: string; workspaceId: string }> {
  // First validate it's allowed
  const normalized = validateAllowedPath(requestedPath, allowedWorkspaces);

  // Then validate it exists and is a directory
  await validateDirectory(normalized);

  return {
    path: normalized,
    workspaceId: pathToWorkspaceId(normalized),
  };
}
