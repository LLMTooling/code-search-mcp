/**
 * Parser for build.gradle and build.gradle.kts (Gradle) dependencies.
 */

import { promises as fs } from 'fs';
import type { Dependency, DependencyScope, ManifestInfo } from '../../types/dependency-analysis.js';
import { parseMavenConstraint } from '../version-utils.js';

/**
 * Parse build.gradle or build.gradle.kts file
 */
export async function parseBuildGradle(filePath: string): Promise<{
  manifest: ManifestInfo;
  dependencies: Dependency[];
}> {
  const content = await fs.readFile(filePath, 'utf-8');
  const isKotlin = filePath.endsWith('.kts');

  const manifest: ManifestInfo = {
    path: filePath,
    type: isKotlin ? 'build.gradle.kts' : 'build.gradle',
    ecosystem: 'gradle',
  };

  const dependencies: Dependency[] = [];

  // Extract dependencies block
  const depsMatch = /dependencies\s*\{([\s\S]*?)\n\s*\}/.exec(content);
  if (!depsMatch) {
    return { manifest, dependencies };
  }

  const depsContent = depsMatch[1];

  // Match dependency declarations
  // Supports formats like:
  // implementation 'group:name:version'
  // implementation("group:name:version")
  // implementation group: 'group', name: 'name', version: 'version'
  const depRegex = /(implementation|api|compileOnly|runtimeOnly|testImplementation|testRuntimeOnly|developmentOnly)\s*(?:\(|'|"|\s)([^)'"]+)/g;

  let match;
  while ((match = depRegex.exec(depsContent)) !== null) {
    const scope = mapGradleScope(match[1]);
    const depString = match[2].trim();

    const dep = parseGradleDependency(depString, scope);
    if (dep) {
      dependencies.push(dep);
    }
  }

  return { manifest, dependencies };
}

function parseGradleDependency(depString: string, scope: DependencyScope): Dependency | null {
  // Handle format: group:name:version
  const colonFormat = /^['"]?([^:'"]+):([^:'"]+):([^:'"]+)['"]?$/.exec(depString.trim());
  if (colonFormat) {
    const groupId = colonFormat[1];
    const artifactId = colonFormat[2];
    const version = colonFormat[3];

    return {
      name: `${groupId}:${artifactId}`,
      version: parseMavenConstraint(version),
      scope,
      ecosystem: 'gradle',
      isDirect: true,
    };
  }

  // Handle format: group: 'group', name: 'name', version: 'version'
  const groupMatch = /group:\s*['"]([^'"]+)['"]/.exec(depString);
  const nameMatch = /name:\s*['"]([^'"]+)['"]/.exec(depString);
  const versionMatch = /version:\s*['"]([^'"]+)['"]/.exec(depString);

  if (groupMatch && nameMatch) {
    const groupId = groupMatch[1];
    const artifactId = nameMatch[1];
    const version = versionMatch?.[1] ?? '+';

    return {
      name: `${groupId}:${artifactId}`,
      version: parseMavenConstraint(version),
      scope,
      ecosystem: 'gradle',
      isDirect: true,
    };
  }

  return null;
}

function mapGradleScope(configuration: string): DependencyScope {
  const lower = configuration.toLowerCase();

  if (lower.includes('test')) {
    return 'test';
  }
  if (lower === 'compileonly' || lower === 'developmentonly') {
    return 'development';
  }
  if (lower === 'api' || lower === 'implementation' || lower === 'runtimeonly') {
    return 'production';
  }

  return 'production';
}
