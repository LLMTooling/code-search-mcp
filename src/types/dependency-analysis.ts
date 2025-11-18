/**
 * Type definitions for dependency analysis.
 */

/**
 * Supported dependency manifest types
 */
export type ManifestType =
  | 'package.json'
  | 'Cargo.toml'
  | 'pom.xml'
  | 'build.gradle'
  | 'build.gradle.kts'
  | 'requirements.txt'
  | 'pyproject.toml'
  | 'Pipfile'
  | 'go.mod'
  | 'Gemfile'
  | 'Gemfile.lock'
  | 'composer.json'
  | 'composer.lock';

/**
 * Ecosystem for package management
 */
export type Ecosystem =
  | 'npm'
  | 'cargo'
  | 'maven'
  | 'gradle'
  | 'pip'
  | 'pipenv'
  | 'go'
  | 'rubygems'
  | 'composer';

/**
 * Dependency scope/type
 */
export type DependencyScope =
  | 'production'
  | 'development'
  | 'optional'
  | 'peer'
  | 'build'
  | 'test';

/**
 * Version constraint information
 */
export interface VersionConstraint {
  /** Original constraint string from manifest */
  raw: string;
  /** Normalized version constraint */
  normalized: string;
  /** Operator (^, ~, >=, etc.) */
  operator?: string;
  /** Minimum version if applicable */
  minVersion?: string;
  /** Maximum version if applicable */
  maxVersion?: string;
}

/**
 * A single dependency entry
 */
export interface Dependency {
  /** Package/crate/module name */
  name: string;
  /** Version constraint */
  version: VersionConstraint;
  /** Dependency scope */
  scope: DependencyScope;
  /** Ecosystem this dependency belongs to */
  ecosystem: Ecosystem;
  /** Whether this is a direct dependency */
  isDirect: boolean;
  /** Optional features or extras */
  features?: string[];
  /** Repository URL if available */
  repository?: string;
  /** License information if available */
  license?: string;
}

/**
 * Manifest file information
 */
export interface ManifestInfo {
  /** Absolute path to the manifest file */
  path: string;
  /** Type of manifest */
  type: ManifestType;
  /** Associated ecosystem */
  ecosystem: Ecosystem;
  /** Project name from manifest */
  projectName?: string;
  /** Project version from manifest */
  projectVersion?: string;
}

/**
 * Dependency analysis result
 */
export interface DependencyAnalysisResult {
  /** Workspace ID */
  workspaceId: string;
  /** Workspace path */
  workspacePath: string;
  /** Detected manifest files */
  manifests: ManifestInfo[];
  /** All dependencies found */
  dependencies: Dependency[];
  /** Dependency statistics */
  statistics: DependencyStatistics;
  /** Insights and recommendations */
  insights: DependencyInsight[];
}

/**
 * Dependency statistics
 */
export interface DependencyStatistics {
  /** Total number of dependencies */
  total: number;
  /** Direct dependencies count */
  direct: number;
  /** Transitive dependencies count (if available) */
  transitive: number;
  /** Dependencies by scope */
  byScope: Record<DependencyScope, number>;
  /** Dependencies by ecosystem */
  byEcosystem: Record<Ecosystem, number>;
  /** Unique package names */
  uniquePackages: number;
}

/**
 * Insight severity levels
 */
export type InsightSeverity = 'info' | 'warning' | 'error';

/**
 * Dependency insight/recommendation
 */
export interface DependencyInsight {
  /** Insight type */
  type: string;
  /** Severity level */
  severity: InsightSeverity;
  /** Human-readable message */
  message: string;
  /** Related dependencies */
  dependencies?: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for dependency analysis
 */
export interface DependencyAnalysisOptions {
  /** Include transitive dependencies (requires package manager) */
  includeTransitive?: boolean;
  /** Analyze for outdated versions (requires network access) */
  checkOutdated?: boolean;
  /** Generate security insights */
  securityAnalysis?: boolean;
  /** Maximum depth for transitive dependencies */
  maxDepth?: number;
}
