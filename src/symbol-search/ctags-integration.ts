/**
 * Integration with universal-ctags for symbol indexing.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import type { CTagsTag, SupportedLanguage } from '../types/index.js';

const execAsync = promisify(exec);

/**
 * Run universal-ctags on a workspace directory.
 */
export async function runCTags(workspaceRoot: string): Promise<CTagsTag[]> {
  // Create a temporary tags file path
  const tagsFile = path.join(workspaceRoot, '.code-search-tags');

  try {
    // Run ctags with appropriate options
    const command = [
      'ctags',
      '--languages=Java,Python,JavaScript,TypeScript,C#,Go,Rust,C,C++,PHP,Ruby,Kotlin',
      '--fields=+nKlsSz',
      '--extras=+q',
      '--output-format=json',
      `-f ${tagsFile}`,
      '-R',
      '.',
    ].join(' ');

    await execAsync(command, {
      cwd: workspaceRoot,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large projects
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
    await execAsync('ctags --version');
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
