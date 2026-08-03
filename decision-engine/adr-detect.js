// Reverse-engineer PROPOSED ADRs from an existing codebase.
//
// When a brownfield repo has no ADRs, the architectural decisions still exist —
// they're just implicit in the manifests. This module reads dependency files,
// Dockerfiles, CI config, and k8s manifests to surface the load-bearing tech
// choices as PROPOSED Decision records (lifecycle: proposed, source:
// emergent-finding). They are NOT auto-accepted — the design/architect panel +
// the operator ratify them (answerDecision), which is exactly the "operator
// decides" contract. Each proposal carries its evidence (which file, which
// token) so ratification is grounded.

const { existsSync, readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { newDecision, writeDecision, nextId } = require('./decisions');

function readIfExists(root, rel) {
  const p = join(root, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function proposal(area, summary, evidence) {
  return {
    area,
    summary,
    evidence,
    options: [
      { id: 'confirm', description: 'Confirm as the architecture of record' },
      { id: 'reconsider', description: 'Flag for architectural review / change' },
    ],
  };
}

// Inspect the repo and return a list of proposed tech decisions with evidence.
function detectTechDecisions(root) {
  const found = [];

  // Node.js ecosystem
  const pkgRaw = readIfExists(root, 'package.json');
  if (pkgRaw) {
    found.push(proposal('runtime', 'Runtime: Node.js', 'package.json present'));
    let pkg = {};
    try { pkg = JSON.parse(pkgRaw); } catch { /* ignore */ }
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const has = (name) => Object.prototype.hasOwnProperty.call(deps, name);
    const web = ['express', 'fastify', 'koa', '@nestjs/core', 'next'].find(has);
    if (web) found.push(proposal('web-framework', `Web framework: ${web}`, `package.json dependency "${web}"`));
    const store = [['pg', 'PostgreSQL'], ['mysql2', 'MySQL'], ['mysql', 'MySQL'], ['mongoose', 'MongoDB'], ['mongodb', 'MongoDB'], ['redis', 'Redis'], ['sqlite3', 'SQLite']].find(([d]) => has(d));
    if (store) found.push(proposal('datastore', `Datastore: ${store[1]}`, `package.json dependency "${store[0]}"`));
    const test = ['jest', 'vitest', 'mocha'].find(has);
    if (test) found.push(proposal('test-framework', `Test framework: ${test}`, `package.json dependency "${test}"`));
  }

  // JVM
  if (existsSync(join(root, 'pom.xml')) || existsSync(join(root, 'build.gradle')) || existsSync(join(root, 'build.gradle.kts'))) {
    const build = existsSync(join(root, 'pom.xml')) ? 'pom.xml (Maven)' : 'build.gradle (Gradle)';
    found.push(proposal('runtime', 'Runtime: JVM / Java', build));
    const buildContent = (readIfExists(root, 'pom.xml') || readIfExists(root, 'build.gradle') || readIfExists(root, 'build.gradle.kts') || '');
    if (/spring/i.test(buildContent)) found.push(proposal('web-framework', 'Web framework: Spring', `"spring" in ${build}`));
  }

  // Python
  if (existsSync(join(root, 'requirements.txt')) || existsSync(join(root, 'pyproject.toml'))) {
    const src = existsSync(join(root, 'requirements.txt')) ? 'requirements.txt' : 'pyproject.toml';
    found.push(proposal('runtime', 'Runtime: Python', src));
    const content = (readIfExists(root, 'requirements.txt') || readIfExists(root, 'pyproject.toml') || '').toLowerCase();
    const fw = ['django', 'flask', 'fastapi'].find((f) => content.includes(f));
    if (fw) found.push(proposal('web-framework', `Web framework: ${fw}`, `"${fw}" in ${src}`));
  }

  // Go
  if (existsSync(join(root, 'go.mod'))) found.push(proposal('runtime', 'Runtime: Go', 'go.mod present'));

  // Deployment / infra
  if (existsSync(join(root, 'Dockerfile'))) found.push(proposal('deployment', 'Containerized deployment: Docker', 'Dockerfile present'));
  if (existsSync(join(root, 'docker-compose.yml')) || existsSync(join(root, 'docker-compose.yaml'))) {
    found.push(proposal('deployment', 'Local orchestration: Docker Compose', 'docker-compose file present'));
  }
  if (existsSync(join(root, 'k8s')) || existsSync(join(root, 'kubernetes')) || existsSync(join(root, 'helm')) || existsSync(join(root, 'charts'))) {
    found.push(proposal('deployment', 'Orchestration: Kubernetes', 'k8s/helm manifests present'));
  }

  // CI
  const wf = join(root, '.github', 'workflows');
  if (existsSync(wf) && readdirSync(wf).some((f) => /\.ya?ml$/.test(f))) {
    found.push(proposal('ci', 'CI: GitHub Actions', '.github/workflows present'));
  }
  if (existsSync(join(root, '.gitlab-ci.yml'))) found.push(proposal('ci', 'CI: GitLab CI', '.gitlab-ci.yml present'));

  return found;
}

// Write the detected decisions as PROPOSED Decision records. Returns { proposed }.
function proposeArchitectureAdrs(root, { created = '', startId } = {}) {
  const detected = detectTechDecisions(root);
  const proposed = [];
  let n = startId ? parseInt(String(startId).replace(/^DEC-/, ''), 10) : parseInt(nextId(root).replace('DEC-', ''), 10);
  for (const d of detected) {
    const id = `DEC-${String(n).padStart(4, '0')}`;
    const decision = newDecision({
      id,
      summary: d.summary,
      body: `Reverse-engineered from the codebase (evidence: ${d.evidence}). PROPOSED — confirm as architecture of record or flag for review.\n\nArea: ${d.area}`,
      source: 'emergent-finding',
      options: d.options,
      lifecycle: 'proposed',
      created,
    });
    writeDecision(root, decision);
    proposed.push({ id, area: d.area, summary: d.summary, evidence: d.evidence });
    n += 1;
  }
  return { proposed };
}

module.exports = { detectTechDecisions, proposeArchitectureAdrs, readIfExists };
