/**
 * Parser for Python dependencies (requirements.txt, pyproject.toml, Pipfile).
 */

import { promises as fs } from 'fs';
import * as TOML from 'toml';
import type { Dependency, ManifestInfo } from '../../types/dependency-analysis.js';
import { parsePipConstraint } from '../version-utils.js';

/**
 * Parse requirements.txt file
 */
export async function parseRequirementsTxt(filePath: string): Promise<{
  manifest: ManifestInfo;
  dependencies: Dependency[];
}> {
  const content = await fs.readFile(filePath, 'utf-8');

  const manifest: ManifestInfo = {
    path: filePath,
    type: 'requirements.txt',
    ecosystem: 'pip',
  };

  const dependencies: Dependency[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) {
      continue;
    }

    const dep = parseRequirementLine(trimmed);
    if (dep) {
      dependencies.push(dep);
    }
  }

  return { manifest, dependencies };
}

/**
 * Parse pyproject.toml file
 */
export async function parsePyprojectToml(filePath: string): Promise<{
  manifest: ManifestInfo;
  dependencies: Dependency[];
}> {
  const content = await fs.readFile(filePath, 'utf-8');
  const pyproject = TOML.parse(content) as PyprojectToml;

  const manifest: ManifestInfo = {
    path: filePath,
    type: 'pyproject.toml',
    ecosystem: 'pip',
    projectName: pyproject.project?.name ?? pyproject.tool?.poetry?.name,
    projectVersion: pyproject.project?.version ?? pyproject.tool?.poetry?.version,
  };

  const dependencies: Dependency[] = [];

  // PEP 621 format (project.dependencies)
  if (pyproject.project?.dependencies) {
    for (const dep of pyproject.project.dependencies) {
      const parsed = parseRequirementLine(dep);
      if (parsed) {
        dependencies.push(parsed);
      }
    }
  }

  // PEP 621 optional dependencies
  if (pyproject.project?.['optional-dependencies']) {
    for (const [group, deps] of Object.entries(pyproject.project['optional-dependencies'])) {
      for (const dep of deps) {
        const parsed = parseRequirementLine(dep);
        if (parsed) {
          parsed.scope = group === 'dev' || group === 'test' ? 'development' : 'optional';
          dependencies.push(parsed);
        }
      }
    }
  }

  // Poetry format
  if (pyproject.tool?.poetry?.dependencies) {
    for (const [name, version] of Object.entries(pyproject.tool.poetry.dependencies)) {
      if (name === 'python') continue; // Skip Python version constraint

      const versionStr = typeof version === 'string' ? version : (version).version ?? '*';
      dependencies.push({
        name,
        version: parsePipConstraint(versionStr),
        scope: 'production',
        ecosystem: 'pip',
        isDirect: true,
      });
    }
  }

  // Poetry dev dependencies
  if (pyproject.tool?.poetry?.['dev-dependencies']) {
    for (const [name, version] of Object.entries(pyproject.tool.poetry['dev-dependencies'])) {
      const versionStr = typeof version === 'string' ? version : '*';
      dependencies.push({
        name,
        version: parsePipConstraint(versionStr),
        scope: 'development',
        ecosystem: 'pip',
        isDirect: true,
      });
    }
  }

  return { manifest, dependencies };
}

/**
 * Parse Pipfile
 */
export async function parsePipfile(filePath: string): Promise<{
  manifest: ManifestInfo;
  dependencies: Dependency[];
}> {
  const content = await fs.readFile(filePath, 'utf-8');
  const pipfile = TOML.parse(content) as Pipfile;

  const manifest: ManifestInfo = {
    path: filePath,
    type: 'Pipfile',
    ecosystem: 'pipenv',
  };

  const dependencies: Dependency[] = [];

  // Production dependencies
  if (pipfile.packages) {
    for (const [name, version] of Object.entries(pipfile.packages)) {
      const versionStr = typeof version === 'string' ? version : (version).version ?? '*';
      dependencies.push({
        name,
        version: parsePipConstraint(versionStr),
        scope: 'production',
        ecosystem: 'pipenv',
        isDirect: true,
      });
    }
  }

  // Dev dependencies
  if (pipfile['dev-packages']) {
    for (const [name, version] of Object.entries(pipfile['dev-packages'])) {
      const versionStr = typeof version === 'string' ? version : '*';
      dependencies.push({
        name,
        version: parsePipConstraint(versionStr),
        scope: 'development',
        ecosystem: 'pipenv',
        isDirect: true,
      });
    }
  }

  return { manifest, dependencies };
}

function parseRequirementLine(line: string): Dependency | null {
  // Handle extras: package[extra1,extra2]>=1.0.0
  const extrasMatch = /^([a-zA-Z0-9_-]+)(\[[^\]]+\])?(.*)?$/.exec(line);
  if (!extrasMatch) {
    return null;
  }

  const name = extrasMatch[1];
  const extras = extrasMatch[2];
  const versionPart = extrasMatch[3]?.trim() ?? '';

  const dep: Dependency = {
    name,
    version: parsePipConstraint(versionPart),
    scope: 'production',
    ecosystem: 'pip',
    isDirect: true,
  };

  if (extras) {
    dep.features = extras
      .slice(1, -1)
      .split(',')
      .map(e => e.trim());
  }

  return dep;
}

interface PyprojectToml {
  project?: {
    name?: string;
    version?: string;
    dependencies?: string[];
    'optional-dependencies'?: Record<string, string[]>;
  };
  tool?: {
    poetry?: {
      name?: string;
      version?: string;
      dependencies?: Record<string, string | PoetryDependency>;
      'dev-dependencies'?: Record<string, string>;
    };
  };
}

interface PoetryDependency {
  version?: string;
  extras?: string[];
  optional?: boolean;
}

interface Pipfile {
  packages?: Record<string, string | PipfileDependency>;
  'dev-packages'?: Record<string, string>;
}

interface PipfileDependency {
  version?: string;
  extras?: string[];
}
