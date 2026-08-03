# Promise Theory v2: Observer Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the observer from 8 grep-based promises to 14 structurally-aware promises with execution traces, majority voting, graduated response, and a coordinator agent architecture.

**Architecture:** Three phases. Phase 1 builds the foundation (registry, traces, cxpak verifier) with no dependency on each other. Phase 2 builds on Phase 1 (graduated response, voting, observer agent). Phase 3 (compact encoding) is independent and can run anytime. Each task is TDD: failing test → implementation → passing test → commit.

**Tech Stack:** Node.js 22+, Jest 29, YAML (js-yaml), cxpak CLI (MCP server via stdio)

**Spec:** `docs/superpowers/specs/2026-04-15-promise-theory-v2-observer-upgrade.md`

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `promise/registry.yaml` | Single source of truth for all 14 promises |
| `promise/registry-loader.js` | Parse registry, filter by environment, apply overrides |
| `promise/cxpak-verifier.js` | MCP client: spawn cxpak, send requests, parse responses |
| `promise/trace-builder.js` | Build trace events from transcript or claude -p response |
| `measurement/trace-analyzer.js` | Post-hoc trace analysis (token attribution, file access) |
| `agents/observer.md` | Observer agent definition with frontmatter promises |
| `tests/unit/promise/registry-loader.test.js` | Registry tests |
| `tests/unit/promise/cxpak-verifier.test.js` | cxpak verifier tests |
| `tests/unit/promise/trace-builder.test.js` | Trace builder tests |
| `tests/unit/measurement/trace-analyzer.test.js` | Trace analyzer tests |

### Modified Files
| File | Changes |
|---|---|
| `promise/observability-checker.js` | Load from registry, integrate cxpak + behavioral promises |
| `promise/trust-manager.js` | Per-dimension trust, graduated thresholds |
| `hooks/stop-verify.js` | Build trace, write trace file, use registry |
| `measurement/executor.js` | `--voters N` flag, trace collection, registry version in metrics |
| `package.json` | Add `js-yaml` dependency |

### Deprecated (replaced but not deleted)
| File | Replaced By |
|---|---|
| `promise/standing-promises.js` | `promise/registry.yaml` + `promise/registry-loader.js` |

---

## Phase 1: Foundation (no inter-dependencies)

### Task 1: Add js-yaml dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install js-yaml**

```bash
npm install js-yaml
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('js-yaml'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add js-yaml for promise registry"
```

---

### Task 2: Promise Registry

**Files:**
- Create: `promise/registry.yaml`
- Create: `promise/registry-loader.js`
- Create: `tests/unit/promise/registry-loader.test.js`

- [ ] **Step 1: Write the registry YAML**

Create `promise/registry.yaml`:

```yaml
version: "2.0"

promises:
  complete-output:
    type: standing
    method: grep
    confidence: high
    requires: null
    pattern: "TODO|FIXME|HACK"
    threshold: 0
    description: "Zero TODO/FIXME/HACK markers"

  no-placeholders:
    type: standing
    method: grep
    confidence: high
    requires: null
    pattern: "placeholder|not yet implemented|stub|dummy implementation"
    threshold: 0
    description: "No placeholder implementations"

  error-handling:
    type: standing
    method: grep_absent
    confidence: high
    requires: null
    pattern: "try\\s*\\{|catch\\s*\\(|\\.catch\\(|\\.finally\\("
    description: "Error handling for failure paths"

  tests-with-code:
    type: standing
    method: file_check
    confidence: medium
    requires: null
    check: "test|spec|_test"
    description: "Tests included with implementation"

  no-dead-code:
    type: standing
    method: consecutive_comments
    confidence: high
    requires: null
    min_lines: 3
    threshold: 0
    description: "No commented-out code blocks"

  resource-cleanup:
    type: standing
    method: grep_absent
    confidence: medium
    requires: null
    pattern: "\\.close\\(|\\.destroy\\(|\\.end\\(|finally\\s*\\{"
    description: "Resources closed/cleaned up"

  implementation-depth:
    type: standing
    method: grep_absent
    confidence: high
    requires: null
    pattern: "function |class |const |let |def |fn |pub |impl "
    description: "Actual code, not just prose"

  output-completeness:
    type: standing
    method: output_length
    confidence: medium
    requires: null
    min_chars: 500
    description: "Substantial output (>500 chars)"
    thresholds:
      high: 500
      medium: 500
      low: 750
      critical: 1000

  import-validity:
    type: structural
    method: cxpak:trace
    confidence: high
    requires: cxpak
    threshold: 0
    description: "All imports resolve to real files"

  function-length:
    type: structural
    method: cxpak:trace
    confidence: high
    requires: cxpak
    description: "No function exceeds line threshold"
    thresholds:
      high: 50
      medium: 50
      low: 40
      critical: 30

  duplication:
    type: structural
    method: cxpak:overview
    confidence: medium
    requires: cxpak
    description: "No copy-paste blocks above threshold"
    thresholds:
      high: 10
      medium: 10
      low: 8
      critical: 5

  architectural-boundary:
    type: structural
    method: cxpak:overview
    confidence: medium
    requires: cxpak
    description: "Modified files stay in expected layers"

  read-before-write:
    type: behavioral
    method: trace+cxpak
    confidence: medium
    requires:
      - trace
      - cxpak
    description: "Agent read related files before modifying them"

  exploration-breadth:
    type: behavioral
    method: trace+cxpak
    confidence: low
    requires:
      - trace
      - cxpak
    description: "Agent read architecturally-related files"
```

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/promise/registry-loader.test.js`:

```javascript
const path = require('path');
const { loadRegistry, availablePromises } = require('../../../promise/registry-loader');

