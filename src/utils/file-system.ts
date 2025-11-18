/**
 * File system utilities for stack detection.
 */

import { promises as fs } from 'fs';
import path from 'path';
import fg from 'fast-glob';

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function readFileContent(
  filePath: string,
  maxBytes?: number
): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    if (maxBytes && content.length > maxBytes) {
      return content.slice(0, maxBytes);
    }
    return content;
  } catch (error) {
    throw new Error(`Failed to read file ${filePath}: ${String(error)}`);
  }
}

export async function findFilesByPattern(
  pattern: string,
  cwd: string,
  maxMatches?: number
): Promise<string[]> {
  try {
    const matches = await fg(pattern, {
      cwd,
      absolute: false,
      dot: false,
      onlyFiles: true,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
    });

    if (maxMatches && matches.length > maxMatches) {
      return matches.slice(0, maxMatches);
    }

    return matches;
  } catch (error) {
    throw new Error(`Failed to find files by pattern ${pattern}: ${String(error)}`);
  }
}

export function resolvePath(
  workspaceRoot: string,
  filePath: string,
  rootRelative = false
): string {
  if (rootRelative || path.isAbsolute(filePath)) {
    return path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
  }
  return path.join(workspaceRoot, filePath);
}

export async function pathMatches(
  workspaceRoot: string,
  regex: string
): Promise<string[]> {
  try {
    const pattern = new RegExp(regex);
    const allFiles = await fg('**/*', {
      cwd: workspaceRoot,
      absolute: false,
      dot: false,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
    });

    return allFiles.filter((file) => pattern.test(file));
  } catch (error) {
    throw new Error(`Failed to match paths with regex ${regex}: ${String(error)}`);
  }
}
