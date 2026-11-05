// GitHub CI as a Definition-of-Done check (`type: github-checks`).
//
// A project whose CI already runs the authoritative build/test matrix on real
// runners (changed-only planning, caches, docker, clusters) should not have to
// replay that matrix on the operator's laptop to mark a task Done. This check
// delegates to CI: optionally push the branch and open a DRAFT PR (CI that only
// triggers on pull_request needs one), then poll `gh pr checks` for the head
// commit until every check settles.
//
// Pushing / opening a draft PR is outward-facing, so both are opt-in per check
// (`push: true`, `draftPr: true`) — the operator turns them on in dod-config.
//
//   waitForGithubChecks({ proc, cwd, push, draftPr, baseBranch, timeoutMs,
//                         intervalMs, appearTimeoutMs, sleep, now })
//     -> { passed, finding, output? }
//
// `proc(cmd, args, { cwd }) -> Promise<{ code, stdout, stderr }>` is injected so
// the whole flow is unit-testable without git/gh or a network.

const PASS_BUCKETS = new Set(['pass', 'skipping']);
const FAIL_BUCKETS = new Set(['fail', 'cancel']);

const DEFAULTS = {
  timeoutMs: 60 * 60 * 1000,
  intervalMs: 30 * 1000,
  appearTimeoutMs: 5 * 60 * 1000,
};

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseChecks(stdout) {
  try {
    const parsed = JSON.parse(String(stdout || '').trim() || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;
  }
}

async function ensurePr({ proc, cwd, draftPr, baseBranch }) {
  const view = await proc('gh', ['pr', 'view', '--json', 'number,url,state'], { cwd });
  if (view.code === 0) {
    try {
      const pr = JSON.parse(view.stdout);
      if (pr && pr.state === 'OPEN') return { url: pr.url };
    } catch {
      /* fall through to create */
    }
  }
  if (!draftPr) {
    return { error: 'no open PR for this branch — CI that runs on pull_request needs one (set draftPr: true on the check, or open the PR first)' };
  }
  const created = await proc('gh', ['pr', 'create', '--draft', '--fill', '--base', baseBranch], { cwd });
  if (created.code !== 0) return { error: `could not open draft PR: ${(created.stderr || created.stdout).trim()}` };
  return { url: created.stdout.trim(), created: true };
}

async function waitForGithubChecks(opts = {}) {
  const {
    proc, cwd = process.cwd(), push = false, draftPr = false, baseBranch = 'main',
    timeoutMs = DEFAULTS.timeoutMs, intervalMs = DEFAULTS.intervalMs, appearTimeoutMs = DEFAULTS.appearTimeoutMs,
    sleep = realSleep, now = Date.now,
  } = opts;
  if (typeof proc !== 'function') throw new Error('waitForGithubChecks requires a proc runner');

  if (push) {
    const pushed = await proc('git', ['push', '-u', 'origin', 'HEAD'], { cwd });
    if (pushed.code !== 0) return { passed: false, finding: 'git push failed', output: (pushed.stderr || pushed.stdout).trim() };
  }

  const pr = await ensurePr({ proc, cwd, draftPr, baseBranch });
  if (pr.error) return { passed: false, finding: pr.error };

  const started = now();
  for (;;) {
    const res = await proc('gh', ['pr', 'checks', '--json', 'name,bucket,state,link,workflow'], { cwd });
    const checks = parseChecks(res.stdout);
    if (checks === null) {
      return { passed: false, finding: `could not read PR checks (${pr.url})`, output: (res.stderr || res.stdout).trim() };
    }
    const elapsed = now() - started;

    if (checks.length === 0) {
      if (elapsed >= appearTimeoutMs) {
        return { passed: false, finding: `no CI checks appeared on ${pr.url} within ${Math.round(appearTimeoutMs / 1000)}s` };
      }
    } else {
      const failed = checks.filter((c) => FAIL_BUCKETS.has(c.bucket));
      if (failed.length) {
        return {
          passed: false,
          finding: `CI failed on ${pr.url}: ${failed.map((c) => c.name).join(', ')}`,
          output: failed.map((c) => `${c.workflow ? `${c.workflow} / ` : ''}${c.name}: ${c.link || c.state}`).join('\n'),
        };
      }
      const pending = checks.filter((c) => !PASS_BUCKETS.has(c.bucket));
      if (pending.length === 0) {
        return { passed: true, finding: `CI green on ${pr.url} (${checks.length} checks)` };
      }
      if (elapsed >= timeoutMs) {
        return { passed: false, finding: `CI still pending on ${pr.url} after ${Math.round(timeoutMs / 60000)} min: ${pending.map((c) => c.name).join(', ')}` };
      }
    }
    await sleep(intervalMs);
  }
}

module.exports = { waitForGithubChecks, parseChecks, PASS_BUCKETS, FAIL_BUCKETS, DEFAULTS };
