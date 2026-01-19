/**
 * AST search service using ast-grep NAPI for structural code search
 * Uses bundled native binaries and language packages - no external installation required
 */

import { parse, Lang, registerDynamicLanguage } from '@ast-grep/napi';
import langBash = require('@ast-grep/lang-bash');
import langC = require('@ast-grep/lang-c');
import langCpp = require('@ast-grep/lang-cpp');
import langCsharp = require('@ast-grep/lang-csharp');
import langGo = require('@ast-grep/lang-go');
import langJava = require('@ast-grep/lang-java');
import langJson = require('@ast-grep/lang-json');
import langKotlin = require('@ast-grep/lang-kotlin');
import langPython = require('@ast-grep/lang-python');
import langRust = require('@ast-grep/lang-rust');
import langScala = require('@ast-grep/lang-scala');
import langSwift = require('@ast-grep/lang-swift');
import langTsx = require('@ast-grep/lang-tsx');
import langTypeScript = require('@ast-grep/lang-typescript');
import langYaml = require('@ast-grep/lang-yaml');
import { promises as fs } from 'fs';
import path from 'path';
import fastGlob from 'fast-glob';
import type {
  ASTPatternSearchOptions,
  ASTRuleSearchOptions,
  ASTSearchResult,
  ASTMatch,
  ASTGrepInfo,
  ASTRule,
  ASTLanguage,
} from '../types/ast-search.js';

// Type for ast-grep language (built-in or custom string)
type NapiLang = Lang | string;

// Register dynamic languages once
let languagesRegistered = false;

function ensureLanguagesRegistered() {
  if (!languagesRegistered) {
    registerDynamicLanguage({
      bash: langBash as any,
      c: langC as any,
      cpp: langCpp as any,
      csharp: langCsharp as any,
      go: langGo as any,
      java: langJava as any,
      json: langJson as any,
      kotlin: langKotlin as any,
      python: langPython as any,
      rust: langRust as any,
      scala: langScala as any,
      swift: langSwift as any,
      tsx: langTsx as any,
      typescript: langTypeScript as any,
      yaml: langYaml as any,
    });
    languagesRegistered = true;
  }
}

// Language mapping from our types to ast-grep NapiLang
// Includes built-in languages and dynamically registered language packages
const LANGUAGE_MAP: Record<ASTLanguage, NapiLang> = {
  bash: 'bash',
  c: 'c',
  cpp: 'cpp',
  csharp: 'csharp',
  css: Lang.Css,
  go: 'go',
  html: Lang.Html,
  java: 'java',
  javascript: Lang.JavaScript,
  json: 'json',
  kotlin: 'kotlin',
  python: 'python',
  rust: 'rust',
  scala: 'scala',
  swift: 'swift',
  tsx: 'tsx',
  typescript: 'typescript',
  yaml: 'yaml',
};

