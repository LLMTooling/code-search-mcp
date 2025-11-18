/**
 * Integration tests for dependency analysis with real project data.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { DependencyAnalyzer } from '../../src/dependency-analysis/dependency-analyzer.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Dependency Analysis Integration Tests', () => {
  let analyzer: DependencyAnalyzer;

  beforeAll(() => {
    analyzer = new DependencyAnalyzer();
  });

  describe('Real Project Analysis - code-search-mcp', () => {
    it('should analyze the code-search-mcp project itself', async () => {
      const projectRoot = path.join(__dirname, '..', '..');
      const result = await analyzer.analyzeDependencies('test-workspace', projectRoot);

      // Verify workspace info
      expect(result.workspaceId).toBe('test-workspace');
      expect(result.workspacePath).toBe(projectRoot);

      // Should find package.json
      expect(result.manifests.length).toBeGreaterThan(0);
      const packageJson = result.manifests.find(m => m.type === 'package.json');
      expect(packageJson).toBeDefined();
      expect(packageJson?.ecosystem).toBe('npm');
      expect(packageJson?.projectName).toBe('code-search-mcp');

      // Should have dependencies
      expect(result.dependencies.length).toBeGreaterThan(0);

      // Verify expected dependencies
      const mcpSdk = result.dependencies.find(d => d.name === '@modelcontextprotocol/sdk');
      expect(mcpSdk).toBeDefined();
      expect(mcpSdk?.scope).toBe('production');
      expect(mcpSdk?.ecosystem).toBe('npm');

      const jest = result.dependencies.find(d => d.name === 'jest');
      expect(jest).toBeDefined();
      expect(jest?.scope).toBe('development');

      const typescript = result.dependencies.find(d => d.name === 'typescript');
      expect(typescript).toBeDefined();

      // Verify statistics
      expect(result.statistics.total).toBe(result.dependencies.length);
      expect(result.statistics.direct).toBeGreaterThan(0);
      expect(result.statistics.byEcosystem.npm).toBe(result.dependencies.length);
      expect(result.statistics.uniquePackages).toBeLessThanOrEqual(result.statistics.total);

      // Should have both production and dev dependencies
      expect(result.statistics.byScope.production).toBeGreaterThan(0);
      expect(result.statistics.byScope.development).toBeGreaterThan(0);

      // Verify insights
      expect(result.insights).toBeDefined();
      expect(Array.isArray(result.insights)).toBe(true);

      // Should have dev dependencies insight
      const devDepsInsight = result.insights.find(i => i.type === 'dev-dependencies');
      expect(devDepsInsight).toBeDefined();
      expect(devDepsInsight?.severity).toBe('info');
    });
  });

  describe('Statistics Calculation', () => {
    it('should calculate statistics correctly', async () => {
      const projectRoot = path.join(__dirname, '..', '..');
      const result = await analyzer.analyzeDependencies('stats-test', projectRoot);

      const stats = result.statistics;

      // Total should equal sum of all scopes
      const scopeSum = Object.values(stats.byScope).reduce((a, b) => a + b, 0);
      expect(stats.total).toBe(scopeSum);

      // Unique packages should be <= total
      expect(stats.uniquePackages).toBeLessThanOrEqual(stats.total);

      // Ecosystem counts should sum to total
      const ecosystemSum = Object.values(stats.byEcosystem).reduce((a, b) => a + b, 0);
      expect(ecosystemSum).toBe(stats.total);
    });
  });

  describe('Insights Generation', () => {
    it('should generate appropriate insights for the project', async () => {
      const projectRoot = path.join(__dirname, '..', '..');
      const result = await analyzer.analyzeDependencies('insights-test', projectRoot);

      expect(result.insights.length).toBeGreaterThan(0);

      // All insights should have required fields
      for (const insight of result.insights) {
        expect(insight.type).toBeDefined();
        expect(insight.severity).toMatch(/^(info|warning|error)$/);
        expect(insight.message).toBeDefined();
        expect(typeof insight.message).toBe('string');
        expect(insight.message.length).toBeGreaterThan(0);
      }

      // Check for dev dependencies insight
      const devDeps = result.insights.find(i => i.type === 'dev-dependencies');
      expect(devDeps).toBeDefined();
      expect(devDeps?.metadata?.count).toBeGreaterThan(0);
    });

    it('should identify wildcard versions if present', async () => {
      const projectRoot = path.join(__dirname, '..', '..');
      const result = await analyzer.analyzeDependencies('wildcard-test', projectRoot);

      // Check if any dependencies use wildcards
      const hasWildcards = result.dependencies.some(
        d => d.version.operator === '*' || d.version.normalized === '*'
      );

      if (hasWildcards) {
        const wildcardInsight = result.insights.find(i => i.type === 'wildcard-versions');
        expect(wildcardInsight).toBeDefined();
        expect(wildcardInsight?.severity).toBe('warning');
        expect(wildcardInsight?.dependencies).toBeDefined();
      }
    });
  });

  describe('Multiple Manifest Detection', () => {
    it('should handle projects with only package.json', async () => {
      const projectRoot = path.join(__dirname, '..', '..');
      const result = await analyzer.analyzeDependencies('single-manifest', projectRoot);

      // This project should only have package.json
      expect(result.manifests.length).toBeGreaterThanOrEqual(1);
      expect(result.manifests.some(m => m.type === 'package.json')).toBe(true);
    });
  });

  describe('Version Constraint Parsing', () => {
    it('should correctly parse version constraints from real dependencies', async () => {
      const projectRoot = path.join(__dirname, '..', '..');
      const result = await analyzer.analyzeDependencies('version-test', projectRoot);

      // Check various constraint types
      for (const dep of result.dependencies) {
        expect(dep.version).toBeDefined();
        expect(dep.version.raw).toBeDefined();
        expect(dep.version.normalized).toBeDefined();

        // Operator should be one of the known types
        if (dep.version.operator) {
          expect(['^', '~', '>=', '<=', '>', '<', '=', '==', '*', 'range']).toContain(
            dep.version.operator
          );
        }
      }

      // Should have some caret dependencies (common in npm)
      const caretDeps = result.dependencies.filter(d => d.version.operator === '^');
      expect(caretDeps.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle workspace with no manifests gracefully', async () => {
      const emptyDir = '/tmp';
      const result = await analyzer.analyzeDependencies('empty-workspace', emptyDir);

      expect(result.manifests.length).toBe(0);
      expect(result.dependencies.length).toBe(0);
      expect(result.statistics.total).toBe(0);
    });

    it('should handle invalid manifest paths gracefully', async () => {
      const nonExistentDir = '/path/that/does/not/exist';
      const result = await analyzer.analyzeDependencies('invalid-workspace', nonExistentDir);

      expect(result.manifests.length).toBe(0);
      expect(result.dependencies.length).toBe(0);
    });
  });
});
