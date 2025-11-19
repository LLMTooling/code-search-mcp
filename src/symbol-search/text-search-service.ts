/**
 * Text/usage search service using ripgrep.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { rgPath } from '@vscode/ripgrep';
import type { SupportedLanguage } from '../types/index.js';
import { getLanguageGlobs } from './language-profiles.js';

const execFileAsync = promisify(execFile);

export interface TextSearchResult {
  file: string;
  line: number;
  column: number;
  content: string;
}

export interface TextSearchParams {
  /** The search pattern (can be regex). */
  pattern: string;
  /** Language to restrict search to. */
  language?: SupportedLanguage;
  /** Case-insensitive search. */
  caseInsensitive?: boolean;
  /** Literal string search (not regex). */
  literal?: boolean;
  /** Max results to return. */
  limit?: number;
  /** File glob patterns to include. */
  include?: string[];
  /** File glob patterns to exclude. */
  exclude?: string[];
}

export class TextSearchService {
  /**
   * Search for text/code patterns using ripgrep.
   */
  async searchText(
    workspaceRoot: string,
    params: TextSearchParams
  ): Promise<TextSearchResult[]> {
    // Validate inputs
    if (!params.pattern || params.pattern.trim() === '') {
      throw new Error('Search pattern cannot be empty');
    }

    // Handle invalid limits
    if (params.limit !== undefined && params.limit <= 0) {
      return [];
    }

    const args: string[] = [];

    // Output format: JSON lines
    args.push('--json');

    // Case sensitivity
    if (params.caseInsensitive) {
      args.push('-i');
    }

    // Literal vs regex
    if (params.literal) {
      args.push('-F');
    }

    // Language-specific globs
    if (params.language) {
      const globs = getLanguageGlobs(params.language);
      for (const glob of globs) {
        args.push('--glob', glob);
      }
    }

    // Additional include patterns
    if (params.include) {
      for (const glob of params.include) {
        args.push('--glob', glob);
      }
    }

    // Exclude patterns (always exclude common build/dependency dirs)
    const defaultExcludes = [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/target/**',
      '**/.venv/**',
      '**/venv/**',
    ];
    const excludes = [...defaultExcludes, ...(params.exclude ?? [])];
    for (const glob of excludes) {
      args.push('--glob', `!${glob}`);
    }

    // Max results
    if (params.limit) {
      args.push('-m', String(params.limit));
    }

    // The pattern
    args.push('--', params.pattern);

    // Working directory
    args.push(workspaceRoot);

    try {
      const { stdout } = await execFileAsync(rgPath, args, {
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      });

      return this.parseRipgrepJsonOutput(stdout);
    } catch (error) {
      // ripgrep exits with code 1 when no matches found
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 1
      ) {
        return [];
      }
      throw new Error(`Text search failed: ${String(error)}`);
    }
  }

  /**
   * Parse ripgrep JSON output.
   */
  private parseRipgrepJsonOutput(output: string): TextSearchResult[] {
    const results: TextSearchResult[] = [];
    const lines = output.trim().split('\n');

    for (const line of lines) {
      if (!line) {
        continue;
      }

      try {
        const obj = JSON.parse(line) as {
          type?: string;
          data?: {
            path?: { text?: string };
            lines?: { text?: string };
            line_number?: number;
            absolute_offset?: number;
            submatches?: { start?: number }[];
          };
        };

        if (obj.type !== 'match' || !obj.data) {
          continue;
        }

        const path = obj.data.path?.text;
        const lineText = obj.data.lines?.text;
        const lineNumber = obj.data.line_number;
        const column = obj.data.submatches?.[0]?.start ?? 0;

        if (path && lineText && lineNumber) {
          results.push({
            file: path,
            line: lineNumber,
            column,
            content: lineText.trim(),
          });
        }
      } catch {
        // Skip malformed lines
        continue;
      }
    }

    return results;
  }

  /**
   * Check if ripgrep is available on the system.
   */
  async isRipgrepAvailable(): Promise<boolean> {
    try {
      await execFileAsync(rgPath, ['--version']);
      return true;
    } catch {
      return false;
    }
  }
}
