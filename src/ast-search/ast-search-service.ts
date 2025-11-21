/**
 * AST search service using ast-grep for structural code search
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type {
  ASTPatternSearchOptions,
  ASTRuleSearchOptions,
  ASTSearchResult,
  ASTMatch,
  ASTGrepInfo,
  ASTRule,
} from '../types/ast-search.js';

export class ASTSearchService {
  private astGrepPath: string | null = null;
  private astGrepVersion: string | null = null;

  /**
   * Check if ast-grep is available
   */
  async isAvailable(): Promise<ASTGrepInfo> {
    try {
      const result = await this.executeASTGrep(['--version'], '.');
      const version = result.stdout.trim();

      return {
        available: true,
        version,
        path: this.astGrepPath || 'ast-grep',
      };
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
    const startTime = Date.now();

    // Build ast-grep command arguments
    const args = [
      'run',
      '--pattern',
      options.pattern,
      '--lang',
      options.language,
      '--json',
    ];

    // Add paths if specified
    if (options.paths && options.paths.length > 0) {
      args.push(...options.paths);
    }

    try {
      const result = await this.executeASTGrep(args, workspacePath);
      const matches = this.parseASTGrepOutput(result.stdout);

      // Apply limit if specified
      const limitedMatches = options.limit
        ? matches.slice(0, options.limit)
        : matches;

      return {
        workspaceId,
        matches: limitedMatches,
        totalMatches: matches.length,
        searchTime: Date.now() - startTime,
        language: options.language,
      };
    } catch (error) {
      throw new Error(`AST pattern search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Search using a complex rule
   */
  async searchRule(
    workspaceId: string,
    workspacePath: string,
    options: ASTRuleSearchOptions
  ): Promise<ASTSearchResult> {
    const startTime = Date.now();

    // Create temporary rule file
    const ruleFile = await this.createRuleFile(options.rule, options.language);

    try {
      // Build ast-grep command arguments
      const args = [
        'scan',
        '--rule',
        ruleFile,
        '--json',
      ];

      // Add debug flag if requested
      if (options.debug) {
        args.push('--debug-query=ast');
      }

      // Add paths if specified
      if (options.paths && options.paths.length > 0) {
        args.push(...options.paths);
      }

      const result = await this.executeASTGrep(args, workspacePath);
      const matches = this.parseASTGrepOutput(result.stdout);

      // Apply limit if specified
      const limitedMatches = options.limit
        ? matches.slice(0, options.limit)
        : matches;

      return {
        workspaceId,
        matches: limitedMatches,
        totalMatches: matches.length,
        searchTime: Date.now() - startTime,
        language: options.language,
      };
    } catch (error) {
      throw new Error(`AST rule search failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // Clean up temporary rule file
      await fs.unlink(ruleFile).catch(() => {
        // Ignore cleanup errors
      });
    }
  }

  /**
   * Create a temporary rule file
   */
  private async createRuleFile(rule: ASTRule, language: string): Promise<string> {
    const tmpDir = os.tmpdir();
    const ruleFile = path.join(tmpDir, `ast-grep-rule-${Date.now()}.yml`);

    const ruleContent = {
      rule,
      language,
    };

    await fs.writeFile(ruleFile, JSON.stringify(ruleContent), 'utf-8');
    return ruleFile;
  }

  /**
   * Execute ast-grep command
   */
  private async executeASTGrep(
    args: string[],
    cwd: string
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      // Try to find ast-grep in node_modules first
      let astGrepCmd = this.astGrepPath;

      if (!astGrepCmd) {
        // Try node_modules bin
        const nodeModulesBin = path.join(
          process.cwd(),
          'node_modules',
          '.bin',
          'ast-grep'
        );
        astGrepCmd = nodeModulesBin;
      }

      const child = spawn(astGrepCmd, args, {
        cwd,
        env: process.env,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute ast-grep: ${error.message}`));
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`ast-grep exited with code ${code}: ${stderr}`));
        }
      });
    });
  }

  /**
   * Parse ast-grep JSON output
   */
  private parseASTGrepOutput(output: string): ASTMatch[] {
    if (!output || output.trim() === '') {
      return [];
    }

    try {
      const lines = output.trim().split('\n');
      const matches: ASTMatch[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const match = JSON.parse(line);

          matches.push({
            file: match.file || match.path || '',
            line: match.range?.start?.line || match.line || 0,
            column: match.range?.start?.column || match.column || 0,
            endLine: match.range?.end?.line || match.line || 0,
            endColumn: match.range?.end?.column || match.column || 0,
            text: match.text || match.match || '',
            metaVariables: match.metaVariables || match.meta_variables,
          });
        } catch (parseError) {
          // Skip invalid JSON lines
          console.error('Failed to parse ast-grep output line:', parseError);
        }
      }

      return matches;
    } catch (error) {
      console.error('Failed to parse ast-grep output:', error);
      return [];
    }
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
}
