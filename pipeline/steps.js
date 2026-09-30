// Step 0–13 pipeline primitives (ported from the reference pipeline-cli/src/steps).
//
// Every step is a pure-ish function whose side effects (git, spawn, gh) arrive
// through injected seams, so the whole pipeline is unit-testable without a real
// repo or network — the same design the reference uses. Pattern C is enforced
// here: the parent working tree stays read-only on its base branch; all code
// work happens inside .worktrees/<task-id>/.

const { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, rmSync, unlinkSync } = require('node:fs');
const { join, dirname, basename } = require('node:path');

const DEFAULT_BRANCH_PATTERN = 'ai-sdlc/{issueIdLower}-{slug}';
const FALLBACK_SLUG = 'task';
const SEVERITIES = ['critical', 'major', 'minor', 'suggestion'];
const ACTIVE_TASK_SENTINEL = '.active-task';

function slugify(title) {
  const s = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return s || FALLBACK_SLUG;
}

// Step 0 — sweep merged worktrees. isMerged(branch) is injected.
function sweepMergedWorktrees({ worktreesDir, isMerged, runner }) {
  const removed = [];
  if (!worktreesDir || !existsSync(worktreesDir)) return { removed };
  for (const name of readdirSync(worktreesDir)) {
    const wt = join(worktreesDir, name);
    const branch = `ai-sdlc/${name}`;
    if (isMerged && isMerged(branch)) {
      if (runner) runner(['worktree', 'remove', '--force', wt]);
      else rmSync(wt, { recursive: true, force: true });
      removed.push(name);
    }
  }
  return { removed };
}

// Step 1 — validate task via the DoR gate (injected evaluator + config).
function validateTaskStep({ task, projectRoot, dorConfig, evaluateDor, stageBJudge }) {
  const r = evaluateDor(task, { projectRoot, config: dorConfig, stageBJudge });
  return { admitted: r.admitted, verdict: r.verdict, reasons: r.reasons, gates: r.gates };
}

// Step 2 — compute branch name from title.
function computeBranchName({ taskId, task, pattern = DEFAULT_BRANCH_PATTERN }) {
  const title = (task.frontmatter && task.frontmatter.title) || task.title || '';
  const slug = slugify(title);
  return pattern
    .replace('{issueIdLower}', String(taskId).toLowerCase())
    .replace('{slug}', slug);
}

// Step 3 — setup worktree with a Pattern C guard. runner runs git in repoDir.
// gitState() -> { branch, clean } for the parent tree (injected/derived).
function setupWorktree({ repoDir, worktreePath, branch, baseBranch = 'main', runner, gitState }) {
  const state = gitState ? gitState() : deriveGitState(repoDir, runner);
  if (state.branch !== baseBranch) {
    throw new Error(`Pattern C violation: parent tree must be on ${baseBranch}, is on ${state.branch}`);
  }
  if (!state.clean) {
    throw new Error('Pattern C violation: parent working tree is dirty; refusing to create a worktree');
  }
  runner(['worktree', 'add', '-b', branch, worktreePath, baseBranch]);
  return { worktreePath, branch };
}

function deriveGitState(repoDir, runner) {
  const branch = runner(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoDir }).stdout.trim();
  const status = runner(['status', '--porcelain'], { cwd: repoDir }).stdout.trim();
  return { branch, clean: status.length === 0 };
}

// Step 4 — begin task: flip status To Do -> In Progress, write .active-task.
function beginTask({ taskFilePath, worktreePath, taskId }) {
  if (taskFilePath && existsSync(taskFilePath)) {
    const raw = readFileSync(taskFilePath, 'utf8');
    const flipped = raw.replace(/^(status:\s*).*$/m, '$1In Progress');
    if (flipped !== raw) writeFileSync(taskFilePath, flipped);
  }
  if (worktreePath) {
    if (!existsSync(worktreePath)) mkdirSync(worktreePath, { recursive: true });
    writeFileSync(join(worktreePath, ACTIVE_TASK_SENTINEL), String(taskId));
  }
  return { activeTask: taskId };
}

// Step 5 — build developer prompt. cxpakContext is the pre-action provider
// output (the proven d=1.82 lever); passed through when available.
// Render the selected ADRs as an implementation-constraint block. Returns null
// when there are none, so callers can omit the section.
function formatDecisionsContext(decisions) {
  if (!Array.isArray(decisions) || decisions.length === 0) return null;
  const lines = decisions.map((d) => {
    const m = d.metadata || {};
    const s = d.spec || {};
    const st = d.status || {};
    const chosen = st.answeredOptionId ? ` (chosen: ${st.answeredOptionId})` : '';
    const why = s.rationale ? ` — ${String(s.rationale).split('\n')[0].trim()}` : '';
    return `  - ${m.id} [${st.lifecycle || 'proposed'}${m.scope ? `/${m.scope}` : ''}]: ${s.summary}${chosen}${why}`;
  });
  return [
    'Architectural decisions (ADRs) — CONSTRAINTS for this implementation.',
    'Honor these; cite the DEC id where you implement one. If an ADR blocks the task or',
    'you must diverge, STOP and flag it — do not silently contradict a recorded decision.',
    ...lines,
  ].join('\n');
}

