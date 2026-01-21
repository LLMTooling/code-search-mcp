/**
 * Utility functions for workspace path validation and ID generation.
 */

import { createHash } from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { isWindowsUncExtendedPath } from './security.js';

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
      throw new Error('Path is not a directory');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('Directory does not exist');
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
  // Block Windows UNC extended-length paths that can bypass path validation
  if (isWindowsUncExtendedPath(requestedPath)) {
    throw new Error(
      'Access denied: UNC extended-length paths are not allowed for security reasons'
    );
  }

  const normalized = path.resolve(requestedPath);

  // Also check normalized path in case it was transformed to UNC format
  if (isWindowsUncExtendedPath(normalized)) {
    throw new Error(
      'Access denied: UNC extended-length paths are not allowed for security reasons'
    );
  }

  // If no allowed workspaces are configured, deny all access
  if (allowedWorkspaces.length === 0) {
    throw new Error(
      `Access denied: No allowed workspaces configured.`
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
    // Don't leak actual paths in error messages
    throw new Error(
      'Access denied: Requested path is not within allowed workspaces.'
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
