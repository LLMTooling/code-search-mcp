/**
 * Parser for Cargo.toml (Rust) dependencies.
 */

import { promises as fs } from 'fs';
import * as TOML from 'toml';
import type { Dependency, DependencyScope, ManifestInfo } from '../../types/dependency-analysis.js';
import { parseCargoConstraint } from '../version-utils.js';

interface CargoToml {
  package?: {
    name?: string;
    version?: string;
  };
  dependencies?: Record<string, string | DependencyDetails>;
  'dev-dependencies'?: Record<string, string | DependencyDetails>;
  'build-dependencies'?: Record<string, string | DependencyDetails>;
}

interface DependencyDetails {
  version?: string;
  features?: string[];
  optional?: boolean;
  git?: string;
  path?: string;
}

/**
 * Parse Cargo.toml file
 */
export async function parseCargoToml(filePath: string): Promise<{
  manifest: ManifestInfo;
  dependencies: Dependency[];
}> {
  const content = await fs.readFile(filePath, 'utf-8');
  const cargo = TOML.parse(content) as CargoToml;

  const manifest: ManifestInfo = {
    path: filePath,
    type: 'Cargo.toml',
    ecosystem: 'cargo',
    projectName: cargo.package?.name,
    projectVersion: cargo.package?.version,
  };

  const dependencies: Dependency[] = [];

  // Parse production dependencies
  if (cargo.dependencies) {
    for (const [name, details] of Object.entries(cargo.dependencies)) {
      dependencies.push(createDependency(name, details, 'production'));
    }
  }

  // Parse dev dependencies
  if (cargo['dev-dependencies']) {
    for (const [name, details] of Object.entries(cargo['dev-dependencies'])) {
      dependencies.push(createDependency(name, details, 'development'));
    }
  }

  // Parse build dependencies
  if (cargo['build-dependencies']) {
    for (const [name, details] of Object.entries(cargo['build-dependencies'])) {
      dependencies.push(createDependency(name, details, 'build'));
    }
  }

  return { manifest, dependencies };
}

function createDependency(
  name: string,
  details: string | DependencyDetails,
  scope: DependencyScope
): Dependency {
  if (typeof details === 'string') {
    return {
      name,
      version: parseCargoConstraint(details),
      scope,
      ecosystem: 'cargo',
      isDirect: true,
    };
  }

  const version = details.version ?? '*';
  const dep: Dependency = {
    name,
    version: parseCargoConstraint(version),
    scope: details.optional === true ? 'optional' : scope,
    ecosystem: 'cargo',
    isDirect: true,
  };

  if (details.features) {
    dep.features = details.features;
  }

  if (details.git) {
    dep.repository = details.git;
  }

  return dep;
}
