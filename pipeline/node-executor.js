// Node executor — runs an execution manifest's local nodes with the RED-test
// discipline (slicr / conductr execute-plan):
//
//   1. ORACLE: one agent writes the acceptance tests (and compiling stubs) that
//      make every node's `accept` command RED, and commits them up front. It
//      implements nothing. The tests derive from the PRD acceptance criteria.
//   2. RED check: every accept is run; one already GREEN cannot discriminate a
//      correct change, so the node is recorded `already_satisfied` and flagged.
//   3. NODES, in manifest order: the implementer fills exactly the node's files.
//      The pipeline — not the implementer — then checks scope (only node.files,
//      never the oracle's tests, no dependency manifests under `new_deps`) and
//      runs the accept. GREEN keeps the commit; anything else is rolled back to
//      the node's start and retried with the concrete failure, up to `retries`.
//   4. A node that never goes GREEN HALTS the run: a human takes it over.
//
// Accept commands are model-authored shell. They run on the host by default, or
// inside the cordon sandbox (https://github.com/Barnett-Studios/cordon:
// --network none, read-only .git, memory/pid/time ceilings) when configured. A
// requested sandbox that is not available fails loud — it never silently runs
// on the host instead.

const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');

const { DEPENDENCY_MANIFEST_RE } = require('../decision-engine/architecture-conformance');
const { CONTEXT_TOOLS_GUIDANCE } = require('./steps');
const OUTPUT_TAIL = 2000;

function tail(text, n = OUTPUT_TAIL) {
  const t = String(text || '');
  return t.length > n ? `…${t.slice(-n)}` : t;
}

// runAccept(cmd, cwd) → { passed, exitCode, output }.
function makeAcceptRunner({ sandbox = {}, timeoutSec = 300, run = spawnSync } = {}) {
  const mode = sandbox.mode || 'host';
  if (mode === 'cordon') {
    if (!sandbox.cordonRun || !existsSync(sandbox.cordonRun)) {
      throw new Error(`sandbox mode is cordon but cordonRun ${JSON.stringify(sandbox.cordonRun || '')} does not exist — install cordon (bin/cordon-run.sh) or set sandbox.mode: host`);
    }
    if (!sandbox.image) throw new Error('sandbox mode is cordon but no sandbox.image (the runtime image the accept runs in) is configured');
  } else if (mode !== 'host') {
    throw new Error(`unknown sandbox mode "${mode}" (host | cordon)`);
  }
  return function runAccept(cmd, cwd) {
    const res = mode === 'cordon'
      ? run(sandbox.cordonRun, [cwd, sandbox.image, 'sh', '-c', cmd], { encoding: 'utf8', env: { ...process.env, CORDON_TIMEOUT: String(timeoutSec) } })
      : run('sh', ['-c', cmd], { cwd, encoding: 'utf8', timeout: timeoutSec * 1000 });
    if (res.error) return { passed: false, exitCode: null, output: `accept could not run: ${res.error.code === 'ETIMEDOUT' ? `timed out after ${timeoutSec}s` : res.error.message}` };
    return { passed: res.status === 0, exitCode: res.status, output: `${res.stdout || ''}${res.stderr || ''}` };
  };
}

function git(runner, args, cwd) {
  const out = runner(args, { cwd });
  return String(out && out.stdout !== undefined ? out.stdout : out || '').trim();
}

function changedFiles(runner, cwd, from) {
  const committed = git(runner, ['diff', '--name-only', `${from}..HEAD`], cwd);
  const uncommitted = git(runner, ['status', '--porcelain'], cwd).split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, ''));
  return [...new Set([...committed.split(/\r?\n/).filter(Boolean), ...uncommitted])];
}

function header(task) {
  const fm = task.frontmatter || {};
  return `Task ${fm.id}: ${fm.title}`;
}

function buildOraclePrompt({ task, nodes, specContext, decisionsContext }) {
  const list = nodes.map((n, i) => `  ${i + 1}. [${n.id}] files: ${n.files.join(', ')}\n     change: ${n.change}\n     accept: ${n.accept}`).join('\n');
  return [
    `You are the TEST AUTHOR (oracle) for ${header(task)}. You write tests; you do NOT implement.`,
    '',
    'Make every node\'s `accept` command below RED now and GREEN only on a correct implementation:',
    list,
    '',
    'Rules:',
    '- Derive each assertion from the PRD acceptance criteria in the specification; pin exact values and error cases, never "it compiles".',
    '- Where a target does not exist yet, add a compiling stub (signature + "not implemented" body) so the suite builds and the test fails on behaviour, not on a build error.',
    '- Do not implement any node. Do not edit files outside tests and stubs.',
    '- Commit the tests + stubs as one setup commit (the suite is expected to fail).',
    specContext || '',
    decisionsContext || '',
    'Return JSON: { commitSha, testFiles[], verifications[], summary } — testFiles lists every test file you created or changed.',
  ].filter(Boolean).join('\n');
}

