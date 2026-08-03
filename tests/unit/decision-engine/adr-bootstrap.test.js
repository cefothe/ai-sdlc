const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { importAdrs, parseAdr, mapStatus } = require(path.join(ROOT, 'decision-engine', 'adr-import.js'));
const { detectTechDecisions, proposeArchitectureAdrs } = require(path.join(ROOT, 'decision-engine', 'adr-detect.js'));
const { bootstrapAdrs } = require(path.join(ROOT, 'decision-engine', 'adr-bootstrap.js'));
const { listDecisions, loadDecision } = require(path.join(ROOT, 'decision-engine', 'decisions.js'));

function repo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adr-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}

const NYGARD = `# 1. Use PostgreSQL for persistence
Date: 2021-03-01
## Status
Accepted
## Context
We need a relational store with strong consistency.
## Decision
We will use PostgreSQL as the primary datastore.
## Consequences
Ops must run a Postgres cluster.
`;

describe('parseAdr / mapStatus', () => {
  test('parses Nygard sections and title (strips leading number)', () => {
    const p = parseAdr(NYGARD);
    expect(p.title).toBe('Use PostgreSQL for persistence');
    expect(p.status).toBe('Accepted');
    expect(p.sections.decision).toMatch(/PostgreSQL as the primary datastore/);
  });

  test('maps statuses to lifecycles', () => {
    expect(mapStatus('Accepted')).toBe('answered');
    expect(mapStatus('Proposed')).toBe('proposed');
    expect(mapStatus('Superseded by ADR-5')).toBe('superseded');
    expect(mapStatus('Deprecated')).toBe('archived');
  });
});

describe('importAdrs (existing ADRs)', () => {
  test('imports an accepted ADR as an answered Decision with provenance', () => {
    const dir = repo({ 'docs/adr/0001-use-postgres.md': NYGARD });
    try {
      const { imported } = importAdrs(dir, { created: '2026-07-18T00:00:00Z' });
      expect(imported).toHaveLength(1);
      const d = loadDecision(dir, imported[0].id);
      expect(d.status.lifecycle).toBe('answered');
      expect(d.status.answeredOptionId).toBe('as-recorded');
      expect(d.spec.summary).toBe('Use PostgreSQL for persistence');
      expect(d.spec.body).toMatch(/Imported from `docs\/adr\/0001-use-postgres.md`/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('skips README and non-md files, and repos with no ADR dirs', () => {
    const dir = repo({ 'docs/adr/README.md': '# index', 'src/x.js': 'x' });
    try {
      expect(importAdrs(dir, {}).imported).toHaveLength(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('detectTechDecisions (reverse-engineer)', () => {
  test('infers runtime, framework, datastore, deployment, CI from manifests', () => {
    const dir = repo({
      'package.json': JSON.stringify({ dependencies: { express: '^4', pg: '^8' }, devDependencies: { jest: '^29' } }),
      Dockerfile: 'FROM node:22',
      '.github/workflows/ci.yml': 'name: ci',
    });
    try {
      const found = detectTechDecisions(dir);
      const summaries = found.map((f) => f.summary);
      expect(summaries).toEqual(expect.arrayContaining(['Runtime: Node.js', 'Web framework: express', 'Datastore: PostgreSQL', 'Test framework: jest', 'Containerized deployment: Docker', 'CI: GitHub Actions']));
      // each proposal carries evidence + confirm/reconsider options
      const store = found.find((f) => f.area === 'datastore');
      expect(store.evidence).toMatch(/pg/);
      expect(store.options.map((o) => o.id)).toEqual(['confirm', 'reconsider']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('proposeArchitectureAdrs writes lifecycle:proposed records with evidence', () => {
    const dir = repo({ 'go.mod': 'module x\n' });
    try {
      const { proposed } = proposeArchitectureAdrs(dir, { created: '2026-07-18T00:00:00Z' });
      expect(proposed.some((p) => p.summary === 'Runtime: Go')).toBe(true);
      const d = loadDecision(dir, proposed[0].id);
      expect(d.status.lifecycle).toBe('proposed');
      expect(d.metadata.source).toBe('emergent-finding');
      expect(d.spec.body).toMatch(/Reverse-engineered/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('bootstrapAdrs (import + detect, no id collisions)', () => {
  test('imports existing ADRs then proposes from code with unique ids', () => {
    const dir = repo({
      'docs/adr/0001-use-postgres.md': NYGARD,
      'package.json': JSON.stringify({ dependencies: { fastify: '^4' } }),
    });
    try {
      const r = bootstrapAdrs(dir, { created: '2026-07-18T00:00:00Z' });
      expect(r.imported.length).toBe(1);
      expect(r.proposed.length).toBeGreaterThanOrEqual(2); // Node runtime + fastify
      const all = listDecisions(dir);
      const ids = all.map((d) => d.metadata.id);
      expect(new Set(ids).size).toBe(ids.length); // no duplicate ids
      // one answered (imported) + the rest proposed
      expect(all.filter((d) => d.status.lifecycle === 'answered')).toHaveLength(1);
      expect(all.filter((d) => d.status.lifecycle === 'proposed').length).toBeGreaterThanOrEqual(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
