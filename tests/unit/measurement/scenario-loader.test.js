const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadScenario, loadAllScenarios, validateScenario } = require('../../../measurement/scenario-loader');

function writeTempScenario(dir, name, content) {
  const filePath = path.join(dir, `${name}.yaml`);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

const VALID_SCENARIO = `
name: test-scenario
description: A test scenario
turns:
  - message: "Fix the bug in handler.js"
    checkpoint:
      - type: file_exists
        path: src/handler.js
      - type: grep_present
        file: src/handler.js
        pattern: "res.status\\\\(400\\\\)"
  - message: "Add tests for the fix"
    checkpoint:
      - type: file_exists
        path: tests/handler.test.js
defect:
  file: src/utils.js
  description: Off-by-one in loop
  original: "i < arr.length"
  mutated: "i <= arr.length"
workspace_setup:
  repo: measurement/fixtures/mini-api
`;

const NO_TURNS_SCENARIO = `
name: bad-scenario
description: Missing turns
workspace_setup:
  repo: measurement/fixtures/mini-api
`;

const EMPTY_TURN_SCENARIO = `
name: empty-turn
description: Turn with no message
turns:
  - checkpoint:
      - type: file_exists
        path: foo.js
workspace_setup:
  repo: measurement/fixtures/mini-api
`;

describe('scenario-loader', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scenario-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadScenario', () => {
    test('parses valid YAML scenario', () => {
      const filePath = writeTempScenario(tmpDir, 'valid', VALID_SCENARIO);
      const scenario = loadScenario(filePath);
      expect(scenario.name).toBe('test-scenario');
      expect(scenario.turns).toHaveLength(2);
      expect(scenario.turns[0].message).toMatch(/Fix the bug/);
      expect(scenario.turns[0].checkpoint).toHaveLength(2);
      expect(scenario.turns[0].checkpoint[0].type).toBe('file_exists');
      expect(scenario.defect.file).toBe('src/utils.js');
      expect(scenario.defect.original).toBe('i < arr.length');
      expect(scenario.defect.mutated).toBe('i <= arr.length');
      expect(scenario.workspace_setup.repo).toBe('measurement/fixtures/mini-api');
    });

    test('throws on missing file', () => {
      expect(() => loadScenario('/nonexistent/path.yaml')).toThrow();
    });

    test('throws on invalid YAML', () => {
      const filePath = path.join(tmpDir, 'bad.yaml');
      fs.writeFileSync(filePath, '{{{{not yaml', 'utf8');
      expect(() => loadScenario(filePath)).toThrow();
    });
  });

  describe('validateScenario', () => {
    test('passes valid scenario', () => {
      const filePath = writeTempScenario(tmpDir, 'valid', VALID_SCENARIO);
      const scenario = loadScenario(filePath);
      expect(() => validateScenario(scenario)).not.toThrow();
    });

    test('rejects scenario without turns', () => {
      const filePath = writeTempScenario(tmpDir, 'no-turns', NO_TURNS_SCENARIO);
      const scenario = loadScenario(filePath);
      expect(() => validateScenario(scenario)).toThrow(/turns/i);
    });

    test('rejects scenario with empty message', () => {
      const filePath = writeTempScenario(tmpDir, 'empty-turn', EMPTY_TURN_SCENARIO);
      const scenario = loadScenario(filePath);
      expect(() => validateScenario(scenario)).toThrow(/message/i);
    });

    test('rejects scenario without name', () => {
      const scenario = { turns: [{ message: 'hi', checkpoint: [] }], workspace_setup: { repo: 'x' } };
      expect(() => validateScenario(scenario)).toThrow(/name/i);
    });

    test('rejects scenario without workspace_setup', () => {
      const scenario = { name: 'x', turns: [{ message: 'hi', checkpoint: [] }] };
      expect(() => validateScenario(scenario)).toThrow(/workspace_setup/i);
    });

    test('allows scenario without defect', () => {
      const noDefect = `
name: no-defect
description: Clean scenario
turns:
  - message: "Do something"
    checkpoint:
      - type: file_exists
        path: foo.js
workspace_setup:
  repo: measurement/fixtures/mini-api
`;
      const filePath = writeTempScenario(tmpDir, 'no-defect', noDefect);
      const scenario = loadScenario(filePath);
      expect(() => validateScenario(scenario)).not.toThrow();
      expect(scenario.defect).toBeUndefined();
    });
  });

  describe('loadAllScenarios', () => {
    test('loads all .yaml files from directory', () => {
      writeTempScenario(tmpDir, 'a', VALID_SCENARIO);
      writeTempScenario(tmpDir, 'b', VALID_SCENARIO.replace('test-scenario', 'b-scenario'));
      const scenarios = loadAllScenarios(tmpDir);
      expect(scenarios).toHaveLength(2);
      expect(scenarios.map(s => s.name).sort()).toEqual(['b-scenario', 'test-scenario']);
    });

    test('throws on empty directory', () => {
      expect(() => loadAllScenarios(tmpDir)).toThrow(/no scenario/i);
    });

    test('ignores non-yaml files', () => {
      writeTempScenario(tmpDir, 'valid', VALID_SCENARIO);
      fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# Hello', 'utf8');
      const scenarios = loadAllScenarios(tmpDir);
      expect(scenarios).toHaveLength(1);
    });
  });
});
