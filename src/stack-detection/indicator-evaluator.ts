/**
 * Evaluates individual indicators for stack detection.
 */

import type {
  Indicator,
  IndicatorEvidence,
  FileExistsIndicator,
  DirExistsIndicator,
  FilePatternExistsIndicator,
  FileContainsIndicator,
  PathPatternIndicator,
  JsonFieldIndicator,
  TomlFieldIndicator,
} from '../types/index.js';
import {
  fileExists,
  dirExists,
  readFileContent,
  findFilesByPattern,
  resolvePath,
  pathMatches,
} from '../utils/file-system.js';
import {
  parseJson,
  parseTomlContent,
  getJsonPointerValue,
  getTomlPathValue,
  matchesExpectedValue,
} from '../utils/parsers.js';

export class IndicatorEvaluator {
  constructor(
    private workspaceRoot: string,
    private maxBytesPerFile: number = 1024 * 1024 // 1MB default
  ) { }

  async evaluate(indicator: Indicator): Promise<IndicatorEvidence[]> {
    switch (indicator.kind) {
      case 'fileExists':
        return this.evaluateFileExists(indicator);
      case 'dirExists':
        return this.evaluateDirExists(indicator);
      case 'filePatternExists':
        return this.evaluateFilePatternExists(indicator);
      case 'fileContains':
        return this.evaluateFileContains(indicator);
      case 'pathPattern':
        return this.evaluatePathPattern(indicator);
      case 'jsonField':
        return this.evaluateJsonField(indicator);
      case 'tomlField':
        return this.evaluateTomlField(indicator);
      default: {
        // Exhaustiveness check
        const _exhaustive: never = indicator;
        throw new Error(`Unknown indicator kind: ${String(_exhaustive)}`);
      }
    }
  }

  private async evaluateFileExists(
    indicator: FileExistsIndicator
  ): Promise<IndicatorEvidence[]> {
    const filePath = resolvePath(
      this.workspaceRoot,
      indicator.path,
      indicator.rootRelative ?? false
    );

    const exists = await fileExists(filePath);
    if (!exists) {
      return [];
    }

    return [
      {
        kind: 'fileExists',
        path: indicator.path,
        weight: indicator.weight,
        note: `Found file: ${indicator.path}`,
      },
    ];
  }

  private async evaluateDirExists(
    indicator: DirExistsIndicator
  ): Promise<IndicatorEvidence[]> {
    const dirPath = resolvePath(
      this.workspaceRoot,
      indicator.path,
      indicator.rootRelative ?? false
    );

    const exists = await dirExists(dirPath);
    if (!exists) {
      return [];
    }

    return [
      {
        kind: 'dirExists',
        path: indicator.path,
        weight: indicator.weight,
        note: `Found directory: ${indicator.path}`,
      },
    ];
  }

  private async evaluateFilePatternExists(
    indicator: FilePatternExistsIndicator
  ): Promise<IndicatorEvidence[]> {
    const matches = await findFilesByPattern(
      indicator.glob,
      this.workspaceRoot,
      indicator.maxMatches
    );

    if (matches.length === 0) {
      return [];
    }

    // For filePatternExists, we return one evidence per match (up to maxMatches)
    // But weight is only counted once per indicator
    return [
      {
        kind: 'filePatternExists',
        glob: indicator.glob,
        weight: indicator.weight,
        note: `Found ${String(matches.length)} file(s) matching pattern: ${indicator.glob}`,
      },
    ];
  }

  private async evaluateFileContains(
    indicator: FileContainsIndicator
  ): Promise<IndicatorEvidence[]> {
    const filePath = resolvePath(
      this.workspaceRoot,
      indicator.path,
      indicator.rootRelative ?? false
    );

    const exists = await fileExists(filePath);
    if (!exists) {
      return [];
    }

    const content = await readFileContent(filePath, this.maxBytesPerFile);
    const pattern = new RegExp(indicator.regex);

    if (!pattern.test(content)) {
      return [];
    }

    return [
      {
        kind: 'fileContains',
        path: indicator.path,
        regex: indicator.regex,
        weight: indicator.weight,
        note: `File ${indicator.path} contains pattern: ${indicator.regex}`,
      },
    ];
  }

  private async evaluatePathPattern(
    indicator: PathPatternIndicator
  ): Promise<IndicatorEvidence[]> {
    const matches = await pathMatches(this.workspaceRoot, indicator.regex);

    if (matches.length === 0) {
      return [];
    }

    return [
      {
        kind: 'pathPattern',
        regex: indicator.regex,
        weight: indicator.weight,
        note: `Found ${String(matches.length)} path(s) matching regex: ${indicator.regex}`,
      },
    ];
  }

  private async evaluateJsonField(
    indicator: JsonFieldIndicator
  ): Promise<IndicatorEvidence[]> {
    const filePath = resolvePath(
      this.workspaceRoot,
      indicator.path,
      indicator.rootRelative ?? false
    );

    const exists = await fileExists(filePath);
    if (!exists) {
      return [];
    }

    try {
      const content = await readFileContent(filePath, this.maxBytesPerFile);
      const json = parseJson(content);
      const value = getJsonPointerValue(json, indicator.jsonPointer);

      if (value === undefined) {
        return [];
      }

      // If expectedValue is specified, check if it matches
      if (indicator.expectedValue !== undefined) {
        if (!matchesExpectedValue(value, indicator.expectedValue)) {
          return [];
        }
      }

      return [
        {
          kind: 'jsonField',
          path: indicator.path,
          fieldPath: indicator.jsonPointer,
          fieldValue: value,
          weight: indicator.weight,
          note: `Found JSON field ${indicator.jsonPointer} in ${indicator.path}`,
        },
      ];
    } catch {
      // Failed to parse JSON or read file
      return [];
    }
  }

  private async evaluateTomlField(
    indicator: TomlFieldIndicator
  ): Promise<IndicatorEvidence[]> {
    const filePath = resolvePath(
      this.workspaceRoot,
      indicator.path,
      indicator.rootRelative ?? false
    );

    const exists = await fileExists(filePath);
    if (!exists) {
      return [];
    }

    try {
      const content = await readFileContent(filePath, this.maxBytesPerFile);
      const toml = parseTomlContent(content);
      const value = getTomlPathValue(toml, indicator.tomlPath);

      if (value === undefined) {
        return [];
      }

      // If expectedValue is specified, check if it matches
      if (indicator.expectedValue !== undefined) {
        if (!matchesExpectedValue(value, indicator.expectedValue)) {
          return [];
        }
      }

      return [
        {
          kind: 'tomlField',
          path: indicator.path,
          fieldPath: indicator.tomlPath,
          fieldValue: value,
          weight: indicator.weight,
          note: `Found TOML field ${indicator.tomlPath} in ${indicator.path}`,
        },
      ];
    } catch {
      // Failed to parse TOML or read file
      return [];
    }
  }
}
