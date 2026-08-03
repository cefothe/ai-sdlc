/**
 * Basic Integration Tests
 *
 * Smoke tests to verify core Node.js functionality works across platforms
 */

const os = require('os');
const path = require('path');

describe('Basic Integration Tests', () => {
  test('Platform detection should work', () => {
    const platform = process.platform;
    expect(platform).toBeDefined();
    expect(['darwin', 'linux', 'win32']).toContain(platform);
  });

  test('Node.js version should be accessible', () => {
    const version = process.version;
    expect(version).toBeDefined();
    expect(version).toMatch(/^v\d+\.\d+\.\d+/);
  });

  test('Home directory should be accessible', () => {
    const home = os.homedir();
    expect(home).toBeDefined();
    expect(home.length).toBeGreaterThan(0);
    expect(path.isAbsolute(home)).toBe(true);
  });

  test('Path separator should be platform-specific', () => {
    const sep = path.sep;
    expect(sep).toBeDefined();

    if (process.platform === 'win32') {
      expect(sep).toBe('\\');
    } else {
      expect(sep).toBe('/');
    }
  });

  test('Path joining should work correctly', () => {
    const joined = path.join('foo', 'bar', 'baz');
    expect(joined).toBeDefined();
    expect(joined).toContain('foo');
    expect(joined).toContain('bar');
    expect(joined).toContain('baz');
  });

  test('Temp directory should be accessible', () => {
    const tmpdir = os.tmpdir();
    expect(tmpdir).toBeDefined();
    expect(tmpdir.length).toBeGreaterThan(0);
    expect(path.isAbsolute(tmpdir)).toBe(true);
  });

  test('Core modules should be importable', () => {
    const fs = require('fs');
    const crypto = require('crypto');
    const util = require('util');

    expect(fs).toBeDefined();
    expect(crypto).toBeDefined();
    expect(util).toBeDefined();

    expect(typeof fs.readFileSync).toBe('function');
    expect(typeof crypto.randomBytes).toBe('function');
    expect(typeof util.promisify).toBe('function');
  });

  test('Environment variables should be accessible', () => {
    const env = process.env;
    expect(env).toBeDefined();
    expect(typeof env).toBe('object');

    // Check for common environment variables
    const hasPath = 'PATH' in env || 'Path' in env;
    expect(hasPath).toBe(true);
  });

  test('Process information should be available', () => {
    expect(process.pid).toBeGreaterThan(0);
    expect(process.arch).toBeDefined();
    expect(['x64', 'arm64', 'arm', 'ia32']).toContain(process.arch);
  });

  test('Path normalization should work', () => {
    const normalized = path.normalize('foo//bar/../baz');
    expect(normalized).toBeDefined();
    // Should not contain double slashes (unless Windows UNC path)
    if (process.platform !== 'win32') {
      expect(normalized).not.toContain('//');
    }
  });
});
