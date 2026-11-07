const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const bg = require(path.join(ROOT, 'decision-engine', 'bug-gate.js'));
const { bugReport } = require(path.join(ROOT, 'tests', 'helpers', 'bug-report.js'));
const codes = (r) => r.substanceIssues.map((i) => i.code);

describe('evaluateBug', () => {
  test('a complete, confirmed report is valid', () => {
    const r = bg.evaluateBug(bugReport());
    expect(r.reasons).toEqual([]);
    expect(r.valid).toBe(true);
  });

  test('draft status blocks (a human confirms the triage)', () => {
    const r = bg.evaluateBug(bugReport({ status: 'draft' }));
    expect(r.structureValid && r.substanceValid).toBe(true);
    expect(r.valid).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/status: confirmed/);
  });

  test('a reproduction without a runnable command is invalid', () => {
    expect(codes(bg.evaluateBug(bugReport({ repro: 'Write a test for the double cancel and run it.' })))).toContain('no-repro-command');
  });

  test('unnumbered steps, invalid severity and missing sections are reported', () => {
    const md = bugReport({ severity: 'urgent' })
      .replace('1. Place an order and pay\n2. Cancel the order\n3. Cancel it again via the API', 'Place an order, cancel it, then cancel it again.')
      .replace(/## Impact[\s\S]*?(?=## Reproduction)/, '');
    const r = bg.evaluateBug(md);
    expect(codes(r)).toEqual(expect.arrayContaining(['steps-not-numbered', 'severity-invalid']));
    expect(r.missingSections).toEqual(['Impact']);
    expect(r.valid).toBe(false);
  });

  test('the template itself is invalid', () => {
    const r = bg.evaluateBug(fs.readFileSync(path.join(ROOT, 'docs', 'bugs', '_template.md'), 'utf8'));
    expect(r.valid).toBe(false);
    expect(r.emptySections.length).toBeGreaterThan(0);
  });
});

describe('bugAcceptanceCriteria', () => {
  test('reproduction passes, expected behavior holds, no regression', () => {
    expect(bg.bugAcceptanceCriteria(bugReport())).toEqual([
      'The reproduction test passes: `npx jest tests/orders/cancel.test.js -t "double cancel"` (it fails before the fix)',
      'Expected behavior holds: The second cancel is rejected with 409 and no refund is issued (PRD AC3).',
      'No regression: the full test suite passes',
    ]);
  });
});
