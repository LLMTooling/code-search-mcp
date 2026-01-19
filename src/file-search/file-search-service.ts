/**
 * File search service for finding files by name, pattern, or extension.
 */

import fg from 'fast-glob';
import { promises as fs } from 'fs';
import path from 'path';

export interface FileSearchResult {
  /** Absolute file path */
  path: string;
  /** Path relative to workspace root */
  relative_path: string;
  /** File size in bytes */
  size_bytes: number;
  /** Last modified timestamp (ISO string) */
  modified: string;
}

export interface FileSearchParams {
  /** Glob pattern (e.g., "*.test.ts", "star-star/*.go") */
  pattern?: string;
  /** Exact filename to match */
  name?: string;
  /** File extension (e.g., ".ts", ".go") */
  extension?: string;
  /** Filter to specific directory (relative to workspace) */
  directory?: string;
  /** Case-sensitive matching (default: false) */
  case_sensitive?: boolean;
  /** Maximum results to return (default: 100) */
  limit?: number;
}

export interface FileSearchResponse {
  total_matches: number;
  files: FileSearchResult[];
  search_time_ms: number;
}

export class FileSearchService {
  /**
   * Search for files in a workspace.
   */
  async searchFiles(
    workspaceRoot: string,
    params: FileSearchParams
  ): Promise<FileSearchResponse> {
    const startTime = Date.now();

    // Validate inputs
    if (!params.pattern && !params.name && !params.extension) {
      throw new Error('At least one of pattern, name, or extension must be provided');
    }

    // Build glob patterns
    const patterns = this.buildGlobPatterns(params);

    // Prepare glob options
    const globOptions: fg.Options = {
      cwd: workspaceRoot,
      absolute: false,
      caseSensitiveMatch: params.case_sensitive ?? false,
      ignore: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/target/**',
        '**/__pycache__/**',
        '**/.pytest_cache/**',
        '**/vendor/**',
      ],
    };

    // Execute search
    const matchedFiles = await fg(patterns, globOptions);

    // Sort matched files by path for consistent ordering before processing
    // This allows us to slice before expensive fs.stat operations
    matchedFiles.sort((a, b) => a.localeCompare(b));

    // Apply limit
    const limit = params.limit ?? 100;
    // We take a few more than limit to account for potential directories or errors
    // Since fast-glob with onlyFiles: true (default) is reliable, this buffer is minimal
    const candidates = matchedFiles.slice(0, limit);

    // Get file stats only for the candidate files
    const files: FileSearchResult[] = [];
    for (const relativePath of candidates) {
      try {
        const absolutePath = path.join(workspaceRoot, relativePath);
        const stats = await fs.stat(absolutePath);

        // Skip directories (though fast-glob should have filtered them)
        if (stats.isDirectory()) {
          continue;
        }

        files.push({
          path: absolutePath,
          relative_path: relativePath,
          size_bytes: stats.size,
          modified: stats.mtime.toISOString(),
        });
      } catch {
        // Skip files that can't be accessed
        continue;
      }
    }

    const endTime = Date.now();

    return {
      total_matches: matchedFiles.length,
      files,
      search_time_ms: endTime - startTime,
    };
  }

  /**
   * Build glob patterns from search parameters.
   */
  private buildGlobPatterns(params: FileSearchParams): string[] {
    const patterns: string[] = [];

    // Handle directory filter
    const dirPrefix = params.directory ? `${params.directory}/` : '';

    if (params.pattern) {
      // User provided explicit pattern
      patterns.push(`${dirPrefix}${params.pattern}`);
    } else if (params.name) {
      // Exact filename match
      if (params.directory) {
        patterns.push(`${dirPrefix}${params.name}`);
      } else {
        // Search in all subdirectories
        patterns.push(`**/${params.name}`);
      }
    } else if (params.extension) {
      // Match by extension
      const ext = params.extension.startsWith('.') ? params.extension : `.${params.extension}`;
      patterns.push(`${dirPrefix}**/*${ext}`);
    }

    return patterns;
  }

  /**
   * Get file statistics for a single file.
   */
  async getFileInfo(filePath: string, workspaceRoot: string): Promise<FileSearchResult | null> {
    try {
      const stats = await fs.stat(filePath);

      if (stats.isDirectory()) {
        return null;
      }

      const relativePath = path.relative(workspaceRoot, filePath);

      return {
        path: filePath,
        relative_path: relativePath,
        size_bytes: stats.size,
        modified: stats.mtime.toISOString(),
      };
    } catch {
      return null;
    }
  }
}
