/**
 * Symbol indexer that builds and maintains symbol indices.
 */

import type {
  SymbolIndex,
  SymbolResult,
  SupportedLanguage,
} from '../types/index.js';
import { runCTags, normalizeCTagsLanguage } from './ctags-integration.js';
import { mapCTagsKind } from './language-profiles.js';
import { CacheManager } from '../cache/index.js';

export class SymbolIndexer {
  private indices = new Map<string, SymbolIndex>();
  private cacheManager: CacheManager;

  constructor(cacheManager?: CacheManager) {
    this.cacheManager = cacheManager ?? new CacheManager();
  }

  /**
   * Initialize the cache system.
   */
  async initialize(): Promise<void> {
    await this.cacheManager.initialize();
  }

  /**
   * Build or rebuild the symbol index for a workspace.
   * Attempts to load from cache first for improved performance.
   */
  async buildIndex(workspaceId: string, workspaceRoot: string, forceRebuild = false): Promise<void> {
    const startTime = Date.now();

    // Try to load from cache if not forcing rebuild
    if (!forceRebuild) {
      const cachedIndex = await this.cacheManager.loadCache(workspaceId, workspaceRoot);
      if (cachedIndex) {
        this.indices.set(workspaceId, cachedIndex);
        const loadTime = Date.now() - startTime;
        console.log(`Index loaded from cache in ${loadTime}ms (${cachedIndex.totalSymbols} symbols)`);
        return;
      }
    }

    // Build index from scratch
    const tags = await runCTags(workspaceRoot);

    const index: SymbolIndex = {
      byLanguage: new Map(),
      totalSymbols: 0,
      lastIndexed: new Date(),
    };

    // Process each tag
    for (const tag of tags) {
      const language = normalizeCTagsLanguage(tag.language);
      if (!language) {
        continue; // Skip unsupported languages
      }

      const normalizedKind = mapCTagsKind(language, tag.kind);

      const symbol: SymbolResult = {
        name: tag.name,
        language,
        kind: normalizedKind,
        file: tag.file,
        line: tag.line,
        column: undefined, // ctags doesn't reliably provide column
        containerName: tag.scope,
        signature: tag.signature,
      };

      // Get or create language map
      if (!index.byLanguage.has(language)) {
        index.byLanguage.set(language, new Map());
      }
      const languageMap = index.byLanguage.get(language)!;

      // Get or create kind map
      if (!languageMap.has(normalizedKind)) {
        languageMap.set(normalizedKind, new Map());
      }
      const kindMap = languageMap.get(normalizedKind)!;

      // Get or create name array
      if (!kindMap.has(tag.name)) {
        kindMap.set(tag.name, []);
      }
      const nameArray = kindMap.get(tag.name)!;

      nameArray.push(symbol);
      index.totalSymbols++;
    }

    this.indices.set(workspaceId, index);

    const buildTime = Date.now() - startTime;
    console.log(`Index built from scratch in ${buildTime}ms (${index.totalSymbols} symbols)`);

    // Save to cache
    await this.cacheManager.saveCache(workspaceId, workspaceRoot, index);
  }

  /**
   * Get the symbol index for a workspace.
   */
  getIndex(workspaceId: string): SymbolIndex | undefined {
    return this.indices.get(workspaceId);
  }

  /**
   * Check if an index exists for a workspace.
   */
  hasIndex(workspaceId: string): boolean {
    return this.indices.has(workspaceId);
  }

  /**
   * Remove the index for a workspace.
   */
  async removeIndex(workspaceId: string): Promise<void> {
    this.indices.delete(workspaceId);
    await this.cacheManager.clearCache(workspaceId);
  }

  /**
   * Get all symbols of a specific kind and language from the index.
   */
  getSymbolsByKind(
    workspaceId: string,
    language: SupportedLanguage,
    kind: string
  ): SymbolResult[] {
    const index = this.indices.get(workspaceId);
    if (!index) {
      return [];
    }

    const languageMap = index.byLanguage.get(language);
    if (!languageMap) {
      return [];
    }

    const kindMap = languageMap.get(kind);
    if (!kindMap) {
      return [];
    }

    // Flatten all symbols of this kind
    const symbols: SymbolResult[] = [];
    for (const nameArray of kindMap.values()) {
      symbols.push(...nameArray);
    }

    return symbols;
  }

  /**
   * Search for symbols by name in the index.
   */
  searchByName(
    workspaceId: string,
    language: SupportedLanguage,
    name: string,
    kinds?: string[]
  ): SymbolResult[] {
    const index = this.indices.get(workspaceId);
    if (!index) {
      return [];
    }

    const languageMap = index.byLanguage.get(language);
    if (!languageMap) {
      return [];
    }

    const results: SymbolResult[] = [];

    // If kinds are specified, only search those kinds
    const kindsToSearch = kinds ?? Array.from(languageMap.keys());

    for (const kind of kindsToSearch) {
      const kindMap = languageMap.get(kind);
      if (!kindMap) {
        continue;
      }

      const nameArray = kindMap.get(name);
      if (nameArray) {
        results.push(...nameArray);
      }
    }

    return results;
  }

  /**
   * Get the cache manager instance.
   */
  getCacheManager(): CacheManager {
    return this.cacheManager;
  }
}
