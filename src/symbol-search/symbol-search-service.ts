/**
 * Symbol search service with language-aware search capabilities.
 */

import type {
  SymbolSearchParams,
  SymbolSearchResult,
  SymbolResult,
  MatchMode,
} from '../types/index.js';
import { SymbolIndexer } from './symbol-indexer.js';
import { getDefaultKinds } from './language-profiles.js';

export class SymbolSearchService {
  constructor(private indexer: SymbolIndexer) {}

  /**
   * Search for symbols based on the provided parameters.
   */
  async searchSymbols(
    workspaceId: string,
    params: SymbolSearchParams
  ): Promise<SymbolSearchResult> {
    const index = this.indexer.getIndex(workspaceId);
    if (!index) {
      throw new Error(`No symbol index found for workspace: ${workspaceId}`);
    }

    const {
      language,
      name,
      match = 'exact',
      kinds,
      scope,
      limit = 100,
    } = params;

    // Get all symbols for the specified language
    const languageMap = index.byLanguage.get(language);
    if (!languageMap) {
      return { symbols: [] };
    }

    // Determine which kinds to search
    const searchKinds = kinds ?? getDefaultKinds(language);

    // Collect candidate symbols
    let candidates: SymbolResult[] = [];

    for (const kind of searchKinds) {
      const kindMap = languageMap.get(kind);
      if (!kindMap) {
        continue;
      }

      // Apply name matching
      for (const [symbolName, symbols] of kindMap.entries()) {
        if (this.matchesName(symbolName, name, match)) {
          candidates.push(...symbols);
        }
      }
    }

    // Apply scope filters
    if (scope) {
      candidates = this.applyScope(candidates, scope);
    }

    // Apply limit
    if (candidates.length > limit) {
      candidates = candidates.slice(0, limit);
    }

    return { symbols: candidates };
  }

  /**
   * Check if a symbol name matches the search term based on the match mode.
   */
  private matchesName(symbolName: string, searchTerm: string, mode: MatchMode): boolean {
    switch (mode) {
      case 'exact':
        return symbolName === searchTerm;
      case 'prefix':
        return symbolName.startsWith(searchTerm);
      case 'substring':
        return symbolName.toLowerCase().includes(searchTerm.toLowerCase());
      case 'regex': {
        try {
          const regex = new RegExp(searchTerm);
          return regex.test(symbolName);
        } catch {
          // Invalid regex, treat as literal substring
          return symbolName.toLowerCase().includes(searchTerm.toLowerCase());
        }
      }
      default: {
        const _exhaustive: never = mode;
        throw new Error(`Unknown match mode: ${String(_exhaustive)}`);
      }
    }
  }

  /**
   * Apply scope filters to candidate symbols.
   */
  private applyScope(
    symbols: SymbolResult[],
    scope: {
      in_class?: string;
      in_namespace?: string;
      in_module?: string;
    }
  ): SymbolResult[] {
    return symbols.filter((symbol) => {
      // Filter by class
      if (scope.in_class) {
        if (!symbol.containerName) {
          return false;
        }
        // Check if containerName matches or contains the class name
        if (!symbol.containerName.includes(scope.in_class)) {
          return false;
        }
      }

      // Filter by namespace (Java packages, C# namespaces)
      if (scope.in_namespace) {
        if (!symbol.containerName) {
          return false;
        }
        // For namespaces, check if it starts with the namespace
        if (!symbol.containerName.startsWith(scope.in_namespace)) {
          return false;
        }
      }

      // Filter by module (Python)
      if (scope.in_module) {
        if (!symbol.file) {
          return false;
        }
        // Check if the file path contains the module name
        if (!symbol.file.includes(scope.in_module.replace(/\./g, '/'))) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Refresh the symbol index for a workspace.
   */
  async refreshIndex(workspaceId: string, workspaceRoot: string): Promise<void> {
    await this.indexer.buildIndex(workspaceId, workspaceRoot);
  }

  /**
   * Check if a workspace has a symbol index.
   */
  hasIndex(workspaceId: string): boolean {
    return this.indexer.hasIndex(workspaceId);
  }

  /**
   * Get index statistics.
   */
  getIndexStats(workspaceId: string): {
    totalSymbols: number;
    lastIndexed: Date | null;
  } {
    const index = this.indexer.getIndex(workspaceId);
    if (!index) {
      return { totalSymbols: 0, lastIndexed: null };
    }

    return {
      totalSymbols: index.totalSymbols,
      lastIndexed: index.lastIndexed,
    };
  }
}
