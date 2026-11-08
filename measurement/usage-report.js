// Usage report — how often each agent and skill actually ran (from the
// usage-telemetry hook's promise/logs/usage.jsonl), and which never ran in the
// window: candidates to merge, sharpen (description routing) or retire.

const { existsSync, readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

const DAY_MS = 86400000;

function loadUsage(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// Library names as invoked: agents may appear bare or plugin-prefixed (ai-sdlc:x).
function libraryNames(root) {
  const agents = readdirSync(join(root, 'agents')).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => f.replace(/\.md$/, ''));
  const skills = readdirSync(join(root, 'skills')).filter((d) => existsSync(join(root, 'skills', d, 'SKILL.md')));
  return { agents, skills };
}

function usageReport(entries, { agents = [], skills = [], days = 30, now = Date.now() } = {}) {
  const since = now - days * DAY_MS;
  const counts = {};
  for (const e of entries) {
    if (Date.parse(e.at) < since) continue;
    const name = String(e.name).replace(/^[^:]+:/, '');
    counts[name] = (counts[name] || 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return {
    days,
    invocations: ranked.reduce((s, [, n]) => s + n, 0),
    top: ranked.slice(0, 20).map(([name, count]) => ({ name, count })),
    unusedAgents: agents.filter((a) => !counts[a]),
    unusedSkills: skills.filter((s) => !counts[s]),
  };
}

module.exports = { loadUsage, usageReport, libraryNames };

// CLI: node measurement/usage-report.js [--days 30]
if (require.main === module) {
  const i = process.argv.indexOf('--days');
  const days = i > 0 ? Number(process.argv[i + 1]) : 30;
  const root = join(__dirname, '..');
  try {
    const rep = usageReport(loadUsage(join(root, 'promise', 'logs', 'usage.jsonl')), { ...libraryNames(root), days });
    console.log(JSON.stringify(rep, null, 2));
  } catch (err) {
    console.error(`usage-report failed: ${err.message}`);
    process.exit(1);
  }
}
