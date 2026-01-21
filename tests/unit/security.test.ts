/**
 * Security utility tests for ReDoS prevention, input validation, and sanitization.
 */

import { describe, it, expect } from '@jest/globals';
import {
  validateRegexPattern,
  safeRegex,
  validateLimit,
  validateFileSize,
  sanitizeGlobPattern,
  isWindowsUncExtendedPath,
  sanitizeErrorMessage,
  MAX_AST_FILE_SIZE,
  DEFAULT_MAX_RESULTS,
  PROCESS_TIMEOUT,
} from '../../src/utils/security.js';

describe('Security Utilities', () => {
  describe('Constants', () => {
    it('should have defined constants for security limits', () => {
      expect(MAX_AST_FILE_SIZE).toBe(100 * 1024 * 1024);
      expect(DEFAULT_MAX_RESULTS).toBe(10000);
      expect(PROCESS_TIMEOUT).toBe(30000);
    });
  });

  describe('validateRegexPattern - ReDoS Prevention', () => {
    it('should accept safe regex patterns', () => {
      expect(() => validateRegexPattern('test')).not.toThrow();
      expect(() => validateRegexPattern('[a-z]+')).not.toThrow();
      expect(() => validateRegexPattern('\\d{3}-\\d{3}-\\d{4}')).not.toThrow();
      expect(() => validateRegexPattern('^(hello|world)$')).not.toThrow();
    });

    it('should reject patterns with catastrophic backtracking', () => {
      // Classic ReDoS pattern: (a+)+
      expect(() => validateRegexPattern('(a+)+')).toThrow();
      expect(() => validateRegexPattern('(a*)+')).toThrow();
      expect(() => validateRegexPattern('(a+)+b')).toThrow();

      // Nested quantifiers
      expect(() => validateRegexPattern('(.+)+')).toThrow();
      expect(() => validateRegexPattern('((.+)+)')).toThrow();

      // Backreference with large quantifier
      expect(() => validateRegexPattern('(a+)\\1+')).toThrow();
    });

    it('should reject excessively long patterns', () => {
      const longPattern = 'a'.repeat(1001);
      expect(() => validateRegexPattern(longPattern)).toThrow(/maximum length/);
    });

    it('should reject patterns with excessive quantifiers', () => {
      expect(() => validateRegexPattern('a{200}')).toThrow();
      expect(() => validateRegexPattern('a{101,}')).toThrow();
      expect(() => validateRegexPattern('a{50,200}')).toThrow();
    });

    it('should reject patterns with excessive alternation', () => {
      const manyAlternations = Array(22).fill('a').join('|');
      expect(() => validateRegexPattern(manyAlternations)).toThrow(/excessive alternation/);
    });

    it('should reject empty or non-string patterns', () => {
      expect(() => validateRegexPattern('')).toThrow();
      expect(() => validateRegexPattern(null as unknown as string)).toThrow();
      expect(() => validateRegexPattern(undefined as unknown as string)).toThrow();
    });
  });

  describe('safeRegex', () => {
    it('should return RegExp for valid patterns', () => {
      const regex = safeRegex('\\d+');
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex?.test('123')).toBe(true);
    });

    it('should return null for ReDoS patterns', () => {
      expect(safeRegex('(a+)+')).toBeNull();
    });

    it('should return null for invalid patterns', () => {
      expect(safeRegex('[invalid')).toBeNull();
    });

    it('should support regex flags', () => {
      const regex = safeRegex('hello', 'i');
      expect(regex?.flags).toContain('i');
      expect(regex?.test('HELLO')).toBe(true);
    });
  });

  describe('validateLimit', () => {
    it('should accept valid limits', () => {
      expect(validateLimit(10)).toBe(10);
      expect(validateLimit(1, 1, 100)).toBe(1);
      expect(validateLimit(100, 1, 100)).toBe(100);
    });

    it('should use default value when provided', () => {
      expect(validateLimit(undefined, 1, 100, 50)).toBe(50);
    });

    it('should reject out-of-bounds values', () => {
      expect(() => validateLimit(0, 1, 100)).toThrow();
      expect(() => validateLimit(101, 1, 100)).toThrow();
      expect(() => validateLimit(-5)).toThrow();
    });

    it('should reject non-finite numbers', () => {
      expect(() => validateLimit(NaN)).toThrow();
      expect(() => validateLimit(Infinity)).toThrow();
    });

    it('should reject non-numeric values', () => {
      expect(() => validateLimit('10' as unknown as number)).toThrow();
      expect(() => validateLimit(null as unknown as number)).toThrow();
    });

    it('should require value when no default provided', () => {
      expect(() => validateLimit(undefined)).toThrow();
    });
  });

  describe('validateFileSize', () => {
    it('should accept valid file sizes', () => {
      expect(() => validateFileSize(1024)).not.toThrow();
      expect(() => validateFileSize(MAX_AST_FILE_SIZE)).not.toThrow();
    });

    it('should reject files exceeding maximum', () => {
      expect(() => validateFileSize(MAX_AST_FILE_SIZE + 1)).toThrow(/exceeds maximum/);
    });

    it('should reject negative sizes', () => {
      expect(() => validateFileSize(-1)).toThrow();
    });

    it('should reject non-finite sizes', () => {
      expect(() => validateFileSize(NaN)).toThrow();
      expect(() => validateFileSize(Infinity)).toThrow();
    });

    it('should provide helpful error message with MB conversion', () => {
      const largeSize = 150 * 1024 * 1024; // 150MB
      expect(() => validateFileSize(largeSize)).toThrow(/150MB.*100MB/);
    });
  });

  describe('sanitizeGlobPattern', () => {
    it('should accept safe glob patterns', () => {
      expect(sanitizeGlobPattern('**/*.ts')).toBe('**/*.ts');
      expect(sanitizeGlobPattern('src/**/*.js')).toBe('src/**/*.js');
      expect(sanitizeGlobPattern('*.json')).toBe('*.json');
      expect(sanitizeGlobPattern('test/*.spec.ts')).toBe('test/*.spec.ts');
    });

    it('should reject path traversal with ..', () => {
      expect(() => sanitizeGlobPattern('../test.ts')).toThrow(/path traversal/);
      expect(() => sanitizeGlobPattern('src/../../etc')).toThrow(/path traversal/);
      expect(() => sanitizeGlobPattern('./../test')).toThrow(/path traversal/);
    });

    it('should reject absolute paths', () => {
      expect(() => sanitizeGlobPattern('/etc/passwd')).toThrow(/absolute path/);
      expect(() => sanitizeGlobPattern('C:\\Windows\\System32')).toThrow(/absolute path/);
    });

    it('should reject shell interpolation', () => {
      expect(() => sanitizeGlobPattern('$(whoami)')).toThrow(/interpolation/);
      expect(() => sanitizeGlobPattern('`ls -la`')).toThrow(/interpolation/);
      expect(() => sanitizeGlobPattern('${HOME}')).toThrow(/interpolation/);
    });

    it('should reject empty or non-string patterns', () => {
      expect(() => sanitizeGlobPattern('')).toThrow();
      expect(() => sanitizeGlobPattern(null as unknown as string)).toThrow();
    });

    it('should trim whitespace', () => {
      expect(sanitizeGlobPattern('  **/*.ts  ')).toBe('**/*.ts');
    });
  });

  describe('isWindowsUncExtendedPath', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should detect \\?\ extended-length paths', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(isWindowsUncExtendedPath('\\\\?\\C:\\Windows')).toBe(true);
      expect(isWindowsUncExtendedPath('\\\\?\\C:\\\\')).toBe(true);
    });

    it('should detect \\. device paths', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(isWindowsUncExtendedPath('\\\\.\\C:\\Windows')).toBe(true);
      expect(isWindowsUncExtendedPath('\\\\.\\pipe\\name')).toBe(true);
    });

    it('should return false for regular paths', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(isWindowsUncExtendedPath('C:\\Windows')).toBe(false);
      expect(isWindowsUncExtendedPath('\\\\server\\share')).toBe(false);
    });

    it('should return false on non-Windows platforms', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(isWindowsUncExtendedPath('\\\\?\\C:\\Windows')).toBe(false);
      expect(isWindowsUncExtendedPath('/usr/bin')).toBe(false);
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('should remove Unix absolute paths', () => {
      const input = 'Error reading /var/log/project/src/file.ts';
      const sanitized = sanitizeErrorMessage(input);
      expect(sanitized).not.toContain('/var/log/project');
      expect(sanitized).toContain('[PATH]');
    });

    it('should remove Windows absolute paths', () => {
      const input = 'Error reading C:\\Users\\JohnDoe\\project\\file.ts';
      const sanitized = sanitizeErrorMessage(input);
      expect(sanitized).not.toContain('JohnDoe');
      expect(sanitized).toContain('[PATH]');
    });

    it('should remove UNC paths', () => {
      const input = 'Access to \\\\server\\share\\file denied';
      const sanitized = sanitizeErrorMessage(input);
      expect(sanitized).not.toContain('\\\\server');
      expect(sanitized).toContain('[HOST]');
    });

    it('should remove home directory paths', () => {
      const input = 'Cannot access /home/alice/project/config.json';
      const sanitized = sanitizeErrorMessage(input);
      expect(sanitized).not.toContain('alice');
      expect(sanitized).toContain('[USER]');
    });

    it('should preserve non-sensitive error information', () => {
      const input = 'Permission denied: invalid token format';
      const sanitized = sanitizeErrorMessage(input);
      expect(sanitized).toContain('Permission denied');
      expect(sanitized).toContain('invalid token format');
    });
  });
});
