// Capability resolver — turns a CapabilityMap (.ai-sdlc/capabilities.yaml) plus
// a task's context into the concrete providers the pipeline dispatches at each
// stage. A provider is either an existing SKILL (code-plan, code-review-pr,
// code-security-scan) or a specialized AGENT (java-pro, security-auditor,
// qa-code-reviewer). This is the seam that plugs the framework's existing
// skills/agents/teams into the Step 0-13 pipeline as named stages.
//
//   - resolvePlanStage   -> the planning provider (e.g. skill: code-plan)
//   - resolveImplementer -> the implementation agent, routed by language
//   - resolveReviewTeam  -> the reviewer set, routed (Java tests -> qa-code-reviewer),
//                           cross-harness-checked (reviewer harness != implementer),
//                           and flagged as a team when >= 3 providers resolve
//   - resolveTestStage   -> the test provider (e.g. agent: test-runner)

const { existsSync, readFileSync } = require('node:fs');
const yaml = require('js-yaml');
const { isJavaTestFile } = require('../promise/java-test-file-pattern');

function loadCapabilityMap(path) {
  if (!path || !existsSync(path)) throw new Error(`capability map not found: ${path}`);
  const doc = yaml.load(readFileSync(path, 'utf8'));
  if (!doc || doc.kind !== 'CapabilityMap') throw new Error('capabilities file must declare kind: CapabilityMap');
  if (!doc.spec || !doc.spec.stages) throw new Error('CapabilityMap requires spec.stages');
  return doc;
}

function ctxHasJavaTests(ctx) {
  return (ctx.files || []).some((f) => isJavaTestFile(f));
}

function matchesWhen(when, ctx) {
  if (!when) return true;
  if (when.languages && !when.languages.some((l) => (ctx.languages || []).includes(l))) return false;
  if (when.labels && !when.labels.some((l) => (ctx.labels || []).includes(l))) return false;
  if (when.javaTestFiles !== undefined && ctxHasJavaTests(ctx) !== when.javaTestFiles) return false;
  return true;
}

function stage(map, name) {
  return (map.spec.stages || {})[name] || null;
}

// ---- External-capability grants (per-stage MCP servers / web tools / skills) ----
// A stage may declare which external capabilities its agents are permitted to use:
// registered MCP servers (firecrawl, a read-only DB), built-in web-research tools
// (WebSearch/WebFetch), and framework skills (deep-research, firecrawl). The grant
// is advisory — it becomes the dispatched agent's `tools` allowlist plus a prompt
// line telling the stage to ground its work in real sources. This is the seam that
// lets design scrape real API docs / inspect a live schema, and review/discovery
// run deep web research, without granting those capabilities to every stage.

const CAP_KINDS = ['mcp', 'web', 'skills'];

function mergeCapabilities(into, from) {
  if (!from || typeof from !== 'object') return into;
  for (const kind of CAP_KINDS) {
    if (!Array.isArray(from[kind])) continue;
    const set = new Set(into[kind] || []);
    for (const v of from[kind]) set.add(v);
    into[kind] = [...set];
  }
  if (from.poc === true) into.poc = true; // boolean grant: OR across sources
  return into;
}

// Resolve a stage's capability grant: the base `capabilities` block unioned with
// every routing rule whose `when` matches via `addCapabilities`. Always returns
// the three tool kinds (possibly empty) + the `poc` flag so callers treat it uniformly.
function resolveStageCapabilities(map, name, ctx = {}) {
  const binding = stage(map, name);
  const grant = { mcp: [], web: [], skills: [], poc: false };
  if (!binding) return grant;
  mergeCapabilities(grant, binding.capabilities);
  for (const rule of binding.routing || []) {
    if (rule.addCapabilities && matchesWhen(rule.when, ctx)) mergeCapabilities(grant, rule.addCapabilities);
  }
  return grant;
}

// Flatten a grant to a concrete tool allowlist for a subagent's `tools` field.
// MCP servers -> mcp__<server> (Claude Code matches all of that server's tools);
// web tools pass through verbatim; any granted skill adds the Skill invoker.
function capabilityToolNames(grant) {
  if (!grant) return [];
  const tools = [];
  for (const s of grant.mcp || []) tools.push(`mcp__${s}`);
  for (const w of grant.web || []) tools.push(w);
  if ((grant.skills || []).length) tools.push('Skill');
  return tools;
}

