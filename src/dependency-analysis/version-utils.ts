/**
 * Version comparison and constraint parsing utilities.
 */

import type { VersionConstraint } from '../types/dependency-analysis.js';

/**
 * Semantic version parts
 */
interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

/**
 * Parse a semantic version string
 */
export function parseSemanticVersion(version: string): SemanticVersion | null {
  // Remove leading 'v' if present
  const cleaned = version.replace(/^v/, '');

  // Match semantic version pattern
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/.exec(cleaned);

  if (!match) {
    return null;
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
    build: match[5],
  };
}

/**
 * Compare two semantic versions
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const versionA = parseSemanticVersion(a);
  const versionB = parseSemanticVersion(b);

  if (!versionA || !versionB) {
    // Fallback to string comparison if not semantic versions
    return a.localeCompare(b);
  }

  // Compare major.minor.patch
  if (versionA.major !== versionB.major) {
    return versionA.major - versionB.major;
  }
  if (versionA.minor !== versionB.minor) {
    return versionA.minor - versionB.minor;
  }
  if (versionA.patch !== versionB.patch) {
    return versionA.patch - versionB.patch;
  }

  // Handle prerelease versions
  if (versionA.prerelease && !versionB.prerelease) {
    return -1; // Prerelease is lower than release
  }
  if (!versionA.prerelease && versionB.prerelease) {
    return 1;
  }
  if (versionA.prerelease && versionB.prerelease) {
    return versionA.prerelease.localeCompare(versionB.prerelease);
  }

  return 0;
}

/**
 * Parse an npm-style version constraint
 */
export function parseNpmConstraint(constraint: string): VersionConstraint {
  const trimmed = constraint.trim();

  // Handle special cases
  if (trimmed === '*' || trimmed === 'latest' || trimmed === '') {
    return {
      raw: constraint,
      normalized: '*',
      operator: '*',
    };
  }

  // Caret range (^1.2.3 or ^1.2)
  const caretMatch = /^\^(\d+(?:\.\d+(?:\.\d+)?)?(?:-[a-zA-Z0-9.-]+)?)$/.exec(trimmed);
  if (caretMatch) {
    const version = caretMatch[1];
    // Normalize to 3 parts for semantic version parsing
    const normalizedVersion = version.includes('.')
      ? (version.split('.').length === 2 ? `${version}.0` : version)
      : `${version}.0.0`;
    const parsed = parseSemanticVersion(normalizedVersion);
    if (parsed) {
      return {
        raw: constraint,
        normalized: `^${version}`,
        operator: '^',
        minVersion: version,
        maxVersion: `${String(parsed.major + 1)}.0.0`,
      };
    }
  }

  // Tilde range (~1.2.3 or ~1.2)
  const tildeMatch = /^~(\d+(?:\.\d+(?:\.\d+)?)?(?:-[a-zA-Z0-9.-]+)?)$/.exec(trimmed);
  if (tildeMatch) {
    const version = tildeMatch[1];
    // Normalize to 3 parts for semantic version parsing
    const normalizedVersion = version.includes('.')
      ? (version.split('.').length === 2 ? `${version}.0` : version)
      : `${version}.0.0`;
    const parsed = parseSemanticVersion(normalizedVersion);
    if (parsed) {
      return {
        raw: constraint,
        normalized: `~${version}`,
        operator: '~',
        minVersion: version,
        maxVersion: `${String(parsed.major)}.${String(parsed.minor + 1)}.0`,
      };
    }
  }

  // Exact version (1.2.3 or 1.2)
  const exactMatch = /^(\d+(?:\.\d+(?:\.\d+)?)?(?:-[a-zA-Z0-9.-]+)?)$/.exec(trimmed);
  if (exactMatch) {
    const version = exactMatch[1];
    return {
      raw: constraint,
      normalized: version,
      operator: '=',
      minVersion: version,
      maxVersion: version,
    };
  }

  // Range operators (>=, <=, >, <)
  const rangeMatch = /^(>=?|<=?|=)(\d+(?:\.\d+(?:\.\d+)?)?(?:-[a-zA-Z0-9.-]+)?)$/.exec(trimmed);
  if (rangeMatch) {
    const operator = rangeMatch[1];
    const version = rangeMatch[2];
    return {
      raw: constraint,
      normalized: `${operator}${version}`,
      operator,
      minVersion: operator.startsWith('>') ? version : undefined,
      maxVersion: operator.startsWith('<') ? version : undefined,
    };
  }

  // Fallback for unparseable constraints
  return {
    raw: constraint,
    normalized: trimmed,
  };
}

/**
 * Parse a Cargo (Rust) version constraint
 */
