/**
 * Parser for package.json (npm/Node.js) dependencies.
 */

import { promises as fs } from 'fs';
import type { Dependency, DependencyScope, ManifestInfo } from '../../types/dependency-analysis.js';
import { parseNpmConstraint } from '../version-utils.js';

interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/**
 * Parse package.json file
 */
export async function parsePackageJson(filePath: string): Promise<{
  manifest: ManifestInfo;
  dependencies: Dependency[];
}> {
  const content = await fs.readFile(filePath, 'utf-8');
  const pkg = JSON.parse(content) as PackageJson;

  const manifest: ManifestInfo = {
    path: filePath,
    type: 'package.json',
    ecosystem: 'npm',
    projectName: pkg.name,
    projectVersion: pkg.version,
  };

  const dependencies: Dependency[] = [];

  // Parse production dependencies
  if (pkg.dependencies) {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      dependencies.push(createDependency(name, version, 'production'));
    }
  }

  // Parse dev dependencies
  if (pkg.devDependencies) {
    for (const [name, version] of Object.entries(pkg.devDependencies)) {
      dependencies.push(createDependency(name, version, 'development'));
    }
  }

  // Parse peer dependencies
  if (pkg.peerDependencies) {
    for (const [name, version] of Object.entries(pkg.peerDependencies)) {
      dependencies.push(createDependency(name, version, 'peer'));
    }
  }

  // Parse optional dependencies
  if (pkg.optionalDependencies) {
    for (const [name, version] of Object.entries(pkg.optionalDependencies)) {
      dependencies.push(createDependency(name, version, 'optional'));
    }
  }

  return { manifest, dependencies };
}

function createDependency(name: string, version: string, scope: DependencyScope): Dependency {
  return {
    name,
    version: parseNpmConstraint(version),
    scope,
    ecosystem: 'npm',
    isDirect: true,
  };
}
