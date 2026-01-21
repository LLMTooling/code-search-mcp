/**
 * Security utilities for input validation and vulnerability prevention.
 * Provides protection against ReDoS, path traversal, and resource exhaustion.
 */

/**
 * Maximum file size for AST parsing (10MB)
 */
export const MAX_AST_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Maximum regex pattern length
 */
export const MAX_REGEX_LENGTH = 1000;

/**
 * Maximum recursion depth for AST traversal
 */
export const MAX_AST_RECURSION_DEPTH = 100;

/**
 * Maximum results for search operations
 */
export const DEFAULT_MAX_RESULTS = 10000;

/**
 * Timeout for external processes (milliseconds)
 */
export const PROCESS_TIMEOUT = 30000; // 30 seconds

/**
 * Cache file permissions (owner read/write only)
 */
export const CACHE_FILE_PERMISSIONS = 0o600;

/**
 * Cache directory permissions (owner read/write/execute only)
 */
export const CACHE_DIR_PERMISSIONS = 0o700;

/**
 * Validate that a regex pattern is safe from ReDoS attacks.
 * Throws an error if the pattern is potentially dangerous.
 *
 * Uses simple string matching instead of regex to avoid ReDoS in the detector itself.
 *
 * @param pattern - The regex pattern to validate
 * @param maxLength - Maximum allowed pattern length (default: MAX_REGEX_LENGTH)
 * @throws Error if pattern is too long or contains dangerous ReDoS patterns
 */
export function validateRegexPattern(pattern: string, maxLength = MAX_REGEX_LENGTH): void {
  if (!pattern || typeof pattern !== 'string') {
    throw new Error('Regex pattern must be a non-empty string');
  }

  // Check pattern length
  if (pattern.length > maxLength) {
    throw new Error(`Regex pattern exceeds maximum length of ${maxLength} characters`);
  }

  // Check for nested quantifiers like (a+)+, (a*)*, etc.
  // Pattern: \( [chars with quantifiers] \) followed by quantifier
  if (/\([^)]*[\*\+][^)]*\)[\*\+]/.test(pattern)) {
    throw new Error(
      'Regex pattern contains nested quantifiers that could cause catastrophic backtracking (ReDoS)'
    );
  }

  // Check for backreference with quantifier like \1+, \1*, \1{10}
  if (/\\\d[\*\+{]/.test(pattern)) {
    throw new Error(
      'Regex pattern contains backreferences with quantifiers that could cause catastrophic backtracking (ReDoS)'
    );
  }

  // Check for repeated capturing groups like (.+)+\1
  if (/\(.+\)[\*\+].*\\\d/.test(pattern)) {
    throw new Error(
      'Regex pattern contains repeated capturing groups that could cause catastrophic backtracking (ReDoS)'
    );
  }

  // Check for overlapping alternations like (a|a)+ or similar
  const alternationCount = (pattern.match(/\|/g) || []).length;
  if (alternationCount > 20) {
    throw new Error('Regex pattern contains excessive alternation that could cause performance issues');
  }

  // Check for excessive repetition
  // Match quantifiers like {n}, {n,}, {n,m}
  const quantifierPattern = /\{(\d+)(,(\d*))?\}/g;
  let match;
  while ((match = quantifierPattern.exec(pattern)) !== null) {
    const min = parseInt(match[1], 10);
    const max = match[3] !== undefined ? parseInt(match[3], 10) : min;

    if (min > 100 || max > 100) {
      throw new Error(
        'Regex pattern contains excessive quantifiers that could cause performance issues'
      );
    }
  }

}

/**
 * Safely compile a regex pattern with ReDoS protection.
 * Returns null if the pattern is invalid (instead of throwing).
 *
 * @param pattern - The regex pattern to compile
 * @param flags - Optional regex flags
 * @returns RegExp object or null if pattern is invalid
 */