// File extension to language mapping
const EXTENSION_MAP: Record<string, ASTLanguage> = {
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.cs': 'csharp',
  '.css': 'css',
  '.go': 'go',
  '.html': 'html',
  '.htm': 'html',
  '.java': 'java',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.json': 'json',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.py': 'python',
  '.pyw': 'python',
  '.rs': 'rust',
  '.scala': 'scala',
  '.sc': 'scala',
  '.sh': 'bash',
  '.bash': 'bash',
  '.swift': 'swift',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

export class ASTSearchService {
  /**
   * Check if ast-grep is available (always true since it's bundled)
   */
  async isAvailable(): Promise<ASTGrepInfo> {
    try {
      // Ensure dynamic languages are registered
      ensureLanguagesRegistered();

      // Try to access the Lang enum and language packages to verify modules load
      const testBuiltIn = Lang.JavaScript;
      const testPython = langPython;
      const testGo = langGo;
      const testJava = langJava;

      if (testBuiltIn !== undefined && testPython !== undefined && testGo !== undefined && testJava !== undefined) {
        const supportedLangs = Object.keys(LANGUAGE_MAP).sort().join(', ');
        return {
          available: true,
          version: '0.40.0', // @ast-grep packages version
          path: `bundled (15 languages: ${supportedLangs})`,
        };
      }
      throw new Error('Failed to load ast-grep modules');
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Search using a simple pattern
   */
  async searchPattern(
    workspaceId: string,
    workspacePath: string,
    options: ASTPatternSearchOptions
  ): Promise<ASTSearchResult> {
    // Ensure dynamic languages are registered
    ensureLanguagesRegistered();

    const startTime = Date.now();

    // Get files to search
    const files = await this.getFilesToSearch(
      workspacePath,
      options.language,
      options.paths
    );

    const matches: ASTMatch[] = [];
    const astLang = LANGUAGE_MAP[options.language];

    if (!astLang) {
      throw new Error(`Unsupported language: ${options.language}`);
    }

    // Search each file
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const ast = parse(astLang, content);
        const root = ast.root();

        // Find all matches
        const nodes = root.findAll(options.pattern);

        for (const node of nodes) {
          const range = node.range();
          const fullText = node.text();
          const { truncated, totalLines } = this.truncateText(fullText, options.maxLines ?? 3);

          const match: ASTMatch = {
            file,
            line: range.start.line + 1, // Convert to 1-indexed
            column: range.start.column + 1,
            endLine: range.end.line + 1,
            endColumn: range.end.column + 1,
            text: truncated,
            totalLines,
          };

          // Extract metavariables if present
          const metaVars = this.extractMetavariables(node, options.pattern);
          if (metaVars && Object.keys(metaVars).length > 0) {
            match.metaVariables = metaVars;
          }

          matches.push(match);

          // Apply limit
          if (options.limit && matches.length >= options.limit) {
            break;
          }
        }

        if (options.limit && matches.length >= options.limit) {
          break;
        }
      } catch {
        // Skip files that fail to parse
      }
    }

    return {
      workspaceId,
      matches,
      totalMatches: matches.length,
      searchTime: Date.now() - startTime,
      language: options.language,
    };
  }

  /**
   * Search using a complex rule
   */
  async searchRule(
    workspaceId: string,
    workspacePath: string,
    options: ASTRuleSearchOptions
  ): Promise<ASTSearchResult> {
    // Ensure dynamic languages are registered
    ensureLanguagesRegistered();

    const startTime = Date.now();

    // Get files to search
    const files = await this.getFilesToSearch(
      workspacePath,
      options.language,
      options.paths
    );

    const matches: ASTMatch[] = [];
    const astLang = LANGUAGE_MAP[options.language];

    if (!astLang) {
      throw new Error(`Unsupported language: ${options.language}`);
    }

    // Search each file
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const ast = parse(astLang, content);
        const root = ast.root();

        // Apply rule
        const nodes = this.applyRule(root, options.rule);

        for (const node of nodes) {
          const range = node.range();
          const fullText = node.text();
          const { truncated, totalLines } = this.truncateText(fullText, options.maxLines ?? 3);

          const match: ASTMatch = {
            file,
            line: range.start.line + 1, // Convert to 1-indexed
            column: range.start.column + 1,
            endLine: range.end.line + 1,
            endColumn: range.end.column + 1,
            text: truncated,
            totalLines,
          };

          // Try to extract metavariables
          const metaVars = this.extractMetavariablesFromRule(node, options.rule);
          if (metaVars && Object.keys(metaVars).length > 0) {
            match.metaVariables = metaVars;
          }

          matches.push(match);

          // Apply limit
          if (options.limit && matches.length >= options.limit) {
            break;
          }
        }

        if (options.limit && matches.length >= options.limit) {
          break;
        }
      } catch {
        // Skip files that fail to parse
      }
    }

    return {
      workspaceId,
      matches,
      totalMatches: matches.length,
      searchTime: Date.now() - startTime,
      language: options.language,
    };
  }

  /**
   * Apply AST rule to find matching nodes
   */
  private applyRule(root: any, rule: ASTRule): any[] {
    let results: any[] = [];

    // Handle composite rules
    if (rule.all) {
      // AND: Start with first rule, filter with rest
      results = this.applyRule(root, rule.all[0]);
      for (let i = 1; i < rule.all.length; i++) {
        results = results.filter(node => this.nodeMatchesRule(node, rule.all![i]));
      }
      return results;
    }

    if (rule.any) {
      // OR: Combine all results
      const allResults = new Set<any>();
      for (const subRule of rule.any) {
        const nodes = this.applyRule(root, subRule);
        nodes.forEach(n => allResults.add(n));
      }
      return Array.from(allResults);
    }

    if (rule.not) {
      // NOT: Find all nodes, exclude those matching not rule
      const allNodes = root.findAll('$_'); // Match everything
      const excludeNodes = new Set(this.applyRule(root, rule.not));
      return allNodes.filter((n: any) => !excludeNodes.has(n));
    }

    // Handle atomic rules
    if (rule.pattern) {
      const pattern = typeof rule.pattern === 'string' ? rule.pattern : rule.pattern.selector || rule.pattern.context || '';
      let nodes = root.findAll(pattern);

      // Apply relational filters
      if (rule.inside) {
        nodes = nodes.filter((n: any) => this.checkInside(n, rule.inside!));
      }
      if (rule.has) {
        nodes = nodes.filter((n: any) => this.checkHas(n, rule.has!));
      }
      if (rule.precedes) {
        nodes = nodes.filter((n: any) => this.checkPrecedes(n, rule.precedes!));
      }
      if (rule.follows) {
        nodes = nodes.filter((n: any) => this.checkFollows(n, rule.follows!));
      }

      return nodes;
    }

    if (rule.kind) {
      // Find by node kind
      let nodes = root.findAll('$_'); // Find all nodes
      nodes = nodes.filter((n: any) => n.kind() === rule.kind);

      // Apply relational filters
      if (rule.inside) {
        nodes = nodes.filter((n: any) => this.checkInside(n, rule.inside!));
      }
      if (rule.has) {
        nodes = nodes.filter((n: any) => this.checkHas(n, rule.has!));
      }

      return nodes;
    }

    if (rule.regex) {
      // Find by regex
      const regex = new RegExp(rule.regex);
      let nodes = root.findAll('$_');
      nodes = nodes.filter((n: any) => regex.test(n.text()));

      // Apply relational filters
      if (rule.inside) {
        nodes = nodes.filter((n: any) => this.checkInside(n, rule.inside!));
      }
      if (rule.has) {
        nodes = nodes.filter((n: any) => this.checkHas(n, rule.has!));
      }

      return nodes;
    }

    // If only relational rules, find all and filter
    if (rule.inside || rule.has || rule.precedes || rule.follows) {
      let nodes = root.findAll('$_');

      if (rule.inside) {
        nodes = nodes.filter((n: any) => this.checkInside(n, rule.inside!));
      }
      if (rule.has) {
        nodes = nodes.filter((n: any) => this.checkHas(n, rule.has!));
      }
      if (rule.precedes) {
        nodes = nodes.filter((n: any) => this.checkPrecedes(n, rule.precedes!));
      }
      if (rule.follows) {
        nodes = nodes.filter((n: any) => this.checkFollows(n, rule.follows!));
      }

      return nodes;
    }

    return [];
  }

  /**
   * Check if node matches a rule
   */
  private nodeMatchesRule(node: any, rule: ASTRule): boolean {
    if (rule.pattern) {
      const pattern = typeof rule.pattern === 'string' ? rule.pattern : rule.pattern.selector || '';
      if (!node.matches(pattern)) return false;
    }

    if (rule.kind && node.kind() !== rule.kind) {
      return false;
    }

    if (rule.regex) {
      const regex = new RegExp(rule.regex);
      if (!regex.test(node.text())) return false;
    }

    if (rule.inside && !this.checkInside(node, rule.inside)) {
      return false;
    }

    if (rule.has && !this.checkHas(node, rule.has)) {
      return false;
    }

    if (rule.precedes && !this.checkPrecedes(node, rule.precedes)) {
      return false;
    }

    if (rule.follows && !this.checkFollows(node, rule.follows)) {
      return false;
    }

    if (rule.not) {
      if (this.nodeMatchesRule(node, rule.not)) {
        return false;
      }
    }

    if (rule.all) {
      return rule.all.every(r => this.nodeMatchesRule(node, r));
    }

    if (rule.any) {
      return rule.any.some(r => this.nodeMatchesRule(node, r));
    }

    return true;
  }

  /**
   * Check inside relational rule
   */
  private checkInside(node: any, rule: ASTRule | any): boolean {
    const pattern = typeof rule === 'string' ? rule : rule.pattern || '';
    if (!pattern) return true;

    return node.inside(pattern);
  }

  /**
   * Check has relational rule
   */
  private checkHas(node: any, rule: ASTRule | any): boolean {
    const pattern = typeof rule === 'string' ? rule : rule.pattern || '';
    if (!pattern) return true;

    return node.has(pattern);
  }

  /**
   * Check precedes relational rule
   */
  private checkPrecedes(node: any, rule: ASTRule | any): boolean {
    const pattern = typeof rule === 'string' ? rule : rule.pattern || '';
    if (!pattern) return true;

    return node.precedes(pattern);
  }

  /**
   * Check follows relational rule
   */
  private checkFollows(node: any, rule: ASTRule | any): boolean {
    const pattern = typeof rule === 'string' ? rule : rule.pattern || '';
    if (!pattern) return true;

    return node.follows(pattern);
  }

  /**
   * Extract metavariables from a matched node
   */
  private extractMetavariables(node: any, pattern: string): Record<string, any> | undefined {
    // Extract variable names from pattern ($VAR, $$VAR, $$$VAR)
    const varPattern = /\$(\$?\$?[A-Z_][A-Z0-9_]*)/g;
    const vars = new Set<string>();
    let match;

    while ((match = varPattern.exec(pattern)) !== null) {
      const varName = match[1].replace(/^\$+/, ''); // Remove leading $
      vars.add(varName);
    }

    if (vars.size === 0) return undefined;

    const metaVars: Record<string, any> = {};

    for (const varName of vars) {
      try {
        const matchedNode = node.getMatch(varName);
        if (matchedNode) {
          const range = matchedNode.range();
          metaVars[varName] = {
            text: matchedNode.text(),
            line: range.start.line + 1,
            column: range.start.column + 1,
          };
        }
      } catch {
        // Variable not found, skip
      }
    }

    return Object.keys(metaVars).length > 0 ? metaVars : undefined;
  }

  /**
   * Extract metavariables from rule
   */
  private extractMetavariablesFromRule(node: any, rule: ASTRule): Record<string, any> | undefined {
    if (rule.pattern) {
      const pattern = typeof rule.pattern === 'string' ? rule.pattern : rule.pattern.selector || '';
      return this.extractMetavariables(node, pattern);
    }
    return undefined;
  }

  /**
   * Get files to search based on language and paths
   */
  private async getFilesToSearch(
    workspacePath: string,
    language: ASTLanguage,
    paths?: string[]
  ): Promise<string[]> {
    // If specific paths provided, use those
    if (paths && paths.length > 0) {
      const resolvedPaths: string[] = [];
      for (const p of paths) {
        const fullPath = path.isAbsolute(p) ? p : path.join(workspacePath, p);
        const globbed = await fastGlob(fullPath, {
          cwd: workspacePath,
          absolute: true,
          onlyFiles: true,
        });
        resolvedPaths.push(...globbed);
      }
      return resolvedPaths;
    }

    // Otherwise, find all files for the language
    const extensions = Object.entries(EXTENSION_MAP)
      .filter(([, lang]) => lang === language)
      .map(([ext]) => ext);

    if (extensions.length === 0) {
      return [];
    }

    const patterns = extensions.map(ext => `**/*${ext}`);

    return await fastGlob(patterns, {
      cwd: workspacePath,
      absolute: true,
      onlyFiles: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
    });
  }

  /**
   * Validate AST rule
   */
  validateRule(rule: ASTRule): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for at least one positive condition
    const hasPositive =
      rule.pattern !== undefined ||
      rule.kind !== undefined ||
      rule.regex !== undefined ||
      rule.inside !== undefined ||
      rule.has !== undefined ||
      rule.all !== undefined ||
      rule.any !== undefined;

    if (!hasPositive) {
      errors.push('Rule must have at least one positive condition (pattern, kind, regex, inside, has, all, or any)');
    }

    // Validate relational rules with stopBy
    if (rule.inside && typeof rule.inside === 'object') {
      if ('stopBy' in rule.inside && rule.inside.stopBy && rule.inside.stopBy !== 'neighbor' && rule.inside.stopBy !== 'end') {
        errors.push('inside.stopBy must be either "neighbor" or "end"');
      }
    }

    if (rule.has && typeof rule.has === 'object') {
      if ('stopBy' in rule.has && rule.has.stopBy && rule.has.stopBy !== 'neighbor' && rule.has.stopBy !== 'end') {
        errors.push('has.stopBy must be either "neighbor" or "end"');
      }
    }

    // Validate composite rules
    if (rule.all && (!Array.isArray(rule.all) || rule.all.length === 0)) {
      errors.push('all must be a non-empty array of rules');
    }

    if (rule.any && (!Array.isArray(rule.any) || rule.any.length === 0)) {
      errors.push('any must be a non-empty array of rules');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Truncate match text to specified number of lines
   */
  private truncateText(text: string, maxLines = 3): { truncated: string; totalLines: number } {
    const lines = text.split('\n');
    const totalLines = lines.length;

    if (totalLines <= maxLines) {
      return { truncated: text, totalLines };
    }

    // Return first maxLines lines
    const truncatedLines = lines.slice(0, maxLines);
    const truncated = truncatedLines.join('\n');

    return { truncated, totalLines };
  }
}
