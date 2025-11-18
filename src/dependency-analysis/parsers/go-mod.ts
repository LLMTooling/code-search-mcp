/**
 * Parser for go.mod (Go modules) dependencies.
 */

import { promises as fs } from 'fs';
import type { Dependency, ManifestInfo } from '../../types/dependency-analysis.js';
import { parsePipConstraint } from '../version-utils.js';

/**
 * Parse go.mod file
 */
export async function parseGoMod(filePath: string): Promise<{
  manifest: ManifestInfo;
  dependencies: Dependency[];
}> {
  const content = await fs.readFile(filePath, 'utf-8');

  // Extract module name
  const moduleMatch = /^module\s+(.+)$/m.exec(content);
  const moduleName = moduleMatch?.[1]?.trim();

  // Extract Go version
  const goVersionMatch = /^go\s+([\d.]+)$/m.exec(content);
  const goVersion = goVersionMatch?.[1];

  const manifest: ManifestInfo = {
    path: filePath,
    type: 'go.mod',
    ecosystem: 'go',
    projectName: moduleName,
    projectVersion: goVersion,
  };

  const dependencies: Dependency[] = [];

  // Extract require block
  const requireMatch = /require\s*\(([\s\S]*?)\n\s*\)/.exec(content);
  if (requireMatch) {
    const requireContent = requireMatch[1];
    const lines = requireContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) {
        continue;
      }

      const dep = parseGoRequire(trimmed);
      if (dep) {
        dependencies.push(dep);
      }
    }
  }

  // Also check for single-line requires
  const singleRequireRegex = /^require\s+([^\s]+)\s+([^\s]+)(?:\s+\/\/.*)?$/gm;
  let match;
  while ((match = singleRequireRegex.exec(content)) !== null) {
    const name = match[1];
    const version = match[2];

    dependencies.push({
      name,
      version: parsePipConstraint(version),
      scope: 'production',
      ecosystem: 'go',
      isDirect: true,
    });
  }

  return { manifest, dependencies };
}

function parseGoRequire(line: string): Dependency | null {
  // Format: module version // indirect (optional)
  const match = /^([^\s]+)\s+([^\s]+)(?:\s+\/\/\s*(.+))?$/.exec(line);
  if (!match) {
    return null;
  }

  const name = match[1];
  const version = match[2];
  const comment = match[3];
  const isIndirect = comment ? comment.includes('indirect') : false;

  return {
    name,
    version: parsePipConstraint(version),
    scope: 'production',
    ecosystem: 'go',
    isDirect: !isIndirect,
  };
}
