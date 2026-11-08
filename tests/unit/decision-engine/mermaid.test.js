const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const m = require(path.join(ROOT, 'decision-engine', 'mermaid.js'));

const fence = (body) => `text\n\`\`\`mermaid\n${body}\n\`\`\`\nmore`;

describe('mermaid diagram checks', () => {
  test('detects the kind from the header line, skipping %% comments', () => {
    expect(m.extractMermaid(fence('%% components\nflowchart LR\n A --> B')).map((d) => d.kind)).toEqual(['component']);
    expect(m.extractMermaid(fence('sequenceDiagram\n A->>B: hi')).map((d) => d.kind)).toEqual(['sequence']);
    expect(m.extractMermaid(fence('erDiagram\n A ||--o{ B : has')).map((d) => d.kind)).toEqual(['er']);
    expect(m.extractMermaid(fence('pie\n "a": 1')).map((d) => d.kind)).toEqual([null]);
  });

  test('a diagram counts only with real edges / relationships', () => {
    expect(m.hasDiagram(fence('flowchart LR\n A --> B'), 'component')).toBe(true);
    expect(m.hasDiagram(fence('flowchart LR\n A\n B'), 'component')).toBe(false);
    expect(m.hasDiagram(fence('C4Container\n Rel(api, db, "reads")'), 'component')).toBe(true);
    expect(m.hasDiagram(fence('classDiagram\n Animal <|-- Duck'), 'component')).toBe(true);
    expect(m.hasDiagram(fence('sequenceDiagram\n participant A'), 'sequence')).toBe(false);
    expect(m.hasDiagram(fence('sequenceDiagram\n A-->>B: reply'), 'sequence')).toBe(true);
    expect(m.hasDiagram(fence('erDiagram\n CUSTOMER {\n string id\n }'), 'er')).toBe(true);
    expect(m.hasDiagram(fence('erDiagram'), 'er')).toBe(false);
    for (const rel of ['||--o{', '|o--|{', '}o..o|', '}|--||']) {
      expect(m.hasDiagram(fence(`erDiagram\n  A ${rel} B : rel`), 'er')).toBe(true);
    }
    expect(m.hasDiagram('no fences at all', 'component')).toBe(false);
  });

  test('an inline ```mermaid mention in prose is not a fence', () => {
    const md = 'Use fenced ```mermaid blocks in docs.\n\n```mermaid\nsequenceDiagram\n A->>B: hi\n```\n';
    expect(m.extractMermaid(md).map((d) => d.kind)).toEqual(['sequence']);
  });

  test('stripMermaid removes diagrams and keeps the surrounding text', () => {
    expect(m.stripMermaid(fence('erDiagram\n A ||--o{ B : has'))).toBe('text\n\nmore');
  });

  test('missingFromDiagram matches names case-, space- and punctuation-insensitively', () => {
    const md = fence('flowchart LR\n  VenueAdapter[Venue adapter] --> Store[(ClickHouse store)]');
    expect(m.missingFromDiagram(md, 'component', ['Venue adapter', 'clickhouse-store', 'REST API'])).toEqual(['REST API']);
    expect(m.missingFromDiagram(md, 'sequence', ['Venue adapter'])).toEqual(['Venue adapter']);
  });

  describe('CLI', () => {
    const cli = path.join(ROOT, 'decision-engine', 'mermaid.js');
    let dir;
    beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mermaid-cli-')); });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
    const run = (body, ...args) => {
      const file = path.join(dir, 'doc.md');
      fs.writeFileSync(file, body);
      return spawnSync(process.execPath, [cli, file, ...args], { encoding: 'utf8' });
    };

    test('lists diagrams and passes when every required kind is present', () => {
      const r = run(fence('flowchart LR\n A --> B') + fence('sequenceDiagram\n A->>B: x'), '--require', 'component,sequence');
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('ok      component: flowchart LR');
    });

    test('exits 1 naming the missing kind; edgeless diagrams are flagged', () => {
      const r = run(fence('flowchart LR\n A\n B'), '--require', 'component,er');
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('no-edge component');
      expect(r.stderr).toContain('missing diagram: component, er');
    });

    test('exits 2 on an unknown kind or an unreadable file', () => {
      expect(run('x', '--require', 'pie').status).toBe(2);
      expect(spawnSync(process.execPath, [cli, path.join(dir, 'absent.md')], { encoding: 'utf8' }).status).toBe(2);
    });
  });
});
