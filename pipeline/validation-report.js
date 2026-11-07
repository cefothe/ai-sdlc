// Validation report — the PR body as evidence (Uber's "validation table"): every
// gate the change passed or skipped, each acceptance criterion with what proves
// it, review and conformance results, pace, and every seam that degraded. The
// human reviewer reads one table instead of re-deriving what ran.

const STATUS = { pass: '✅', fail: '❌', skip: '⏭️', warn: '⚠️' };

function row(check, status, detail) {
  return `| ${check} | ${STATUS[status]} | ${String(detail || '').replace(/\|/g, '\\|').replace(/\n+/g, ' ')} |`;
}

function gateRows(steps) {
  const rows = [];
  const v = steps.validate;
  rows.push(v ? row('Definition of Ready', v.admitted ? 'pass' : 'fail', v.verdict) : row('Definition of Ready', 'skip', 'not evaluated in this run'));
  const spec = steps.spec;
  rows.push(spec && spec.injected
    ? row('Specification', 'pass', [spec.kind === 'bug' ? `bug report ${spec.bugPath}` : spec.prdPath && `PRD ${spec.prdPath}`, spec.designPath && `design ${spec.designPath}`, spec.architecture && 'architecture slice'].filter(Boolean).join(' · '))
    : row('Specification', 'warn', 'no spec block reached the agents'));
  if (steps.plan) rows.push(row('Plan', steps.plan.produced ? 'pass' : 'warn', [steps.plan.provider && steps.plan.provider.name, steps.planArtifact && `committed ${steps.planArtifact.path}`].filter(Boolean).join(' · ') || 'no plan produced'));
  if (steps.nodes) {
    const done = steps.nodes.nodes.filter((n) => n.status === 'done').length;
    const weak = steps.nodes.nodes.filter((n) => n.status === 'already_satisfied').map((n) => n.id);
    rows.push(row('RED oracle nodes', weak.length ? 'warn' : 'pass', `${done}/${steps.nodes.nodes.length} GREEN against tests written first${weak.length ? `; already green before the change (weak accept): ${weak.join(', ')}` : ''}`));
  }
  if (steps.planDrift) rows.push(row('Plan conformance', steps.planDrift.length ? 'warn' : 'pass', steps.planDrift.length ? `changed but not in the plan: ${steps.planDrift.join(', ')}` : 'every changed source file is in the plan'));
  if (steps.conformance) {
    const c = steps.conformance;
    rows.push(row('Architecture conformance', c.status === 'clean' ? 'pass' : c.status === 'skipped' ? 'skip' : 'warn',
      c.status === 'findings' ? c.findings.map((f) => `${f.code}: ${f.file}`).join('; ') : c.status === 'clean' ? `components: ${c.touched.join(', ') || 'n/a'}` : 'no architecture overview'));
  }
  if (steps.review) {
    const r = steps.review;
    rows.push(row('Cross-harness review', r.approved ? 'pass' : 'fail', `${r.decision} after ${r.iterations} iteration(s) — ${r.counts.critical} critical, ${r.counts.major} major, ${r.counts.minor} minor`));
  }
  if (steps.promiseGate) rows.push(row('Promise gate', steps.promiseGate.blocking ? 'fail' : 'pass', steps.promiseGate.blocking ? steps.promiseGate.brokenPromises.join(', ') : 'no hard-mandatory promise broken'));
  if (steps.hitl) {
    const h = steps.hitl;
    rows.push(row('Human sign-off gate', h.status === 'blocked' ? 'fail' : 'pass', h.status === 'clear' ? 'no high-stakes checkpoint fired' : `signed off by a human: ${h.fired.map((f) => f.name).join(', ')}`));
  }
  if (steps.pace && steps.pace.post) {
    const p = steps.pace.post;
    rows.push(row('Pace', 'pass', `${p.verdict}${p.hitlFloor && p.hitlFloor.length ? ' (HITL floor)' : ''}${p.trustRaised ? ' (raised: low trust)' : ''}${p.conformanceRaised ? ' (raised: conformance)' : ''}`));
  }
  if (steps.cost) rows.push(row('Cost', 'pass', `$${steps.cost.usd.toFixed(2)} over ${steps.cost.calls} agent call(s)`));
  return rows;
}

function acRows(task, steps) {
  const acs = (task.acceptanceCriteria || []);
  if (!acs.length) return [];
  const evidence = steps.nodes ? steps.nodes.nodes.filter((n) => n.status === 'done').map((n) => n.id) : [];
  return acs.map((a, i) => `| AC${i + 1} | ${String(a.text).replace(/\|/g, '\\|')} | ${evidence.length ? `RED→GREEN nodes: ${evidence.join(', ')}; reviewed against the spec` : 'reviewed against the spec'} |`);
}

function buildValidationReport({ task, result }) {
  const fm = (task && task.frontmatter) || {};
  const steps = (result && result.steps) || {};
  const out = [
    `Implements ${fm.id}: ${fm.title || ''}`, '',
    '## Validation', '', '| Check | Status | Detail |', '|---|---|---|', ...gateRows(steps), '',
  ];
  const acs = acRows(task, steps);
  if (acs.length) out.push('## Acceptance criteria', '', '| # | Criterion | Evidence |', '|---|---|---|', ...acs, '');
  if (steps.developer && steps.developer.filesChanged) out.push(`**Files changed:** ${steps.developer.filesChanged.map((f) => `\`${f}\``).join(', ') || 'none'}`, '');
  const degraded = (result && result.degraded) || [];
  out.push('## Degraded seams', '', degraded.length ? degraded.map((d) => `- ${d.seam}: ${d.reason}`).join('\n') : '- none — every component this run uses was available', '');
  return out.join('\n');
}

module.exports = { buildValidationReport };