// One-line human-readable guidance appended to a stage's dispatch prompt.
// Returns null when the stage grants nothing (so callers can omit the line).
function formatCapabilityGuidance(grant) {
  if (!grant) return null;
  const parts = [];
  if ((grant.mcp || []).length) parts.push(`MCP servers [${grant.mcp.join(', ')}]`);
  if ((grant.web || []).length) parts.push(`web research [${grant.web.join(', ')}]`);
  if ((grant.skills || []).length) parts.push(`skills [${grant.skills.join(', ')}]`);
  const poc = grant.poc
    ? ' You MAY also run a SMALL, throwaway proof-of-concept to VALIDATE an external contract (call the real endpoint, check a response schema, confirm auth/pagination/rate limits) — record the result as evidence and cite it; keep it bounded, read-only, and never commit PoC code.'
    : '';
  if (!parts.length && !poc) return null;
  const base = parts.length
    ? `External capabilities granted for this stage — use them to ground your work in real sources (fetch the real docs/specs, inspect the live schema, research prior art) rather than inventing anything you could verify: ${parts.join('; ')}.`
    : '';
  return (base + poc).trim() || null;
}

// Single-provider stage with first-match-wins routing.
function resolveSingle(map, name, ctx = {}) {
  const binding = stage(map, name);
  if (!binding) return null;
  for (const rule of binding.routing || []) {
    if (rule.provider && matchesWhen(rule.when, ctx)) return { stage: name, ...rule.provider, routedBy: rule.when };
  }
  return binding.provider ? { stage: name, ...binding.provider } : null;
}

function resolvePlanStage(map, ctx) {
  return resolveSingle(map, 'plan', ctx);
}

function resolveImplementer(map, ctx) {
  return resolveSingle(map, 'implement', ctx);
}

function resolveTestStage(map, ctx) {
  return resolveSingle(map, 'test', ctx);
}

// Shared multi-provider resolution: base providers[] + routing add/replace by
// role. Used by both the design panel and the review team.
function applyTeamRouting(binding, ctx) {
  const providers = (binding.providers || []).map((p) => ({ ...p }));
  for (const rule of binding.routing || []) {
    if (!matchesWhen(rule.when, ctx)) continue;
    const add = rule.addProvider || rule.provider;
    if (!add) continue;
    const targetRole = rule.replaceRole || add.role;
    const idx = targetRole ? providers.findIndex((p) => p.role === targetRole) : -1;
    if (idx >= 0) providers[idx] = { ...add };
    else providers.push({ ...add });
  }
  return providers;
}

// Design stage: a PANEL of architect agents (solution / backend / cloud …) that
// shape the design BEFORE implementation. Advisory + collaborative, so there is
// no cross-harness constraint. Their output feeds the plan and should be
// recorded as an ADR (Decision) by the operator.
function resolveDesignPanel(map, ctx = {}) {
  const binding = stage(map, 'design');
  if (!binding) return { providers: [], panel: false };
  const providers = applyTeamRouting(binding, ctx);
  return { providers, panel: binding.panel === true || providers.length >= 2 };
}

// Review stage: build the reviewer team, apply routing (incl. the architect
// review lens for structural changes), enforce cross-harness independence, and
// decide team vs single dispatch.
function resolveReviewTeam(map, ctx = {}, { implementerHarness } = {}) {
  const binding = stage(map, 'review');
  if (!binding) return { providers: [], team: false };
  const providers = applyTeamRouting(binding, ctx);

  // Cross-harness enforcement: a reviewer may not run on the implementer harness.
  if (implementerHarness) {
    for (const p of providers) {
      if (p.harness && p.harness === implementerHarness) {
        throw new Error(`cross-harness violation: reviewer "${p.name}" (${p.role || 'reviewer'}) shares the implementer harness "${implementerHarness}"`);
      }
    }
  }

  const team = binding.team === true || providers.length >= 3;
  return { providers, team, umbrellaSkill: binding.skill || null };
}

module.exports = { loadCapabilityMap, resolvePlanStage, resolveImplementer, resolveTestStage, resolveDesignPanel, resolveReviewTeam, applyTeamRouting, matchesWhen, ctxHasJavaTests, resolveStageCapabilities, capabilityToolNames, formatCapabilityGuidance };
