/**
 * Parser for Gemfile (Ruby) dependencies.
 */

import { promises as fs } from 'fs';
import type { Dependency, ManifestInfo } from '../../types/dependency-analysis.js';
import { parsePipConstraint } from '../version-utils.js';

/**
 * Parse Gemfile
 */
export async function parseGemfile(filePath: string): Promise<{
  manifest: ManifestInfo;
  dependencies: Dependency[];
}> {
  const content = await fs.readFile(filePath, 'utf-8');

  const manifest: ManifestInfo = {
    path: filePath,
    type: 'Gemfile',
    ecosystem: 'rubygems',
  };

  const dependencies: Dependency[] = [];
  const lines = content.split('\n');

  let currentGroup: 'production' | 'development' | 'test' = 'production';

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Detect group blocks
    const groupMatch = /^group\s+:(\w+)(?:\s*,\s*:(\w+))?\s+do/.exec(trimmed);
    if (groupMatch) {
      const group = groupMatch[1];
      currentGroup = mapRubyGroup(group);
      continue;
    }

    // End of group block
    if (trimmed === 'end') {
      currentGroup = 'production';
      continue;
    }

    // Parse gem declaration
    const dep = parseGemDeclaration(trimmed, currentGroup);
    if (dep) {
      dependencies.push(dep);
    }
  }

  return { manifest, dependencies };
}

function parseGemDeclaration(line: string, scope: 'production' | 'development' | 'test'): Dependency | null {
  // Format: gem 'name', 'version'
  // Format: gem 'name', '~> version'
  // Format: gem 'name', '>= version'
  // Format: gem "name", require: false
  const gemMatch = /^gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/.exec(line);
  if (!gemMatch) {
    return null;
  }

  const name = gemMatch[1];
  const version = gemMatch[2] || '*';

  // Check if it's in a development or test group in the same line
  if (line.includes('group:') || line.includes('groups:')) {
    if (line.includes(':development') || line.includes(':test')) {
      scope = 'development';
    }
  }

  return {
    name,
    version: parseRubyVersion(version),
    scope,
    ecosystem: 'rubygems',
    isDirect: true,
  };
}

function parseRubyVersion(version: string) {
  // Ruby uses ~> for pessimistic version constraint
  if (version.startsWith('~>')) {
    const cleaned = version.replace('~>', '').trim();
    return {
      raw: version,
      normalized: `~${cleaned}`,
      operator: '~',
      minVersion: cleaned,
    };
  }

  return parsePipConstraint(version);
}

function mapRubyGroup(group: string): 'production' | 'development' | 'test' {
  const lower = group.toLowerCase();
  if (lower === 'development' || lower === 'dev') {
    return 'development';
  }
  if (lower === 'test') {
    return 'test';
  }
  return 'production';
}
