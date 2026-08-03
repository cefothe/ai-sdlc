const path = require('path');
const { loadRegistry, availablePromises } = require('../../../promise/registry-loader');

describe('registry-loader', () => {
  describe('loadRegistry', () => {
    test('loads registry.yaml and returns version + promises map', () => {
      const registry = loadRegistry();
      expect(registry.version).toBe('2.3');
      expect(registry.promises).toBeInstanceOf(Map);
    });

    test('contains all 19 promise IDs (18 base + test-assertion-deserialize from PR #32 integration)', () => {
      const registry = loadRegistry();
      const ids = [...registry.promises.keys()];
      expect(ids).toHaveLength(19);
      expect(ids).toContain('complete-output');
      expect(ids).toContain('no-placeholders');
      expect(ids).toContain('error-handling');
      expect(ids).toContain('tests-with-code');
      expect(ids).toContain('no-dead-code');
      expect(ids).toContain('resource-cleanup');
      expect(ids).toContain('implementation-depth');
      expect(ids).toContain('output-completeness');
      expect(ids).toContain('test-assertion-deserialize');
      expect(ids).toContain('import-validity');
      expect(ids).toContain('function-length');
      expect(ids).toContain('duplication');
      expect(ids).toContain('architectural-boundary');
      expect(ids).toContain('convention-compliance');
      expect(ids).toContain('change-impact');
      expect(ids).toContain('security-surface');
      expect(ids).toContain('context-acquisition');
      expect(ids).toContain('read-before-write');
      expect(ids).toContain('exploration-breadth');
    });

    test('each promise has required fields: type, method, confidence, requires, description', () => {
      const registry = loadRegistry();
      for (const [id, spec] of registry.promises) {
        expect(spec).toHaveProperty('type');
        expect(spec).toHaveProperty('method');
        expect(spec).toHaveProperty('confidence');
        expect(spec).toHaveProperty('requires');
        expect(spec).toHaveProperty('description');
        expect(['standing', 'structural', 'behavioral']).toContain(spec.type);
        expect(['high', 'medium', 'low']).toContain(spec.confidence);
      }
    });

    test('standing promises require null (always available)', () => {
      const registry = loadRegistry();
      for (const [id, spec] of registry.promises) {
        if (spec.type === 'standing') {
          expect(spec.requires).toBeNull();
        }
      }
    });

    test('structural promises require cxpak', () => {
      const registry = loadRegistry();
      for (const [id, spec] of registry.promises) {
        if (spec.type === 'structural') {
          expect(spec.requires).toBe('cxpak');
        }
      }
    });

    test('behavioral promises require trace (and optionally cxpak) or cxpak alone', () => {
      const registry = loadRegistry();
      for (const [id, spec] of registry.promises) {
        if (spec.type === 'behavioral') {
          if (Array.isArray(spec.requires)) {
            expect(spec.requires).toContain('trace');
          } else {
            expect(spec.requires).toBe('cxpak');
          }
        }
      }
    });

    test('throws if registry.yaml is missing', () => {
      expect(() => loadRegistry('/nonexistent/path')).toThrow();
    });

    test('loads from custom path', () => {
      const defaultPath = path.join(__dirname, '../../../promise/registry.yaml');
      const registry = loadRegistry(defaultPath);
      expect(registry.version).toBe('2.3');
    });

    test('test-assertion-deserialize.test_file_pattern matches JAVA_TEST_FILE_PATTERN (ryordanov NEW-4 cross-check)', () => {
      // Pins the YAML literal to the JS source-of-truth so the pattern can't
      // silently drift between registry.yaml, standing-promises.js, and
      // findings-interpreter.js. Also catches accidental YAML quoting
      // changes — single-quoted YAML doesn't process \\ as an escape, so
      // a refactor from "..." to '...' in the YAML would produce a
      // different runtime string and trip this assertion.
      const { JAVA_TEST_FILE_PATTERN } = require('../../../promise/java-test-file-pattern');
      const registry = loadRegistry();
      const spec = registry.promises.get('test-assertion-deserialize');
      expect(spec).toBeDefined();
      expect(spec.test_file_pattern).toBe(JAVA_TEST_FILE_PATTERN);
    });

    test('standing-promises and registry both reference the same JAVA_TEST_FILE_PATTERN constant (ryordanov NEW-4)', () => {
      // Belt-and-braces check on the JS side: the in-memory STANDING_PROMISES
      // array and the loaded registry must both see the same pattern.
      const { JAVA_TEST_FILE_PATTERN } = require('../../../promise/java-test-file-pattern');
      const { STANDING_PROMISES } = require('../../../promise/standing-promises');
      const standingDeserialize = STANDING_PROMISES.find(p => p.id === 'test-assertion-deserialize');
      expect(standingDeserialize).toBeDefined();
      expect(standingDeserialize.verification.test_file_pattern).toBe(JAVA_TEST_FILE_PATTERN);
    });
  });

  describe('availablePromises', () => {
    test('returns only standing promises when no capabilities (8 base + 1 PR #32 = 9)', () => {
      const available = availablePromises({ cxpak: false, trace: false });
      expect(available.length).toBe(9);
      available.forEach(p => expect(p.type).toBe('standing'));
    });

    test('returns standing + structural + context-acquisition when cxpak available', () => {
      const available = availablePromises({ cxpak: true, trace: false });
      expect(available.length).toBe(17);
      const types = new Set(available.map(p => p.type));
      expect(types).toEqual(new Set(['standing', 'structural', 'behavioral']));
    });

    test('returns standing + behavioral(trace-only) when trace available but no cxpak', () => {
      const available = availablePromises({ cxpak: false, trace: true });
      expect(available.length).toBe(10);
      const traceOnly = available.filter(p => p.type === 'behavioral');
      expect(traceOnly.length).toBe(1);
      expect(traceOnly[0].id).toBe('read-before-write');
    });

    test('returns all 19 when cxpak + trace available', () => {
      const available = availablePromises({ cxpak: true, trace: true });
      expect(available.length).toBe(19);
      const types = new Set(available.map(p => p.type));
      expect(types).toEqual(new Set(['standing', 'structural', 'behavioral']));
    });

    test('each returned promise includes its id', () => {
      const available = availablePromises({ cxpak: true, trace: true });
      available.forEach(p => {
        expect(p).toHaveProperty('id');
        expect(typeof p.id).toBe('string');
      });
    });
  });

  describe('overrides', () => {
    const fs = require('fs');
    const yaml = require('js-yaml');
    const tmpDir = path.join(__dirname, '../../../promise');
    const overridePath = path.join(tmpDir, 'overrides.yaml');

    afterEach(() => {
      try { fs.unlinkSync(overridePath); } catch (_) {}
    });

    test('applies threshold override from overrides.yaml', () => {
      fs.writeFileSync(overridePath, yaml.dump({
        overrides: {
          'function-length': { thresholds: { high: 80, medium: 80, low: 60, critical: 40 } },
        },
      }));
      const registry = loadRegistry();
      const fl = registry.promises.get('function-length');
      expect(fl.thresholds.high).toBe(80);
    });

    test('applies enabled=false override to disable a promise', () => {
      fs.writeFileSync(overridePath, yaml.dump({
        overrides: {
          'architectural-boundary': { enabled: false },
        },
      }));
      const registry = loadRegistry();
      const ab = registry.promises.get('architectural-boundary');
      expect(ab.enabled).toBe(false);
    });

    test('ignores overrides for nonexistent promise IDs', () => {
      fs.writeFileSync(overridePath, yaml.dump({
        overrides: {
          'nonexistent-promise': { threshold: 99 },
        },
      }));
      const registry = loadRegistry();
      expect(registry.promises.has('nonexistent-promise')).toBe(false);
    });
  });
});
