/**
 * Parser for pom.xml (Maven) dependencies.
 */

import { promises as fs } from 'fs';
import type { Dependency, DependencyScope, ManifestInfo } from '../../types/dependency-analysis.js';
import { parseMavenConstraint } from '../version-utils.js';

/**
 * Simple XML parser for Maven POM files
 * Note: This is a basic implementation. Production use should consider a full XML parser.
 */
export async function parsePomXml(filePath: string): Promise<{
  manifest: ManifestInfo;
  dependencies: Dependency[];
}> {
  const content = await fs.readFile(filePath, 'utf-8');

  const manifest: ManifestInfo = {
    path: filePath,
    type: 'pom.xml',
    ecosystem: 'maven',
    projectName: extractXmlValue(content, 'artifactId'),
    projectVersion: extractXmlValue(content, 'version'),
  };

  const dependencies: Dependency[] = [];

  // Extract dependencies section
  const depsMatch = /<dependencies>([\s\S]*?)<\/dependencies>/.exec(content);
  if (depsMatch) {
    const depsContent = depsMatch[1];
    const depMatches = depsContent.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g);

    for (const match of depMatches) {
      const depContent = match[1];
      const dep = parseMavenDependency(depContent);
      if (dep) {
        dependencies.push(dep);
      }
    }
  }

  return { manifest, dependencies };
}

function parseMavenDependency(depContent: string): Dependency | null {
  const groupId = extractXmlValue(depContent, 'groupId');
  const artifactId = extractXmlValue(depContent, 'artifactId');
  const version = extractXmlValue(depContent, 'version') ?? '[0,)';
  const scope = extractXmlValue(depContent, 'scope') ?? 'compile';
  const optional = extractXmlValue(depContent, 'optional') === 'true';

  if (!groupId || !artifactId) {
    return null;
  }

  const name = `${groupId}:${artifactId}`;
  const depScope = mapMavenScope(scope, optional);

  return {
    name,
    version: parseMavenConstraint(version),
    scope: depScope,
    ecosystem: 'maven',
    isDirect: true,
  };
}

function mapMavenScope(scope: string, optional: boolean): DependencyScope {
  if (optional) {
    return 'optional';
  }

  switch (scope.toLowerCase()) {
    case 'compile':
    case 'runtime':
      return 'production';
    case 'test':
      return 'test';
    case 'provided':
      return 'peer';
    default:
      return 'production';
  }
}

function extractXmlValue(content: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`);
  const match = regex.exec(content);
  return match?.[1]?.trim();
}
