1. Stack registry (top-level)

/**
 * The full set of stack definitions loaded at startup from stacks.yaml/json.
 */
type StackRegistry = {
  /**
   * Map of stack id -> definition.
   *
   * Example ids: "nodejs", "python", "rust", "go", "java-maven", "react", "nextjs".
   */
  stacks: Record<string, StackDefinition>;

  /**
   * Optional metadata about the registry itself.
   */
  version?: string;          // e.g. "2025.01"
  updatedAt?: string;        // ISO string
  description?: string;
};

2. Stack definition schema (core)
/**
 * A “stack” is a recognizable technology or layer in a codebase.
 * Examples: Node.js, Python, Rust (Cargo), Go (modules), Java (Maven), React, Next.js, Django.
 */
type StackDefinition = {
  /** Unique identifier, stable and machine-friendly. */
  id: string; // "nodejs", "python", "rust", "go", "java-maven", "react", "nextjs", ...

  /** Human-friendly name for display. */
  displayName: string; // "Node.js", "Python (pyproject)", "Rust (Cargo)", ...

  /**
   * High-level kind of stack.
   *
   * "language"   – primary language ecosystem (Node.js, Python, Rust, Go, Java...)
   * "framework"  – higher-level framework (React, Next.js, Django, Spring Boot...)
   * "runtime"    – runtime/platform (Node.js runtime, Deno, .NET runtime, JVM, browser-only)
   * "tooling"    – build/test tools (Webpack, Vite, Jest, ESLint, Poetry, pnpm, Maven...)
   */
  category: "language" | "framework" | "runtime" | "tooling";

  /**
   * Optional, short description of what this stack definition represents.
   */
  description?: string;

  /**
   * Optional tags for filtering, grouping, or display.
   * Examples: ["backend", "frontend", "cli", "web", "mobile", "monorepo"]
   */
  tags?: string[];

  /**
   * Direct dependencies between stacks (semantic, not file-based).
   * e.g. React depends on Node.js, Django depends on Python, etc.
   */
  dependsOn?: string[];    // list of stack ids this stack logically sits on

  /**
   * Where to primarily search for indicators, relative to workspace root.
   * If empty/undefined, assume ["."]
   */
  searchRoots?: string[];  // e.g. [".", "src", "backend", "frontend"]

  /**
   * Definitions of signals that indicate the presence of this stack.
   */
  indicators: StackIndicators;

  /**
   * Detection scoring configuration.
   */
  detection: DetectionConfig;
};

3. Indicator sets and scoring
/**
 * Indicator groups for a given stack.
 */
type StackIndicators = {
  /**
   * At least ONE of these must be satisfied for the stack
   * to be considered at all (hard gate).
   *
   * Example: `package.json` for Node.js, `pyproject.toml` or `setup.py` for Python,
   *          `Cargo.toml` for Rust, `go.mod` for Go, `pom.xml` for Maven.
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
   * (You can still allow the engine to override conflicts if both strongly detected.)
   */
  conflictsWith?: string[];
};

/**
 * Scoring & thresholds for deciding whether a stack is present.
 */
type DetectionConfig = {
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
   * Optional “hard maximum” number of indicator matches to count.
   * Anything beyond this may be ignored or capped to avoid runaway scoring in huge repos.
   */
  maxIndicatorsCounted?: number;

  /**
   * Whether this stack should be considered "primary" if multiple stacks
   * of the same category are detected (e.g., choose one primary language).
   */
  priority?: number; // higher = more important
};

4. Indicator types (detection signals)

These are the “building blocks” for your heuristics.

/**
 * All possible indicator types.
 * Each one contributes `weight` points to the stack’s score when satisfied.
 */
type Indicator =
  | FileExistsIndicator
  | DirExistsIndicator
  | FilePatternExistsIndicator
  | FileContainsIndicator
  | PathPatternIndicator
  | JsonFieldIndicator
  | TomlFieldIndicator;

/**
 * Simple file presence: path relative to search root.
 * Example: "package.json", "pyproject.toml", "Cargo.toml", "go.mod".
 */
type FileExistsIndicator = {
  kind: "fileExists";
  path: string;
  /** How strong this signal is. Big ticket files get high weights. */
  weight: number;
  /** If true, `path` is always interpreted relative to the workspace root, not searchRoots. */
  rootRelative?: boolean;
};

/**
 * Directory presence: path relative to search root.
 * Example: "src/main/java", "src", "tests".
 */
type DirExistsIndicator = {
  kind: "dirExists";
  path: string;
  weight: number;
  rootRelative?: boolean;
};

/**
 * File pattern presence: glob relative to search root.
 * Example: "**/*.go", "src/**/*.rs", "config/*.js".
 */
type FilePatternExistsIndicator = {
  kind: "filePatternExists";
  glob: string;
  weight: number;
  rootRelative?: boolean;
  /**
   * Max number of distinct matches to count;
   * beyond this, weight contribution can be capped.
   */
  maxMatches?: number;
};

/**
 * File content regex: check whether a specific file at `path`
 * contains text matching `regex`.
 *
 * Example:
 *   - pyproject.toml contains "\\[project\\]" (PEP 621 metadata).
 *   - package.json contains "\"dependencies\"".
 */
type FileContainsIndicator = {
  kind: "fileContains";
  path: string;
  regex: string;
  weight: number;
  rootRelative?: boolean;
};

/**
 * Path pattern: any file or directory path in the workspace
 * that matches a regex.
 *
 * Example:
 *   - regex: "src/main/java" for Maven-like structure.
 *   - regex: ".*\\.csproj$" for .NET projects.
 */
