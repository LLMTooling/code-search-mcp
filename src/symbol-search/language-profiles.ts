/**
 * Language-specific profiles for symbol search.
 */

import type { LanguageProfiles, SupportedLanguage } from '../types/index.js';

/**
 * Language profiles define how to search and categorize symbols for each language.
 */
export const LANGUAGE_PROFILES: LanguageProfiles = {
  java: {
    fileGlobs: ['**/*.java'],
    defaultKinds: ['class', 'interface', 'enum', 'method', 'field'],
    kindMapping: {
      c: 'class',
      i: 'interface',
      e: 'enum',
      m: 'method',
      f: 'field',
      g: 'enum',
    },
  },
  python: {
    fileGlobs: ['**/*.py'],
    defaultKinds: ['class', 'function', 'method'],
    kindMapping: {
      c: 'class',
      f: 'function',
      m: 'method',
      v: 'variable',
      I: 'module',
    },
  },
  javascript: {
    fileGlobs: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
    defaultKinds: ['function', 'class', 'variable'],
    kindMapping: {
      f: 'function',
      c: 'class',
      v: 'variable',
      m: 'method',
      p: 'property',
      C: 'constant',
      g: 'generator',
    },
  },
  typescript: {
    fileGlobs: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    defaultKinds: ['function', 'class', 'variable', 'interface', 'type', 'enum'],
    kindMapping: {
      f: 'function',
      c: 'class',
      v: 'variable',
      i: 'interface',
      t: 'type',
      e: 'enum',
      m: 'method',
      p: 'property',
      C: 'constant',
      g: 'generator',
      a: 'alias',
    },
  },
  csharp: {
    fileGlobs: ['**/*.cs', '**/*.csx'],
    defaultKinds: ['namespace', 'class', 'struct', 'interface', 'enum', 'method', 'property', 'field'],
    kindMapping: {
      n: 'namespace',
      c: 'class',
      s: 'struct',
      i: 'interface',
      e: 'enum',
      m: 'method',
      p: 'property',
      f: 'field',
      E: 'event',
      d: 'delegate',
    },
  },
};

/**
 * Get file glob patterns for a specific language.
 */
export function getLanguageGlobs(language: SupportedLanguage): string[] {
  return LANGUAGE_PROFILES[language].fileGlobs;
}

/**
 * Get default symbol kinds for a specific language.
 */
export function getDefaultKinds(language: SupportedLanguage): string[] {
  return LANGUAGE_PROFILES[language].defaultKinds;
}

/**
 * Map a ctags kind letter to a normalized kind name.
 */
export function mapCTagsKind(language: SupportedLanguage, ctagsKind: string): string {
  const mapping = LANGUAGE_PROFILES[language].kindMapping;
  return mapping[ctagsKind] ?? ctagsKind;
}
