#!/usr/bin/env node
// Runnable demo: drives the Step 0–13 pipeline for one task end-to-end using
// FAKE seams (no real claude/git/gh, no network). Shows exactly what the
// framework does — DoR admission, design panel, implement, cross-harness review
// team, finalize, PR — as structured output. Run: `node examples/demo.js`.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { parseTask } = require(path.join(ROOT, 'decision-engine', 'backlog-task'));
const { evaluateDor } = require(path.join(ROOT, 'decision-engine', 'dor-gate'));
const { loadCapabilityMap } = require(path.join(ROOT, 'pipeline', 'capabilities'));
const { executePipeline } = require(path.join(ROOT, 'pipeline', 'execute'));

const TASK = `---
id: AISDLC-42
title: 'feat: idempotent payment capture'
status: To Do
dispatchable: true
labels: [payment]
references:
  - README.md
---
## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 same idempotency key returns the same 200 body
- [x] #2 a second capture does not double-charge
<!-- AC:END -->
`;

// Fake seams -----------------------------------------------------------------
function fakeRunner(state = { branch: 'main', clean: true }) {
  return (args) => {
    if (args[0] === 'rev-parse') return { stdout: `${state.branch}\n` };
    if (args[0] === 'status') return { stdout: state.clean ? '' : ' M x\n' };
    return { stdout: '' };
  };
}
const fakeGh = () => ({ stdout: 'https://github.com/org/api/pull/7\n' });
async function fakeSpawn({ type, provider }) {
  if (type === 'design') return { design: `${provider.name}: capture must be idempotent; key stored with the charge.` };
  if (type === 'plan') return { plan: '1) add idempotency table  2) guard capture  3) tests' };
  if (type === 'developer') return { commitSha: 'a1b2c3d', filesChanged: ['src/capture.js'], verifications: ['unit tests pass'], summary: 'idempotent capture' };
  return { approved: true, findings: [] }; // reviewers
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-demo-'));
  const tasksDir = path.join(dir, 'backlog', 'tasks');
  fs.mkdirSync(tasksDir, { recursive: true });
  const taskFilePath = path.join(tasksDir, 'AISDLC-42 - feat.md');
  fs.writeFileSync(taskFilePath, TASK);
  const task = parseTask(TASK);

  const result = await executePipeline({
    taskId: 'AISDLC-42',
    task,
    taskFilePath,
    completedDir: path.join(dir, 'backlog', 'completed'),
    worktreePath: path.join(dir, '.worktrees', 'aisdlc-42'),
    baseBranch: 'main',
    projectRoot: ROOT, // so the README.md reference resolves
    evaluateDor,
    dorConfig: { spec: { evaluationMode: 'warn-only', autoPassRules: [] } },
    capabilityMap: loadCapabilityMap(path.join(ROOT, '.ai-sdlc', 'capabilities.yaml')),
    taskContext: { labels: ['payment'], languages: ['javascript'], files: ['src/capture.js'] },
    implementerHarness: 'claude',
    gitState: () => ({ branch: 'main', clean: true }),
    runner: fakeRunner(),
    gh: fakeGh,
    spawn: fakeSpawn,
  });

  const c = result.steps.capabilities;
  console.log('=== ai-sdlc pipeline demo ===');
  console.log('admitted        :', result.steps.validate ? result.steps.validate.admitted : '(no DoR)');
  console.log('branch          :', result.steps.branch);
  console.log('design panel    :', (c.design.providers || []).map((p) => p.name).join(', '));
  console.log('  security lens? :', (c.design.providers || []).some((p) => p.role === 'security-architect'));
  console.log('plan provider   :', c.plan && c.plan.name);
  console.log('implementer     :', c.implementer && c.implementer.name);
  console.log('review team     :', c.review.providers.map((p) => `${p.role}:${p.name}`).join(', '));
  console.log('  native team?   :', c.review.teamPlan.useTeam, `(${c.review.teamPlan.dispatch})`);
  console.log('review decision :', result.steps.review && result.steps.review.decision);
  console.log('finalized ->    :', result.steps.finalize && result.steps.finalize.movedTo && path.basename(result.steps.finalize.movedTo));
  console.log('PR opened       :', result.steps.pr && result.steps.pr.url);
  console.log('cleanup ran     :', result.steps.cleanup && result.steps.cleanup.cleaned);
  console.log('OK              :', result.ok);

  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error('demo failed:', err.message);
  process.exit(1);
});