function buildDeveloperPrompt({ task, branch, cxpakContext, capabilityGuidance, decisionsContext }) {
  const fm = task.frontmatter || {};
  const acs = (task.acceptanceCriteria || []).map((a, i) => `  ${i + 1}. ${a.text}`).join('\n');
  const lines = [
    `You are implementing backlog task ${fm.id} on branch ${branch}.`,
    `Title: ${fm.title}`,
    '',
    'Acceptance criteria (all must be satisfied):',
    acs || '  (none specified)',
    '',
  ];
  if (cxpakContext) {
    lines.push('Structured context (cxpak — read this before exploring):', cxpakContext, '');
  }
  if (decisionsContext) lines.push(decisionsContext, '');
  if (capabilityGuidance) lines.push(capabilityGuidance, '');
  lines.push('Implement the contract exactly. Return JSON: { commitSha, filesChanged[], filesChangedExternal[], verifications[], summary }.');
  return { prompt: lines.join('\n') };
}

// Step 6 — parse + validate the developer's structured return.
function parseDeveloperReturn(ret) {
  if (!ret || typeof ret !== 'object') throw new Error('developer return is not an object');
  if (typeof ret.commitSha !== 'string' || ret.commitSha.length === 0) {
    throw new Error('developer return missing commitSha — no commit was produced');
  }
  if (!Array.isArray(ret.verifications) || ret.verifications.length === 0) {
    throw new Error('developer return missing verifications — cannot confirm the work ran');
  }
  return {
    commitSha: ret.commitSha,
    filesChanged: ret.filesChanged || [],
    filesChangedExternal: ret.filesChangedExternal || [],
    verifications: ret.verifications,
    summary: ret.summary || '',
  };
}

// Compute the REAL diff a cross-harness reviewer must see — the actual changed
// lines, not the implementer's self-reported summary. Reviewing a paraphrase
// defeats the whole point of an independent harness: an implementer that writes
// a clean summary over buggy code would pass. We render the full patch of the
// task branch vs its base (the standard PR diff), prefixed with a --stat header.
//
// Bounded, not unbounded: a giant change is truncated at maxChars with an
// explicit marker so the prompt never blows the model's context (R7/R8 token
// discipline) — but the default budget is large (200k chars) so real reviews
// get the whole change. Falls back to the developer summary only when git
// produces nothing usable (e.g. no runner, or an empty/failed diff).
function computeReviewDiff({ runner, cwd, baseBranch = 'main', commitSha, fallbackSummary, maxChars = 200000 }) {
  const readDiff = () => {
    if (!runner) return '';
    const run = (args) => {
      try {
        return String((runner(args, { cwd }) || {}).stdout || '').trim();
      } catch (err) {
        // execFileSync throws on non-zero exit but may still expose captured stdout.
        return String((err && err.stdout) || '').trim();
      }
    };
    // Range diff against the merge-base with the base branch = the full change
    // set on this branch (the PR view). Fall back to showing the single commit
    // when the range is empty (e.g. base branch not present in the worktree).
    const range = `${baseBranch}...HEAD`;
    let stat = run(['diff', '--stat', range]);
    let patch = run(['diff', range]);
    if (!patch && commitSha) {
      stat = run(['show', '--stat', '--format=', commitSha]);
      patch = run(['show', '--format=', commitSha]);
    }
    if (!patch) return '';
    return [stat ? `Changed files:\n${stat}` : '', patch].filter(Boolean).join('\n\n');
  };

  let diff = readDiff();
  if (!diff) {
    // Nothing from git — degrade to the summary so the reviewer still gets
    // *something*, but make it explicit this is not the real diff.
    return fallbackSummary
      ? `(git diff unavailable — implementer summary only, NOT the actual diff)\n\n${fallbackSummary}`
      : '(diff unavailable)';
  }
  if (diff.length > maxChars) {
    diff = `${diff.slice(0, maxChars)}\n\n… [diff truncated at ${maxChars} chars — review the remainder in the worktree]`;
  }
  return diff;
}

