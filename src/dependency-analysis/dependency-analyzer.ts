/**
 * Core dependency analysis service.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type {
  DependencyAnalysisResult,
  DependencyAnalysisOptions,
  ManifestInfo,
  Dependency,
  DependencyStatistics,
  DependencyInsight,
  DependencyScope,
  Ecosystem,
} from '../types/dependency-analysis.js';
import { parsePackageJson } from './parsers/package-json.js';
import { parseCargoToml } from './parsers/cargo-toml.js';
import { parsePomXml } from './parsers/pom-xml.js';
import { parseBuildGradle } from './parsers/build-gradle.js';
import { parseRequirementsTxt, parsePyprojectToml, parsePipfile } from './parsers/python.js';
import { parseGoMod } from './parsers/go-mod.js';
import { parseGemfile } from './parsers/gemfile.js';
import { parseComposerJson } from './parsers/composer-json.js';

export class DependencyAnalyzer {
  /**
   * Analyze dependencies in a workspace
   */
  async analyzeDependencies(
    workspaceId: string,
    workspacePath: string,
    options: DependencyAnalysisOptions = {}
  ): Promise<DependencyAnalysisResult> {
    // Find all manifest files
    const manifestPaths = await this.findManifests(workspacePath);

    // Parse all manifests and collect dependencies
    const allDependencies: Dependency[] = [];
    const manifests: ManifestInfo[] = [];

    for (const manifestInfo of manifestPaths) {
      try {
        const result = await this.parseManifest(manifestInfo.path);
        if (result) {
          allDependencies.push(...result.dependencies);
          manifests.push(result.manifest);
        }
      } catch (error) {
        console.error(`Failed to parse ${manifestInfo.path}:`, error);
      }
    }

    // Calculate statistics
    const statistics = this.calculateStatistics(allDependencies);

    // Generate insights
    const insights = this.generateInsights(allDependencies, manifests, options);

    return {
      workspaceId,
      workspacePath,
      manifests,
      dependencies: allDependencies,
      statistics,
      insights,
    };
  }

  /**
   * Find all manifest files in a workspace
   */
  private async findManifests(workspacePath: string): Promise<ManifestInfo[]> {
    const manifests: ManifestInfo[] = [];

    const manifestFiles = [
      { name: 'package.json', type: 'package.json' as const, ecosystem: 'npm' as const },
      { name: 'Cargo.toml', type: 'Cargo.toml' as const, ecosystem: 'cargo' as const },
      { name: 'pom.xml', type: 'pom.xml' as const, ecosystem: 'maven' as const },
      { name: 'build.gradle', type: 'build.gradle' as const, ecosystem: 'gradle' as const },
      { name: 'build.gradle.kts', type: 'build.gradle.kts' as const, ecosystem: 'gradle' as const },
      { name: 'requirements.txt', type: 'requirements.txt' as const, ecosystem: 'pip' as const },
      { name: 'pyproject.toml', type: 'pyproject.toml' as const, ecosystem: 'pip' as const },
      { name: 'Pipfile', type: 'Pipfile' as const, ecosystem: 'pipenv' as const },
      { name: 'go.mod', type: 'go.mod' as const, ecosystem: 'go' as const },
      { name: 'Gemfile', type: 'Gemfile' as const, ecosystem: 'rubygems' as const },
      { name: 'composer.json', type: 'composer.json' as const, ecosystem: 'composer' as const },
    ];

    for (const { name, type, ecosystem } of manifestFiles) {
      const manifestPath = path.join(workspacePath, name);
      try {
        await fs.access(manifestPath);
        manifests.push({
          path: manifestPath,
          type,
          ecosystem,
        });
      } catch {
        // File doesn't exist, skip
      }
    }

    return manifests;
  }

  /**
   * Parse a specific manifest file
   */
  private async parseManifest(
    manifestPath: string
  ): Promise<{ manifest: ManifestInfo; dependencies: Dependency[] } | null> {
    const basename = path.basename(manifestPath);

    try {
      switch (basename) {
        case 'package.json':
          return await parsePackageJson(manifestPath);
        case 'Cargo.toml':
          return await parseCargoToml(manifestPath);
        case 'pom.xml':
          return await parsePomXml(manifestPath);
        case 'build.gradle':
        case 'build.gradle.kts':
          return await parseBuildGradle(manifestPath);
        case 'requirements.txt':
          return await parseRequirementsTxt(manifestPath);
        case 'pyproject.toml':
          return await parsePyprojectToml(manifestPath);
        case 'Pipfile':
          return await parsePipfile(manifestPath);
        case 'go.mod':
          return await parseGoMod(manifestPath);
        case 'Gemfile':
          return await parseGemfile(manifestPath);
        case 'composer.json':
          return await parseComposerJson(manifestPath);
        default:
          return null;
      }
    } catch (error) {
      console.error(`Error parsing ${manifestPath}:`, error);
      return null;
    }
  }

  /**
   * Calculate dependency statistics
   */
  private calculateStatistics(dependencies: Dependency[]): DependencyStatistics {
    const byScope: Record<DependencyScope, number> = {
      production: 0,
      development: 0,
      optional: 0,
      peer: 0,
      build: 0,
      test: 0,
    };

    const byEcosystem: Partial<Record<Ecosystem, number>> = {};
    const uniquePackages = new Set<string>();

    let direct = 0;
    let transitive = 0;

    for (const dep of dependencies) {
      byScope[dep.scope]++;

      byEcosystem[dep.ecosystem] = (byEcosystem[dep.ecosystem] ?? 0) + 1;

      uniquePackages.add(dep.name);

      if (dep.isDirect) {
        direct++;
      } else {
        transitive++;
      }
    }

    return {
      total: dependencies.length,
      direct,
      transitive,
      byScope,
      byEcosystem: byEcosystem as Record<Ecosystem, number>,
      uniquePackages: uniquePackages.size,
    };
  }

  /**
   * Generate insights and recommendations
   */
  private generateInsights(
    dependencies: Dependency[],
    manifests: ManifestInfo[],
    _options: DependencyAnalysisOptions
  ): DependencyInsight[] {
    const insights: DependencyInsight[] = [];

    // Insight: Multiple ecosystems detected
    const ecosystems = new Set(manifests.map(m => m.ecosystem));
    if (ecosystems.size > 1) {
      insights.push({
        type: 'multi-ecosystem',
        severity: 'info',
        message: `Project uses multiple package managers: ${Array.from(ecosystems).join(', ')}`,
        metadata: {
          ecosystems: Array.from(ecosystems),
        },
      });
    }

    // Insight: Duplicate dependencies across ecosystems
    const nameGroups = new Map<string, Dependency[]>();
    for (const dep of dependencies) {
      const existing = nameGroups.get(dep.name) ?? [];
      existing.push(dep);
      nameGroups.set(dep.name, existing);
    }

    const duplicates = Array.from(nameGroups.entries()).filter(([_, deps]) => deps.length > 1);
    if (duplicates.length > 0) {
      insights.push({
        type: 'duplicate-dependencies',
        severity: 'warning',
        message: `Found ${String(duplicates.length)} dependencies declared multiple times`,
        dependencies: duplicates.map(([name]) => name),
      });
    }

    // Insight: Wildcard versions
    const wildcardDeps = dependencies.filter(
      dep => dep.version.operator === '*' || dep.version.normalized === '*'
    );
    if (wildcardDeps.length > 0) {
      insights.push({
        type: 'wildcard-versions',
        severity: 'warning',
        message: `${String(wildcardDeps.length)} dependencies use wildcard or unspecified versions`,
        dependencies: wildcardDeps.map(d => d.name),
      });
    }

    // Insight: Large number of dependencies
    if (dependencies.length > 100) {
      insights.push({
        type: 'large-dependency-count',
        severity: 'info',
        message: `Project has ${String(dependencies.length)} dependencies. Consider reviewing for unused packages.`,
        metadata: {
          count: dependencies.length,
        },
      });
    }

    // Insight: Dev dependencies count
    const devDeps = dependencies.filter(d => d.scope === 'development' || d.scope === 'test');
    if (devDeps.length > 0) {
      insights.push({
        type: 'dev-dependencies',
        severity: 'info',
        message: `Project has ${String(devDeps.length)} development/test dependencies`,
        metadata: {
          count: devDeps.length,
        },
      });
    }

    return insights;
  }
}
