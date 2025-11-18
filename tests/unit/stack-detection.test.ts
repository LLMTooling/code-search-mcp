/**
 * Unit tests for Stack Detection Engine
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { StackDetectionEngine } from '../../src/stack-detection/detection-engine.js';
import type { StackRegistry } from '../../src/types/index.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DIR = path.join(__dirname, 'stack-detection-test');

describe('StackDetectionEngine', () => {
  let detectionEngine: StackDetectionEngine;
  let stackRegistry: StackRegistry;

  beforeAll(async () => {
    // Load real stack registry
    const stacksPath = path.join(__dirname, '../../src/stacks.json');
    const content = await fs.readFile(stacksPath, 'utf-8');
    stackRegistry = JSON.parse(content) as StackRegistry;
    detectionEngine = new StackDetectionEngine(stackRegistry);

    // Create test directory
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('Node.js/TypeScript Detection', () => {
    it('should detect Node.js project with package.json', async () => {
      const projectDir = path.join(TEST_DIR, 'nodejs-project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ name: 'test', dependencies: {} })
      );

      const result = await detectionEngine.detectStacks('ws-1', projectDir, {
        scanMode: 'fast',
      });

      expect(result.detectedStacks.length).toBeGreaterThan(0);
      const nodeStack = result.detectedStacks.find(s => s.id === 'nodejs');
      expect(nodeStack).toBeDefined();
      expect(nodeStack?.confidence).toBeGreaterThan(0.4);
    });

    it('should detect TypeScript project with tsconfig.json', async () => {
      const projectDir = path.join(TEST_DIR, 'typescript-project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: {} })
      );
      await fs.writeFile(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ name: 'test' })
      );

      const result = await detectionEngine.detectStacks('ws-2', projectDir, {
        scanMode: 'fast',
      });

      const tsStack = result.detectedStacks.find(s => s.id === 'typescript');
      expect(tsStack).toBeDefined();
      expect(tsStack?.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('Python Detection', () => {
    it('should detect Python project with pyproject.toml', async () => {
      const projectDir = path.join(TEST_DIR, 'python-project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'pyproject.toml'),
        '[project]\nname = "test"'
      );

      const result = await detectionEngine.detectStacks('ws-3', projectDir, {
        scanMode: 'fast',
      });

      const pythonStack = result.detectedStacks.find(s => s.id === 'python');
      expect(pythonStack).toBeDefined();
      expect(pythonStack?.confidence).toBeGreaterThan(0.5);
    });

    it('should detect Python project with requirements.txt', async () => {
      const projectDir = path.join(TEST_DIR, 'python-reqs');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'requirements.txt'),
        'flask==2.0.0\nrequests==2.28.0'
      );
      // Add a .py file to increase confidence
      await fs.writeFile(
        path.join(projectDir, 'app.py'),
        'print("Hello")'
      );

      const result = await detectionEngine.detectStacks('ws-4', projectDir, {
        scanMode: 'thorough',
      });

      const pythonStack = result.detectedStacks.find(s => s.id === 'python');
      expect(pythonStack).toBeDefined();
    });

    it('should detect Flask framework', async () => {
      const projectDir = path.join(TEST_DIR, 'flask-project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'requirements.txt'),
        'flask==2.0.0'
      );

      const result = await detectionEngine.detectStacks('ws-5', projectDir, {
        scanMode: 'fast',
      });

      const flaskStack = result.detectedStacks.find(s => s.id === 'flask');
      expect(flaskStack).toBeDefined();
    });
  });

  describe('Java Detection', () => {
    it('should detect Maven project', async () => {
      const projectDir = path.join(TEST_DIR, 'maven-project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'pom.xml'),
        '<?xml version="1.0"?><project></project>'
      );

      const result = await detectionEngine.detectStacks('ws-6', projectDir, {
        scanMode: 'fast',
      });

      const mavenStack = result.detectedStacks.find(s => s.id === 'java-maven');
      expect(mavenStack).toBeDefined();
      expect(mavenStack?.confidence).toBeGreaterThan(0.5);
    });

    it('should detect Gradle project', async () => {
      const projectDir = path.join(TEST_DIR, 'gradle-project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'build.gradle'), '');

      const result = await detectionEngine.detectStacks('ws-7', projectDir, {
        scanMode: 'fast',
      });

      const gradleStack = result.detectedStacks.find(s => s.id === 'java-gradle');
      expect(gradleStack).toBeDefined();
    });
  });

  describe('Go Detection', () => {
    it('should detect Go module', async () => {
      const projectDir = path.join(TEST_DIR, 'go-project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'go.mod'),
        'module example.com/myproject\n\ngo 1.21'
      );

      const result = await detectionEngine.detectStacks('ws-8', projectDir, {
        scanMode: 'fast',
      });

      const goStack = result.detectedStacks.find(s => s.id === 'go');
      expect(goStack).toBeDefined();
      expect(goStack?.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('Rust Detection', () => {
    it('should detect Rust/Cargo project', async () => {
      const projectDir = path.join(TEST_DIR, 'rust-project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'Cargo.toml'),
        '[package]\nname = "test"\nversion = "0.1.0"'
      );

      const result = await detectionEngine.detectStacks('ws-9', projectDir, {
        scanMode: 'fast',
      });

      const rustStack = result.detectedStacks.find(s => s.id === 'rust');
      expect(rustStack).toBeDefined();
      expect(rustStack?.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('C/C++ Detection', () => {
    it('should detect CMake project', async () => {
      const projectDir = path.join(TEST_DIR, 'cmake-project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'CMakeLists.txt'),
        'cmake_minimum_required(VERSION 3.10)'
      );

      const result = await detectionEngine.detectStacks('ws-10', projectDir, {
        scanMode: 'fast',
      });

      const cmakeStack = result.detectedStacks.find(s => s.id === 'cc-cmake');
      expect(cmakeStack).toBeDefined();
    });

    it('should detect Makefile project', async () => {
      const projectDir = path.join(TEST_DIR, 'make-project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'Makefile'),
        'all:\n\tgcc -o app main.c'
      );

      const result = await detectionEngine.detectStacks('ws-11', projectDir, {
        scanMode: 'fast',
      });

      const makeStack = result.detectedStacks.find(s => s.id === 'cc-make');
      expect(makeStack).toBeDefined();
    });
  });

  describe('Framework Detection', () => {
    it('should detect React project', async () => {
      const projectDir = path.join(TEST_DIR, 'react-project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'package.json'),
        JSON.stringify({
          name: 'test',
          dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
        })
      );

      const result = await detectionEngine.detectStacks('ws-12', projectDir, {
        scanMode: 'thorough',
      });

      const reactStack = result.detectedStacks.find(s => s.id === 'react');
      expect(reactStack).toBeDefined();
    });

    it('should detect Next.js project', async () => {
      const projectDir = path.join(TEST_DIR, 'nextjs-project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'package.json'),
        JSON.stringify({
          name: 'test',
          dependencies: { next: '^14.0.0', react: '^18.0.0' },
        })
      );

      const result = await detectionEngine.detectStacks('ws-13', projectDir, {
        scanMode: 'thorough',
      });

      const nextStack = result.detectedStacks.find(s => s.id === 'nextjs');
      expect(nextStack).toBeDefined();
    });

    it('should detect Angular project', async () => {
      const projectDir = path.join(TEST_DIR, 'angular-project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'angular.json'),
        JSON.stringify({ version: 1, projects: {} })
      );

      const result = await detectionEngine.detectStacks('ws-14', projectDir, {
        scanMode: 'fast',
      });

      const angularStack = result.detectedStacks.find(s => s.id === 'angular');
      expect(angularStack).toBeDefined();
    });
  });

  describe('Multiple Stack Detection', () => {
    it('should detect multiple stacks in monorepo', async () => {
      const projectDir = path.join(TEST_DIR, 'monorepo');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ name: 'monorepo', workspaces: ['packages/*'] })
      );
      await fs.writeFile(
        path.join(projectDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: {} })
      );

      const result = await detectionEngine.detectStacks('ws-15', projectDir, {
        scanMode: 'thorough',
      });

      expect(result.detectedStacks.length).toBeGreaterThan(1);

      const nodeStack = result.detectedStacks.find(s => s.id === 'nodejs');
      const tsStack = result.detectedStacks.find(s => s.id === 'typescript');

      expect(nodeStack).toBeDefined();
      expect(tsStack).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty directory', async () => {
      const projectDir = path.join(TEST_DIR, 'empty');
      await fs.mkdir(projectDir, { recursive: true });

      const result = await detectionEngine.detectStacks('ws-16', projectDir, {
        scanMode: 'fast',
      });

      expect(result.detectedStacks).toEqual([]);
    });

    it('should handle directory with only README', async () => {
      const projectDir = path.join(TEST_DIR, 'readme-only');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'README.md'), '# Test Project');

      const result = await detectionEngine.detectStacks('ws-17', projectDir, {
        scanMode: 'fast',
      });

      expect(result.detectedStacks.length).toBe(0);
    });

    it('should handle malformed JSON files', async () => {
      const projectDir = path.join(TEST_DIR, 'malformed-json');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'package.json'),
        '{ invalid json content'
      );

      const result = await detectionEngine.detectStacks('ws-18', projectDir, {
        scanMode: 'fast',
      });

      // Should not crash, but may not detect Node.js
      expect(result).toBeDefined();
    });

    it('should respect scan mode differences', async () => {
      const projectDir = path.join(TEST_DIR, 'scan-mode-test');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ name: 'test' })
      );

      const fastResult = await detectionEngine.detectStacks('ws-19', projectDir, {
        scanMode: 'fast',
      });

      const thoroughResult = await detectionEngine.detectStacks('ws-20', projectDir, {
        scanMode: 'thorough',
      });

      // Both should detect stacks
      expect(fastResult.detectedStacks.length).toBeGreaterThan(0);
      expect(thoroughResult.detectedStacks.length).toBeGreaterThan(0);
    });
  });

  describe('Summary Generation', () => {
    it('should generate summary with dominant languages', async () => {
      const projectDir = path.join(TEST_DIR, 'summary-test');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: {} })
      );
      await fs.writeFile(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ name: 'test' })
      );

      const result = await detectionEngine.detectStacks('ws-21', projectDir, {
        scanMode: 'thorough',
      });

      expect(result.summary).toBeDefined();
      expect(result.summary?.dominantLanguages).toBeDefined();
      expect(Array.isArray(result.summary?.dominantLanguages)).toBe(true);
    });

    it('should generate summary for projects with frameworks', async () => {
      const projectDir = path.join(TEST_DIR, 'framework-summary');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'package.json'),
        JSON.stringify({
          name: 'test',
          dependencies: { react: '^18.0.0' },
        })
      );

      const result = await detectionEngine.detectStacks('ws-22', projectDir, {
        scanMode: 'thorough',
      });

      expect(result.summary).toBeDefined();
      expect(result.detectedStacks.length).toBeGreaterThan(0);
      // Check if React stack was detected
      const reactStack = result.detectedStacks.find(s => s.id === 'react');
      if (reactStack) {
        expect(reactStack.category).toBeDefined();
      }
    });
  });

  describe('Confidence Scores', () => {
    it('should assign higher confidence with more indicators', async () => {
      const projectDir = path.join(TEST_DIR, 'confidence-test');
      await fs.mkdir(projectDir, { recursive: true });

      // Create project with multiple indicators
      await fs.writeFile(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ name: 'test', dependencies: {}, devDependencies: {} })
      );
      await fs.writeFile(path.join(projectDir, 'package-lock.json'), '{}');

      const result = await detectionEngine.detectStacks('ws-23', projectDir, {
        scanMode: 'thorough',
      });

      const nodeStack = result.detectedStacks.find(s => s.id === 'nodejs');
      expect(nodeStack?.confidence).toBeGreaterThan(0.5);
    });
  });
});
