/**
 * Cache manager for persisting symbol indices to disk.
 * Provides significant performance improvements by avoiding full re-indexing on startup.
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { SymbolIndex, SymbolResult, SupportedLanguage } from '../types/index.js';
import { createHash } from 'crypto';

const CACHE_VERSION = '1.0.0';
const CACHE_DIR_NAME = '.code-search-mcp-cache';

export interface CacheStats {
  workspaceId: string;
  workspacePath: string;
  totalSymbols: number;
  lastIndexed: Date;
  cacheSize: number;
  cacheAge: number; // milliseconds since last indexed
  fileCount: number;
  isCached: boolean;
}

export interface CacheMetadata {
  version: string;
  workspaceId: string;
  workspacePath: string;
  workspaceHash: string; // Hash of workspace path for validation
  lastIndexed: string;
  fileMtimes: Record<string, number>; // File path -> modification time
  totalSymbols: number;
}

export interface SerializedSymbolIndex {
  byLanguage: Record<string, Record<string, Record<string, SymbolResult[]>>>;
  totalSymbols: number;
  lastIndexed: string;
}

export interface CachedIndex {
  metadata: CacheMetadata;
  index: SerializedSymbolIndex;
}

export class CacheManager {
  private cacheDir: string;
  private enableCache: boolean;

  constructor(cacheDir?: string, enableCache = true) {
    // Use provided cache dir, or default to user's home directory
    this.cacheDir = cacheDir ?? path.join(os.homedir(), CACHE_DIR_NAME);
    this.enableCache = enableCache;
  }

  /**
   * Initialize the cache directory.
   */
  async initialize(): Promise<void> {
    if (!this.enableCache) {
      return;
    }

    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      console.error('Failed to initialize cache directory:', error);
      this.enableCache = false;
    }
  }

  /**
   * Get the cache file path for a workspace.
   */
  private getCacheFilePath(workspaceId: string): string {
    return path.join(this.cacheDir, `${workspaceId}.json`);
  }

  /**
   * Generate a hash of the workspace path for validation.
   */
  private hashWorkspacePath(workspacePath: string): string {
    return createHash('sha256').update(workspacePath).digest('hex');
  }

  /**
   * Serialize a SymbolIndex to a plain object for JSON storage.
   */
  private serializeIndex(index: SymbolIndex): SerializedSymbolIndex {
    const byLanguage: Record<string, Record<string, Record<string, SymbolResult[]>>> = {};

    for (const [lang, kindMap] of index.byLanguage.entries()) {
      byLanguage[lang] = {};
      for (const [kind, nameMap] of kindMap.entries()) {
        byLanguage[lang][kind] = {};
        for (const [name, symbols] of nameMap.entries()) {
          byLanguage[lang][kind][name] = symbols;
        }
      }
    }

    return {
      byLanguage,
      totalSymbols: index.totalSymbols,
      lastIndexed: index.lastIndexed.toISOString(),
    };
  }

  /**
   * Deserialize a plain object back to a SymbolIndex.
   */
  private deserializeIndex(serialized: SerializedSymbolIndex): SymbolIndex {
    const byLanguage = new Map<
      SupportedLanguage,
      Map<string, Map<string, SymbolResult[]>>
    >();

    for (const [lang, kindMap] of Object.entries(serialized.byLanguage)) {
      const langMap = new Map<string, Map<string, SymbolResult[]>>();
      for (const [kind, nameMap] of Object.entries(kindMap)) {
        const kindMapInner = new Map<string, SymbolResult[]>();
        for (const [name, symbols] of Object.entries(nameMap)) {
          kindMapInner.set(name, symbols);
        }
        langMap.set(kind, kindMapInner);
      }
      byLanguage.set(lang as SupportedLanguage, langMap);
    }

    return {
      byLanguage,
      totalSymbols: serialized.totalSymbols,
      lastIndexed: new Date(serialized.lastIndexed),
    };
  }

  /**
   * Get file modification times for all source files in a workspace.
   * This is used for cache invalidation.
   */
  private async getFileMtimes(workspacePath: string): Promise<Record<string, number>> {
    const mtimes: Record<string, number> = {};

    try {
      // Read all files recursively
      const files = await this.getAllFiles(workspacePath);

      // Get mtime for each file
      for (const file of files) {
        try {
          const stats = await fs.stat(file);
          mtimes[file] = stats.mtimeMs;
        } catch {
          // Skip files that can't be read
        }
      }
    } catch (error) {
      console.error('Error getting file mtimes:', error);
    }

    return mtimes;
  }

  /**
   * Recursively get all files in a directory.
   */
  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Skip common directories that shouldn't be indexed
      if (entry.isDirectory()) {
        const skipDirs = ['node_modules', '.git', 'dist', 'build', 'target', '.cache'];
        if (skipDirs.includes(entry.name)) {
          continue;
        }
        files.push(...await this.getAllFiles(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Check if cache is valid for a workspace.
   * Returns true if cache exists and files haven't changed.
   */
  async isCacheValid(workspaceId: string, workspacePath: string): Promise<boolean> {
    if (!this.enableCache) {
      return false;
    }

    try {
      const cacheFilePath = this.getCacheFilePath(workspaceId);

      // Check if cache file exists
      try {
        await fs.access(cacheFilePath);
      } catch {
        return false;
      }

      // Read and parse cache
      const cacheContent = await fs.readFile(cacheFilePath, 'utf-8');
      const cached: CachedIndex = JSON.parse(cacheContent);

      // Validate cache version
      if (cached.metadata.version !== CACHE_VERSION) {
        console.log(`Cache version mismatch: ${cached.metadata.version} !== ${CACHE_VERSION}`);
        return false;
      }

      // Validate workspace path hash
      const currentHash = this.hashWorkspacePath(workspacePath);
      if (cached.metadata.workspaceHash !== currentHash) {
        console.log('Workspace path changed - cache invalid');
        return false;
      }

      // Check if any files have been modified
      const currentMtimes = await this.getFileMtimes(workspacePath);
      const cachedMtimes = cached.metadata.fileMtimes;

      // Check for new files
      for (const file of Object.keys(currentMtimes)) {
        if (!(file in cachedMtimes)) {
          console.log(`New file detected: ${file}`);
          return false;
        }
      }

      // Check for modified files
      for (const [file, cachedMtime] of Object.entries(cachedMtimes)) {
        const currentMtime = currentMtimes[file];
        if (currentMtime === undefined) {
          // File was deleted
          console.log(`File deleted: ${file}`);
          return false;
        }
        if (currentMtime !== cachedMtime) {
          console.log(`File modified: ${file}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error checking cache validity:', error);
      return false;
    }
  }

  /**
   * Save an index to cache.
   */
  async saveCache(
    workspaceId: string,
    workspacePath: string,
    index: SymbolIndex
  ): Promise<void> {
    if (!this.enableCache) {
      return;
    }

    try {
      await this.initialize();

      const fileMtimes = await this.getFileMtimes(workspacePath);
      const serializedIndex = this.serializeIndex(index);

      const cached: CachedIndex = {
        metadata: {
          version: CACHE_VERSION,
          workspaceId,
          workspacePath,
          workspaceHash: this.hashWorkspacePath(workspacePath),
          lastIndexed: index.lastIndexed.toISOString(),
          fileMtimes,
          totalSymbols: index.totalSymbols,
        },
        index: serializedIndex,
      };

      const cacheFilePath = this.getCacheFilePath(workspaceId);
      await fs.writeFile(cacheFilePath, JSON.stringify(cached, null, 2), 'utf-8');

      console.log(`Cache saved for workspace ${workspaceId} (${index.totalSymbols} symbols)`);
    } catch (error) {
      console.error('Failed to save cache:', error);
      // Don't throw - caching is optional
    }
  }

  /**
   * Load an index from cache.
   * Returns null if cache doesn't exist or is invalid.
   */
  async loadCache(workspaceId: string, workspacePath: string): Promise<SymbolIndex | null> {
    if (!this.enableCache) {
      return null;
    }

    try {
      // Check if cache is valid first
      const isValid = await this.isCacheValid(workspaceId, workspacePath);
      if (!isValid) {
        return null;
      }

      const cacheFilePath = this.getCacheFilePath(workspaceId);
      const cacheContent = await fs.readFile(cacheFilePath, 'utf-8');
      const cached: CachedIndex = JSON.parse(cacheContent);

      const index = this.deserializeIndex(cached.index);
      console.log(`Cache loaded for workspace ${workspaceId} (${index.totalSymbols} symbols)`);

      return index;
    } catch (error) {
      console.error('Failed to load cache:', error);
      return null;
    }
  }

  /**
   * Clear cache for a specific workspace.
   */
  async clearCache(workspaceId: string): Promise<void> {
    if (!this.enableCache) {
      return;
    }

    try {
      const cacheFilePath = this.getCacheFilePath(workspaceId);
      await fs.unlink(cacheFilePath);
      console.log(`Cache cleared for workspace ${workspaceId}`);
    } catch (error) {
      // Cache file might not exist - that's okay
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Failed to clear cache:', error);
      }
    }
  }

  /**
   * Clear all caches.
   */
  async clearAllCaches(): Promise<void> {
    if (!this.enableCache) {
      return;
    }

    try {
      const files = await fs.readdir(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(this.cacheDir, file));
        }
      }
      console.log('All caches cleared');
    } catch (error) {
      console.error('Failed to clear all caches:', error);
    }
  }

  /**
   * Get cache statistics for a workspace.
   */
  async getCacheStats(workspaceId: string, workspacePath: string): Promise<CacheStats | null> {
    if (!this.enableCache) {
      return null;
    }

    try {
      const cacheFilePath = this.getCacheFilePath(workspaceId);

      // Check if cache exists
      let cacheExists = false;
      let cacheSize = 0;
      try {
        const stats = await fs.stat(cacheFilePath);
        cacheExists = true;
        cacheSize = stats.size;
      } catch {
        return {
          workspaceId,
          workspacePath,
          totalSymbols: 0,
          lastIndexed: new Date(0),
          cacheSize: 0,
          cacheAge: 0,
          fileCount: 0,
          isCached: false,
        };
      }

      if (!cacheExists) {
        return null;
      }

      // Read cache
      const cacheContent = await fs.readFile(cacheFilePath, 'utf-8');
      const cached: CachedIndex = JSON.parse(cacheContent);

      const lastIndexed = new Date(cached.metadata.lastIndexed);
      const cacheAge = Date.now() - lastIndexed.getTime();
      const fileCount = Object.keys(cached.metadata.fileMtimes).length;

      return {
        workspaceId,
        workspacePath,
        totalSymbols: cached.metadata.totalSymbols,
        lastIndexed,
        cacheSize,
        cacheAge,
        fileCount,
        isCached: true,
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return null;
    }
  }

  /**
   * Get statistics for all caches.
   */
  async getAllCacheStats(): Promise<CacheStats[]> {
    if (!this.enableCache) {
      return [];
    }

    try {
      const stats: CacheStats[] = [];
      const files = await fs.readdir(this.cacheDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const cacheFilePath = path.join(this.cacheDir, file);
          const cacheContent = await fs.readFile(cacheFilePath, 'utf-8');
          const cached: CachedIndex = JSON.parse(cacheContent);

          const fileStats = await fs.stat(cacheFilePath);
          const lastIndexed = new Date(cached.metadata.lastIndexed);
          const cacheAge = Date.now() - lastIndexed.getTime();

          stats.push({
            workspaceId: cached.metadata.workspaceId,
            workspacePath: cached.metadata.workspacePath,
            totalSymbols: cached.metadata.totalSymbols,
            lastIndexed,
            cacheSize: fileStats.size,
            cacheAge,
            fileCount: Object.keys(cached.metadata.fileMtimes).length,
            isCached: true,
          });
        }
      }

      return stats;
    } catch (error) {
      console.error('Failed to get all cache stats:', error);
      return [];
    }
  }
}
