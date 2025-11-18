/**
 * Integration tests for the MCP server using real GitHub repositories.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { simpleGit } from 'simple-git';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WorkspaceManager } from '../../src/workspace/workspace-manager.js';
import { StackDetectionEngine } from '../../src/stack-detection/detection-engine.js';
import { SymbolIndexer } from '../../src/symbol-search/symbol-indexer.js';
import { SymbolSearchService } from '../../src/symbol-search/symbol-search-service.js';
import { TextSearchService } from '../../src/symbol-search/text-search-service.js';
import { isCTagsAvailable } from '../../src/symbol-search/ctags-integration.js';
import type { StackRegistry } from '../../src/types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_REPOS_DIR = path.join(__dirname, 'repos');

// Test repositories - real, popular GitHub repos
const TEST_REPOSITORIES = {
  typescript: {
    url: 'https://github.com/microsoft/TypeScript.git',
    branch: 'main',
    shallow: true,
    depth: 1,
  },
  flask: {
    url: 'https://github.com/pallets/flask.git',
    branch: 'main',
    shallow: true,
    depth: 1,
  },
};

describe('MCP Server Integration Tests', () => {
  let workspaceManager: WorkspaceManager;
  let stackRegistry: StackRegistry;
  let detectionEngine: StackDetectionEngine;
  let symbolIndexer: SymbolIndexer;
  let symbolSearchService: SymbolSearchService;
  let textSearchService: TextSearchService;
  let ctagsAvailable: boolean;

  const clonedRepos: Map<string, string> = new Map();

  beforeAll(async () => {
    // Check if ctags is available
    ctagsAvailable = await isCTagsAvailable();

    // Create test repos directory
    await fs.mkdir(TEST_REPOS_DIR, { recursive: true });

    // Clone test repositories
    console.log('Cloning test repositories...');
    for (const [name, config] of Object.entries(TEST_REPOSITORIES)) {
      const repoPath = path.join(TEST_REPOS_DIR, name);

      // Skip if already exists
      try {
        await fs.access(repoPath);
        console.log(`Repository ${name} already exists, skipping clone`);
        clonedRepos.set(name, repoPath);
        continue;
      } catch {
        // Repo doesn't exist, clone it
      }

      console.log(`Cloning ${name} from ${config.url}...`);
      const git = simpleGit();
      await git.clone(config.url, repoPath, [
        '--depth',
        String(config.depth),
        '--branch',
        config.branch,
        '--single-branch',
      ]);
      clonedRepos.set(name, repoPath);
      console.log(`Cloned ${name} successfully`);
    }

    // Load stack registry
    const stacksPath = path.join(__dirname, '../../src/stacks.json');
    const content = await fs.readFile(stacksPath, 'utf-8');
    stackRegistry = JSON.parse(content) as StackRegistry;

    // Initialize services
    workspaceManager = new WorkspaceManager();
    detectionEngine = new StackDetectionEngine(stackRegistry);
    symbolIndexer = new SymbolIndexer();
    symbolSearchService = new SymbolSearchService(symbolIndexer);
    textSearchService = new TextSearchService();
  }, 120000); // 2 minute timeout for cloning

  afterAll(async () => {
    // Clean up cloned repositories
    console.log('Cleaning up test repositories...');
    try {
      await fs.rm(TEST_REPOS_DIR, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test repos:', error);
    }
  });

  describe('Workspace Management', () => {
    it('should add a workspace successfully', async () => {
      const repoPath = clonedRepos.get('typescript');
      expect(repoPath).toBeDefined();

      const workspace = await workspaceManager.addWorkspace(repoPath!, 'TypeScript');

      expect(workspace).toBeDefined();
      expect(workspace.id).toMatch(/^ws-\d+$/);
      expect(workspace.name).toBe('TypeScript');
      expect(workspace.rootPath).toBe(repoPath);
      expect(workspace.createdAt).toBeInstanceOf(Date);
      expect(workspace.lastAccessed).toBeInstanceOf(Date);
    });

    it('should list workspaces', async () => {
      const workspaces = workspaceManager.listWorkspaces();
      expect(workspaces.length).toBeGreaterThan(0);
      expect(workspaces[0]?.name).toBe('TypeScript');
    });

    it('should retrieve a workspace by ID', async () => {
      const workspaces = workspaceManager.listWorkspaces();
      const workspace = workspaceManager.getWorkspace(workspaces[0]!.id);

      expect(workspace).toBeDefined();
      expect(workspace?.name).toBe('TypeScript');
    });

    it('should add multiple workspaces', async () => {
      const flaskPath = clonedRepos.get('flask');
      expect(flaskPath).toBeDefined();

      const workspace = await workspaceManager.addWorkspace(flaskPath!, 'Flask');
      expect(workspace.name).toBe('Flask');

      const allWorkspaces = workspaceManager.listWorkspaces();
      expect(allWorkspaces.length).toBe(2);
    });
  });

  describe('Stack Detection', () => {
    it('should detect TypeScript stack in TypeScript repo', async () => {
      const repoPath = clonedRepos.get('typescript')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'TypeScript-Stack');

      const result = await detectionEngine.detectStacks(
        workspace.id,
        workspace.rootPath,
        { scanMode: 'thorough' }
      );

      expect(result.detectedStacks.length).toBeGreaterThan(0);

      // Should detect TypeScript or JavaScript (TypeScript repo contains both)
      const langStack = result.detectedStacks.find(s =>
        s.id === 'typescript' || s.id === 'javascript'
      );
      expect(langStack).toBeDefined();
      expect(langStack?.confidence).toBeGreaterThan(0.3);

      // Should also detect Node.js (TypeScript depends on Node)
      const nodeStack = result.detectedStacks.find(s => s.id === 'nodejs');
      expect(nodeStack).toBeDefined();
    });

    it('should detect Python stack in Flask repo', async () => {
      const repoPath = clonedRepos.get('flask')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Flask-Stack');

      const result = await detectionEngine.detectStacks(
        workspace.id,
        workspace.rootPath,
        { scanMode: 'thorough' }
      );

      expect(result.detectedStacks.length).toBeGreaterThan(0);

      // Should detect Python
      const pythonStack = result.detectedStacks.find(s => s.id === 'python');
      expect(pythonStack).toBeDefined();
      expect(pythonStack?.confidence).toBeGreaterThan(0.5);
    });

    it('should generate summary with dominant languages', async () => {
      const repoPath = clonedRepos.get('typescript')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'TypeScript-Summary');

      const result = await detectionEngine.detectStacks(
        workspace.id,
        workspace.rootPath,
        { scanMode: 'thorough' }
      );

      expect(result.summary).toBeDefined();
      expect(result.summary?.dominantLanguages).toBeDefined();
      expect(result.summary?.dominantLanguages?.length).toBeGreaterThan(0);
    });
  });

  describe('Symbol Search', () => {
    it('should build symbol index for TypeScript repo', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping symbol search tests - ctags not available');
        return;
      }

      const repoPath = clonedRepos.get('typescript')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'TypeScript-Symbols');

      await symbolIndexer.buildIndex(workspace.id, workspace.rootPath);

      const index = symbolIndexer.getIndex(workspace.id);
      expect(index).toBeDefined();
      expect(index?.totalSymbols).toBeGreaterThan(0);
    }, 60000); // 1 minute timeout for indexing

    it('should search for TypeScript classes', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping symbol search tests - ctags not available');
        return;
      }

      const repoPath = clonedRepos.get('typescript')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'TypeScript-Search');

      await symbolSearchService.refreshIndex(workspace.id, workspace.rootPath);

      const result = await symbolSearchService.searchSymbols(workspace.id, {
        language: 'typescript',
        name: 'Node',
        match: 'substring',
        kinds: ['class', 'interface'],
        limit: 10,
      });

      expect(result.symbols.length).toBeGreaterThan(0);
      result.symbols.forEach(symbol => {
        expect(symbol.language).toBe('typescript');
        expect(['class', 'interface']).toContain(symbol.kind);
        expect(symbol.name.toLowerCase()).toContain('node');
      });
    }, 60000);

    it('should search for Python functions', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping symbol search tests - ctags not available');
        return;
      }

      const repoPath = clonedRepos.get('flask')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Flask-Symbols');

      await symbolSearchService.refreshIndex(workspace.id, workspace.rootPath);

      const result = await symbolSearchService.searchSymbols(workspace.id, {
        language: 'python',
        name: 'render',
        match: 'substring',
        kinds: ['function', 'method'],
        limit: 10,
      });

      expect(result.symbols.length).toBeGreaterThan(0);
      result.symbols.forEach(symbol => {
        expect(symbol.language).toBe('python');
        expect(['function', 'method']).toContain(symbol.kind);
      });
    }, 60000);

    it('should use exact match mode', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping symbol search tests - ctags not available');
        return;
      }

      const repoPath = clonedRepos.get('typescript')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'TypeScript-Exact');

      await symbolSearchService.refreshIndex(workspace.id, workspace.rootPath);

      const result = await symbolSearchService.searchSymbols(workspace.id, {
        language: 'typescript',
        name: 'SourceFile',
        match: 'exact',
        limit: 10,
      });

      // All results should have exact name match
      result.symbols.forEach(symbol => {
        expect(symbol.name).toBe('SourceFile');
      });
    }, 60000);
  });

  describe('Text Search', () => {
    it('should search for text patterns in TypeScript files', async () => {
      const repoPath = clonedRepos.get('typescript')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'TypeScript-Text');

      const results = await textSearchService.searchText(workspace.rootPath, {
        pattern: 'export',
        language: 'typescript',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toBeDefined();
        expect(result.line).toBeGreaterThan(0);
        expect(result.content.toLowerCase()).toContain('export');
      });
    });

    it('should search for text patterns in Python files', async () => {
      const repoPath = clonedRepos.get('flask')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Flask-Text');

      const results = await textSearchService.searchText(workspace.rootPath, {
        pattern: 'import',
        language: 'python',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toMatch(/\.py$/);
        expect(result.content.toLowerCase()).toContain('import');
      });
    });

    it('should support case-insensitive search', async () => {
      const repoPath = clonedRepos.get('typescript')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'TypeScript-CaseInsensitive');

      const results = await textSearchService.searchText(workspace.rootPath, {
        pattern: 'FUNCTION',
        language: 'typescript',
        caseInsensitive: true,
        limit: 5,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should support literal string search', async () => {
      const repoPath = clonedRepos.get('flask')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Flask-Literal');

      const results = await textSearchService.searchText(workspace.rootPath, {
        pattern: 'def ',
        language: 'python',
        literal: true,
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should perform complete workflow: add workspace, detect stacks, search symbols, search text', async () => {
      const repoPath = clonedRepos.get('typescript')!;

      // Step 1: Add workspace
      const workspace = await workspaceManager.addWorkspace(repoPath, 'TypeScript-E2E');
      expect(workspace.id).toBeDefined();

      // Step 2: Detect stacks
      const stackResult = await detectionEngine.detectStacks(
        workspace.id,
        workspace.rootPath,
        { scanMode: 'fast' }
      );
      expect(stackResult.detectedStacks.length).toBeGreaterThan(0);

      // Step 3: Search symbols (if ctags available)
      if (ctagsAvailable) {
        await symbolSearchService.refreshIndex(workspace.id, workspace.rootPath);
        const symbolResult = await symbolSearchService.searchSymbols(workspace.id, {
          language: 'typescript',
          name: 'Type',
          match: 'prefix',
          limit: 5,
        });
        expect(symbolResult.symbols.length).toBeGreaterThan(0);
      }

      // Step 4: Search text
      const textResult = await textSearchService.searchText(workspace.rootPath, {
        pattern: 'class',
        language: 'typescript',
        limit: 5,
      });
      expect(textResult.length).toBeGreaterThan(0);
    }, 90000); // 90 second timeout
  });
});