export function safeRegex(pattern: string, flags = ''): RegExp | null {
  try {
    validateRegexPattern(pattern);
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

/**
 * Validate a numeric limit parameter (e.g., max results, max depth).
 * Ensures the value is within acceptable bounds.
 *
 * @param value - The value to validate
 * @param min - Minimum allowed value (default: 1)
 * @param max - Maximum allowed value (default: DEFAULT_MAX_RESULTS)
 * @param defaultValue - Default value if undefined
 * @returns The validated value or defaultValue
 * @throws Error if value is out of bounds
 */
export function validateLimit(
  value: number | undefined,
  min = 1,
  max = DEFAULT_MAX_RESULTS,
  defaultValue?: number
): number {
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error('Limit value is required');
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Limit must be a finite number');
  }

  if (value < min || value > max) {
    throw new Error(`Limit must be between ${min} and ${max}`);
  }

  return Math.floor(value);
}

/**
 * Validate file size against maximum allowed size.
 *
 * @param size - The file size in bytes
 * @param maxSize - Maximum allowed size in bytes (default: MAX_AST_FILE_SIZE)
 * @throws Error if file is too large
 */
export function validateFileSize(size: number, maxSize = MAX_AST_FILE_SIZE): void {
  if (typeof size !== 'number' || !Number.isFinite(size)) {
    throw new Error('File size must be a finite number');
  }

  if (size < 0) {
    throw new Error('File size cannot be negative');
  }

  if (size > maxSize) {
    throw new Error(
      `File size (${Math.round(size / 1024 / 1024)}MB) exceeds maximum allowed size of ${Math.round(maxSize / 1024 / 1024)}MB`
    );
  }
}

/**
 * Sanitize a glob pattern to prevent path traversal.
 * Removes any dangerous patterns while keeping valid glob syntax.
 *
 * @param glob - The glob pattern to sanitize
 * @returns Sanitized glob pattern
 * @throws Error if pattern contains dangerous elements
 */
export function sanitizeGlobPattern(glob: string): string {
  if (!glob || typeof glob !== 'string') {
    throw new Error('Glob pattern must be a non-empty string');
  }

  const trimmed = glob.trim();

  // Check for path traversal attempts before normalization
  if (trimmed.includes('..')) {
    throw new Error('Glob pattern cannot contain ".." (path traversal)');
  }

  // Check for absolute paths (should be relative to workspace)
  if (pathIsAbsolute(trimmed)) {
    throw new Error('Glob pattern must be relative to workspace, not an absolute path');
  }

  // Check for potentially dangerous shell patterns
  if (trimmed.includes('$') || trimmed.includes('`') || trimmed.includes('$(')) {
    throw new Error('Glob pattern cannot contain shell interpolation');
  }

  return trimmed;
}

/**
 * Check if a path is absolute (works on both Windows and Unix).
 */
function pathIsAbsolute(p: string): boolean {
  // Unix absolute paths start with /
  if (p.startsWith('/')) {
    return true;
  }

  // Windows absolute paths: C:\ or \\ or \\?\ or \\.\
  if (/^[a-zA-Z]:\\/.test(p) || /^\\\\/.test(p)) {
    return true;
  }

  return false;
}

/**
 * Check if a Windows path uses UNC extended-length syntax (\\?\ or \\.\
 * These can bypass normal path validation.
 *
 * @param p - The path to check
 * @returns true if the path uses UNC extended-length syntax
 */
export function isWindowsUncExtendedPath(p: string): boolean {
  if (process.platform !== 'win32') {
    return false;
  }
  return /^\\\\[?\\.]/.test(p);
}

/**
 * Sanitize an error message to prevent information disclosure.
 * Removes file paths and system information.
 *
 * @param message - The error message to sanitize
 * @returns Sanitized error message
 */
export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;

  // Remove home directory paths FIRST (before general path replacement)
  // Match /home/username/... or /Users/username/... (greedy match until whitespace or end)
  sanitized = sanitized.replace(/\/home\/[^\s]+/g, '/home/[USER]/');
  sanitized = sanitized.replace(/\/Users\/[^\s]+/g, '/Users/[USER]/');

  // Remove absolute Unix paths (remaining paths that don't match home pattern)
  // Exclude paths that were already sanitized (/home/[USER]/, /Users/[USER]/)
  sanitized = sanitized.replace(/\/(?!home\/\[USER\]|Users\/\[USER\])[^\/\s]+\/[^\/\s]+/g, '[PATH]');

  // Remove absolute Windows paths
  sanitized = sanitized.replace(/[A-Za-z]:\\[^\\]+\\[^\\]+/g, '[PATH]');

  // Remove UNC paths
  sanitized = sanitized.replace(/\\\\[^\\]+\\/g, '\\\\[HOST]\\');

  return sanitized;
}
