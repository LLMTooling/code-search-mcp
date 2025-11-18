/**
 * Unit tests for dependency manifest parsers.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parsePackageJson } from '../../src/dependency-analysis/parsers/package-json.js';
import { parseCargoToml } from '../../src/dependency-analysis/parsers/cargo-toml.js';
import { parsePomXml } from '../../src/dependency-analysis/parsers/pom-xml.js';
import { parseBuildGradle } from '../../src/dependency-analysis/parsers/build-gradle.js';
import { parseRequirementsTxt, parsePyprojectToml, parsePipfile } from '../../src/dependency-analysis/parsers/python.js';
import { parseGoMod } from '../../src/dependency-analysis/parsers/go-mod.js';
import { parseGemfile } from '../../src/dependency-analysis/parsers/gemfile.js';
import { parseComposerJson } from '../../src/dependency-analysis/parsers/composer-json.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DIR = path.join(__dirname, 'manifest-parsers-test');

describe('Manifest Parsers', () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('package.json Parser', () => {
    it('should parse package.json with all dependency types', async () => {
      const packageJsonPath = path.join(TEST_DIR, 'package.json');
      await fs.writeFile(
        packageJsonPath,
        JSON.stringify({
          name: 'test-package',
          version: '1.0.0',
          dependencies: {
            'express': '^4.17.1',
            'lodash': '~4.17.21',
          },
          devDependencies: {
            'jest': '^29.0.0',
            'typescript': '5.0.0',
          },
          peerDependencies: {
            'react': '>=17.0.0',
          },
          optionalDependencies: {
            'fsevents': '^2.3.2',
          },
        })
      );

      const result = await parsePackageJson(packageJsonPath);

      expect(result.manifest.projectName).toBe('test-package');
      expect(result.manifest.projectVersion).toBe('1.0.0');
      expect(result.manifest.ecosystem).toBe('npm');
      expect(result.dependencies.length).toBe(6);

      const express = result.dependencies.find(d => d.name === 'express');
      expect(express?.scope).toBe('production');
      expect(express?.version.operator).toBe('^');

      const jest = result.dependencies.find(d => d.name === 'jest');
      expect(jest?.scope).toBe('development');

      const react = result.dependencies.find(d => d.name === 'react');
      expect(react?.scope).toBe('peer');

      const fsevents = result.dependencies.find(d => d.name === 'fsevents');
      expect(fsevents?.scope).toBe('optional');
    });
  });

  describe('Cargo.toml Parser', () => {
    it('should parse Cargo.toml dependencies', async () => {
      const cargoTomlPath = path.join(TEST_DIR, 'Cargo.toml');
      await fs.writeFile(
        cargoTomlPath,
        `[package]
name = "test-crate"
version = "0.1.0"

[dependencies]
serde = "1.0"
tokio = { version = "1.28", features = ["full"] }

[dev-dependencies]
criterion = "0.5"

[build-dependencies]
cc = "1.0"
`
      );

      const result = await parseCargoToml(cargoTomlPath);

      expect(result.manifest.projectName).toBe('test-crate');
      expect(result.manifest.projectVersion).toBe('0.1.0');
      expect(result.manifest.ecosystem).toBe('cargo');
      expect(result.dependencies.length).toBe(4);

      const serde = result.dependencies.find(d => d.name === 'serde');
      expect(serde?.scope).toBe('production');
      expect(serde?.version.operator).toBe('^');

      const tokio = result.dependencies.find(d => d.name === 'tokio');
      expect(tokio?.features).toContain('full');

      const criterion = result.dependencies.find(d => d.name === 'criterion');
      expect(criterion?.scope).toBe('development');

      const cc = result.dependencies.find(d => d.name === 'cc');
      expect(cc?.scope).toBe('build');
    });
  });

  describe('pom.xml Parser', () => {
    it('should parse Maven pom.xml dependencies', async () => {
      const pomXmlPath = path.join(TEST_DIR, 'pom.xml');
      await fs.writeFile(
        pomXmlPath,
        `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <artifactId>test-artifact</artifactId>
  <version>1.0.0</version>

  <dependencies>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-core</artifactId>
      <version>5.3.0</version>
    </dependency>
    <dependency>
      <groupId>junit</groupId>
      <artifactId>junit</artifactId>
      <version>4.13.2</version>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>com.google.guava</groupId>
      <artifactId>guava</artifactId>
      <version>[30.0,31.0)</version>
    </dependency>
  </dependencies>
</project>
`
      );

      const result = await parsePomXml(pomXmlPath);

      expect(result.manifest.projectName).toBe('test-artifact');
      expect(result.manifest.projectVersion).toBe('1.0.0');
      expect(result.manifest.ecosystem).toBe('maven');
      expect(result.dependencies.length).toBe(3);

      const spring = result.dependencies.find(d => d.name === 'org.springframework:spring-core');
      expect(spring?.scope).toBe('production');
      expect(spring?.version.minVersion).toBe('5.3.0');

      const junit = result.dependencies.find(d => d.name === 'junit:junit');
      expect(junit?.scope).toBe('test');

      const guava = result.dependencies.find(d => d.name === 'com.google.guava:guava');
      expect(guava?.version.operator).toBe('range');
    });
  });

  describe('build.gradle Parser', () => {
    it('should parse Gradle build.gradle dependencies', async () => {
      const gradlePath = path.join(TEST_DIR, 'build.gradle');
      await fs.writeFile(
        gradlePath,
        `plugins {
    id 'java'
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web:2.7.0'
    api 'com.google.guava:guava:31.0-jre'
    testImplementation 'junit:junit:4.13.2'
    compileOnly 'org.projectlombok:lombok:1.18.24'
}
`
      );

      const result = await parseBuildGradle(gradlePath);

      expect(result.manifest.ecosystem).toBe('gradle');
      expect(result.dependencies.length).toBeGreaterThan(0);

      const spring = result.dependencies.find(d => d.name.includes('spring-boot-starter-web'));
      expect(spring?.scope).toBe('production');

      const junit = result.dependencies.find(d => d.name.includes('junit'));
      expect(junit?.scope).toBe('test');

      const lombok = result.dependencies.find(d => d.name.includes('lombok'));
      expect(lombok?.scope).toBe('development');
    });
  });

  describe('requirements.txt Parser', () => {
    it('should parse Python requirements.txt', async () => {
      const requirementsPath = path.join(TEST_DIR, 'requirements.txt');
      await fs.writeFile(
        requirementsPath,
        `# Production dependencies
Flask==2.3.0
requests>=2.28.0
numpy~=1.24.0
pandas[excel]>=2.0.0

# Comment line
Django>=4.0,<5.0
`
      );

      const result = await parseRequirementsTxt(requirementsPath);

      expect(result.manifest.ecosystem).toBe('pip');
      expect(result.dependencies.length).toBe(5);

      const flask = result.dependencies.find(d => d.name === 'Flask');
      expect(flask?.version.operator).toBe('==');

      const requests = result.dependencies.find(d => d.name === 'requests');
      expect(requests?.version.operator).toBe('>=');

      const pandas = result.dependencies.find(d => d.name === 'pandas');
      expect(pandas?.features).toContain('excel');
    });
  });

  describe('pyproject.toml Parser', () => {
    it('should parse pyproject.toml with Poetry format', async () => {
      const pyprojectPath = path.join(TEST_DIR, 'pyproject.toml');
      await fs.writeFile(
        pyprojectPath,
        `[tool.poetry]
name = "test-project"
version = "1.0.0"

[tool.poetry.dependencies]
python = "^3.9"
django = "^4.2"
celery = "^5.3"

[tool.poetry.dev-dependencies]
pytest = "^7.4"
black = "^23.7"
`
      );

      const result = await parsePyprojectToml(pyprojectPath);

      expect(result.manifest.projectName).toBe('test-project');
      expect(result.manifest.projectVersion).toBe('1.0.0');
      expect(result.manifest.ecosystem).toBe('pip');

      const django = result.dependencies.find(d => d.name === 'django');
      expect(django?.scope).toBe('production');

      const pytest = result.dependencies.find(d => d.name === 'pytest');
      expect(pytest?.scope).toBe('development');
    });
  });

  describe('go.mod Parser', () => {
    it('should parse go.mod dependencies', async () => {
      const goModPath = path.join(TEST_DIR, 'go.mod');
      await fs.writeFile(
        goModPath,
        `module github.com/example/test

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/stretchr/testify v1.8.4
    golang.org/x/sync v0.3.0 // indirect
)
`
      );

      const result = await parseGoMod(goModPath);

      expect(result.manifest.projectName).toBe('github.com/example/test');
      expect(result.manifest.projectVersion).toBe('1.21');
      expect(result.manifest.ecosystem).toBe('go');

      const gin = result.dependencies.find(d => d.name === 'github.com/gin-gonic/gin');
      expect(gin?.isDirect).toBe(true);

      const sync = result.dependencies.find(d => d.name === 'golang.org/x/sync');
      expect(sync?.isDirect).toBe(false);
    });
  });

  describe('Gemfile Parser', () => {
    it('should parse Ruby Gemfile', async () => {
      const gemfilePath = path.join(TEST_DIR, 'Gemfile');
      await fs.writeFile(
        gemfilePath,
        `source 'https://rubygems.org'

gem 'rails', '~> 7.0'
gem 'pg', '>= 1.0'

group :development, :test do
  gem 'rspec-rails', '~> 6.0'
  gem 'pry'
end

group :test do
  gem 'capybara'
end
`
      );

      const result = await parseGemfile(gemfilePath);

      expect(result.manifest.ecosystem).toBe('rubygems');
      expect(result.dependencies.length).toBeGreaterThan(0);

      const rails = result.dependencies.find(d => d.name === 'rails');
      expect(rails?.scope).toBe('production');
      expect(rails?.version.operator).toBe('~');

      const rspec = result.dependencies.find(d => d.name === 'rspec-rails');
      expect(rspec?.scope).toBe('development');
    });
  });

  describe('composer.json Parser', () => {
    it('should parse PHP composer.json', async () => {
      const composerPath = path.join(TEST_DIR, 'composer.json');
      await fs.writeFile(
        composerPath,
        JSON.stringify({
          name: 'test/package',
          version: '1.0.0',
          require: {
            'php': '>=8.0',
            'laravel/framework': '^10.0',
            'guzzlehttp/guzzle': '~7.5',
          },
          'require-dev': {
            'phpunit/phpunit': '^10.0',
            'mockery/mockery': '^1.6',
          },
        })
      );

      const result = await parseComposerJson(composerPath);

      expect(result.manifest.projectName).toBe('test/package');
      expect(result.manifest.ecosystem).toBe('composer');
      expect(result.dependencies.length).toBe(4); // Should skip 'php'

      const laravel = result.dependencies.find(d => d.name === 'laravel/framework');
      expect(laravel?.scope).toBe('production');
      expect(laravel?.version.operator).toBe('^');

      const phpunit = result.dependencies.find(d => d.name === 'phpunit/phpunit');
      expect(phpunit?.scope).toBe('development');

      // PHP should be skipped
      const php = result.dependencies.find(d => d.name === 'php');
      expect(php).toBeUndefined();
    });
  });
});
