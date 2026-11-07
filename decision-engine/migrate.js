// Migration — bring artifacts written under the old rules up to the current
// gates: PRDs (10 sections + substance + product grounding), design docs
// (substance, AC mapping, complete ADRs), ADRs (context / rationale /
// consequences / described alternatives), the product context, and open tasks
// (ACs seeded from their spec; bug tasks linked to a bug report).
//
// Two layers, matching the framework's deterministic-first rule:
//   - scan (read-only): run every gate over every artifact and report what each
//     one is missing, ordered by in-flight impact (artifacts open tasks depend on
//     come first).
//   - apply (--apply, structural only): add the missing section skeletons from
//     the templates, the design's relatedPrd link, per-AC test-strategy
//     placeholders, and the product context scaffold. Skeleton bodies are
//     template placeholders, which every gate treats as EMPTY — so a migrated
//     artifact keeps failing until real content is written. Nothing is invented,
//     no status is changed, and ADR reasoning is never generated here (the
//     /ai-sdlc:migrate command fills content from evidence, then a human
//     re-approves).

const { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } = require('node:fs');
const { join, dirname } = require('node:path');
const { parsePrd, evaluatePrd, extractPrdAcceptanceCriteria } = require('./prd-gate');
const { evaluateDesignFile, findSection: findDesignSection } = require('./design-gate');
const { listDecisions, evaluateAdrQuality } = require('./decisions');
const { evaluateProductContextRoot, DEFAULT_CONTEXT_PATH } = require('./product-context');
const { evaluateArchitectureRoot, ARCHITECTURE_PATH } = require('./architecture-context');
const { parseTask } = require('./backlog-task');
const { addFrontmatterLine, appendToSection } = require('./doc-sections');

const PLUGIN_ROOT = join(__dirname, '..');
const TEMPLATES = {
  prd: join(PLUGIN_ROOT, 'docs', 'prd', '_template.md'),
  design: join(PLUGIN_ROOT, 'docs', 'design', '_template.md'),
  product: join(PLUGIN_ROOT, 'docs', 'product', '_template.md'),
  architecture: join(PLUGIN_ROOT, 'docs', 'architecture', '_template.md'),
};

function listMarkdown(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_') && f.toLowerCase() !== 'readme.md').sort();
}

// Template section bodies by heading — the skeleton a missing section gets.
function templateSections(templatePath) {
  const { sections } = parsePrd(readFileSync(templatePath, 'utf8'));
  return new Map(sections.map((s) => [s.heading, s.content]));
}

function openTasks(root) {
  const dir = join(root, 'backlog', 'tasks');
  return listMarkdown(dir).map((f) => {
    const path = join('backlog', 'tasks', f);
    try {
      return { path, task: parseTask(readFileSync(join(root, path), 'utf8')) };
    } catch {
      return null;
    }
  }).filter((t) => t && String(t.task.frontmatter.status || '').toLowerCase() !== 'done');
}

function tasksReferencing(tasks, relPath) {
  return tasks.filter(({ task }) => {
    const fm = task.frontmatter;
    return (fm.specRef && fm.specRef.artifactPath === relPath) || (fm.references || []).includes(relPath);
  }).map(({ task }) => task.frontmatter.id);
}