export function parseCargoConstraint(constraint: string): VersionConstraint {
  const trimmed = constraint.trim();

  // Wildcard
  if (trimmed === '*') {
    return {
      raw: constraint,
      normalized: '*',
      operator: '*',
    };
  }

  // Caret (default in Cargo) - supports 1.0, 1.0.0, or ^1.0.0
  const caretMatch = /^(?:\^)?(\d+(?:\.\d+(?:\.\d+)?)?)$/.exec(trimmed);
  if (caretMatch) {
    const version = caretMatch[1];
    return {
      raw: constraint,
      normalized: `^${version}`,
      operator: '^',
      minVersion: version,
    };
  }

  // Tilde
  const tildeMatch = /^~(\d+(?:\.\d+(?:\.\d+)?)?)$/.exec(trimmed);
  if (tildeMatch) {
    const version = tildeMatch[1];
    return {
      raw: constraint,
      normalized: `~${version}`,
      operator: '~',
      minVersion: version,
    };
  }

  // Comparison operators
  const compMatch = /^(>=?|<=?|=)(\d+\.\d+\.\d+)$/.exec(trimmed);
  if (compMatch) {
    const operator = compMatch[1];
    const version = compMatch[2];
    return {
      raw: constraint,
      normalized: `${operator}${version}`,
      operator,
      minVersion: operator.startsWith('>') ? version : undefined,
      maxVersion: operator.startsWith('<') ? version : undefined,
    };
  }

  return {
    raw: constraint,
    normalized: trimmed,
  };
}

/**
 * Parse a Python (pip) version constraint
 */
export function parsePipConstraint(constraint: string): VersionConstraint {
  const trimmed = constraint.trim();

  // Wildcard or empty
  if (!trimmed || trimmed === '*') {
    return {
      raw: constraint,
      normalized: '*',
      operator: '*',
    };
  }

  // Comparison operators (==, !=, >=, <=, >, <, ~=)
  const compMatch = /^(==|!=|>=|<=|>|<|~=)(\d+(?:\.\d+)*(?:[a-zA-Z0-9.-]+)?)$/.exec(trimmed);
  if (compMatch) {
    const operator = compMatch[1];
    const version = compMatch[2];
    return {
      raw: constraint,
      normalized: `${operator}${version}`,
      operator,
      minVersion: operator.startsWith('>') || operator === '~=' || operator === '==' ? version : undefined,
      maxVersion: operator.startsWith('<') || operator === '==' ? version : undefined,
    };
  }

  // Just a version number (treat as ==)
  if (/^\d+(?:\.\d+)*$/.test(trimmed)) {
    return {
      raw: constraint,
      normalized: `==${trimmed}`,
      operator: '==',
      minVersion: trimmed,
      maxVersion: trimmed,
    };
  }

  return {
    raw: constraint,
    normalized: trimmed,
  };
}

/**
 * Parse a Maven version constraint
 */
export function parseMavenConstraint(constraint: string): VersionConstraint {
  const trimmed = constraint.trim();

  // Range notation [1.0,2.0) or [1.0,2.0]
  const rangeMatch = /^([[(])([^,)\]]+)?,?([^,)\]]+)?([)\]])$/.exec(trimmed);
  if (rangeMatch) {
    const leftBracket = rangeMatch[1];
    const minVer = rangeMatch[2];
    const maxVer = rangeMatch[3];
    const rightBracket = rangeMatch[4];

    return {
      raw: constraint,
      normalized: trimmed,
      operator: 'range',
      minVersion: minVer || undefined,
      maxVersion: maxVer || undefined,
      metadata: {
        includeMin: leftBracket === '[',
        includeMax: rightBracket === ']',
      },
    };
  }

  // Simple version
  if (/^\d+(?:\.\d+)*$/.test(trimmed)) {
    return {
      raw: constraint,
      normalized: trimmed,
      operator: '=',
      minVersion: trimmed,
      maxVersion: trimmed,
    };
  }

  return {
    raw: constraint,
    normalized: trimmed,
  };
}

/**
 * Check if a version satisfies a constraint
 */
export function satisfiesConstraint(version: string, constraint: VersionConstraint): boolean {
  const operator = constraint.operator;

  if (!operator || operator === '*') {
    return true;
  }

  if (operator === '=' || operator === '==') {
    return version === constraint.minVersion;
  }

  if (operator === '^' && constraint.minVersion) {
    const cmp = compareVersions(version, constraint.minVersion);
    if (cmp < 0) return false;
    if (constraint.maxVersion) {
      return compareVersions(version, constraint.maxVersion) < 0;
    }
    return true;
  }

  if (operator === '~' && constraint.minVersion) {
    const cmp = compareVersions(version, constraint.minVersion);
    if (cmp < 0) return false;
    if (constraint.maxVersion) {
      return compareVersions(version, constraint.maxVersion) < 0;
    }
    return true;
  }

  if (operator === '>' && constraint.minVersion) {
    return compareVersions(version, constraint.minVersion) > 0;
  }

  if (operator === '>=' && constraint.minVersion) {
    return compareVersions(version, constraint.minVersion) >= 0;
  }

  if (operator === '<' && constraint.maxVersion) {
    return compareVersions(version, constraint.maxVersion) < 0;
  }

  if (operator === '<=' && constraint.maxVersion) {
    return compareVersions(version, constraint.maxVersion) <= 0;
  }

  // Fallback
  return true;
}

/**
 * Additional metadata for version constraint
 */
interface VersionConstraintMetadata {
  includeMin?: boolean;
  includeMax?: boolean;
}

declare module '../types/dependency-analysis.js' {
  interface VersionConstraint {
    metadata?: VersionConstraintMetadata;
  }
}
