/**
 * Parser for composer.json (PHP) dependencies.
 */

import { promises as fs } from 'fs';
import type { Dependency, DependencyScope, ManifestInfo } from '../../types/dependency-analysis.js';
import { parseNpmConstraint } from '../version-utils.js';

interface ComposerJson {
  name?: string;
  version?: string;
  require?: Record<string, string>;
  'require-dev'?: Record<string, string>;
}

/**
 * Parse composer.json file
 */
export async function parseComposerJson(filePath: string): Promise<{
  manifest: ManifestInfo;
  dependencies: Dependency[];
}> {
  const content = await fs.readFile(filePath, 'utf-8');
  const composer = JSON.parse(content) as ComposerJson;

  const manifest: ManifestInfo = {
    path: filePath,
    type: 'composer.json',
    ecosystem: 'composer',
    projectName: composer.name,
    projectVersion: composer.version,
  };

  const dependencies: Dependency[] = [];

  // Parse production dependencies
  if (composer.require) {
    for (const [name, version] of Object.entries(composer.require)) {
      // Skip PHP version constraint
      if (name === 'php' || name.startsWith('ext-')) {
        continue;
      }
      dependencies.push(createDependency(name, version, 'production'));
    }
  }

  // Parse dev dependencies
  if (composer['require-dev']) {
    for (const [name, version] of Object.entries(composer['require-dev'])) {
      if (name === 'php' || name.startsWith('ext-')) {
        continue;
      }
      dependencies.push(createDependency(name, version, 'development'));
    }
  }

  return { manifest, dependencies };
}

function createDependency(name: string, version: string, scope: DependencyScope): Dependency {
  return {
    name,
    version: parseNpmConstraint(version),
    scope,
    ecosystem: 'composer',
    isDirect: true,
  };
}
