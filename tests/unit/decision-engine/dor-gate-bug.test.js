const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { evaluateDor, DEFAULT_CONFIG } = require(path.join(ROOT, 'decision-engine', 'dor-gate.js'));
const { bugReport } = require(path.join(ROOT, 'tests', 'helpers', 'bug-report.js'));

function project(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dor-bug-'));
  fs.mkdirSync(path.join(root, 'docs', 'bugs'), { recursive: true });
  if (body !== null) fs.writeFileSync(path.join(root, 'docs', 'bugs', 'order-double-cancel.md'), body);
  return root;
}

const task = () => ({
  frontmatter: {
    id: 'AISDLC-0002', dispatchable: true, labels: ['bug'],
    references: ['docs/bugs/order-double-cancel.md'],
    specRef: { source: 'bug', featureId: 'order-double-cancel', artifactPath: 'docs/bugs/order-double-cancel.md' },
  },
  body: 'Fix double cancel.',
  acceptanceCriteria: [{ checked: false, text: 'reproduction passes' }],
});
const gate = (res, id) => res.gates.find((g) => g.gateId === id);

describe('DoR gate 10 — bug report confirmed', () => {
  let root;
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('a confirmed report passes gate 10 and gates 8/9 do not fire', () => {
    root = project(bugReport());
    const res = evaluateDor(task(), { projectRoot: root, config: DEFAULT_CONFIG });
    expect(gate(res, 10).verdict).toBe('pass');
    expect(gate(res, 8)).toBeUndefined();
    expect(gate(res, 9)).toBeUndefined();
  });

  test('a draft report fails gate 10 and blocks admission', () => {
    root = project(bugReport({ status: 'draft' }));
    const res = evaluateDor(task(), { projectRoot: root, config: DEFAULT_CONFIG });
    expect(gate(res, 10).verdict).toBe('fail');
    expect(res.admitted).toBe(false);
    expect(res.reasons.join(' ')).toMatch(/bug report not ready/);
  });

  test('a missing report is a gate-3 failure, not a double report', () => {
    root = project(null);
    const res = evaluateDor(task(), { projectRoot: root, config: DEFAULT_CONFIG });
    expect(gate(res, 3).verdict).toBe('fail');
    expect(gate(res, 10).verdict).toBe('pass');
  });

  test('gate 10 can be disabled and never fires for a non-bug task', () => {
    root = project(bugReport({ status: 'draft' }));
    expect(gate(evaluateDor(task(), { projectRoot: root, config: DEFAULT_CONFIG, bugGate: false }), 10)).toBeUndefined();
    const plain = task();
    delete plain.frontmatter.specRef;
    expect(gate(evaluateDor(plain, { projectRoot: root, config: DEFAULT_CONFIG }), 10)).toBeUndefined();
  });
});
