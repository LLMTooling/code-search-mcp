
import { describe, it, expect } from '@jest/globals';
import { validateAllowedPath } from '../../src/utils/workspace-path.js';
import path from 'path';

describe('Workspace Path Security', () => {
  it('should DENY access when allowedWorkspaces is empty', () => {
    // Secure behavior: empty array means allow nothing
    expect(() => {
      validateAllowedPath('/etc/passwd', []);
    }).toThrow(/Access denied/);
  });

  it('should ALLOW access to explicitly allowed workspace', () => {
    const cwd = process.cwd();
    const result = validateAllowedPath(cwd, [cwd]);
    expect(result).toBe(cwd);
  });

  it('should DENY access to path outside allowed workspace', () => {
    const cwd = process.cwd();
    expect(() => {
        validateAllowedPath('/etc/passwd', [cwd]);
    }).toThrow(/Access denied/);
  });

  describe('UNC Extended-Length Path Protection', () => {
    it('should DENY Windows UNC extended-length paths (\\?\)', () => {
      const cwd = process.cwd();
      expect(() => {
        validateAllowedPath('\\\\?\\C:\\Windows\\System32', [cwd]);
      }).toThrow(/UNC extended-length paths are not allowed/);
    });

    it('should DENY Windows device paths (\\\.\\)', () => {
      const cwd = process.cwd();
      expect(() => {
        validateAllowedPath('\\\\.\\C:\\Windows\\System32', [cwd]);
      }).toThrow(/UNC extended-length paths are not allowed/);
    });

    it('should DENY UNC paths even if they would resolve to allowed workspace', () => {
      const allowed = process.cwd();
      // Try to construct a UNC path that might resolve to the allowed path
      expect(() => {
        validateAllowedPath('\\\\?\\' + allowed, [allowed]);
      }).toThrow(/UNC extended-length paths are not allowed/);
    });
  });

  describe('Trailing Separator Edge Cases', () => {
    it('should ALLOW access with trailing separator', () => {
      const cwd = process.cwd();
      const withTrailing = cwd + path.sep;
      const result = validateAllowedPath(withTrailing, [cwd]);
      // Result should be normalized (trailing separator removed)
      expect(result).toBe(cwd);
    });

    it('should DENY path traversal via parent references', () => {
      const cwd = process.cwd();
      expect(() => {
        validateAllowedPath(cwd + path.sep + '..' + path.sep + 'etc', [cwd]);
      }).toThrow(/Access denied/);
    });

    it('should DENY multiple trailing separators attempting bypass', () => {
      const cwd = process.cwd();
      const multipleTrailing = cwd + path.sep + path.sep + path.sep;
      const result = validateAllowedPath(multipleTrailing, [cwd]);
      // Should normalize to same path without traversal
      expect(result).not.toContain('..');
    });

    it('should DENY trailing separator with parent reference', () => {
      const cwd = process.cwd();
      // Try to escape by adding trailing separator after ..
      expect(() => {
        validateAllowedPath(cwd + path.sep + '..', [cwd]);
      }).toThrow(/Access denied/);
    });

    it('should handle mixed path separators correctly', () => {
      const cwd = process.cwd();
      // On Windows, test both forward and backward slashes
      if (path.sep === '\\') {
        const withForward = cwd.replace(/\\/g, '/') + '/';
        expect(() => {
          validateAllowedPath(withForward, [cwd]);
        }).not.toThrow();
      }
    });
  });

  describe('Error Message Sanitization', () => {
    it('should not leak paths in access denied errors', () => {
      const cwd = process.cwd();
      expect(() => {
        validateAllowedPath('/etc/passwd', [cwd]);
      }).toThrow(/Access denied/);
      // Error should NOT contain the requested path
      expect(() => {
        validateAllowedPath('/etc/passwd', [cwd]);
      }).not.toThrow('/etc/passwd');
    });
  });
});
