/**
 * Types for the stack detection system.
 * Based on STACK_DETECTION_SYSTEM.md specification.
 */

// ============================================================================
// Stack Registry (top-level)
// ============================================================================

export interface StackRegistry {
  /**
   * Map of stack id -> definition.
   * Example ids: "nodejs", "python", "rust", "go", "java-maven", "react", "nextjs".
   */
  stacks: Record<string, StackDefinition>;

  /**
   * Optional metadata about the registry itself.
   */
  version?: string;
  updatedAt?: string;
  description?: string;
}

// ============================================================================
// Stack Definition (core)
// ============================================================================

export type StackCategory = 'language' | 'framework' | 'runtime' | 'tooling';

export interface StackDefinition {
  /** Unique identifier, stable and machine-friendly. */
  id: string;

  /** Human-friendly name for display. */
  displayName: string;

  /**
   * High-level kind of stack.
   * - "language": primary language ecosystem
   * - "framework": higher-level framework
   * - "runtime": runtime/platform
   * - "tooling": build/test tools
   */
  category: StackCategory;

  /** Optional, short description of what this stack definition represents. */
  description?: string;

  /** Optional tags for filtering, grouping, or display. */
  tags?: string[];

  /**
   * Direct dependencies between stacks (semantic, not file-based).
   * e.g. React depends on Node.js, Django depends on Python, etc.
   */
  dependsOn?: string[];

  /**
   * Where to primarily search for indicators, relative to workspace root.
   * If empty/undefined, assume ["."]
   */
  searchRoots?: string[];

  /** Definitions of signals that indicate the presence of this stack. */
  indicators: StackIndicators;

  /** Detection scoring configuration. */
  detection: DetectionConfig;
}

// ============================================================================
// Indicator Sets and Scoring
// ============================================================================

export interface StackIndicators {
  /**
   * At least ONE of these must be satisfied for the stack
   * to be considered at all (hard gate).
   */
  requiredAny?: Indicator[];

  /**
   * ALL of these must be satisfied for the stack to be considered.
   * Use sparingly; only for very specific stacks.
   */
  requiredAll?: Indicator[];

  /**
   * These raise the score/confidence but are not required.
   * If only optional indicators are present and total score >= minScore,
   * the stack can still be detected.
   */
  optional?: Indicator[];

  /**
   * Other stack ids that should NOT be present at the same time.
   */
  conflictsWith?: string[];
}

export interface DetectionConfig {
  /**
   * Minimum score required to declare this stack "detected".
   * Score is the sum of `weight` for all satisfied indicators.
   */
  minScore: number;

  /**
   * Optional max score used for normalizing confidence (0..1).
   * If omitted, engine can derive `maxScore` from sum of all indicator weights.
   */
  maxScore?: number;

  /**
   * Optional "hard maximum" number of indicator matches to count.
   */
  maxIndicatorsCounted?: number;

  /**
   * Whether this stack should be considered "primary" if multiple stacks
   * of the same category are detected.
   */
  priority?: number;
}

// ============================================================================
// Indicator Types (detection signals)
// ============================================================================

export interface FileExistsIndicator {
  kind: 'fileExists';
  path: string;
  weight: number;
  /** If true, `path` is always interpreted relative to the workspace root. */
  rootRelative?: boolean;
}

export interface DirExistsIndicator {
  kind: 'dirExists';
  path: string;
  weight: number;
  rootRelative?: boolean;
}

export interface FilePatternExistsIndicator {
  kind: 'filePatternExists';
  glob: string;
  weight: number;
  rootRelative?: boolean;
  /** Max number of distinct matches to count. */
  maxMatches?: number;
}

export interface FileContainsIndicator {
  kind: 'fileContains';
  path: string;
  regex: string;
  weight: number;
  rootRelative?: boolean;
}

export interface PathPatternIndicator {
  kind: 'pathPattern';
  regex: string;
  weight: number;
}

export interface JsonFieldIndicator {
  kind: 'jsonField';
  path: string;
  jsonPointer: string;
  expectedValue?: string | number | boolean | string[];
  weight: number;
  rootRelative?: boolean;
}

export interface TomlFieldIndicator {
  kind: 'tomlField';
  path: string;
  tomlPath: string;
  expectedValue?: string | number | boolean | string[];
  weight: number;
  rootRelative?: boolean;
}

export type Indicator =
  | FileExistsIndicator
  | DirExistsIndicator
  | FilePatternExistsIndicator
  | FileContainsIndicator
  | PathPatternIndicator
  | JsonFieldIndicator
  | TomlFieldIndicator;

// ============================================================================
// Detection Engine Config
// ============================================================================

export type ScanMode = 'fast' | 'thorough';

export interface DetectionOptions {
  /** Which stacks to consider. If empty or undefined, consider all. */
  includeStacks?: string[];
  excludeStacks?: string[];

  /**
   * Max directory depth for scanning below the root.
   * Example: 0=root only, 1=root+immediate children, etc.
   */
  maxDepth?: number;

  /**
   * Scan mode:
   *   - "fast": only use cheap indicators (fileExists, dirExists at shallow depth).
   *   - "thorough": use all indicators, deeper traversal, content checks.
   */
  scanMode?: ScanMode;

  /** Global safety caps. */
  limits?: {
    /** Max number of files to inspect. */
    maxFiles?: number;
    /** Max bytes to read for any single file when doing content/JSON/TOML checks. */
    maxBytesPerFile?: number;
    /** Hard timeout in milliseconds for the entire detection run. */
    timeoutMs?: number;
  };
}

// ============================================================================
// Detection Results
// ============================================================================

export interface WorkspaceStackDetectionResult {
  /** Identifier of the workspace. */
  workspaceId: string;

  /** Absolute or canonical root path. */
  rootPath: string;

  /** All stacks that met their `minScore` threshold. */
  detectedStacks: DetectedStack[];

  /** Stacks that were considered but did NOT meet their threshold. */
  consideredStacks?: ConsideredStack[];

  /** Summary metadata. */
  summary?: {
    dominantLanguages?: string[];
    /** Most "significant" stack per category, based on priority & confidence. */
    primaryByCategory?: Record<StackCategory, string[]>;
  };
}

export interface DetectedStack {
  id: string;
  displayName: string;
  category: StackCategory;

  /** Final score (sum of indicator weights). */
  score: number;

  /** Normalized confidence in 0..1. */
  confidence: number;

  /**
   * The ids of stacks this stack depends on that were also detected.
   */
  resolvedDependencies?: string[];

  /** Indicators that contributed to the score (satisfied ones). */
  evidence: IndicatorEvidence[];
}

export interface ConsideredStack {
  id: string;
  displayName: string;
  category: StackCategory;
  score: number;
  confidence: number;
  evidence: IndicatorEvidence[];
}

export interface IndicatorEvidence {
  /** The kind of indicator that fired. */
  kind: Indicator['kind'];

  /** Reference to original indicator. */
  indicatorId?: string;

  /** File/directory path that matched (if applicable). */
  path?: string;

  /** Glob or regex involved. */
  glob?: string;
  regex?: string;

  /** For jsonField/tomlField indicators. */
  fieldPath?: string;
  fieldValue?: unknown;

  /** Weight this evidence contributed. */
  weight: number;

  /** Optional human-readable note. */
  note?: string;
}
