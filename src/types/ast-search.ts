/**
 * Type definitions for AST-based code search using ast-grep
 */

/**
 * Supported programming languages for AST search
 * Includes built-in languages and dynamically loaded language packages
 */
export type ASTLanguage =
  | 'javascript'
  | 'typescript'
  | 'tsx'
  | 'html'
  | 'css'
  | 'rust';

/**
 * Stop-by directive for relational rules
 */
export type StopBy = 'neighbor' | 'end';

/**
 * Atomic pattern matching rule
 */
export interface PatternRule {
  pattern?: string | {
    selector?: string;
    context?: string;
    strictness?: 'cst' | 'smart' | 'ast' | 'relaxed' | 'signature';
  };
  kind?: string;
  regex?: string;
  nthChild?: number;
}

/**
 * Relational rules for context-aware matching
 */
export interface RelationalRule {
  inside?: ASTRule | {
    pattern?: string;
    kind?: string;
    stopBy?: StopBy;
  };
  has?: ASTRule | {
    pattern?: string;
    kind?: string;
    stopBy?: StopBy;
  };
  precedes?: ASTRule | {
    pattern?: string;
    kind?: string;
    stopBy?: StopBy;
  };
  follows?: ASTRule | {
    pattern?: string;
    kind?: string;
    stopBy?: StopBy;
  };
}

/**
 * Composite rules for logical combinations
 */
export interface CompositeRule {
  all?: ASTRule[];
  any?: ASTRule[];
  not?: ASTRule;
  matches?: string;
}

/**
 * Complete AST rule definition
 */
export type ASTRule = PatternRule & RelationalRule & CompositeRule;

/**
 * AST search match result
 */
export interface ASTMatch {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  text: string;
  /** Total number of lines in the full match (before truncation) */
  totalLines: number;
  metaVariables?: Record<string, {
    text: string;
    line: number;
    column: number;
  }>;
}

/**
 * Pattern-based AST search options
 */
export interface ASTPatternSearchOptions {
  language: ASTLanguage;
  pattern: string;
  /** File paths to search (glob patterns supported) */
  paths?: string[];
  /** Maximum number of results to return */
  limit?: number;
  /** Maximum number of lines to include in match text (default: 3) */
  maxLines?: number;
  /** Show only matched text without context */
  compactMode?: boolean;
}

/**
 * Rule-based AST search options
 */
export interface ASTRuleSearchOptions {
  language: ASTLanguage;
  rule: ASTRule;
  /** File paths to search (glob patterns supported) */
  paths?: string[];
  /** Maximum number of results to return */
  limit?: number;
  /** Maximum number of lines to include in match text (default: 3) */
  maxLines?: number;
  /** Show only matched text without context */
  compactMode?: boolean;
  /** Debug mode: show AST structure */
  debug?: boolean;
}

/**
 * AST search result
 */
export interface ASTSearchResult {
  workspaceId: string;
  matches: ASTMatch[];
  totalMatches: number;
  searchTime: number;
  language: ASTLanguage;
}

/**
 * AST-grep availability check result
 */
export interface ASTGrepInfo {
  available: boolean;
  version?: string;
  path?: string;
  error?: string;
}