// Step 7 — build the cross-harness review prompts. promiseContext is the
// advisory promise-verification string (read-only reviewer input). `team` is an
// optional resolved reviewer set (from the CapabilityMap) — each entry may
// carry { role, name, harness }; when omitted, the default 3 roles are used.
function buildReviewPrompts({ task, diff, promiseContext, team, capabilityGuidance }) {
  const fm = task.frontmatter || {};
  const roster = (team && team.length ? team : ['code-reviewer', 'test-reviewer', 'security-reviewer']).map((r) =>
    typeof r === 'string' ? { role: r, name: r } : { role: r.role || r.name, name: r.name || r.role, harness: r.harness },
  );
  const prompts = roster.map((r) => {
    const lines = [
      `You are the ${r.role} for task ${fm.id}${r.name && r.name !== r.role ? ` (agent: ${r.name})` : ''}. Review the diff below independently.`,
      promiseContext ? `\n${promiseContext}\n` : '',
      capabilityGuidance ? `${capabilityGuidance}\n` : '',
      'Diff:',
      diff || '(diff omitted)',
      '',
      'Return JSON: { reviewer, approved: boolean, findings: [{ severity, file, line, message }] }.',
    ];
    return { reviewer: r.role, provider: r, prompt: lines.filter(Boolean).join('\n') };
  });
  return { prompts, reviewers: roster.map((r) => r.role) };
}

// Step 8 — aggregate reviewer verdicts. APPROVED iff all approved and no
// critical/major findings (reference semantics).
function aggregateVerdicts({ verdicts }) {
  const counts = { critical: 0, major: 0, minor: 0, suggestion: 0 };
  let allApproved = true;
  for (const v of verdicts || []) {
    if (!v.approved) allApproved = false;
    for (const f of v.findings || []) {
      const sev = SEVERITIES.includes(f.severity) ? f.severity : 'suggestion';
      counts[sev] += 1;
    }
  }
  const blocking = counts.critical > 0 || counts.major > 0;
  const decision = allApproved && !blocking ? 'APPROVED' : 'CHANGES_REQUESTED';
  return { decision, approved: decision === 'APPROVED', counts, blocking };
}

// Step 10 — finalize: check ACs, flip to Done, move tasks/ -> completed/.
function finalizeTask({ taskFilePath, completedDir, requireAllAcChecked, task }) {
  const acs = (task && task.acceptanceCriteria) || [];
  const unchecked = acs.filter((a) => !a.checked);
  if (requireAllAcChecked && acs.length > 0 && unchecked.length > 0) {
    throw new Error(`cannot finalize: ${unchecked.length} acceptance criteria still unchecked`);
  }
  let movedTo = null;
  if (taskFilePath && existsSync(taskFilePath)) {
    const raw = readFileSync(taskFilePath, 'utf8').replace(/^(status:\s*).*$/m, '$1Done');
    writeFileSync(taskFilePath, raw);
    if (completedDir) {
      if (!existsSync(completedDir)) mkdirSync(completedDir, { recursive: true });
      movedTo = join(completedDir, basename(taskFilePath));
      renameSync(taskFilePath, movedTo);
    }
  }
  return { finalized: true, movedTo };
}

// Step 11 — push branch + open PR (injected gh).
function pushAndPr({ branch, task, baseBranch = 'main', runner, gh, worktreePath }) {
  if (runner) runner(['push', '-u', 'origin', branch], { cwd: worktreePath });
  const fm = task.frontmatter || {};
  const out = gh(['pr', 'create', '--head', branch, '--base', baseBranch, '--title', `${fm.id}: ${fm.title}`, '--body', `Implements ${fm.id}.`]);
  const url = (out && out.stdout ? out.stdout : String(out || '')).trim();
  return { url, branch };
}

// Step 12 — sibling PRs for cross-repo external changes (workspace / external paths).
function siblingPrs({ filesChangedExternal, resolveRepoForPath, gh, branch }) {
  const prs = [];
  const byRepo = new Map();
  for (const f of filesChangedExternal || []) {
    const repo = resolveRepoForPath ? resolveRepoForPath(f) : null;
    if (!repo) continue;
    if (!byRepo.has(repo.id)) byRepo.set(repo.id, []);
    byRepo.get(repo.id).push(f);
  }
  for (const [repoId, files] of byRepo) {
    const out = gh(['pr', 'create', '--head', branch, '--title', `sibling: ${repoId} changes for ${branch}`, '--body', `Sibling changes: ${files.join(', ')}`]);
    prs.push({ repoId, url: (out && out.stdout ? out.stdout : String(out || '')).trim(), files });
  }
  return { prs };
}

// Step 13 — cleanup sentinel (always runs, even on failure).
function cleanupTask({ worktreePath }) {
  if (worktreePath) {
    const sentinel = join(worktreePath, ACTIVE_TASK_SENTINEL);
    if (existsSync(sentinel)) {
      try { unlinkSync(sentinel); } catch { /* best-effort */ }
    }
  }
  return { cleaned: true };
}

module.exports = {
  slugify, sweepMergedWorktrees, validateTaskStep, computeBranchName, setupWorktree,
  beginTask, buildDeveloperPrompt, formatDecisionsContext, parseDeveloperReturn, computeReviewDiff, buildReviewPrompts,
  aggregateVerdicts, finalizeTask, pushAndPr, siblingPrs, cleanupTask,
  DEFAULT_BRANCH_PATTERN, FALLBACK_SLUG, SEVERITIES, ACTIVE_TASK_SENTINEL,
};
