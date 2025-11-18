/**
 * Types for language-aware symbol search.
 * Based on LANGUAGE_AWARE_SEARCH.md specification.
 */

// ============================================================================
// Supported Languages
// ============================================================================

export type SupportedLanguage =
  | 'java'
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'csharp'
  | 'go'
  | 'rust'
  | 'c'
  | 'cpp'
  | 'php'
  | 'ruby'
  | 'kotlin';

// ============================================================================
// Symbol Search Parameters
// ============================================================================

export type MatchMode = 'exact' | 'prefix' | 'substring' | 'regex';

export interface SymbolSearchScope {
  /** Filter to methods/fields within this class. */
  in_class?: string;
  /** Filter to symbols in this namespace/package. */
  in_namespace?: string;
  /** Filter to symbols in this module (Python). */
  in_module?: string;
}

export interface SymbolSearchParams {
  language: SupportedLanguage;
  /** Search term, e.g. "UserService" */
  name: string;
  /** How to match the name. */
  match?: MatchMode;
  /** Logical kinds to filter by. */
  kinds?: string[];
  /** Scope filter. */
  scope?: SymbolSearchScope;
  /** Max results to return. */
  limit?: number;
}

// ============================================================================
// Symbol Results
// ============================================================================

export interface SymbolResult {
  name: string;
  language: SupportedLanguage;
  /** Normalized kind: "class" | "method" | "field" | "function" | ... */
  kind: string;
  file: string;
  line: number;
  column?: number;
  /** Class / module / namespace name. */
  containerName?: string;
  /** Function/method signature if available. */
  signature?: string;
}

export interface SymbolSearchResult {
  symbols: SymbolResult[];
}

// ============================================================================
// Language Profiles
// ============================================================================

export interface LanguageProfile {
  fileGlobs: string[];
  defaultKinds: string[];
  /** Map from ctags kind to normalized kind. */
  kindMapping: Record<string, string>;
}

export type LanguageProfiles = Record<SupportedLanguage, LanguageProfile>;

// ============================================================================
// CTags Integration
// ============================================================================

export interface CTagsTag {
  name: string;
  file: string;
  line: number;
  kind: string;
  language: string;
  scope?: string;
  scopeKind?: string;
  signature?: string;
}

export interface SymbolIndex {
  /** Index by language -> kind -> name -> symbols */
  byLanguage: Map<
    SupportedLanguage,
    Map<string, Map<string, SymbolResult[]>>
  >;
  /** Total symbols indexed. */
  totalSymbols: number;
  /** Last indexed timestamp. */
  lastIndexed: Date;
}
