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
  java: {
    url: 'https://github.com/spring-projects/spring-petclinic.git',
    branch: 'main',
    shallow: true,
    depth: 1,
  },
  go: {
    url: 'https://github.com/gin-gonic/gin.git',
    branch: 'master',
    shallow: true,
    depth: 1,
  },
  rust: {
    url: 'https://github.com/BurntSushi/ripgrep.git',
    branch: 'master',
    shallow: true,
    depth: 1,
  },
  javascript: {
    url: 'https://github.com/expressjs/express.git',
    branch: 'master',
    shallow: true,
    depth: 1,
  },
  c: {
    url: 'https://github.com/curl/curl.git',
    branch: 'master',
    shallow: true,
    depth: 1,
  },
  cpp: {
    url: 'https://github.com/nlohmann/json.git',
    branch: 'develop',
    shallow: true,
    depth: 1,
  },
  php: {
    url: 'https://github.com/laravel/framework.git',
    branch: 'master',
    shallow: true,
    depth: 1,
  },
  ruby: {
    url: 'https://github.com/jekyll/jekyll.git',
    branch: 'master',
    shallow: true,
    depth: 1,
  },
  kotlin: {
    url: 'https://github.com/square/okhttp.git',
    branch: 'master',
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

  describe('Java Language Support', () => {
    it('should detect Java stack in Spring PetClinic repo', async () => {
      const repoPath = clonedRepos.get('java')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Java-Stack');

      const result = await detectionEngine.detectStacks(
        workspace.id,
        workspace.rootPath,
        { scanMode: 'thorough' }
      );

      expect(result.detectedStacks.length).toBeGreaterThan(0);

      // Should detect Java (Maven)
      const javaStack = result.detectedStacks.find(s => s.id === 'java-maven');
      expect(javaStack).toBeDefined();
      expect(javaStack?.confidence).toBeGreaterThan(0.8);
    });

    it('should search for Java classes', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping Java symbol search - ctags not available');
        return;
      }

      const repoPath = clonedRepos.get('java')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Java-Symbols');

      await symbolSearchService.refreshIndex(workspace.id, workspace.rootPath);

      const result = await symbolSearchService.searchSymbols(workspace.id, {
        language: 'java',
        name: 'Owner',
        match: 'substring',
        kinds: ['class'],
        limit: 10,
      });

      expect(result.symbols.length).toBeGreaterThan(0);
      result.symbols.forEach(symbol => {
        expect(symbol.language).toBe('java');
        expect(symbol.kind).toBe('class');
      });
    }, 60000);

    it('should search for Java methods', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping Java symbol search - ctags not available');
        return;
      }

      const repoPath = clonedRepos.get('java')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Java-Methods');

      await symbolSearchService.refreshIndex(workspace.id, workspace.rootPath);

      const result = await symbolSearchService.searchSymbols(workspace.id, {
        language: 'java',
        name: 'get',
        match: 'prefix',
        kinds: ['method'],
        limit: 20,
      });

      expect(result.symbols.length).toBeGreaterThan(0);
      result.symbols.forEach(symbol => {
        expect(symbol.language).toBe('java');
        expect(symbol.kind).toBe('method');
        expect(symbol.name.toLowerCase()).toMatch(/^get/);
      });
    }, 60000);

    it('should search for text in Java files', async () => {
      const repoPath = clonedRepos.get('java')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Java-Text');

      const results = await textSearchService.searchText(workspace.rootPath, {
        pattern: 'public class',
        language: 'java',
        literal: true,
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toMatch(/\.java$/);
        expect(result.content).toContain('public class');
      });
    });
  });

  describe('Go Language Support', () => {
    it('should detect Go stack in Gin repo', async () => {
      const repoPath = clonedRepos.get('go')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Go-Stack');

      const result = await detectionEngine.detectStacks(
        workspace.id,
        workspace.rootPath,
        { scanMode: 'thorough' }
      );

      expect(result.detectedStacks.length).toBeGreaterThan(0);

      // Should detect Go
      const goStack = result.detectedStacks.find(s => s.id === 'go');
      expect(goStack).toBeDefined();
      expect(goStack?.confidence).toBeGreaterThan(0.8);
    });

    it('should search for text in Go files', async () => {
      const repoPath = clonedRepos.get('go')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Go-Text');

      const results = await textSearchService.searchText(workspace.rootPath, {
        pattern: 'func \\w+',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toMatch(/\.go$/);
      });
    });

    it('should search for Go package imports', async () => {
      const repoPath = clonedRepos.get('go')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Go-Imports');

      const results = await textSearchService.searchText(workspace.rootPath, {
        pattern: 'import',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toMatch(/\.go$/);
        expect(result.content.toLowerCase()).toContain('import');
      });
    });

    it('should index and search Go structs', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping Go symbol search - ctags not available');
        return;
      }

      const repoPath = clonedRepos.get('go')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Go-Symbols');

      await symbolSearchService.refreshIndex(workspace.id, workspace.rootPath);

      const result = await symbolSearchService.searchSymbols(workspace.id, {
        language: 'go',
        name: 'Context',
        match: 'exact',
      });

      expect(result.symbols.length).toBeGreaterThan(0);
      result.symbols.forEach(symbol => {
        expect(symbol.language).toBe('go');
      });
    }, 60000);
  });

  describe('Rust Language Support', () => {
    it('should detect Rust stack in ripgrep repo', async () => {
      const repoPath = clonedRepos.get('rust')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Rust-Stack');

      const result = await detectionEngine.detectStacks(
        workspace.id,
        workspace.rootPath,
        { scanMode: 'thorough' }
      );

      expect(result.detectedStacks.length).toBeGreaterThan(0);

      // Should detect Rust
      const rustStack = result.detectedStacks.find(s => s.id === 'rust');
      expect(rustStack).toBeDefined();
      expect(rustStack?.confidence).toBeGreaterThan(0.8);
    });

    it('should search for text in Rust files', async () => {
      const repoPath = clonedRepos.get('rust')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Rust-Text');

      const results = await textSearchService.searchText(workspace.rootPath, {
        pattern: 'fn \\w+',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toMatch(/\.rs$/);
      });
    });

    it('should search for Rust structs and impl blocks', async () => {
      const repoPath = clonedRepos.get('rust')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Rust-Structs');

      const results = await textSearchService.searchText(workspace.rootPath, {
        pattern: 'struct|impl',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toMatch(/\.rs$/);
      });
    });

    it('should index and search Rust structs', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping Rust symbol search - ctags not available');
        return;
      }

      const repoPath = clonedRepos.get('rust')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Rust-Symbols');

      await symbolSearchService.refreshIndex(workspace.id, workspace.rootPath);

      const result = await symbolSearchService.searchSymbols(workspace.id, {
        language: 'rust',
        name: 'Searcher',
        match: 'substring',
      });

      expect(result.symbols.length).toBeGreaterThan(0);
      result.symbols.forEach(symbol => {
        expect(symbol.language).toBe('rust');
      });
    }, 60000);
  });

  describe('JavaScript Language Support', () => {
    it('should detect JavaScript/Node.js stack in Express repo', async () => {
      const repoPath = clonedRepos.get('javascript')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'JavaScript-Stack');

      const result = await detectionEngine.detectStacks(
        workspace.id,
        workspace.rootPath,
        { scanMode: 'thorough' }
      );

      expect(result.detectedStacks.length).toBeGreaterThan(0);

      // Should detect Node.js or JavaScript
      const jsStack = result.detectedStacks.find(s =>
        s.id === 'nodejs' || s.id === 'javascript' || s.id === 'express'
      );
      expect(jsStack).toBeDefined();
    });

    it('should search for JavaScript functions', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping JavaScript symbol search - ctags not available');
        return;
      }

      const repoPath = clonedRepos.get('javascript')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'JavaScript-Symbols');

      await symbolSearchService.refreshIndex(workspace.id, workspace.rootPath);

      const result = await symbolSearchService.searchSymbols(workspace.id, {
        language: 'javascript',
        name: 'app',
        match: 'substring',
        kinds: ['function', 'variable'],
        limit: 10,
      });

      expect(result.symbols.length).toBeGreaterThan(0);
      result.symbols.forEach(symbol => {
        expect(symbol.language).toBe('javascript');
      });
    }, 60000);

    it('should search for text in JavaScript files', async () => {
      const repoPath = clonedRepos.get('javascript')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'JavaScript-Text');

      const results = await textSearchService.searchText(workspace.rootPath, {
        pattern: 'function',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toMatch(/\.js$/);
        expect(result.content.toLowerCase()).toContain('function');
      });
    });

    it('should search for JavaScript exports', async () => {
      const repoPath = clonedRepos.get('javascript')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'JavaScript-Exports');

      const results = await textSearchService.searchText(workspace.rootPath, {
        pattern: 'exports|module\\.exports',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toMatch(/\.js$/);
      });
    });
  });

  describe('C Language Support', () => {
    it('should index and search C functions', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping C symbol search - ctags not available');
        return;
      }

      const repoPath = clonedRepos.get('c')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'C-Symbols');

      await symbolSearchService.refreshIndex(workspace.id, workspace.rootPath);

      const result = await symbolSearchService.searchSymbols(workspace.id, {
        language: 'c',
        name: 'curl',
        match: 'prefix',
      });

      expect(result.symbols.length).toBeGreaterThan(0);
      result.symbols.forEach(symbol => {
        expect(symbol.language).toBe('c');
      });
    }, 60000);

    it('should search for C struct definitions', async () => {
      const repoPath = clonedRepos.get('c')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'C-Structs');

      const results = await textSearchService.searchText(workspace.rootPath, {
        pattern: 'struct \\w+',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toMatch(/\.(c|h)$/);
      });
    });
  });

  describe('C++ Language Support', () => {
    it('should index and search C++ classes', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping C++ symbol search - ctags not available');
        return;
      }

      const repoPath = clonedRepos.get('cpp')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'CPP-Symbols');

      await symbolSearchService.refreshIndex(workspace.id, workspace.rootPath);

      const result = await symbolSearchService.searchSymbols(workspace.id, {
        language: 'cpp',
        name: 'json',
        match: 'substring',
      });

      expect(result.symbols.length).toBeGreaterThan(0);
      result.symbols.forEach(symbol => {
        expect(symbol.language).toBe('cpp');
      });
    }, 60000);

    it('should search for C++ namespaces', async () => {
      const repoPath = clonedRepos.get('cpp')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'CPP-Namespaces');

      const results = await textSearchService.searchText(workspace.rootPath, {
        pattern: 'namespace \\w+',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toMatch(/\.(cpp|hpp|h|cc|hh)$/);
      });
    });
  });

  describe('PHP Language Support', () => {
    it('should index and search PHP classes', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping PHP symbol search - ctags not available');
        return;
      }

      const repoPath = clonedRepos.get('php')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'PHP-Symbols');

      await symbolSearchService.refreshIndex(workspace.id, workspace.rootPath);

      const result = await symbolSearchService.searchSymbols(workspace.id, {
        language: 'php',
        name: 'Controller',
        match: 'substring',
      });

      expect(result.symbols.length).toBeGreaterThan(0);
      result.symbols.forEach(symbol => {
        expect(symbol.language).toBe('php');
      });
    }, 60000);

    it('should search for PHP namespace declarations', async () => {
      const repoPath = clonedRepos.get('php')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'PHP-Namespaces');

      const results = await textSearchService.searchText(workspace.rootPath, {
        pattern: 'namespace \\w+',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toMatch(/\.php$/);
      });
    });
  });

  describe('Ruby Language Support', () => {
    it('should index and search Ruby classes', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping Ruby symbol search - ctags not available');
        return;
      }

      const repoPath = clonedRepos.get('ruby')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Ruby-Symbols');

      await symbolSearchService.refreshIndex(workspace.id, workspace.rootPath);

      const result = await symbolSearchService.searchSymbols(workspace.id, {
        language: 'ruby',
        name: 'Jekyll',
        match: 'substring',
      });

      expect(result.symbols.length).toBeGreaterThan(0);
      result.symbols.forEach(symbol => {
        expect(symbol.language).toBe('ruby');
      });
    }, 60000);

    it('should search for Ruby module definitions', async () => {
      const repoPath = clonedRepos.get('ruby')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Ruby-Modules');

      const results = await textSearchService.searchText(workspace.rootPath, {
        pattern: 'module \\w+',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toMatch(/\.rb$/);
      });
    });
  });

  describe('Kotlin Language Support', () => {
    it('should index and search Kotlin classes', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping Kotlin symbol search - ctags not available');
        return;
      }

      const repoPath = clonedRepos.get('kotlin')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Kotlin-Symbols');

      await symbolSearchService.refreshIndex(workspace.id, workspace.rootPath);

      const result = await symbolSearchService.searchSymbols(workspace.id, {
        language: 'kotlin',
        name: 'Http',
        match: 'prefix',
      });

      expect(result.symbols.length).toBeGreaterThan(0);
      result.symbols.forEach(symbol => {
        expect(symbol.language).toBe('kotlin');
      });
    }, 60000);

    it('should search for Kotlin data classes', async () => {
      const repoPath = clonedRepos.get('kotlin')!;
      const workspace = await workspaceManager.addWorkspace(repoPath, 'Kotlin-DataClasses');

      const results = await textSearchService.searchText(workspace.rootPath, {
        pattern: 'data class|class \\w+',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toMatch(/\.kt$/);
      });
    });
  });
});
