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
import { FileSearchService } from '../../src/file-search/file-search-service.js';
import { DependencyAnalyzer } from '../../src/dependency-analysis/dependency-analyzer.js';
import { isCTagsAvailable } from '../../src/symbol-search/ctags-integration.js';
import type { StackRegistry } from '../../src/types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_REPOS_DIR = path.join(__dirname, 'repos');
const TEST_CACHE_DIR = path.join(__dirname, 'integration-cache');

// Test repositories - real, popular GitHub repos
// Reduced set for faster CI while maintaining language coverage
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
};

describe('MCP Server Integration Tests', () => {
  let workspaceManager: WorkspaceManager;
  let stackRegistry: StackRegistry;
  let detectionEngine: StackDetectionEngine;
  let symbolIndexer: SymbolIndexer;
  let symbolSearchService: SymbolSearchService;
  let textSearchService: TextSearchService;
  let fileSearchService: FileSearchService;
  let dependencyAnalyzer: DependencyAnalyzer;
  let ctagsAvailable: boolean;

  const clonedRepos: Map<string, string> = new Map();
  // Reusable workspaces to enable caching
  const workspaces: Map<string, { id: string; path: string }> = new Map();

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
    await fs.mkdir(TEST_CACHE_DIR, { recursive: true });
    workspaceManager = new WorkspaceManager(TEST_CACHE_DIR);
    await workspaceManager.initialize();
    detectionEngine = new StackDetectionEngine(stackRegistry);
    symbolIndexer = new SymbolIndexer();
    symbolSearchService = new SymbolSearchService(symbolIndexer);
    textSearchService = new TextSearchService();
    fileSearchService = new FileSearchService();
    dependencyAnalyzer = new DependencyAnalyzer();

    // Pre-create workspaces and build symbol indices to enable caching
    console.log('Setting up workspaces and building symbol indices...');
    for (const [name, repoPath] of clonedRepos.entries()) {
      const workspace = await workspaceManager.addWorkspace(repoPath, name);
      workspaces.set(name, { id: workspace.id, path: repoPath });

      // Pre-build symbol index if ctags is available
      if (ctagsAvailable) {
        console.log(`Building symbol index for ${name}...`);
        await symbolSearchService.refreshIndex(workspace.id, repoPath);
      }
    }
    console.log('Setup complete!');
  }, 120000); // 2 minute timeout for cloning

  afterAll(async () => {
    // Clean up test cache directory
    try {
      await fs.rm(TEST_CACHE_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }

    // Clean up cloned repositories
    console.log('Cleaning up test repositories...');
    try {
      await fs.rm(TEST_REPOS_DIR, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test repos:', error);
    }
  });

  describe('Workspace Management', () => {
    it('should have created workspaces successfully', async () => {
      const workspace = workspaces.get('typescript');
      expect(workspace).toBeDefined();
      expect(workspace?.id).toBe('typescript');

      const retrieved = workspaceManager.getWorkspace(workspace!.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.rootPath).toBe(workspace?.path);
    });

    it('should list all workspaces', async () => {
      const allWorkspaces = workspaceManager.listWorkspaces();
      expect(allWorkspaces.length).toBe(Object.keys(TEST_REPOSITORIES).length);
    });

    it('should retrieve workspace by ID', async () => {
      const workspace = workspaces.get('flask');
      const retrieved = workspaceManager.getWorkspace(workspace!.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('flask');
    });
  });

  describe('Stack Detection', () => {
    it('should detect TypeScript stack in TypeScript repo', async () => {
      const workspace = workspaces.get('typescript')!;

      const result = await detectionEngine.detectStacks(
        workspace.id,
        workspace.path,
        { scanMode: 'fast' }  // Use fast mode for testing
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
      const workspace = workspaces.get('flask')!;

      const result = await detectionEngine.detectStacks(
        workspace.id,
        workspace.path,
        { scanMode: 'fast' }  // Use fast mode for testing
      );

      expect(result.detectedStacks.length).toBeGreaterThan(0);

      // Should detect Python
      const pythonStack = result.detectedStacks.find(s => s.id === 'python');
      expect(pythonStack).toBeDefined();
      expect(pythonStack?.confidence).toBeGreaterThan(0.5);
    });

    it('should generate summary with dominant languages', async () => {
      const workspace = workspaces.get('typescript')!;

      const result = await detectionEngine.detectStacks(
        workspace.id,
        workspace.path,
        { scanMode: 'fast' }  // Use fast mode for testing
      );

      expect(result.summary).toBeDefined();
      expect(result.summary?.dominantLanguages).toBeDefined();
      expect(result.summary?.dominantLanguages?.length).toBeGreaterThan(0);
    });
  });

  describe('Symbol Search', () => {
    it('should have built symbol index for TypeScript repo', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping symbol search tests - ctags not available');
        return;
      }

      const workspace = workspaces.get('typescript')!;
      const index = symbolIndexer.getIndex(workspace.id);
      expect(index).toBeDefined();
      expect(index?.totalSymbols).toBeGreaterThan(0);
    });

    it('should search for TypeScript classes', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping symbol search tests - ctags not available');
        return;
      }

      const workspace = workspaces.get('typescript')!;

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
    });

    it('should search for Python functions', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping symbol search tests - ctags not available');
        return;
      }

      const workspace = workspaces.get('flask')!;

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
    });

    it('should use exact match mode', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping symbol search tests - ctags not available');
        return;
      }

      const workspace = workspaces.get('typescript')!;

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
    });
  });

  describe('Text Search', () => {
    it('should search for text patterns in TypeScript files', async () => {
      const workspace = workspaces.get('typescript')!;

      const results = await textSearchService.searchText(workspace.path, {
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
      const workspace = workspaces.get('flask')!;

      const results = await textSearchService.searchText(workspace.path, {
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
      const workspace = workspaces.get('typescript')!;

      const results = await textSearchService.searchText(workspace.path, {
        pattern: 'FUNCTION',
        language: 'typescript',
        caseInsensitive: true,
        limit: 5,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should support literal string search', async () => {
      const workspace = workspaces.get('flask')!;

      const results = await textSearchService.searchText(workspace.path, {
        pattern: 'def ',
        language: 'python',
        literal: true,
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should perform complete workflow: workspace access, detect stacks, search symbols, search text', async () => {
      const workspace = workspaces.get('typescript')!;

      // Step 1: Verify workspace exists
      expect(workspace.id).toBeDefined();
      const retrieved = workspaceManager.getWorkspace(workspace.id);
      expect(retrieved).toBeDefined();

      // Step 2: Detect stacks
      const stackResult = await detectionEngine.detectStacks(
        workspace.id,
        workspace.path,
        { scanMode: 'fast' }
      );
      expect(stackResult.detectedStacks.length).toBeGreaterThan(0);

      // Step 3: Search symbols (if ctags available)
      if (ctagsAvailable) {
        const symbolResult = await symbolSearchService.searchSymbols(workspace.id, {
          language: 'typescript',
          name: 'Type',
          match: 'prefix',
          limit: 5,
        });
        expect(symbolResult.symbols.length).toBeGreaterThan(0);
      }

      // Step 4: Search text
      const textResult = await textSearchService.searchText(workspace.path, {
        pattern: 'class',
        language: 'typescript',
        limit: 5,
      });
      expect(textResult.length).toBeGreaterThan(0);
    });
  });

  describe('Java Language Support', () => {
    it('should detect Java stack in Spring PetClinic repo', async () => {
      const workspace = workspaces.get('java')!;

      const result = await detectionEngine.detectStacks(
        workspace.id,
        workspace.path,
        { scanMode: 'fast' }
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

      const workspace = workspaces.get('java')!;

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
    });

    it('should search for text in Java files', async () => {
      const workspace = workspaces.get('java')!;

      const results = await textSearchService.searchText(workspace.path, {
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
      const workspace = workspaces.get('go')!;

      const result = await detectionEngine.detectStacks(
        workspace.id,
        workspace.path,
        { scanMode: 'fast' }
      );

      expect(result.detectedStacks.length).toBeGreaterThan(0);

      // Should detect Go
      const goStack = result.detectedStacks.find(s => s.id === 'go');
      expect(goStack).toBeDefined();
      expect(goStack?.confidence).toBeGreaterThan(0.8);
    });

    it('should search for text in Go files', async () => {
      const workspace = workspaces.get('go')!;

      const results = await textSearchService.searchText(workspace.path, {
        pattern: 'func \\w+',
        language: 'go',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.file).toMatch(/\.go$/);
      });
    });

    it('should index and search Go structs', async () => {
      if (!ctagsAvailable) {
        console.log('Skipping Go symbol search - ctags not available');
        return;
      }

      const workspace = workspaces.get('go')!;

      const result = await symbolSearchService.searchSymbols(workspace.id, {
        language: 'go',
        name: 'Context',
        match: 'exact',
      });

      expect(result.symbols.length).toBeGreaterThan(0);
      result.symbols.forEach(symbol => {
        expect(symbol.language).toBe('go');
      });
    });
  });

  describe('Rust Language Support', () => {
    it('should detect Rust stack in ripgrep repo', async () => {
      const workspace = workspaces.get('rust')!;

      const result = await detectionEngine.detectStacks(
        workspace.id,
        workspace.path,
        { scanMode: 'fast' }
      );

      expect(result.detectedStacks.length).toBeGreaterThan(0);

      // Should detect Rust
      const rustStack = result.detectedStacks.find(s => s.id === 'rust');
      expect(rustStack).toBeDefined();
      expect(rustStack?.confidence).toBeGreaterThan(0.7);
    });

    it('should search for text in Rust files', async () => {
      const workspace = workspaces.get('rust')!;

      const results = await textSearchService.searchText(workspace.path, {
        pattern: 'fn \\w+',
        language: 'rust',
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

      const workspace = workspaces.get('rust')!;

      const result = await symbolSearchService.searchSymbols(workspace.id, {
        language: 'rust',
        name: 'Searcher',
        match: 'substring',
      });

      expect(result.symbols.length).toBeGreaterThan(0);
      result.symbols.forEach(symbol => {
        expect(symbol.language).toBe('rust');
      });
    });
  });

  describe('File Search', () => {
    it('should find TypeScript configuration files', async () => {
      const workspace = workspaces.get('typescript')!;

      const result = await fileSearchService.searchFiles(workspace.path, {
        name: 'tsconfig*.json',
      });

      expect(result.files.length).toBeGreaterThan(0);
      result.files.forEach(file => {
        expect(file.relative_path).toMatch(/tsconfig.*\.json$/);
        expect(file.size_bytes).toBeGreaterThan(0);
        expect(new Date(file.modified)).toBeInstanceOf(Date);
      });
    });

    it('should find Python source files by extension', async () => {
      const workspace = workspaces.get('flask')!;

      const result = await fileSearchService.searchFiles(workspace.path, {
        extension: 'py',
        limit: 20,
      });

      expect(result.files.length).toBeGreaterThan(0);
      expect(result.files.length).toBeLessThanOrEqual(20);
      result.files.forEach(file => {
        expect(file.relative_path).toMatch(/\.py$/);
      });
    });

    it('should find Java files with pattern', async () => {
      const workspace = workspaces.get('java')!;

      const result = await fileSearchService.searchFiles(workspace.path, {
        pattern: '**/*.java',
        limit: 15,
      });

      expect(result.files.length).toBeGreaterThan(0);
      result.files.forEach(file => {
        expect(file.relative_path).toMatch(/\.java$/);
      });
    });

    it('should find test files in Go repository', async () => {
      const workspace = workspaces.get('go')!;

      const result = await fileSearchService.searchFiles(workspace.path, {
        pattern: '**/*_test.go',
      });

      expect(result.files.length).toBeGreaterThan(0);
      result.files.forEach(file => {
        expect(file.relative_path).toMatch(/_test\.go$/);
      });
    });

    it('should find Cargo.toml in Rust repository', async () => {
      const workspace = workspaces.get('rust')!;

      const result = await fileSearchService.searchFiles(workspace.path, {
        name: 'Cargo.toml',
      });

      expect(result.files.length).toBeGreaterThan(0);
      result.files.forEach(file => {
        expect(file.relative_path).toMatch(/Cargo\.toml$/);
      });
    });

    it('should filter by directory', async () => {
      const workspace = workspaces.get('typescript')!;

      const result = await fileSearchService.searchFiles(workspace.path, {
        directory: 'src',
        extension: 'ts',
        limit: 10,
      });

      expect(result.files.length).toBeGreaterThan(0);
      result.files.forEach(file => {
        expect(file.relative_path).toMatch(/^src\//);
        expect(file.relative_path).toMatch(/\.ts$/);
      });
    });

    it('should return total_matches and search_time_ms', async () => {
      const workspace = workspaces.get('flask')!;

      const result = await fileSearchService.searchFiles(workspace.path, {
        extension: 'py',
        limit: 5,
      });

      expect(result.total_matches).toBeGreaterThan(0);
      expect(result.search_time_ms).toBeGreaterThanOrEqual(0);
      expect(result.files.length).toBeLessThanOrEqual(5);
    });

    it('should handle pattern with wildcards', async () => {
      const workspace = workspaces.get('java')!;

      const result = await fileSearchService.searchFiles(workspace.path, {
        pattern: '**/test/**/*.java',
      });

      expect(result.files.length).toBeGreaterThan(0);
      result.files.forEach(file => {
        expect(file.relative_path).toMatch(/test/);
        expect(file.relative_path).toMatch(/\.java$/);
      });
    });
  });

  describe('Dependency Analysis', () => {
    it('should analyze TypeScript/npm dependencies', async () => {
      const workspace = workspaces.get('typescript')!;

      const result = await dependencyAnalyzer.analyzeDependencies(
        workspace.id,
        workspace.path
      );

      expect(result.workspaceId).toBe(workspace.id);
      expect(result.workspacePath).toBe(workspace.path);
      expect(result.manifests.length).toBeGreaterThan(0);

      // Should find package.json
      const packageJson = result.manifests.find(m => m.type === 'package.json');
      expect(packageJson).toBeDefined();
      expect(packageJson?.ecosystem).toBe('npm');

      // Should have insights
      expect(result.insights).toBeDefined();
      expect(Array.isArray(result.insights)).toBe(true);
    });

    it('should analyze Python dependencies in Flask', async () => {
      const workspace = workspaces.get('flask')!;

      const result = await dependencyAnalyzer.analyzeDependencies(
        workspace.id,
        workspace.path
      );

      expect(result.workspaceId).toBe(workspace.id);
      expect(result.manifests.length).toBeGreaterThan(0);

      // Should find pyproject.toml or setup.py
      const pythonManifest = result.manifests.find(
        m => m.type === 'pyproject.toml' || m.type === 'requirements.txt'
      );
      expect(pythonManifest).toBeDefined();

      if (result.dependencies.length > 0) {
        result.dependencies.forEach(dep => {
          expect(['pip', 'pipenv']).toContain(dep.ecosystem);
          expect(dep.version.raw).toBeDefined();
        });
      }
    });

    it('should analyze Rust dependencies in ripgrep', async () => {
      const workspace = workspaces.get('rust')!;

      const result = await dependencyAnalyzer.analyzeDependencies(
        workspace.id,
        workspace.path
      );

      expect(result.manifests.length).toBeGreaterThan(0);

      // Should find Cargo.toml
      const cargoToml = result.manifests.find(m => m.type === 'Cargo.toml');
      expect(cargoToml).toBeDefined();
      expect(cargoToml?.ecosystem).toBe('cargo');

      // Should have dependencies
      expect(result.dependencies.length).toBeGreaterThan(0);
      result.dependencies.forEach(dep => {
        expect(dep.ecosystem).toBe('cargo');
        expect(dep.name).toBeDefined();
        expect(['production', 'development', 'build']).toContain(dep.scope);
      });

      // Verify version constraints are parsed
      result.dependencies.forEach(dep => {
        expect(dep.version.normalized).toBeDefined();
        if (dep.version.operator) {
          expect(['^', '~', '>=', '<=', '>', '<', '=', '*']).toContain(dep.version.operator);
        }
      });
    });

    it('should analyze Go dependencies in Gin', async () => {
      const workspace = workspaces.get('go')!;

      const result = await dependencyAnalyzer.analyzeDependencies(
        workspace.id,
        workspace.path
      );

      // Should find go.mod
      const goMod = result.manifests.find(m => m.type === 'go.mod');
      expect(goMod).toBeDefined();
      expect(goMod?.ecosystem).toBe('go');
      expect(goMod?.projectName).toContain('gin');

      if (result.dependencies.length > 0) {
        result.dependencies.forEach(dep => {
          expect(dep.ecosystem).toBe('go');
          expect(dep.isDirect).toBeDefined();
        });

        // Should distinguish direct vs indirect
        const directDeps = result.dependencies.filter(d => d.isDirect);
        expect(directDeps.length).toBeGreaterThan(0);
      }
    });

    it('should analyze Java/Maven dependencies in Spring PetClinic', async () => {
      const workspace = workspaces.get('java')!;

      const result = await dependencyAnalyzer.analyzeDependencies(
        workspace.id,
        workspace.path
      );

      // Should find pom.xml or build.gradle (Spring PetClinic uses Gradle)
      const javaManifest = result.manifests.find(
        m => m.type === 'pom.xml' || m.type === 'build.gradle' || m.type === 'build.gradle.kts'
      );
      expect(javaManifest).toBeDefined();
      expect(['maven', 'gradle']).toContain(javaManifest?.ecosystem);

      if (result.dependencies.length > 0) {
        result.dependencies.forEach(dep => {
          expect(['maven', 'gradle']).toContain(dep.ecosystem);
          expect(dep.name).toBeDefined();
          expect(dep.name.length).toBeGreaterThan(0);
        });
      }
    });
  });
});
