/**
 * Integration with universal-ctags for symbol indexing.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import { ctagsPath } from '@LLMTooling/universal-ctags-node';
import type { CTagsTag, SupportedLanguage } from '../types/index.js';
import { PROCESS_TIMEOUT } from '../utils/security.js';

const execFileAsync = promisify(execFile);

/**
 * Generate a unique temp filename for ctags output.
 * Uses a hash of the workspace path to ensure consistency.
 */
function getTagsFilePath(workspaceRoot: string): string {
  const hash = createHash('sha256').update(workspaceRoot).digest('hex').substring(0, 16);
  return path.join(os.tmpdir(), `code-search-tags-${hash}.tmp`);
}

/**
 * Check if a file exists and is a symlink.
 * Returns true if the path is a symlink.
 */
async function isSymlink(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(filePath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Run universal-ctags on a workspace directory.
 * Uses a secure temporary file to prevent symlink attacks.
 */
export async function runCTags(workspaceRoot: string): Promise<CTagsTag[]> {
  // Use system temp directory instead of workspace root to prevent symlink attacks
  const tagsFile = getTagsFilePath(workspaceRoot);

  try {
    // Ensure the tags file doesn't exist or is not a symlink (TOCTOU protection)
    try {
      const existingIsSymlink = await isSymlink(tagsFile);
      if (existingIsSymlink) {
        throw new Error('Security: Refusing to overwrite symlink at tags file location');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, which is fine
    }

    // Run ctags with appropriate options
    const args = [
      '--languages=Java,Python,JavaScript,TypeScript,C#,Go,Rust,C,C++,PHP,Ruby,Kotlin',
      '--fields=+nKlsSz',
      '--extras=+q',
      '--output-format=json',
      `-f`,
      tagsFile,
      '-R',
      '.',
    ];

    await execFileAsync(ctagsPath, args, {
      cwd: workspaceRoot,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large projects
      timeout: PROCESS_TIMEOUT, // Add timeout to prevent hangs
    });

    // Read and parse the tags file
    const content = await fs.readFile(tagsFile, 'utf-8');
    const lines = content.trim().split('\n');
    const tags: CTagsTag[] = [];

    for (const line of lines) {
      if (!line || line.startsWith('!_TAG_')) {
        continue;
      }

      try {
        const tag = parseCTagsJsonLine(line);
        if (tag) {
          tags.push(tag);
        }
      } catch {
        // Skip malformed lines
        continue;
      }
    }

    return tags;
  } finally {
    // Clean up the tags file
    try {
      await fs.unlink(tagsFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Parse a single JSON line from ctags output.
 */
function parseCTagsJsonLine(line: string): CTagsTag | null {
  try {
    const obj = JSON.parse(line) as {
      name?: string;
      path?: string;
      line?: number;
      kind?: string;
      language?: string;
      scope?: string;
      scopeKind?: string;
      signature?: string;
    };

    if (!obj.name || !obj.path || !obj.line || !obj.kind || !obj.language) {
      return null;
    }

    return {
      name: obj.name,
      file: obj.path,
      line: obj.line,
      kind: obj.kind,
      language: obj.language.toLowerCase(),
      scope: obj.scope,
      scopeKind: obj.scopeKind,
      signature: obj.signature,
    };
  } catch {
    return null;
  }
}

/**
 * Check if ctags is available on the system.
 */
export async function isCTagsAvailable(): Promise<boolean> {
  try {
    await execFileAsync(ctagsPath, ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Map ctags language names to our supported language types.
 */
export function normalizeCTagsLanguage(ctagsLang: string): SupportedLanguage | null {
  const normalized = ctagsLang.toLowerCase();
  switch (normalized) {
    case 'java':
      return 'java';
    case 'python':
      return 'python';
    case 'javascript':
      return 'javascript';
    case 'typescript':
      return 'typescript';
    case 'c#':
    case 'csharp':
      return 'csharp';
    case 'go':
      return 'go';
    case 'rust':
      return 'rust';
    case 'c':
      return 'c';
    case 'c++':
    case 'cpp':
      return 'cpp';
    case 'php':
      return 'php';
    case 'ruby':
      return 'ruby';
    case 'kotlin':
      return 'kotlin';
    default:
      return null;
  }
}
