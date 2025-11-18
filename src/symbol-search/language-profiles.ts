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
  go: {
    fileGlobs: ['**/*.go'],
    defaultKinds: ['package', 'function', 'method', 'struct', 'interface', 'type'],
    kindMapping: {
      p: 'package',
      f: 'function',
      m: 'method',
      s: 'struct',
      i: 'interface',
      t: 'type',
      c: 'constant',
      v: 'variable',
      n: 'interface',
      u: 'unknown',
      R: 'constructor',
    },
  },
  rust: {
    fileGlobs: ['**/*.rs'],
    defaultKinds: ['module', 'struct', 'enum', 'trait', 'function', 'method', 'type'],
    kindMapping: {
      n: 'module',
      s: 'struct',
      g: 'enum',
      T: 'trait',
      f: 'function',
      i: 'interface',
      t: 'type',
      c: 'implementation',
      v: 'variable',
      M: 'macro',
      m: 'method',
      e: 'enumerator',
      P: 'method',
    },
  },
  c: {
    fileGlobs: ['**/*.c', '**/*.h'],
    defaultKinds: ['function', 'struct', 'enum', 'typedef', 'macro'],
    kindMapping: {
      f: 'function',
      s: 'struct',
      g: 'enum',
      t: 'typedef',
      d: 'macro',
      v: 'variable',
      e: 'enumerator',
      u: 'union',
      m: 'member',
      l: 'local',
      p: 'prototype',
      x: 'externvar',
    },
  },
  cpp: {
    fileGlobs: ['**/*.cpp', '**/*.cc', '**/*.cxx', '**/*.hpp', '**/*.hh', '**/*.hxx', '**/*.C', '**/*.H'],
    defaultKinds: ['class', 'struct', 'function', 'method', 'namespace', 'enum', 'typedef'],
    kindMapping: {
      c: 'class',
      s: 'struct',
      f: 'function',
      m: 'member',
      n: 'namespace',
      g: 'enum',
      t: 'typedef',
      u: 'union',
      v: 'variable',
      e: 'enumerator',
      d: 'macro',
      p: 'prototype',
      x: 'externvar',
      l: 'local',
    },
  },
  php: {
    fileGlobs: ['**/*.php', '**/*.php3', '**/*.php4', '**/*.php5', '**/*.php7', '**/*.phtml'],
    defaultKinds: ['class', 'interface', 'trait', 'function', 'method', 'variable'],
    kindMapping: {
      c: 'class',
      i: 'interface',
      t: 'trait',
      f: 'function',
      d: 'define',
      v: 'variable',
      n: 'namespace',
      a: 'alias',
    },
  },
  ruby: {
    fileGlobs: ['**/*.rb', '**/*.ruby', '**/*.rake'],
    defaultKinds: ['class', 'module', 'method', 'singleton'],
    kindMapping: {
      c: 'class',
      m: 'module',
      f: 'method',
      F: 'singleton',
      S: 'singleton',
    },
  },
  kotlin: {
    fileGlobs: ['**/*.kt', '**/*.kts'],
    defaultKinds: ['class', 'interface', 'method', 'variable', 'object'],
    kindMapping: {
      c: 'class',
      i: 'interface',
      m: 'method',
      v: 'variable',
      o: 'object',
      p: 'package',
      C: 'constant',
      t: 'typealias',
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