function buildNodePrompt({ task, node, specContext, decisionsContext, capabilityGuidance, testFiles, feedback }) {
  return [
    `You are implementing node [${node.id}] of ${header(task)}.`,
    `Change: ${node.change}`,
    `Files you may edit (and only these): ${node.files.join(', ')}${node.kind === 'create' ? ' (create this file)' : ''}`,
    `Acceptance (the oracle — must exit 0 when you are done): ${node.accept}`,
    `The tests are already written (${testFiles.join(', ') || 'see the setup commit'}). Read them — they are the spec you code to. Do NOT modify them.`,
    node.forbid && node.forbid.includes('new_deps') ? 'Do not add or change dependencies (no dependency-manifest or lockfile edits).' : '',
    feedback ? `\nYour previous attempt was rolled back:\n${feedback}` : '',
    specContext || '',
    decisionsContext || '',
    capabilityGuidance || '',
    CONTEXT_TOOLS_GUIDANCE,
    'Commit your change. Return JSON: { commitSha, filesChanged[], filesChangedExternal[], verifications[], summary }.',
  ].filter(Boolean).join('\n');
}

// Scope violations of a node attempt, or [] when the change stayed in bounds.
function scopeViolations({ node, changed, testFiles }) {
  const out = [];
  const outside = changed.filter((f) => !node.files.includes(f));
  if (outside.length) out.push(`edited files outside the node: ${outside.join(', ')}`);
  const tests = changed.filter((f) => testFiles.includes(f));
  if (tests.length) out.push(`modified the oracle's tests: ${tests.join(', ')}`);
  if (node.forbid && node.forbid.includes('new_deps')) {
    const deps = changed.filter((f) => DEPENDENCY_MANIFEST_RE.test(f));
    if (deps.length) out.push(`changed dependency manifests under forbid new_deps: ${deps.join(', ')}`);
  }
  return out;
}

async function runNodes({ task, nodes, spawn, implementer, tools, cwd, runner, runAccept, specContext, decisionsContext, capabilityGuidance, retries = 2 }) {
  const report = [];
  const oracleRet = await spawn({ type: 'test-author', provider: implementer, tools, cwd, prompt: buildOraclePrompt({ task, nodes, specContext, decisionsContext }) });
  if (!oracleRet || typeof oracleRet.commitSha !== 'string' || !oracleRet.commitSha) {
    return { status: 'halted', halt: { node: null, reason: 'the test author produced no setup commit — no oracle, nothing to gate on' }, nodes: report, testFiles: [] };
  }
  const testFiles = Array.isArray(oracleRet.testFiles) ? oracleRet.testFiles : [];
  const filesChanged = new Set(testFiles);
  const verifications = [];

  for (const node of nodes) {
    const red = runAccept(node.accept, cwd);
    if (red.passed) {
      report.push({ id: node.id, status: 'already_satisfied', attempts: 0, reason: 'accept was GREEN before any change — too weak to discriminate, or the work already exists' });
      continue;
    }
    let done = false;
    let feedback = null;
    let attempt = 0;
    while (!done && attempt <= retries) {
      attempt += 1;
      const start = git(runner, ['rev-parse', 'HEAD'], cwd);
      await spawn({ type: 'developer', provider: implementer, tools, cwd, iteration: attempt - 1, prompt: buildNodePrompt({ task, node, specContext, decisionsContext, capabilityGuidance, testFiles, feedback }) });
      const changed = changedFiles(runner, cwd, start);
      const violations = scopeViolations({ node, changed, testFiles });
      const accept = violations.length ? null : runAccept(node.accept, cwd);
      if (!violations.length && accept.passed) {
        done = true;
        changed.forEach((f) => filesChanged.add(f));
        verifications.push(`[${node.id}] ${node.accept} → exit 0`);
        report.push({ id: node.id, status: 'done', attempts: attempt });
        break;
      }
      feedback = violations.length ? violations.join('\n') : `accept exited ${accept.exitCode}:\n${tail(accept.output)}`;
      runner(['reset', '--hard', start], { cwd });
      runner(['clean', '-fd'], { cwd });
    }
    if (!done) {
      report.push({ id: node.id, status: 'halted', attempts: attempt, reason: feedback });
      return { status: 'halted', halt: { node: node.id, reason: `node ${node.id} did not pass its accept after ${attempt} attempt(s) — a human takes this node over. Last failure:\n${feedback}` }, nodes: report, testFiles };
    }
  }

  return {
    status: 'ok',
    nodes: report,
    testFiles,
    developer: {
      commitSha: git(runner, ['rev-parse', 'HEAD'], cwd),
      filesChanged: [...filesChanged],
      filesChangedExternal: [],
      verifications: verifications.length ? verifications : ['all node accepts were already GREEN'],
      summary: `executed ${report.filter((r) => r.status === 'done').length}/${nodes.length} manifest node(s) against the RED oracle`,
    },
  };
}

module.exports = { runNodes, makeAcceptRunner, scopeViolations, buildOraclePrompt, buildNodePrompt, DEPENDENCY_MANIFEST_RE };