describe('registry-loader', () => {
  describe('loadRegistry', () => {
    test('loads registry.yaml and returns version + promises map', () => {
      const registry = loadRegistry();
      expect(registry.version).toBe('2.0');
      expect(registry.promises).toBeInstanceOf(Map);
    });

    test('contains all 14 promise IDs', () => {
      const registry = loadRegistry();
      const ids = [...registry.promises.keys()];
      expect(ids).toHaveLength(14);
      expect(ids).toContain('complete-output');
      expect(ids).toContain('no-placeholders');
      expect(ids).toContain('error-handling');
      expect(ids).toContain('tests-with-code');
      expect(ids).toContain('no-dead-code');
      expect(ids).toContain('resource-cleanup');
      expect(ids).toContain('implementation-depth');
      expect(ids).toContain('output-completeness');
      expect(ids).toContain('import-validity');
      expect(ids).toContain('function-length');
      expect(ids).toContain('duplication');
      expect(ids).toContain('architectural-boundary');
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

    test('behavioral promises require both trace and cxpak', () => {
      const registry = loadRegistry();
      for (const [id, spec] of registry.promises) {
        if (spec.type === 'behavioral') {
          expect(spec.requires).toEqual(['trace', 'cxpak']);
        }
      }
    });

    test('throws if registry.yaml is missing', () => {
      expect(() => loadRegistry('/nonexistent/path')).toThrow();
    });

    test('loads from custom path', () => {
      const defaultPath = path.join(__dirname, '../../../promise/registry.yaml');
      const registry = loadRegistry(defaultPath);
      expect(registry.version).toBe('2.0');
    });
  });

  describe('availablePromises', () => {
    test('returns only standing promises when no capabilities', () => {
      const available = availablePromises({ cxpak: false, trace: false });
      expect(available.length).toBe(8);
      available.forEach(p => expect(p.type).toBe('standing'));
    });

    test('returns standing + structural when cxpak available', () => {
      const available = availablePromises({ cxpak: true, trace: false });
      expect(available.length).toBe(12);
      const types = new Set(available.map(p => p.type));
      expect(types).toEqual(new Set(['standing', 'structural']));
    });

    test('returns all 14 when cxpak + trace available', () => {
      const available = availablePromises({ cxpak: true, trace: true });
      expect(available.length).toBe(14);
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest tests/unit/promise/registry-loader.test.js --verbose`
Expected: FAIL — `Cannot find module '../../../promise/registry-loader'`

- [ ] **Step 4: Implement registry-loader.js**

Create `promise/registry-loader.js`:

```javascript
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const DEFAULT_REGISTRY_PATH = path.join(__dirname, 'registry.yaml');
const OVERRIDES_PATH = path.join(__dirname, 'overrides.yaml');

function loadRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
  const content = fs.readFileSync(registryPath, 'utf8');
  const raw = yaml.load(content);

  if (!raw || !raw.version || !raw.promises) {
    throw new Error(`Invalid registry at ${registryPath}: missing version or promises`);
  }

  const promises = new Map();
  for (const [id, spec] of Object.entries(raw.promises)) {
    promises.set(id, { id, enabled: true, ...spec });
  }

  applyOverrides(promises);

  return { version: raw.version, promises };
}

function applyOverrides(promises) {
  let overrides;
  try {
    const content = fs.readFileSync(OVERRIDES_PATH, 'utf8');
    overrides = yaml.load(content);
  } catch (_) {
    return;
  }

  if (!overrides || !overrides.overrides) return;

  for (const [id, patch] of Object.entries(overrides.overrides)) {
    const spec = promises.get(id);
    if (!spec) continue;

    if (patch.enabled === false) {
      spec.enabled = false;
    }
    if (patch.threshold !== undefined) {
      spec.threshold = patch.threshold;
    }
    if (patch.thresholds) {
      spec.thresholds = { ...(spec.thresholds || {}), ...patch.thresholds };
    }
  }
}

function availablePromises(env = { cxpak: false, trace: false }) {
  const { promises } = loadRegistry();
  const result = [];

  for (const [id, spec] of promises) {
    if (spec.enabled === false) continue;

    if (spec.requires === null) {
      result.push(spec);
    } else if (spec.requires === 'cxpak' && env.cxpak) {
      result.push(spec);
    } else if (Array.isArray(spec.requires)) {
      const met = spec.requires.every(r => env[r]);
      if (met) result.push(spec);
    }
  }

  return result;
}

module.exports = { loadRegistry, availablePromises };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/unit/promise/registry-loader.test.js --verbose`
Expected: All 13 tests PASS

- [ ] **Step 6: Run full promise test suite to verify no regressions**

Run: `npx jest tests/unit/promise/ --verbose`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add promise/registry.yaml promise/registry-loader.js tests/unit/promise/registry-loader.test.js
git commit -m "feat(promise): add versioned promise registry with 14 promises"
```

---

### Task 3: Trace Builder

**Files:**
- Create: `promise/trace-builder.js`
- Create: `tests/unit/promise/trace-builder.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/promise/trace-builder.test.js`:

```javascript
const { buildTrace, buildFingerprint } = require('../../../promise/trace-builder');

describe('trace-builder', () => {
  describe('buildFingerprint', () => {
    test('returns fingerprint event with required fields', () => {
      const fp = buildFingerprint({
        model: 'sonnet',
        claudeMdHash: 'abc123',
        rulesLoaded: ['security.md'],
        promisesActive: 14,
        registryVersion: '2.0',
        cxpakAvailable: true,
        cxpakVersion: '0.9.3',
      });
      expect(fp.ev).toBe('fingerprint');
      expect(fp.ts).toBeDefined();
      expect(fp.model).toBe('sonnet');
      expect(fp.claude_md_hash).toBe('abc123');
      expect(fp.rules_loaded).toEqual(['security.md']);
      expect(fp.promises_active).toBe(14);
      expect(fp.registry_version).toBe('2.0');
      expect(fp.cxpak_available).toBe(true);
    });

    test('sets cxpak_version to null when unavailable', () => {
      const fp = buildFingerprint({
        model: 'sonnet',
        claudeMdHash: 'abc123',
        rulesLoaded: [],
        promisesActive: 8,
        registryVersion: '2.0',
        cxpakAvailable: false,
      });
      expect(fp.cxpak_available).toBe(false);
      expect(fp.cxpak_version).toBeNull();
    });
  });

  describe('buildTrace', () => {
    test('extracts tool_use events from assistant messages', () => {
      const messages = [
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', name: 'Read', input: { file_path: '/src/index.js' } },
              { type: 'text', text: 'Reading the file...' },
              { type: 'tool_use', name: 'Write', input: { file_path: '/src/out.js', content: 'code' } },
            ],
          },
          usage: { input_tokens: 500, output_tokens: 200 },
        },
      ];

      const events = buildTrace(messages);
      const toolEvents = events.filter(e => e.ev === 'tool');
      expect(toolEvents).toHaveLength(2);
      expect(toolEvents[0].name).toBe('Read');
      expect(toolEvents[0].args_summary).toBe('/src/index.js');
      expect(toolEvents[1].name).toBe('Write');
      expect(toolEvents[1].args_summary).toBe('/src/out.js');
    });

    test('truncates args_summary to 80 chars', () => {
      const longPath = '/very/long/path/' + 'a'.repeat(100) + '.js';
      const messages = [
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', name: 'Read', input: { file_path: longPath } },
            ],
          },
        },
      ];

      const events = buildTrace(messages);
      const toolEvents = events.filter(e => e.ev === 'tool');
      expect(toolEvents[0].args_summary.length).toBeLessThanOrEqual(80);
    });

    test('adds start and end events', () => {
      const messages = [
        {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      ];

      const events = buildTrace(messages);
      expect(events[0].ev).toBe('start');
      expect(events[events.length - 1].ev).toBe('end');
    });

    test('end event contains total token counts', () => {
      const messages = [
        {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
          usage: { input_tokens: 100, output_tokens: 50 },
        },
        {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'world' }] },
          usage: { input_tokens: 200, output_tokens: 100 },
        },
      ];

      const events = buildTrace(messages);
      const endEvent = events.find(e => e.ev === 'end');
      expect(endEvent.total_tokens.in).toBe(300);
      expect(endEvent.total_tokens.out).toBe(150);
    });

    test('returns only start+end for messages with no tool calls', () => {
      const messages = [
        {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'just text' }] },
        },
      ];

      const events = buildTrace(messages);
      expect(events).toHaveLength(2);
      expect(events[0].ev).toBe('start');
      expect(events[1].ev).toBe('end');
    });

    test('handles empty messages array', () => {
      const events = buildTrace([]);
      expect(events).toHaveLength(2);
      expect(events[0].ev).toBe('start');
      expect(events[1].ev).toBe('end');
    });

    test('extracts Grep args_summary from pattern field', () => {
      const messages = [
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', name: 'Grep', input: { pattern: 'handleOrder', path: 'src/' } },
            ],
          },
        },
      ];

      const events = buildTrace(messages);
      const toolEvents = events.filter(e => e.ev === 'tool');
      expect(toolEvents[0].args_summary).toContain('handleOrder');
    });

    test('each event has ISO timestamp', () => {
      const messages = [
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/a.js' } }],
          },
        },
      ];

      const events = buildTrace(messages);
      events.forEach(e => {
        expect(e.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/promise/trace-builder.test.js --verbose`
Expected: FAIL — `Cannot find module '../../../promise/trace-builder'`

- [ ] **Step 3: Implement trace-builder.js**

Create `promise/trace-builder.js`:

```javascript
const MAX_ARGS_LENGTH = 80;

function buildFingerprint({ model, claudeMdHash, rulesLoaded, promisesActive, registryVersion, cxpakAvailable, cxpakVersion = null }) {
  return {
    ts: new Date().toISOString(),
    ev: 'fingerprint',
    model,
    claude_md_hash: claudeMdHash,
    rules_loaded: rulesLoaded,
    promises_active: promisesActive,
    registry_version: registryVersion,
    cxpak_available: cxpakAvailable,
    cxpak_version: cxpakAvailable ? cxpakVersion : null,
  };
}

function summarizeArgs(name, input) {
  if (!input) return '';

  if (input.file_path) return truncate(input.file_path);
  if (input.pattern) {
    const p = input.path ? `${input.pattern} ${input.path}` : input.pattern;
    return truncate(p);
  }
  if (input.command) return truncate(input.command);
  if (input.query) return truncate(input.query);
  if (input.url) return truncate(input.url);

  const keys = Object.keys(input);
  if (keys.length === 0) return '';
  return truncate(`${keys[0]}:${JSON.stringify(input[keys[0]])}`);
}

function truncate(str) {
  if (!str) return '';
  const s = String(str);
  return s.length <= MAX_ARGS_LENGTH ? s : s.slice(0, MAX_ARGS_LENGTH - 3) + '...';
}

function buildTrace(messages) {
  const now = new Date();
  const events = [];
  let totalIn = 0;
  let totalOut = 0;

  events.push({ ts: now.toISOString(), ev: 'start' });

  for (const msg of messages) {
    if (!msg.message || msg.message.role !== 'assistant') continue;

    const usage = msg.usage || {};
    if (usage.input_tokens) totalIn += usage.input_tokens;
    if (usage.output_tokens) totalOut += usage.output_tokens;

    const content = msg.message.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block.type !== 'tool_use') continue;

      events.push({
        ts: new Date().toISOString(),
        ev: 'tool',
        name: block.name,
        args_summary: summarizeArgs(block.name, block.input),
        tokens: {
          in: usage.input_tokens || 0,
          out: usage.output_tokens || 0,
        },
      });
    }
  }

  events.push({
    ts: new Date().toISOString(),
    ev: 'end',
    total_tokens: { in: totalIn, out: totalOut },
  });

  return events;
}

module.exports = { buildTrace, buildFingerprint, summarizeArgs };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/promise/trace-builder.test.js --verbose`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add promise/trace-builder.js tests/unit/promise/trace-builder.test.js
git commit -m "feat(promise): add trace builder for execution trace collection"
```

---

### Task 4: Trace Analyzer

**Files:**
- Create: `measurement/trace-analyzer.js`
- Create: `tests/unit/measurement/trace-analyzer.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/measurement/trace-analyzer.test.js`:

```javascript
const { loadTrace, tokenAttribution, filesAccessed, explorationRatio, timeToFirstWrite, toolSequence } = require('../../../measurement/trace-analyzer');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('trace-analyzer', () => {
  const sampleEvents = [
    { ts: '2026-04-15T10:00:00.000Z', ev: 'start' },
    { ts: '2026-04-15T10:00:01.000Z', ev: 'tool', name: 'Read', args_summary: 'src/index.js', tokens: { in: 200, out: 0 } },
    { ts: '2026-04-15T10:00:02.000Z', ev: 'tool', name: 'Grep', args_summary: 'handleOrder src/', tokens: { in: 100, out: 300 } },
    { ts: '2026-04-15T10:00:03.000Z', ev: 'tool', name: 'Read', args_summary: 'src/order.js', tokens: { in: 150, out: 0 } },
    { ts: '2026-04-15T10:00:05.000Z', ev: 'tool', name: 'Write', args_summary: 'src/new-file.js', tokens: { in: 500, out: 800 } },
    { ts: '2026-04-15T10:00:06.000Z', ev: 'tool', name: 'Edit', args_summary: 'src/index.js', tokens: { in: 200, out: 400 } },
    { ts: '2026-04-15T10:00:08.000Z', ev: 'end', total_tokens: { in: 1150, out: 1500 }, duration_ms: 8000 },
  ];

  describe('loadTrace', () => {
    test('reads JSONL file and returns events array', () => {
      const tmpFile = path.join(os.tmpdir(), `test-trace-${Date.now()}.jsonl`);
      const content = sampleEvents.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(tmpFile, content);
      try {
        const events = loadTrace(tmpFile);
        expect(events).toHaveLength(7);
        expect(events[0].ev).toBe('start');
        expect(events[6].ev).toBe('end');
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    test('throws on missing file', () => {
      expect(() => loadTrace('/nonexistent/file.jsonl')).toThrow();
    });

    test('skips empty lines', () => {
      const tmpFile = path.join(os.tmpdir(), `test-trace-empty-${Date.now()}.jsonl`);
      const content = JSON.stringify(sampleEvents[0]) + '\n\n' + JSON.stringify(sampleEvents[6]) + '\n';
      fs.writeFileSync(tmpFile, content);
      try {
        const events = loadTrace(tmpFile);
        expect(events).toHaveLength(2);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });
  });

  describe('tokenAttribution', () => {
    test('groups tokens by tool name with percentages', () => {
      const attr = tokenAttribution(sampleEvents);
      expect(attr.get('Read').in).toBe(350);
      expect(attr.get('Write').out).toBe(800);
      expect(attr.get('Grep').in).toBe(100);
    });

    test('percentages sum to ~100', () => {
      const attr = tokenAttribution(sampleEvents);
      let totalPct = 0;
      for (const [, val] of attr) {
        totalPct += val.pct;
      }
      expect(totalPct).toBeCloseTo(100, 0);
    });

    test('returns empty map for events with no tool calls', () => {
      const events = [
        { ts: '2026-04-15T10:00:00.000Z', ev: 'start' },
        { ts: '2026-04-15T10:00:01.000Z', ev: 'end', total_tokens: { in: 0, out: 0 } },
      ];
      const attr = tokenAttribution(events);
      expect(attr.size).toBe(0);
    });
  });

  describe('filesAccessed', () => {
    test('separates read and written files', () => {
      const result = filesAccessed(sampleEvents);
      expect(result.read).toContain('src/index.js');
      expect(result.read).toContain('src/order.js');
      expect(result.written).toContain('src/new-file.js');
      expect(result.written).toContain('src/index.js');
    });

    test('deduplicates file paths', () => {
      const result = filesAccessed(sampleEvents);
      const readCount = result.read.filter(f => f === 'src/index.js').length;
      expect(readCount).toBe(1);
    });
  });

  describe('explorationRatio', () => {
    test('returns ratio of read events to total tool events', () => {
      const ratio = explorationRatio(sampleEvents);
      expect(ratio).toBeCloseTo(2 / 5, 2);
    });

    test('returns 0 for events with no tool calls', () => {
      const events = [{ ev: 'start' }, { ev: 'end' }];
      expect(explorationRatio(events)).toBe(0);
    });
  });

  describe('timeToFirstWrite', () => {
    test('returns milliseconds from start to first Write or Edit', () => {
      const ms = timeToFirstWrite(sampleEvents);
      expect(ms).toBe(5000);
    });

    test('returns null if no write events', () => {
      const events = [
        { ts: '2026-04-15T10:00:00.000Z', ev: 'start' },
        { ts: '2026-04-15T10:00:01.000Z', ev: 'tool', name: 'Read', args_summary: 'a.js' },
        { ts: '2026-04-15T10:00:02.000Z', ev: 'end' },
      ];
      expect(timeToFirstWrite(events)).toBeNull();
    });
  });

  describe('toolSequence', () => {
    test('returns ordered array of tool names', () => {
      const seq = toolSequence(sampleEvents);
      expect(seq).toEqual(['Read', 'Grep', 'Read', 'Write', 'Edit']);
    });

    test('returns empty array for no tool events', () => {
      const events = [{ ev: 'start' }, { ev: 'end' }];
      expect(toolSequence(events)).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/measurement/trace-analyzer.test.js --verbose`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implement trace-analyzer.js**

Create `measurement/trace-analyzer.js`:

```javascript
const fs = require('fs');

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'Search', 'LS']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

function loadTrace(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

function tokenAttribution(events) {
  const toolEvents = events.filter(e => e.ev === 'tool');
  const totals = new Map();
  let grandTotal = 0;

  for (const e of toolEvents) {
    const tokens = e.tokens || { in: 0, out: 0 };
    const total = tokens.in + tokens.out;
    grandTotal += total;

    const existing = totals.get(e.name) || { in: 0, out: 0, total: 0 };
    existing.in += tokens.in;
    existing.out += tokens.out;
    existing.total += total;
    totals.set(e.name, existing);
  }

  const result = new Map();
  for (const [name, val] of totals) {
    result.set(name, {
      in: val.in,
      out: val.out,
      pct: grandTotal > 0 ? (val.total / grandTotal) * 100 : 0,
    });
  }

  return result;
}

function filesAccessed(events) {
  const readSet = new Set();
  const writeSet = new Set();

  for (const e of events) {
    if (e.ev !== 'tool' || !e.args_summary) continue;

    if (READ_TOOLS.has(e.name)) {
      readSet.add(e.args_summary);
    }
    if (WRITE_TOOLS.has(e.name)) {
      writeSet.add(e.args_summary);
    }
  }

  return { read: [...readSet], written: [...writeSet] };
}

function explorationRatio(events) {
  const toolEvents = events.filter(e => e.ev === 'tool');
  if (toolEvents.length === 0) return 0;

  const readEvents = toolEvents.filter(e => READ_TOOLS.has(e.name));
  return readEvents.length / toolEvents.length;
}

function timeToFirstWrite(events) {
  const start = events.find(e => e.ev === 'start');
  if (!start || !start.ts) return null;

  const firstWrite = events.find(e => e.ev === 'tool' && WRITE_TOOLS.has(e.name));
  if (!firstWrite || !firstWrite.ts) return null;

  return new Date(firstWrite.ts).getTime() - new Date(start.ts).getTime();
}

function toolSequence(events) {
  return events
    .filter(e => e.ev === 'tool')
    .map(e => e.name);
}

module.exports = { loadTrace, tokenAttribution, filesAccessed, explorationRatio, timeToFirstWrite, toolSequence };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/measurement/trace-analyzer.test.js --verbose`
Expected: All 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add measurement/trace-analyzer.js tests/unit/measurement/trace-analyzer.test.js
git commit -m "feat(measurement): add trace analyzer for post-hoc execution analysis"
```

---

### Task 5: cxpak Verifier

**Files:**
- Create: `promise/cxpak-verifier.js`
- Create: `tests/unit/promise/cxpak-verifier.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/promise/cxpak-verifier.test.js`:

```javascript
const { CxpakVerifier } = require('../../../promise/cxpak-verifier');

describe('CxpakVerifier', () => {
  describe('constructor', () => {
    test('creates instance with default timeout', () => {
      const verifier = new CxpakVerifier();
      expect(verifier.timeout).toBe(10000);
    });

    test('accepts custom timeout', () => {
      const verifier = new CxpakVerifier({ timeout: 5000 });
      expect(verifier.timeout).toBe(5000);
    });
  });

  describe('checkAvailability', () => {
    test('returns false when cxpak is not installed', async () => {
      const verifier = new CxpakVerifier({ cxpakCommand: 'nonexistent-command-12345' });
      const available = await verifier.checkAvailability();
      expect(available).toBe(false);
    });
  });

  describe('verifyImportValidity', () => {
    test('returns kept when no files to check', async () => {
      const verifier = new CxpakVerifier();
      const result = await verifier.verifyImportValidity([]);
      expect(result.result).toBe('kept');
      expect(result.promise_id).toBe('import-validity');
    });

    test('returns verification result shape', async () => {
      const verifier = new CxpakVerifier();
      const result = await verifier.verifyImportValidity([]);
      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('promise_id');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('evidence');
      expect(result.confidence).toBe('high');
    });
  });

  describe('verifyFunctionLength', () => {
    test('returns kept when no files to check', async () => {
      const verifier = new CxpakVerifier();
      const result = await verifier.verifyFunctionLength([], 50);
      expect(result.result).toBe('kept');
      expect(result.promise_id).toBe('function-length');
    });
  });

  describe('verifyDuplication', () => {
    test('returns kept when no files to check', async () => {
      const verifier = new CxpakVerifier();
      const result = await verifier.verifyDuplication([], 10);
      expect(result.result).toBe('kept');
      expect(result.promise_id).toBe('duplication');
    });
  });

  describe('verifyAll', () => {
    test('returns array of verification results', async () => {
      const verifier = new CxpakVerifier();
      const results = await verifier.verifyAll([], { functionLength: 50, duplication: 10 });
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(4);

      const ids = results.map(r => r.promise_id);
      expect(ids).toContain('import-validity');
      expect(ids).toContain('function-length');
      expect(ids).toContain('duplication');
      expect(ids).toContain('architectural-boundary');
    });

    test('all results have standard verification shape', async () => {
      const verifier = new CxpakVerifier();
      const results = await verifier.verifyAll([]);
      for (const r of results) {
        expect(r).toHaveProperty('result');
        expect(r).toHaveProperty('promise_id');
        expect(r).toHaveProperty('confidence');
        expect(r).toHaveProperty('evidence');
        expect(['kept', 'broken', 'partial']).toContain(r.result);
      }
    });
  });

  describe('graceful degradation', () => {
    test('returns skipped results when cxpak unavailable', async () => {
      const verifier = new CxpakVerifier({ cxpakCommand: 'nonexistent-command-12345' });
      const results = await verifier.verifyAll(['src/test.js']);
      for (const r of results) {
        expect(r.result).toBe('kept');
        expect(r.evidence).toContain('cxpak unavailable');
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/promise/cxpak-verifier.test.js --verbose`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implement cxpak-verifier.js**

Create `promise/cxpak-verifier.js`:

```javascript
const { spawn, execFileSync } = require('child_process');

class CxpakVerifier {
  constructor({ timeout = 10000, cxpakCommand = 'cxpak' } = {}) {
    this.timeout = timeout;
    this.cxpakCommand = cxpakCommand;
    this._available = null;
  }

  async checkAvailability() {
    if (this._available !== null) return this._available;
    try {
      execFileSync(this.cxpakCommand, ['--version'], { timeout: 5000, stdio: 'pipe' });
      this._available = true;
    } catch (_) {
      this._available = false;
    }
    return this._available;
  }

  async sendMcpRequest(method, params) {
    const available = await this.checkAvailability();
    if (!available) return null;

    return new Promise((resolve, reject) => {
      const child = spawn(this.cxpakCommand, ['serve', '--mcp', '.'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.timeout,
      });

      const request = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      });

      const chunks = [];
      child.stdout.on('data', d => chunks.push(d));

      child.on('close', () => {
        try {
          const output = Buffer.concat(chunks).toString('utf8');
          const lines = output.split('\n').filter(l => l.trim());
          for (const line of lines) {
            const parsed = JSON.parse(line);
            if (parsed.id === 1) {
              resolve(parsed.result || null);
              return;
            }
          }
          resolve(null);
        } catch (_) {
          resolve(null);
        }
      });

      child.on('error', () => resolve(null));

      setTimeout(() => {
        try { child.kill(); } catch (_) {}
        resolve(null);
      }, this.timeout);

      child.stdin.write(request + '\n');
      child.stdin.end();
    });
  }

  makeResult(promiseId, confidence, result, evidence) {
    return { promise_id: promiseId, confidence, result, evidence };
  }

  async verifyImportValidity(files) {
    if (files.length === 0) {
      return this.makeResult('import-validity', 'high', 'kept', 'no files to check');
    }

    const available = await this.checkAvailability();
    if (!available) {
      return this.makeResult('import-validity', 'high', 'kept', 'cxpak unavailable — skipped');
    }

    const response = await this.sendMcpRequest('cxpak:trace', { files, check: 'imports' });
    if (!response) {
      return this.makeResult('import-validity', 'high', 'kept', 'cxpak returned no data — skipped');
    }

    const unresolved = response.unresolved || [];
    if (unresolved.length === 0) {
      return this.makeResult('import-validity', 'high', 'kept', 'all imports resolve');
    }

    return this.makeResult('import-validity', 'high', 'broken', `unresolved imports: ${unresolved.join(', ')}`);
  }

  async verifyFunctionLength(files, threshold = 50) {
    if (files.length === 0) {
      return this.makeResult('function-length', 'high', 'kept', 'no files to check');
    }

    const available = await this.checkAvailability();
    if (!available) {
      return this.makeResult('function-length', 'high', 'kept', 'cxpak unavailable — skipped');
    }

    const response = await this.sendMcpRequest('cxpak:trace', { files, check: 'function_length', threshold });
    if (!response) {
      return this.makeResult('function-length', 'high', 'kept', 'cxpak returned no data — skipped');
    }

    const violations = response.violations || [];
    if (violations.length === 0) {
      return this.makeResult('function-length', 'high', 'kept', `all functions within ${threshold} lines`);
    }

    const detail = violations.map(v => `${v.name}:${v.lines}`).join(', ');
    return this.makeResult('function-length', 'high', 'broken', `functions exceeding ${threshold} lines: ${detail}`);
  }

  async verifyDuplication(files, threshold = 10) {
    if (files.length === 0) {
      return this.makeResult('duplication', 'medium', 'kept', 'no files to check');
    }

    const available = await this.checkAvailability();
    if (!available) {
      return this.makeResult('duplication', 'medium', 'kept', 'cxpak unavailable — skipped');
    }

    const response = await this.sendMcpRequest('cxpak:overview', { files, check: 'duplication', threshold });
    if (!response) {
      return this.makeResult('duplication', 'medium', 'kept', 'cxpak returned no data — skipped');
    }

    const blocks = response.duplicate_blocks || [];
    if (blocks.length === 0) {
      return this.makeResult('duplication', 'medium', 'kept', `no duplicate blocks above ${threshold} lines`);
    }

    return this.makeResult('duplication', 'medium', 'broken', `${blocks.length} duplicate blocks found`);
  }

  async verifyArchitecturalBoundary(files) {
    if (files.length === 0) {
      return this.makeResult('architectural-boundary', 'medium', 'kept', 'no files to check');
    }

    const available = await this.checkAvailability();
    if (!available) {
      return this.makeResult('architectural-boundary', 'medium', 'kept', 'cxpak unavailable — skipped');
    }

    const response = await this.sendMcpRequest('cxpak:overview', { files, check: 'boundaries' });
    if (!response) {
      return this.makeResult('architectural-boundary', 'medium', 'kept', 'cxpak returned no data — skipped');
    }

    const violations = response.boundary_violations || [];
    if (violations.length === 0) {
      return this.makeResult('architectural-boundary', 'medium', 'kept', 'all files within expected layers');
    }

    const detail = violations.map(v => `${v.file}: ${v.violation}`).join('; ');
    return this.makeResult('architectural-boundary', 'medium', 'broken', detail);
  }

  async verifyAll(files, thresholds = {}) {
    const functionLength = thresholds.functionLength || 50;
    const duplication = thresholds.duplication || 10;

    return Promise.all([
      this.verifyImportValidity(files),
      this.verifyFunctionLength(files, functionLength),
      this.verifyDuplication(files, duplication),
      this.verifyArchitecturalBoundary(files),
    ]);
  }
}

module.exports = { CxpakVerifier };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/promise/cxpak-verifier.test.js --verbose`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add promise/cxpak-verifier.js tests/unit/promise/cxpak-verifier.test.js
git commit -m "feat(promise): add cxpak verifier for structural promise checking"
```

---

## Phase 2: Integration (depends on Phase 1)

### Task 6: Integrate Registry into ObservabilityChecker

**Files:**
- Modify: `promise/observability-checker.js`
- Modify: `tests/unit/promise/observability-checker.test.js`
- Modify: `tests/unit/promise/standing-promises.test.js`

- [ ] **Step 1: Write new integration tests**

Add to `tests/unit/promise/observability-checker.test.js`:

```javascript
const { ObservabilityChecker } = require('../../../promise/observability-checker');
const { availablePromises } = require('../../../promise/registry-loader');

describe('registry integration', () => {
  let checker;

  beforeEach(() => {
    checker = new ObservabilityChecker();
  });

  test('verifyFromRegistry runs all standing promises on output with TODO', async () => {
    const promises = availablePromises({ cxpak: false, trace: false });
    const output = '// TODO: implement this\nfunction stub() {}';
    const results = await checker.verifyAll(promises, output);

    expect(results.length).toBe(8);
    const completeOutput = results.find(r => r.promise_id === 'complete-output');
    expect(completeOutput.result).toBe('broken');
  });

  test('verifyFromRegistry runs structural promises when cxpak flag set', async () => {
    const promises = availablePromises({ cxpak: true, trace: false });
    expect(promises.length).toBe(12);
  });

  test('each result has promise_id, result, confidence, evidence', async () => {
    const promises = availablePromises({ cxpak: false, trace: false });
    const output = 'function clean() {\n  try {\n    doStuff();\n  } catch (e) {\n    handle(e);\n  }\n}\n// test: test_clean.js';
    const results = await checker.verifyAll(promises, output);

    for (const r of results) {
      expect(r).toHaveProperty('promise_id');
      expect(r).toHaveProperty('result');
      expect(r).toHaveProperty('confidence');
      expect(r).toHaveProperty('evidence');
    }
  });
});
```

- [ ] **Step 2: Run tests to see current state**

Run: `npx jest tests/unit/promise/observability-checker.test.js --verbose`
Expected: New tests may fail if `verifyAll` signature doesn't accept registry promises

- [ ] **Step 3: Update ObservabilityChecker to accept registry-format promises**

Modify `promise/observability-checker.js` — update `verifyAll` to accept both legacy format (from standing-promises.js) and registry format (from registry-loader.js):

```javascript
// At top of file, add:
const { CxpakVerifier } = require('./cxpak-verifier');

// In the class, update verifyAll:
async verifyAll(promises, output, context = {}) {
  const results = [];
  const cxpakVerifier = context.cxpak ? new CxpakVerifier() : null;
  const files = context.files || [];

  for (const p of promises) {
    // Registry format: { id, type, method, confidence, ... }
    // Legacy format: { id, declaration, verification: { method, confidence, ... } }
    const id = p.id;
    const method = p.method || (p.verification && p.verification.method);
    const confidence = p.confidence || (p.verification && p.verification.confidence);
    const params = p.verification || p;

    if (p.type === 'structural' && cxpakVerifier) {
      // Delegate to cxpak verifier
      let result;
      const thresholds = p.thresholds || {};
      const tier = context.trustTier || 'high';
      const threshold = thresholds[tier] || p.threshold;

      switch (p.method) {
        case 'cxpak:trace':
          if (id === 'import-validity') {
            result = await cxpakVerifier.verifyImportValidity(files);
          } else if (id === 'function-length') {
            result = await cxpakVerifier.verifyFunctionLength(files, threshold);
          }
          break;
        case 'cxpak:overview':
          if (id === 'duplication') {
            result = await cxpakVerifier.verifyDuplication(files, threshold);
          } else if (id === 'architectural-boundary') {
            result = await cxpakVerifier.verifyArchitecturalBoundary(files);
          }
          break;
      }
      if (result) {
        results.push(result);
        continue;
      }
    }

    if (p.type === 'behavioral') {
      // Behavioral promises handled by caller (needs trace data)
      continue;
    }

    // Standing promise — use existing verification methods
    const verification = this.verify(method, params, output, context);
    results.push({
      promise_id: id,
      confidence,
      ...verification,
    });
  }

  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/promise/observability-checker.test.js --verbose`
Expected: All tests pass (old + new)

- [ ] **Step 5: Update standing-promises.test.js to reference registry**

Update `tests/unit/promise/standing-promises.test.js` — change the count test:

```javascript
// Change: expect(STANDING_PROMISES).toHaveLength(8);
// To: leave as-is — standing-promises.js is still valid, just deprecated
// Add a new test:
test('registry contains all 8 standing promise IDs from legacy array', () => {
  const { loadRegistry } = require('../../../promise/registry-loader');
  const registry = loadRegistry();
  const legacyIds = STANDING_PROMISES.map(p => p.id);
  for (const id of legacyIds) {
    expect(registry.promises.has(id)).toBe(true);
  }
});
```

- [ ] **Step 6: Run full test suite**

Run: `npx jest tests/unit/promise/ tests/unit/measurement/ --verbose`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add promise/observability-checker.js tests/unit/promise/observability-checker.test.js tests/unit/promise/standing-promises.test.js
git commit -m "feat(promise): integrate registry into ObservabilityChecker with cxpak delegation"
```

---

### Task 7: Graduated Response in TrustManager

**Files:**
- Modify: `promise/trust-manager.js`
- Modify: `tests/unit/promise/trust-manager.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/promise/trust-manager.test.js`:

```javascript
describe('graduated response', () => {
  let manager;

  beforeEach(() => {
    manager = new TrustManager();
  });

  describe('getThresholdsForTier', () => {
    test('returns default thresholds for high tier', () => {
      const t = manager.getThresholdsForTier('high');
      expect(t.functionLength).toBe(50);
      expect(t.duplication).toBe(10);
      expect(t.outputCompleteness).toBe(500);
    });

    test('returns tightened thresholds for low tier', () => {
      const t = manager.getThresholdsForTier('low');
      expect(t.functionLength).toBe(40);
      expect(t.duplication).toBe(8);
      expect(t.outputCompleteness).toBe(750);
    });

    test('returns strictest thresholds for critical tier', () => {
      const t = manager.getThresholdsForTier('critical');
      expect(t.functionLength).toBe(30);
      expect(t.duplication).toBe(5);
      expect(t.outputCompleteness).toBe(1000);
    });
  });

  describe('getResponseForTier', () => {
    test('high tier: accept, no retry, no voting', () => {
      const r = manager.getResponseForTier('high');
      expect(r.action).toBe('accept');
      expect(r.retry).toBe(false);
      expect(r.voting).toBe(false);
    });

    test('medium tier: retry same model on failure', () => {
      const r = manager.getResponseForTier('medium');
      expect(r.action).toBe('retry');
      expect(r.retryModel).toBe('same');
      expect(r.voting).toBe(false);
    });

    test('low tier: retry with escalated model', () => {
      const r = manager.getResponseForTier('low');
      expect(r.action).toBe('retry');
      expect(r.retryModel).toBe('escalate');
      expect(r.voting).toBe(false);
    });

    test('critical tier: escalate + mandatory voting', () => {
      const r = manager.getResponseForTier('critical');
      expect(r.action).toBe('escalate');
      expect(r.retryModel).toBe('best');
      expect(r.voting).toBe(true);
      expect(r.voters).toBe(3);
      expect(r.humanReview).toBe(true);
    });
  });

  describe('per-dimension trust', () => {
    test('computeDimensionTrust groups by promise type', () => {
      const results = [
        { promise_id: 'complete-output', result: 'kept', confidence: 'high', type: 'standing' },
        { promise_id: 'no-placeholders', result: 'kept', confidence: 'high', type: 'standing' },
        { promise_id: 'import-validity', result: 'broken', confidence: 'high', type: 'structural' },
        { promise_id: 'function-length', result: 'kept', confidence: 'high', type: 'structural' },
      ];
      const dimensions = manager.computeDimensionTrust(results);
      expect(dimensions.standing).toBeCloseTo(1.0, 1);
      expect(dimensions.structural).toBeCloseTo(0.5, 1);
    });

    test('returns null for dimensions with no results', () => {
      const results = [
        { promise_id: 'complete-output', result: 'kept', confidence: 'high', type: 'standing' },
      ];
      const dimensions = manager.computeDimensionTrust(results);
      expect(dimensions.standing).toBeCloseTo(1.0, 1);
      expect(dimensions.structural).toBeNull();
      expect(dimensions.behavioral).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/promise/trust-manager.test.js --verbose`
Expected: FAIL — methods don't exist yet

- [ ] **Step 3: Implement graduated response methods**

Add to `promise/trust-manager.js`:

```javascript
// After existing methods, add:

const TIER_THRESHOLDS = {
  high:     { functionLength: 50, duplication: 10, outputCompleteness: 500 },
  medium:   { functionLength: 50, duplication: 10, outputCompleteness: 500 },
  low:      { functionLength: 40, duplication: 8,  outputCompleteness: 750 },
  critical: { functionLength: 30, duplication: 5,  outputCompleteness: 1000 },
};

const TIER_RESPONSES = {
  high:     { action: 'accept', retry: false, retryModel: null, voting: false, voters: 0, humanReview: false },
  medium:   { action: 'retry', retry: true, retryModel: 'same', voting: false, voters: 0, humanReview: false },
  low:      { action: 'retry', retry: true, retryModel: 'escalate', voting: false, voters: 0, humanReview: false },
  critical: { action: 'escalate', retry: true, retryModel: 'best', voting: true, voters: 3, humanReview: true },
};

// Inside TrustManager class:
getThresholdsForTier(tier) {
  return { ...(TIER_THRESHOLDS[tier] || TIER_THRESHOLDS.high) };
}

getResponseForTier(tier) {
  return { ...(TIER_RESPONSES[tier] || TIER_RESPONSES.high) };
}

computeDimensionTrust(verificationResults) {
  const groups = { standing: [], structural: [], behavioral: [] };

  for (const r of verificationResults) {
    const type = r.type || 'standing';
    if (groups[type]) {
      groups[type].push(r);
    }
  }

  const result = {};
  for (const [dim, results] of Object.entries(groups)) {
    if (results.length === 0) {
      result[dim] = null;
      continue;
    }
    result[dim] = this.computeRunObservation(results);
  }

  return result;
}
```

Update the `module.exports` line to include the new constants:

```javascript
module.exports = { TrustManager, CONFIDENCE_WEIGHTS, OBSERVATION_VALUES, TIER_THRESHOLDS, TIER_RESPONSES };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/promise/trust-manager.test.js --verbose`
Expected: All tests pass (old + new)

- [ ] **Step 5: Commit**

```bash
git add promise/trust-manager.js tests/unit/promise/trust-manager.test.js
git commit -m "feat(promise): add graduated response with per-dimension trust"
```

---

### Task 8: Integrate Traces into stop-verify.js

**Files:**
- Modify: `hooks/stop-verify.js`

- [ ] **Step 1: Update stop-verify.js to build and write traces**

Modify `hooks/stop-verify.js` — add trace building after extracting the transcript:

```javascript
// Add at top:
const { buildTrace, buildFingerprint } = require('../promise/trace-builder');
const { availablePromises, loadRegistry } = require('../promise/registry-loader');

// In main(), after extracting finalAssistantText:

// Build trace from full transcript
let trace = [];
try {
  const transcriptContent = await fs.readFile(transcriptPath, 'utf8');
  const messages = transcriptContent.trim().split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l));
  trace = buildTrace(messages);
} catch (err) {
  // Trace building failure is non-fatal
}

// Build fingerprint
let registry;
try {
  registry = loadRegistry();
} catch (_) {
  registry = { version: 'unknown', promises: new Map() };
}

const fingerprint = buildFingerprint({
  model: 'unknown', // not available in hook context
  claudeMdHash: 'unknown',
  rulesLoaded: [],
  promisesActive: registry.promises.size,
  registryVersion: registry.version,
  cxpakAvailable: false, // determined at verification time
});

// Write trace file
if (trace.length > 0 && sessionId) {
  const tracesDir = path.join(__dirname, '..', 'promise', 'logs', 'traces');
  await fs.mkdir(tracesDir, { recursive: true });
  const traceContent = [fingerprint, ...trace].map(e => JSON.stringify(e)).join('\n') + '\n';
  await fs.writeFile(path.join(tracesDir, `${sessionId}.trace.jsonl`), traceContent);
}

// Use registry-based promises instead of hardcoded
const env = { cxpak: false, trace: trace.length > 0 };
const promises = availablePromises(env);
const results = await checker.verifyAll(promises, finalAssistantText, { trace });
```

- [ ] **Step 2: Verify the hook still works end-to-end**

Run: `echo '{"session_id":"test","transcript_path":"/dev/null"}' | node hooks/stop-verify.js`
Expected: Exit 0, no crash

- [ ] **Step 3: Commit**

```bash
git add hooks/stop-verify.js
git commit -m "feat(hooks): integrate trace building and registry into stop-verify"
```

---

### Task 9: Majority Voting in Executor

**Files:**
- Modify: `measurement/executor.js`
- Modify: `tests/unit/measurement/executor.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/measurement/executor.test.js`:

```javascript
describe('voting', () => {
  test('constructor accepts voters parameter', () => {
    const executor = new Executor({
      ref: 'main',
      repoRoot: '/tmp/test',
      voters: 3,
    });
    expect(executor.voters).toBe(3);
  });

  test('constructor defaults voters to 1', () => {
    const executor = new Executor({
      ref: 'main',
      repoRoot: '/tmp/test',
    });
    expect(executor.voters).toBe(1);
  });

  test('computeConsensus returns median of odd number of scores', () => {
    const executor = new Executor({ ref: 'main', repoRoot: '/tmp/test' });
    expect(executor.computeConsensus([7, 9, 4])).toBe(7);
  });

  test('computeConsensus returns lower median of even number of scores', () => {
    const executor = new Executor({ ref: 'main', repoRoot: '/tmp/test' });
    expect(executor.computeConsensus([7, 9, 4, 8])).toBe(7.5);
  });

  test('computeAgreement returns stddev of scores', () => {
    const executor = new Executor({ ref: 'main', repoRoot: '/tmp/test' });
    const agreement = executor.computeAgreement([8, 8, 8]);
    expect(agreement).toBe(0);
  });

  test('computeAgreement returns >0 for divergent scores', () => {
    const executor = new Executor({ ref: 'main', repoRoot: '/tmp/test' });
    const agreement = executor.computeAgreement([4, 8, 9]);
    expect(agreement).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/measurement/executor.test.js --verbose`
Expected: FAIL on voting tests

- [ ] **Step 3: Implement voting in Executor**

Modify `measurement/executor.js`:

In constructor, add:
```javascript
this.voters = opts.voters || 1;
this.parallelVoters = opts.parallelVoters || false;
```

Add methods:
```javascript
computeConsensus(scores) {
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

computeAgreement(scores) {
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
  return Math.sqrt(variance);
}
```

In `execute()`, wrap the per-task invocation in a voter loop:

```javascript
// Replace the single invocation block with:
const voterScores = [];
const voterOutputs = [];

for (let voter = 0; voter < this.voters; voter++) {
  // ... existing invocation logic (unchanged) ...
  // After scoring, push to voterScores/voterOutputs
  voterScores.push(qualityScore);
  voterOutputs.push({ output, analysis, promiseRecord, usage, cost_usd, score: qualityScore });
}

if (this.voters > 1) {
  const consensus = this.computeConsensus(voterScores);
  const agreement = this.computeAgreement(voterScores);

  // Write consensus record
  await collector.writeRecord({
    run, task_id: task.id, ref: this.ref, resolved_sha: resolvedSha,
    status: 'consensus', voter: null, voter_count: this.voters,
    quality_score: consensus, agreement_stddev: agreement,
    // ... use best voter's analysis for other fields
  });

  // Write individual voter records
  for (let v = 0; v < voterOutputs.length; v++) {
    await collector.writeRecord({
      run, task_id: task.id, ref: this.ref, resolved_sha: resolvedSha,
      status: 'voter', voter: v + 1, voter_count: this.voters,
      quality_score: voterOutputs[v].score,
      // ... voter-specific fields
    });
  }
}
```

Add CLI flag parsing:
```javascript
const votersIdx = args.indexOf('--voters');
const voters = votersIdx !== -1 ? parseInt(args[votersIdx + 1], 10) : 1;
const parallelVoters = args.includes('--parallel-voters');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/measurement/executor.test.js --verbose`
Expected: All tests pass

- [ ] **Step 5: Run full test suite**

Run: `npx jest tests/unit/promise/ tests/unit/measurement/ --verbose`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add measurement/executor.js tests/unit/measurement/executor.test.js
git commit -m "feat(measurement): add majority voting with --voters flag"
```

---

### Task 10: Observer Agent Definition

**Files:**
- Create: `agents/observer.md`

- [ ] **Step 1: Create the observer agent**

Create `agents/observer.md`:

```markdown
---
name: observer
description: Coordinator agent that dispatches workers, verifies output quality, and gates via clean-prompt retry. The agent never sees assessment.
promises_offered:
  - clean-retry: "Retry prompts contain zero reference to previous attempts"
  - trust-based-routing: "Model selection follows trust tier table"
  - output-comparison: "Best output selected by quality score, not recency"
---

# Observer Agent

You are the observer in a Promise Theory verification framework. Your role is to coordinate worker agents, verify their output, and gate quality — without ever telling a worker about your assessment.

## Core Invariant

**The worker never sees an assessment.** When you retry, use the original user prompt verbatim. Never reference the previous attempt. Never explain why you're retrying. The new worker must have zero knowledge that a previous attempt existed.

## Workflow

1. Receive user request
2. Read trust ledger: `promise/logs/` for current trust state
3. Determine trust tier and response level
4. Route based on request type:
   - **Code output task** → dispatch worker, verify, gate
   - **Question / explanation** → handle directly, no worker dispatch
5. After worker completes:
   - Read verification results from `promise/logs/stop-verify.jsonl` (latest entry)
   - Read trace from `promise/logs/traces/` (latest entry)
   - Apply gate decision based on trust tier
6. If gate fails and trust tier warrants retry:
   - Dispatch new worker with identical, clean prompt
   - Select model based on trust tier response table
   - Compare outputs, keep best by quality score
7. Present final output to user
8. Update trust ledger

## Trust Tier Response Table

| Tier | Range | Gate Action | Voting |
|---|---|---|---|
| High | > 0.8 | Accept | None |
| Medium | 0.5 – 0.8 | Retry same model on failure | None |
| Low | 0.2 – 0.5 | Retry escalated model | Optional |
| Critical | < 0.2 | Escalated model + human flag | 3 voters |

## What You Must Never Do

- Tell a worker why it's being retried
- Include assessment results in a worker's prompt
- Reference a previous worker's output in a new worker's prompt
- Skip verification because "this looks good enough"
- Override trust tier decisions based on intuition
```

- [ ] **Step 2: Commit**

```bash
git add agents/observer.md
git commit -m "feat(agents): add observer agent definition"
```

---

## Phase 3: Compact Encoding (independent)

### Task 11: Compact Constraint Encoding — CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read current CLAUDE.md and measure token count**

```bash
wc -c CLAUDE.md
```

Record baseline byte count.

- [ ] **Step 2: Rewrite CLAUDE.md using Header-Table Standard**

Apply encoding principles:
- Tables over bullets for rule sets
- Rule IDs matching promise registry IDs
- One line per rule
- Prose only for non-obvious WHY

Rewrite `CLAUDE.md`:

```markdown
# CLAUDE.md

## Overview

AI SDLC framework on Claude Code: Promise Theory verification, cxpak context, deterministic hooks, specialized agents.

## Build & Test

| Command | Scope |
|---|---|
| `npx jest tests/unit/promise/ tests/unit/measurement/ tests/integration/` | Full suite |
| `npx jest <path>` | Single file |
| Always use `test-runner` subagent | All test execution |

## Code Standards

| Rule ID | Constraint |
|---|---|
| complete-output | Zero TODO/FIXME/HACK markers |
| no-placeholders | No stub implementations |
| error-handling | All failure paths: try/catch or .catch() |
| tests-with-code | Tests written alongside implementation |
| no-dead-code | No commented-out blocks (3+ consecutive //) |
| resource-cleanup | .close(), finally, cleanup in all paths |
| implementation-depth | Substantial code, not prose |
| output-completeness | >500 chars output |

## Output Rules

Token compounding: every unnecessary output token becomes input context on next turn.

| Rule | Detail |
|---|---|
| no-preambles | Never start with "Let me", "I'll", "Here's what" |
| no-summaries | No trailing recaps unless asked |
| no-narration | Execute silently between tool calls |
| code-changes | List files + describe changes, no prose wrapping |
| errors | file:line + message only |
| status | One line |

## Architecture

Three pillars:

| Pillar | Location | Function |
|---|---|---|
| Promise Theory | `promise/` | Observer verifies post-output; trust via EMA; clean-prompt retry (never inject feedback — R5 proved harmful) |
| cxpak MCP | external | Token-budgeted context: overview, trace, diff, auto_context |
| Hooks | `hooks/` | PostToolUse lint, Stop verify, PreToolUse build guards (100% enforcement) |

Measurement framework (`measurement/`) validates changes via Wilcoxon signed-rank on 5-task battery.

## Agent Promise Model

Agents declare promises voluntarily. Observer assesses independently. Agent never sees assessment.

Standing promises: see `promise/registry.yaml` (14 promises, version 2.0).

## Agent Dispatch

| Scale | Method |
|---|---|
| 1-2 agents | Task tool, parallel calls in one message |
| 3+ agents | Native Teams (TeamCreate → Task → JSONL → TeamDelete) |

Proactive subagents: `file-analyzer` (>1000 lines), `code-analyzer` (multi-file), `test-runner` (all tests).

## Info Sources

Priority: CLAUDE.md → README.md → docs/ → package files. If insufficient: ask user.

## Philosophy

Skeptical, concise, no flattery. No partial implementations, simplifications, code duplication, dead code, cheater tests, over-engineering, mixed concerns, resource leaks.

## Git

Clean commit messages. No Claude footer. No co-authored-by.

## Emergency

| Situation | Action |
|---|---|
| Context overflow (90%+) | Spawn fresh agent with summary |
| Build/test failure | Stop, check docs, fix, verify |
| Uncertain approach | Check docs, then ask user |
```

- [ ] **Step 3: Measure new byte count**

```bash
wc -c CLAUDE.md
```

Calculate reduction percentage from baseline.

- [ ] **Step 4: Run full test suite to verify nothing references removed content**

Run: `npx jest tests/unit/promise/ tests/unit/measurement/ --verbose`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "refactor: compact constraint encoding for CLAUDE.md (~30% token reduction)"
```

---

### Task 12: Compact Encoding — Rules Files

**Files:**
- Modify: `rules/security.md`
- Modify: `rules/cloud-iac.md`
- Modify: `rules/ci-cd.md`
- Modify: `rules/infrastructure.md`
- Modify: `rules/shell-scripts.md`

- [ ] **Step 1: Measure baseline byte counts**

```bash
wc -c rules/security.md rules/cloud-iac.md rules/ci-cd.md rules/infrastructure.md rules/shell-scripts.md
```

Record total.

- [ ] **Step 2: Rewrite each file using Header-Table Standard**

Apply the same encoding principles as Task 11 to each file. Preserve the `---` paths frontmatter. Convert multi-line explanations to single-line table rows. Keep non-obvious WHY as inline parentheticals.

Example transformation for `rules/security.md`:

```markdown
---
paths:
  - "**/*.java"
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.py"
  - "**/*.go"
  - "**/*.rs"
---

# Security

## Input Validation

| Rule | Detail |
|---|---|
| boundary-only | Validate at system boundaries: user input, API responses, file uploads, URL params |
| allowlist | Validate what IS permitted, not what isn't (denylists always incomplete) |
| parameterized | Never string-interpolate SQL — prepared statements with bind parameters only |

## Secret Handling

| Rule | Detail |
|---|---|
| no-log-secrets | Never log secrets/tokens/PII — log reference IDs only |
| timing-safe | crypto.timingSafeEqual (Node), MessageDigest.isEqual (Java), hmac.compare_digest (Python) |
| secrets-manager | Secrets in Vault/AWS SM, not env vars (.env + .gitignore for local dev only) |

## Network & URL

| Rule | Detail |
|---|---|
| ssrf-prevention | Block user-controlled URLs to private IPs: 127.0.0.0/8, 10.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16 |
| path-traversal | path.resolve() then verify starts with expected base dir |

## Auth & Sessions

| Rule | Detail |
|---|---|
| cookie-flags | httpOnly + Secure + SameSite on auth cookies — all three required |
| token-lifecycle | Short-lived access (minutes), long-lived refresh with rotation |
| rate-limit | Rate limit: login, password reset, 2FA, token refresh |

## Dependencies

| Rule | Detail |
|---|---|
| pin-versions | Lockfiles enforced: npm ci / pip install --require-hashes |
| audit | npm audit / pip-audit in CI before merge |
```

Apply the same transformation to cloud-iac.md, ci-cd.md, infrastructure.md, shell-scripts.md. Each file keeps its paths frontmatter and converts prose sections to tables.

- [ ] **Step 3: Measure new byte counts**

```bash
wc -c rules/security.md rules/cloud-iac.md rules/ci-cd.md rules/infrastructure.md rules/shell-scripts.md
```

Calculate reduction percentage.

- [ ] **Step 4: Commit**

```bash
git add rules/security.md rules/cloud-iac.md rules/ci-cd.md rules/infrastructure.md rules/shell-scripts.md
git commit -m "refactor: compact constraint encoding for rules files (~40% token reduction)"
```

---

## Verification

After all tasks complete:

- [ ] **Full test suite passes**

```bash
npx jest tests/unit/promise/ tests/unit/measurement/ --verbose
```

Expected: All tests pass, including new tests for registry-loader, trace-builder, trace-analyzer, cxpak-verifier, graduated response, and voting.

- [ ] **Registry contains 14 promises**

```bash
node -e "const {loadRegistry} = require('./promise/registry-loader'); const r = loadRegistry(); console.log('Version:', r.version, 'Promises:', r.promises.size)"
```

Expected: `Version: 2.0 Promises: 14`

- [ ] **Stop hook still works**

```bash
echo '{"session_id":"test","transcript_path":"/dev/null"}' | node hooks/stop-verify.js; echo "exit: $?"
```

Expected: `exit: 0`

- [ ] **Compact encoding reduced token count**

```bash
wc -c CLAUDE.md rules/*.md
```

Compare against pre-compact baseline.

- [ ] **Existing measurement infrastructure unbroken**

```bash
npx jest tests/unit/measurement/ --verbose
```

Expected: All existing tests pass alongside new voting tests.
