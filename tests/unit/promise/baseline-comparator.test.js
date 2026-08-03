const {
  computeDeltas,
  formatDeltaReport,
  loadBaseline,
  saveBaseline,
} = require('../../../promise/baseline-comparator');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

describe('baseline-comparator', () => {
  describe('computeDeltas', () => {
    test('computes health score deltas with toFixed(2)', () => {
      const before = {
        health: { composite: 80.5, dead_code: 2.1, conventions: 90.0, modularity: 75.3, complexity: 10.0 },
        architecture: { boundary_violations: 3, circular_deps: 1, modules: 12 },
        risks: { high_risk_count: 2 },
      };
      const after = {
        health: { composite: 82.7, dead_code: 1.5, conventions: 91.2, modularity: 74.1, complexity: 12.3 },
        architecture: { boundary_violations: 3, circular_deps: 1, modules: 12 },
        risks: { high_risk_count: 2 },
      };
      const deltas = computeDeltas(before, after);
      expect(deltas.health.composite).toBe('2.20');
      expect(deltas.health.dead_code).toBe('-0.60');
      expect(deltas.health.conventions).toBe('1.20');
      expect(deltas.health.modularity).toBe('-1.20');
      expect(deltas.health.complexity).toBe('2.30');
    });

    test('computes architecture boundary deltas as integers', () => {
      const before = {
        health: { composite: 80, dead_code: 2, conventions: 90, modularity: 75, complexity: 10 },
        architecture: { boundary_violations: 3, circular_deps: 1, modules: 12 },
        risks: { high_risk_count: 2 },
      };
      const after = {
        health: { composite: 80, dead_code: 2, conventions: 90, modularity: 75, complexity: 10 },
        architecture: { boundary_violations: 5, circular_deps: 0, modules: 14 },
        risks: { high_risk_count: 2 },
      };
      const deltas = computeDeltas(before, after);
      expect(deltas.architecture.boundary_violations).toBe(2);
      expect(deltas.architecture.circular_deps).toBe(-1);
      expect(deltas.architecture.modules).toBe(2);
    });

    test('computes risks deltas as integers', () => {
      const before = {
        health: { composite: 80, dead_code: 2, conventions: 90, modularity: 75, complexity: 10 },
        architecture: { boundary_violations: 3, circular_deps: 1, modules: 12 },
        risks: { high_risk_count: 2 },
      };
      const after = {
        health: { composite: 80, dead_code: 2, conventions: 90, modularity: 75, complexity: 10 },
        architecture: { boundary_violations: 3, circular_deps: 1, modules: 12 },
        risks: { high_risk_count: 5 },
      };
      const deltas = computeDeltas(before, after);
      expect(deltas.risks.high_risk_count).toBe(3);
    });

    test('returns null when before is null', () => {
      const after = {
        health: { composite: 80 },
        architecture: { boundary_violations: 3 },
        risks: { high_risk_count: 2 },
      };
      expect(computeDeltas(null, after)).toBeNull();
    });

    test('returns null when after is null', () => {
      const before = {
        health: { composite: 80 },
        architecture: { boundary_violations: 3 },
        risks: { high_risk_count: 2 },
      };
      expect(computeDeltas(before, null)).toBeNull();
    });

    test('handles missing sub-fields by returning null for keys absent in before', () => {
      const before = {
        health: { composite: 80 },
        architecture: { boundary_violations: 3 },
        risks: { high_risk_count: 2 },
      };
      const after = {
        health: { composite: 82, dead_code: 1.5 },
        architecture: { boundary_violations: 5, circular_deps: 0 },
        risks: { high_risk_count: 3 },
      };
      const deltas = computeDeltas(before, after);
      expect(deltas.health.composite).toBe('2.00');
      expect(deltas.health.dead_code).toBeNull();
      expect(deltas.architecture.boundary_violations).toBe(2);
      expect(deltas.architecture.circular_deps).toBeNull();
    });
  });

  describe('formatDeltaReport', () => {
    test('formats positive deltas as regressions with signs', () => {
      const deltas = {
        health: { composite: '-2.30', dead_code: '0.00', conventions: '0.00', modularity: '0.00', complexity: '0.00' },
        architecture: { boundary_violations: 3, circular_deps: 0, modules: 0 },
        risks: { high_risk_count: 0 },
      };
      const report = formatDeltaReport(deltas);
      expect(report).toContain('health.composite: -2.30');
      expect(report).toContain('architecture.boundary_violations: +3');
      expect(report).not.toContain('dead_code');
      expect(report).not.toContain('circular_deps');
    });

    test('returns empty string for null deltas', () => {
      expect(formatDeltaReport(null)).toBe('');
    });

    test('returns empty string when all values are zero', () => {
      const deltas = {
        health: { composite: '0.00', dead_code: '0.00', conventions: '0.00', modularity: '0.00', complexity: '0.00' },
        architecture: { boundary_violations: 0, circular_deps: 0, modules: 0 },
        risks: { high_risk_count: 0 },
      };
      expect(formatDeltaReport(deltas)).toBe('');
    });

    test('skips null sub-fields', () => {
      const deltas = {
        health: { composite: '1.50', dead_code: null },
        architecture: { boundary_violations: null },
        risks: { high_risk_count: 1 },
      };
      const report = formatDeltaReport(deltas);
      expect(report).toContain('health.composite: +1.50');
      expect(report).toContain('risks.high_risk_count: +1');
      expect(report).not.toContain('dead_code');
      expect(report).not.toContain('boundary_violations');
    });
  });

  describe('loadBaseline', () => {
    let tmpDir;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baseline-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    test('returns null for nonexistent baseline file', async () => {
      const result = await loadBaseline(tmpDir, 'nonexistent-session');
      expect(result).toBeNull();
    });

    test('reads and parses existing JSON baseline', async () => {
      const baselinesDir = path.join(tmpDir, 'baselines');
      await fs.mkdir(baselinesDir, { recursive: true });
      const baseline = {
        health: { composite: 80.5 },
        architecture: { boundary_violations: 3 },
        risks: { high_risk_count: 2 },
      };
      await fs.writeFile(
        path.join(baselinesDir, 'test-session.json'),
        JSON.stringify(baseline, null, 2),
        'utf8'
      );
      const result = await loadBaseline(tmpDir, 'test-session');
      expect(result).toEqual(baseline);
    });
  });

  describe('saveBaseline', () => {
    let tmpDir;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baseline-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    test('writes JSON file with 2-space indent', async () => {
      const baseline = {
        health: { composite: 80.5 },
        architecture: { boundary_violations: 3 },
      };
      await saveBaseline(tmpDir, 'save-session', baseline);
      const filePath = path.join(tmpDir, 'baselines', 'save-session.json');
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toBe(JSON.stringify(baseline, null, 2));
    });

    test('creates baselines directory if missing', async () => {
      const baseline = { health: { composite: 90 } };
      const nestedDir = path.join(tmpDir, 'nested', 'deep');
      await saveBaseline(nestedDir, 'nested-session', baseline);
      const filePath = path.join(nestedDir, 'baselines', 'nested-session.json');
      const content = await fs.readFile(filePath, 'utf8');
      expect(JSON.parse(content)).toEqual(baseline);
    });
  });
});