const normalizeAc = (t) => String(t).replace(/^#\d+\s+/, '').trim().toLowerCase();

// Read-only: every artifact against the current gates.
function scanArtifacts(root) {
  const tasks = openTasks(root);
  const productContext = evaluateProductContextRoot(root);
  const productForPrd = productContext || undefined;

  const prds = listMarkdown(join(root, 'docs', 'prd')).map((f) => {
    const path = join('docs', 'prd', f);
    const markdown = readFileSync(join(root, path), 'utf8');
    const r = evaluatePrd(markdown, { path, productContext: productForPrd });
    const issues = r.reasons.filter((x) => !/^status is /.test(x));
    return { path, status: r.status, ok: issues.length === 0, issues, missingSections: r.missingSections, inFlightTasks: tasksReferencing(tasks, path) };
  });

  const designs = listMarkdown(join(root, 'docs', 'design')).map((f) => {
    const path = join('docs', 'design', f);
    const r = evaluateDesignFile(join(root, path), { root });
    return { path, status: r.status, ok: r.valid, issues: r.reasons, missingSections: r.missingSections, unmappedAcs: r.unmappedAcs, adrIssues: r.adrIssues, inFlightTasks: tasksReferencing(tasks, path) };
  });

  const adrs = listDecisions(root).map((d) => {
    const q = evaluateAdrQuality(d);
    return { id: q.id, lifecycle: (d.status || {}).lifecycle, ok: q.valid, issues: q.issues };
  });

  const taskIssues = [];
  for (const { path, task } of tasks) {
    const fm = task.frontmatter;
    const issues = [];
    const labels = (fm.labels || []).map((l) => String(l).toLowerCase());
    if (labels.includes('bug') && !(fm.specRef && fm.specRef.source === 'bug')) issues.push('bug task without a bug report — triage it with /ai-sdlc:bug');
    if (fm.specRef && fm.specRef.source !== 'bug' && typeof fm.specRef.artifactPath === 'string' && existsSync(join(root, fm.specRef.artifactPath))) {
      const prdAcs = extractPrdAcceptanceCriteria(readFileSync(join(root, fm.specRef.artifactPath), 'utf8')).map(normalizeAc);
      const taskAcs = new Set((task.acceptanceCriteria || []).map((a) => normalizeAc(a.text)));
      const missing = prdAcs.filter((a) => !taskAcs.has(a));
      if (missing.length) issues.push(`${missing.length} PRD acceptance criteria not in the task — re-seed its ACs from ${fm.specRef.artifactPath}`);
    }
    if (issues.length) taskIssues.push({ path, id: fm.id, issues });
  }

  const architecture = evaluateArchitectureRoot(root);

  const byImpact = (a, b) => b.inFlightTasks.length - a.inFlightTasks.length || a.path.localeCompare(b.path);
  const report = {
    productContext: productContext ? { path: DEFAULT_CONTEXT_PATH, exists: true, ok: productContext.valid, issues: productContext.reasons } : { path: DEFAULT_CONTEXT_PATH, exists: false, ok: false, issues: ['no product context doc'] },
    architecture: architecture ? { path: ARCHITECTURE_PATH, exists: true, ok: architecture.valid, issues: architecture.reasons } : { path: ARCHITECTURE_PATH, exists: false, ok: false, issues: ['no architecture overview — run /ai-sdlc:architecture'] },
    prds: prds.sort(byImpact),
    designs: designs.sort(byImpact),
    adrs,
    tasks: taskIssues,
  };
  const failing = [report.productContext, report.architecture, ...prds, ...designs, ...adrs].filter((x) => !x.ok).length + taskIssues.length;
  report.summary = {
    prds: `${prds.filter((p) => p.ok).length}/${prds.length} ok`,
    designs: `${designs.filter((d) => d.ok).length}/${designs.length} ok`,
    adrs: `${adrs.filter((a) => a.ok).length}/${adrs.length} ok`,
    tasks: `${taskIssues.length} need attention`,
    productContext: report.productContext.ok ? 'ok' : report.productContext.exists ? 'incomplete' : 'missing',
    architecture: report.architecture.ok ? 'ok' : report.architecture.exists ? 'incomplete' : 'missing',
    clean: failing === 0,
  };
  return report;
}

function appendSections(markdown, names, bodies) {
  const blocks = names.map((n) => `## ${n}\n${bodies.get(n) || `<${n}>`}\n`);
  return `${markdown.replace(/\s*$/, '\n')}\n${blocks.join('\n')}`;
}

// Structural fixes only. Returns the list of changes made.
function applyStructuralFixes(root, report) {
  const changes = [];
  const prdBodies = templateSections(TEMPLATES.prd);
  const designBodies = templateSections(TEMPLATES.design);

  const ctxPath = join(root, DEFAULT_CONTEXT_PATH);
  if (!existsSync(ctxPath)) {
    mkdirSync(dirname(ctxPath), { recursive: true });
    writeFileSync(ctxPath, readFileSync(TEMPLATES.product, 'utf8'));
    changes.push({ path: DEFAULT_CONTEXT_PATH, change: 'created product context scaffold' });
  }

  const archPath = join(root, ARCHITECTURE_PATH);
  if (!existsSync(archPath)) {
    mkdirSync(dirname(archPath), { recursive: true });
    writeFileSync(archPath, readFileSync(TEMPLATES.architecture, 'utf8'));
    changes.push({ path: ARCHITECTURE_PATH, change: 'created architecture overview scaffold' });
  }

  for (const prd of report.prds) {
    if (!prd.missingSections.length) continue;
    const full = join(root, prd.path);
    writeFileSync(full, appendSections(readFileSync(full, 'utf8'), prd.missingSections, prdBodies));
    changes.push({ path: prd.path, change: `added section skeletons: ${prd.missingSections.join(', ')}` });
  }

  for (const design of report.designs) {
    const full = join(root, design.path);
    let md = readFileSync(full, 'utf8');
    const before = md;
    const { frontmatter } = parsePrd(md);
    const feature = String(frontmatter.feature || frontmatter.featureId || design.path.replace(/^.*\//, '').replace(/\.md$/, ''));
    const prdRel = join('docs', 'prd', `${feature}.md`).split('\\').join('/');
    const notes = [];
    if (!frontmatter.relatedPrd && existsSync(join(root, prdRel))) {
      md = addFrontmatterLine(md, `relatedPrd: ${prdRel}`);
      notes.push(`linked relatedPrd ${prdRel}`);
    }
    if (design.missingSections.length) {
      md = appendSections(md, design.missingSections, designBodies);
      notes.push(`added section skeletons: ${design.missingSections.join(', ')}`);
    }
    const prdFull = join(root, String(parsePrd(md).frontmatter.relatedPrd || prdRel));
    // Placeholders already present (a previous --apply) are not added twice.
    const pending = (design.unmappedAcs || []).filter((tag) => !md.includes(`<${tag} — `));
    if (pending.length && existsSync(prdFull)) {
      const acs = extractPrdAcceptanceCriteria(readFileSync(prdFull, 'utf8'));
      const lines = pending.map((tag) => `<${tag} — test layer + what proves it: "${acs[Number(tag.slice(2)) - 1] || ''}">`);
      md = appendToSection(md, (h) => !!findDesignSection([{ heading: h }], 'Test strategy'), lines);
      notes.push(`added test-strategy placeholders for ${pending.join(', ')}`);
    }
    if (md !== before) {
      writeFileSync(full, md);
      changes.push({ path: design.path, change: notes.join('; ') });
    }
  }
  return changes;
}

function formatReport(report) {
  const lines = ['Migration report', '', `Summary: product context ${report.summary.productContext} · architecture ${report.summary.architecture} · PRDs ${report.summary.prds} · designs ${report.summary.designs} · ADRs ${report.summary.adrs} · tasks ${report.summary.tasks}`];
  const section = (title, items, label) => {
    const bad = items.filter((i) => !i.ok);
    if (!bad.length) return;
    lines.push('', `${title}:`);
    for (const i of bad) {
      lines.push(`- ${label(i)}${i.inFlightTasks && i.inFlightTasks.length ? `  [blocks ${i.inFlightTasks.join(', ')}]` : ''}`);
      for (const issue of i.issues) lines.push(`    · ${issue}`);
    }
  };
  if (!report.productContext.ok) section('Product context', [report.productContext], (i) => i.path);
  if (!report.architecture.ok) section('Architecture overview', [report.architecture], (i) => i.path);
  section('PRDs', report.prds, (i) => `${i.path} (status: ${i.status || 'unset'})`);
  section('Design docs', report.designs, (i) => `${i.path} (status: ${i.status || 'unset'})`);
  section('ADRs', report.adrs, (i) => `${i.id} [${i.lifecycle}]`);
  if (report.tasks.length) {
    lines.push('', 'Open tasks:');
    for (const t of report.tasks) { lines.push(`- ${t.id} (${t.path})`); for (const issue of t.issues) lines.push(`    · ${issue}`); }
  }
  if (report.summary.clean) lines.push('', 'Everything meets the current gates.');
  return lines.join('\n');
}

module.exports = { scanArtifacts, applyStructuralFixes, formatReport, appendSections, addFrontmatterLine, appendToSection };

// CLI: node decision-engine/migrate.js [--apply] [--json]
// exit 0 clean · 2 artifacts still fail the current gates
if (require.main === module) {
  const args = process.argv.slice(2);
  const root = process.cwd();
  try {
    let report = scanArtifacts(root);
    let changes = [];
    if (args.includes('--apply')) {
      changes = applyStructuralFixes(root, report);
      report = scanArtifacts(root);
    }
    if (args.includes('--json')) console.log(JSON.stringify({ changes, report }, null, 2));
    else {
      if (changes.length) console.log(['Structural changes:', ...changes.map((c) => `- ${c.path}: ${c.change}`), ''].join('\n'));
      console.log(formatReport(report));
    }
    process.exit(report.summary.clean ? 0 : 2);
  } catch (err) {
    console.error(`migrate failed: ${err.message}`);
    process.exit(1);
  }
}