type PathPatternIndicator = {
  kind: "pathPattern";
  regex: string;
  weight: number;
};

/**
 * JSON field presence in a file.
 * Useful for package.json, tsconfig.json, composer.json, etc.
 *
 * The engine can parse the file as JSON and look up the path.
 */
type JsonFieldIndicator = {
  kind: "jsonField";
  path: string;          // file path (e.g., "package.json")
  jsonPointer: string;   // JSON pointer or dot path, e.g. "/dependencies/react"
  /**
   * Expected value behavior:
   *   - if `expectedValue` is undefined → just check the field exists.
   *   - if defined → check equality or pattern depending on type.
   */
  expectedValue?: string | number | boolean | string[];
  weight: number;
  rootRelative?: boolean;
};

/**
 * TOML field presence in a file, e.g. pyproject.toml, Cargo.toml.
 *
 * pyproject.toml is the standardized place for modern Python packaging metadata, per PEP 518/621. :contentReference[oaicite:0]{index=0}
 * Cargo.toml is the manifest file for Rust packages and workspaces. :contentReference[oaicite:1]{index=1}
 */
type TomlFieldIndicator = {
  kind: "tomlField";
  path: string;          // e.g. "pyproject.toml", "Cargo.toml"
  tomlPath: string;      // TOML dotted key path, e.g. "project.name", "build-system.requires"
  expectedValue?: string | number | boolean | string[];
  weight: number;
  rootRelative?: boolean;
};

5. Detection engine config (multi-stack, multi-workspace)

To make it explicit that you can detect multiple stacks per workspace, define engine options and results like this.

5.1 Detection options
/**
 * Options for a single detection run on a workspace.
 */
type DetectionOptions = {
  /**
   * Which stacks to consider. If empty or undefined, consider all from the registry.
   */
  includeStacks?: string[];  // whitelist by stack id
  excludeStacks?: string[];  // blacklist by stack id

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
  scanMode?: "fast" | "thorough";

  /**
   * Global safety caps.
   */
  limits?: {
    /**
     * Max number of files to inspect.
     */
    maxFiles?: number;

    /**
     * Max bytes to read for any single file when doing content/JSON/TOML checks.
     */
    maxBytesPerFile?: number;

    /**
     * Hard timeout in milliseconds for the entire detection run.
     */
    timeoutMs?: number;
  };
};

5.2 Detection result (multiple stacks)
/**
 * The result of running stack detection on a single workspace.
 * A workspace can have MANY stacks detected at once (monorepos, polyglot projects).
 */
type WorkspaceStackDetectionResult = {
  /** Identifier of the workspace (from your MCP workspace manager). */
  workspaceId: string;

  /** Absolute or canonical root path (sanitized if needed). */
  rootPath: string;

  /** All stacks that met their `minScore` threshold. */
  detectedStacks: DetectedStack[];

  /** Stacks that were considered but did NOT meet their threshold, with partial scores. */
  consideredStacks?: ConsideredStack[];

  /** Summary metadata that the LLM can use to understand the shape of the repo. */
  summary?: {
    dominantLanguages?: string[]; // e.g. ["typescript", "python"]
    /** Most “significant” stack per category, based on priority & confidence. */
    primaryByCategory?: Record<
      "language" | "framework" | "runtime" | "tooling",
      string[]  // stack ids, sorted by priority/confidence
    >;
  };
};

/**
 * A stack that crossed the minScore threshold.
 */
type DetectedStack = {
  id: string;
  displayName: string;
  category: "language" | "framework" | "runtime" | "tooling";

  /** Final score (sum of indicator weights). */
  score: number;

  /** Normalized confidence in 0..1, derived from score and `maxScore`. */
  confidence: number;

  /**
   * The ids of stacks this stack depends on that were also detected,
   * resolved from StackDefinition.dependsOn.
   */
  resolvedDependencies?: string[];

  /**
   * Indicators that contributed to the score (satisfied ones).
   * Every entry is a normalized record; you can omit raw regex/glob if you want.
   */
  evidence: IndicatorEvidence[];
};

/**
 * A stack that was evaluated but did not meet `minScore`.
 * Useful for debugging or “near miss” information.
 */
type ConsideredStack = {
  id: string;
  displayName: string;
  category: "language" | "framework" | "runtime" | "tooling";
  score: number;
  confidence: number;
  evidence: IndicatorEvidence[];
};

5.3 Evidence records
/**
 * Evidence that a particular indicator fired.
 * This is what the LLM uses to understand WHY a stack was detected.
 */
type IndicatorEvidence = {
  /**
   * The kind of indicator that fired (same set as `Indicator["kind"]`).
   */
  kind: Indicator["kind"];

  /**
   * Reference to original indicator if you include ids in your registry.
   */
  indicatorId?: string;

  /**
   * File/directory path that matched (if applicable), relative to workspace root.
   */
  path?: string;

  /**
   * Glob or regex involved (optional; you may trim them for brevity).
   */
  glob?: string;
  regex?: string;

  /**
   * For jsonField/tomlField indicators, the resolved key path and value.
   */
  fieldPath?: string;        // jsonPointer or tomlPath
  fieldValue?: unknown;      // captured value (trimmed/sanitized)

  /** Weight this piece of evidence contributed to the score. */
  weight: number;

  /**
   * Optional human-readable note; can be generated at detection time,
   * like "Found pyproject.toml with [project] table".
   */
  note?: string;
};


I started a comprehensive example database for you to work off of / build upon - stacks.json.example