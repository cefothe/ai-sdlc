const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { init, detectBrownfield, scaffold, scanMarkers, seedBacklog } = require(path.join(ROOT, 'init', 'init.js'));
const validator = require(path.join(ROOT, 'spec', 'validate-schemas.js'));

function makeProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}

describe('detectBrownfield', () => {
  test('detects an existing project by source presence', () => {
    const dir = makeProject({ 'src/app.js': 'const x = 1;\n' });
    try {
      const d = detectBrownfield(dir, { hasGit: false });
      expect(d.brownfield).toBe(true);
      expect(d.hasSource).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an empty dir is greenfield', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-'));
    try {
      expect(detectBrownfield(dir, { hasGit: false }).brownfield).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scaffold (non-destructive)', () => {
  test('creates baseline config + backlog and skips existing files', () => {
    const dir = makeProject({ '.ai-sdlc/dor-config.yaml': 'apiVersion: ai-sdlc.io/v1alpha1\nkind: DorConfig\nmetadata:\n  name: existing\nspec:\n  rubricVersion: v1\n' });
    try {
      const r = scaffold(dir);
      expect(r.skipped).toContain(path.join('.ai-sdlc', 'dor-config.yaml'));
      expect(r.created).toContain(path.join('.ai-sdlc', 'quality-gate.yaml'));
      // existing file untouched
      expect(fs.readFileSync(path.join(dir, '.ai-sdlc', 'dor-config.yaml'), 'utf8')).toMatch(/name: existing/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('scaffolded config passes the schema validator envelope checks', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaf-'));
    try {
      scaffold(dir);
      const { schemas } = validator.lintSchemas(path.join(ROOT, 'spec', 'schemas'));
      const errors = validator.validateInstances(path.join(dir, '.ai-sdlc'), schemas);
      expect(errors).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scanMarkers', () => {
  test('finds TODO/FIXME markers with file+line', () => {
    const dir = makeProject({
      'src/a.js': 'line1\n// TODO: wire the thing\nline3\n',
      'src/b.ts': '/* FIXME broken */\n',
      'node_modules/pkg/index.js': '// TODO should be ignored\n',
    });
    try {
      const found = scanMarkers(dir);
      const files = found.map((f) => f.file).sort();
      expect(files).toEqual([path.join('src', 'a.js'), path.join('src', 'b.ts')]);
      expect(found.find((f) => f.file === path.join('src', 'a.js')).text).toBe('wire the thing');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('seedBacklog', () => {
  test('creates one dispatchable:false task per file and per gh issue', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-'));
    try {
      const markers = [
        { file: 'src/a.js', line: 2, marker: 'TODO', text: 'x' },
        { file: 'src/a.js', line: 9, marker: 'FIXME', text: 'y' },
      ];
      const ghIssues = [{ number: 42, title: 'Broken login', body: 'fails', url: 'https://gh/42' }];
      const { tasks } = seedBacklog(dir, { markers, ghIssues, createdDate: '2026-07-17 21:00' });
      expect(tasks).toHaveLength(2); // 1 gh + 1 file-grouped
      const ghTask = tasks.find((t) => t.source === 'gh#42');
      const content = fs.readFileSync(ghTask.path, 'utf8');
      expect(content).toMatch(/dispatchable: false/);
      expect(content).toMatch(/needs DoR triage/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('init (full brownfield flow)', () => {
  test('scaffolds, indexes via injected cxpak, seeds backlog, writes report, never touches source', () => {
    const dir = makeProject({ 'src/app.js': '// TODO: refactor\nconst app = 1;\n' });
    const before = fs.readFileSync(path.join(dir, 'src', 'app.js'), 'utf8');
    let cxpakCalledWith = null;
    try {
      const report = init(dir, {
        hasGit: true,
        createdDate: '2026-07-17 21:00',
        ghIssues: [{ number: 7, title: 'Add logout', body: 'need logout', url: 'https://gh/7' }],
        cxpakIndex: (d) => { cxpakCalledWith = d; return { files: 1 }; },
      });
      expect(report.mode).toBe('brownfield');
      expect(report.cxpak.indexed).toBe(true);
      expect(cxpakCalledWith).toBe(dir);
      expect(report.markersFound).toBe(1);
      expect(report.seededTasks).toBe(2);
      // report persisted
      expect(fs.existsSync(path.join(dir, '.ai-sdlc', 'triage-report.json'))).toBe(true);
      // source untouched
      expect(fs.readFileSync(path.join(dir, 'src', 'app.js'), 'utf8')).toBe(before);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('brownfield init bootstraps ADRs: imports existing + proposes from code', () => {
    const dir = makeProject({
      'docs/adr/0001-use-postgres.md': '# 1. Use PostgreSQL\n## Status\nAccepted\n## Decision\nUse Postgres.\n',
      'package.json': JSON.stringify({ dependencies: { express: '^4', pg: '^8' } }),
      'src/app.js': 'const a = 1;\n',
    });
    try {
      const report = init(dir, { hasGit: true, createdDate: '2026-07-18 00:00' });
      expect(report.adr.imported).toBe(1);
      expect(report.adr.proposed).toBeGreaterThanOrEqual(2); // Node runtime + express + pg
      // the store exists on disk
      expect(fs.existsSync(path.join(dir, '.ai-sdlc', '_decisions'))).toBe(true);
      const files = fs.readdirSync(path.join(dir, '.ai-sdlc', '_decisions'));
      expect(files.length).toBe(report.adr.imported + report.adr.proposed);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('init without cxpak still succeeds (indexed:false with reason)', () => {
    const dir = makeProject({ 'src/x.py': 'y = 1\n' });
    try {
      const report = init(dir, { hasGit: false, createdDate: '2026-07-17 21:00' });
      expect(report.cxpak.indexed).toBe(false);
      expect(report.cxpak.reason).toMatch(/not provided/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
