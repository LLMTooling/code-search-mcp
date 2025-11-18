/**
 * Utilities for parsing JSON and TOML files.
 */

import { parse as parseToml } from 'toml';

export function parseJson(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${String(error)}`);
  }
}

export function parseTomlContent(content: string): unknown {
  try {
    return parseToml(content);
  } catch (error) {
    throw new Error(`Failed to parse TOML: ${String(error)}`);
  }
}

/**
 * Get a value from an object using a JSON pointer path.
 * JSON pointer format: /path/to/field
 * e.g., "/dependencies/react" to get obj.dependencies.react
 */
export function getJsonPointerValue(obj: unknown, pointer: string): unknown {
  if (!pointer.startsWith('/')) {
    throw new Error('JSON pointer must start with /');
  }

  const parts = pointer.split('/').slice(1); // Remove leading empty string
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Get a value from an object using a TOML dotted path.
 * e.g., "project.name" to get obj.project.name
 */
export function getTomlPathValue(obj: unknown, tomlPath: string): unknown {
  const parts = tomlPath.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Compare a value against an expected value.
 * Handles primitives and array membership.
 */
export function matchesExpectedValue(
  actual: unknown,
  expected: string | number | boolean | string[]
): boolean {
  if (Array.isArray(expected)) {
    // Expected is an array - check if actual matches any element
    return expected.some((e) => actual === e);
  }

  return actual === expected;
}
