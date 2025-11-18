/**
 * Unit tests for version comparison and constraint parsing utilities.
 */

import { describe, it, expect } from '@jest/globals';
import {
  parseSemanticVersion,
  compareVersions,
  parseNpmConstraint,
  parseCargoConstraint,
  parsePipConstraint,
  parseMavenConstraint,
  satisfiesConstraint,
} from '../../src/dependency-analysis/version-utils.js';

describe('Version Utils', () => {
  describe('parseSemanticVersion', () => {
    it('should parse valid semantic versions', () => {
      const v1 = parseSemanticVersion('1.2.3');
      expect(v1).toEqual({ major: 1, minor: 2, patch: 3 });

      const v2 = parseSemanticVersion('v2.0.0');
      expect(v2).toEqual({ major: 2, minor: 0, patch: 0 });

      const v3 = parseSemanticVersion('1.0.0-alpha');
      expect(v3).toEqual({ major: 1, minor: 0, patch: 0, prerelease: 'alpha' });

      const v4 = parseSemanticVersion('1.0.0-beta.1+build.123');
      expect(v4).toEqual({ major: 1, minor: 0, patch: 0, prerelease: 'beta.1', build: 'build.123' });
    });

    it('should return null for invalid versions', () => {
      expect(parseSemanticVersion('invalid')).toBeNull();
      expect(parseSemanticVersion('1.2')).toBeNull();
      expect(parseSemanticVersion('1')).toBeNull();
    });
  });

  describe('compareVersions', () => {
    it('should compare semantic versions correctly', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
      expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
      expect(compareVersions('1.2.3', '1.2.3')).toBe(0);

      expect(compareVersions('1.2.3', '1.2.4')).toBeLessThan(0);
      expect(compareVersions('1.2.3', '1.3.0')).toBeLessThan(0);
      expect(compareVersions('1.2.3', '2.0.0')).toBeLessThan(0);
    });

    it('should handle prerelease versions', () => {
      expect(compareVersions('1.0.0-alpha', '1.0.0')).toBeLessThan(0);
      expect(compareVersions('1.0.0', '1.0.0-alpha')).toBeGreaterThan(0);
      expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0);
    });
  });

  describe('parseNpmConstraint', () => {
    it('should parse caret constraints', () => {
      const constraint = parseNpmConstraint('^1.2.3');
      expect(constraint.operator).toBe('^');
      expect(constraint.minVersion).toBe('1.2.3');
      expect(constraint.maxVersion).toBe('2.0.0');
    });

    it('should parse tilde constraints', () => {
      const constraint = parseNpmConstraint('~1.2.3');
      expect(constraint.operator).toBe('~');
      expect(constraint.minVersion).toBe('1.2.3');
      expect(constraint.maxVersion).toBe('1.3.0');
    });

    it('should parse exact versions', () => {
      const constraint = parseNpmConstraint('1.2.3');
      expect(constraint.operator).toBe('=');
      expect(constraint.minVersion).toBe('1.2.3');
      expect(constraint.maxVersion).toBe('1.2.3');
    });

    it('should parse wildcards', () => {
      const constraint = parseNpmConstraint('*');
      expect(constraint.operator).toBe('*');

      const constraint2 = parseNpmConstraint('latest');
      expect(constraint2.operator).toBe('*');
    });

    it('should parse comparison operators', () => {
      const ge = parseNpmConstraint('>=1.2.3');
      expect(ge.operator).toBe('>=');
      expect(ge.minVersion).toBe('1.2.3');

      const le = parseNpmConstraint('<=2.0.0');
      expect(le.operator).toBe('<=');
      expect(le.maxVersion).toBe('2.0.0');
    });
  });

  describe('parseCargoConstraint', () => {
    it('should parse caret constraints (default)', () => {
      const constraint = parseCargoConstraint('1.2.3');
      expect(constraint.operator).toBe('^');
      expect(constraint.minVersion).toBe('1.2.3');
    });

    it('should parse explicit caret', () => {
      const constraint = parseCargoConstraint('^1.2.3');
      expect(constraint.operator).toBe('^');
    });

    it('should parse tilde constraints', () => {
      const constraint = parseCargoConstraint('~1.2.3');
      expect(constraint.operator).toBe('~');
    });

    it('should parse wildcards', () => {
      const constraint = parseCargoConstraint('*');
      expect(constraint.operator).toBe('*');
    });
  });

  describe('parsePipConstraint', () => {
    it('should parse equality constraints', () => {
      const constraint = parsePipConstraint('==1.2.3');
      expect(constraint.operator).toBe('==');
      expect(constraint.minVersion).toBe('1.2.3');
    });

    it('should parse compatible release', () => {
      const constraint = parsePipConstraint('~=1.2.3');
      expect(constraint.operator).toBe('~=');
    });

    it('should parse comparison operators', () => {
      const ge = parsePipConstraint('>=1.2.3');
      expect(ge.operator).toBe('>=');

      const le = parsePipConstraint('<=2.0.0');
      expect(le.operator).toBe('<=');
    });

    it('should handle bare version numbers', () => {
      const constraint = parsePipConstraint('1.2.3');
      expect(constraint.operator).toBe('==');
      expect(constraint.minVersion).toBe('1.2.3');
    });
  });

  describe('parseMavenConstraint', () => {
    it('should parse range notation', () => {
      const inclusive = parseMavenConstraint('[1.0,2.0]');
      expect(inclusive.operator).toBe('range');
      expect(inclusive.minVersion).toBe('1.0');
      expect(inclusive.maxVersion).toBe('2.0');

      const exclusive = parseMavenConstraint('[1.0,2.0)');
      expect(exclusive.operator).toBe('range');
      expect(exclusive.minVersion).toBe('1.0');
      expect(exclusive.maxVersion).toBe('2.0');
    });

    it('should parse simple versions', () => {
      const constraint = parseMavenConstraint('1.2.3');
      expect(constraint.operator).toBe('=');
      expect(constraint.minVersion).toBe('1.2.3');
    });
  });

  describe('satisfiesConstraint', () => {
    it('should check if version satisfies caret constraint', () => {
      const constraint = parseNpmConstraint('^1.2.3');
      expect(satisfiesConstraint('1.2.3', constraint)).toBe(true);
      expect(satisfiesConstraint('1.2.4', constraint)).toBe(true);
      expect(satisfiesConstraint('1.3.0', constraint)).toBe(true);
      expect(satisfiesConstraint('2.0.0', constraint)).toBe(false);
      expect(satisfiesConstraint('1.2.2', constraint)).toBe(false);
    });

    it('should check if version satisfies tilde constraint', () => {
      const constraint = parseNpmConstraint('~1.2.3');
      expect(satisfiesConstraint('1.2.3', constraint)).toBe(true);
      expect(satisfiesConstraint('1.2.4', constraint)).toBe(true);
      expect(satisfiesConstraint('1.3.0', constraint)).toBe(false);
      expect(satisfiesConstraint('1.2.2', constraint)).toBe(false);
    });

    it('should check if version satisfies exact constraint', () => {
      const constraint = parseNpmConstraint('1.2.3');
      expect(satisfiesConstraint('1.2.3', constraint)).toBe(true);
      expect(satisfiesConstraint('1.2.4', constraint)).toBe(false);
    });

    it('should check wildcard constraints', () => {
      const constraint = parseNpmConstraint('*');
      expect(satisfiesConstraint('1.0.0', constraint)).toBe(true);
      expect(satisfiesConstraint('999.999.999', constraint)).toBe(true);
    });
  });
});
