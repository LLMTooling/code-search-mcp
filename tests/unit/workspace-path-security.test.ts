
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
});
