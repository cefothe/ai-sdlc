// Sync the shared project-context protocol into every agent and every skill
// that plans, implements, reviews or tests — and grant agents the read-only
// context tools — so an agent invoked OUTSIDE the pipeline (Task tool, a
// skill, a teammate) knows the architecture, the product context, the spec and
// the code map, not only one the pipeline hands a spec block to.
//
//   - Protocol: rules/context-protocol.md is the single source. Each target gets
//     it as a marked block right after its frontmatter; re-running replaces the
//     block, so edits are made in the rule file only.
//   - Stage grants: an agent bound to a pipeline stage (incl. routing) in the
//     plugin's capability maps also gets that stage's granted capabilities —
//     MCP servers (both namings), web tools, and the Skill tool for granted
//     skills — otherwise its allowlist silently voids the grant. Headless runs
//     still boot only the servers the CURRENT stage grants (strict --mcp-config).
//   - Tools: an explicit `tools:` allowlist excludes every MCP tool not listed
//     (Claude Code sub-agents docs). Each allowlisted agent gets the cxpak and
//     ai-sdlc-context servers in both namings: plugin-bundled (interactive,
//     mcp__plugin_<plugin>_<server>__*) and the headless pipeline's strict
//     --mcp-config (mcp__<server>__*). Both servers are read-only, so read-only
//     agents stay read-only. Agents without `tools:` already inherit MCP tools.
//
//   node scripts/sync-context-protocol.js          # write
//   node scripts/sync-context-protocol.js --check  # exit 1 on drift (CI)

const { readFileSync, writeFileSync, readdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, 'rules', 'context-protocol.md');
const BEGIN = '<!-- ai-sdlc:context-protocol:begin — generated from rules/context-protocol.md; edit there and run `node scripts/sync-context-protocol.js` -->';
const END = '<!-- ai-sdlc:context-protocol:end -->';
const BLOCK_RE = /<!-- ai-sdlc:context-protocol:begin[^\n]*-->[\s\S]*?<!-- ai-sdlc:context-protocol:end -->\n*/;
const PLUGIN = 'ai-sdlc';
const CONTEXT_SERVERS = ['cxpak', 'ai-sdlc-context'];
const CONTEXT_TOOLS = [
  ...CONTEXT_SERVERS.map((s) => `mcp__plugin_${PLUGIN}_${s}__*`),
  ...CONTEXT_SERVERS.map((s) => `mcp__${s}__*`),
];
// Skills whose work depends on the system's context. Web-scraping, help and
// team-plumbing skills do not.
const SKILL_RE = /^(code|qa|testing)-/;

const FRONTMATTER_RE = /^(---\r?\n[\s\S]*?\r?\n---\r?\n)/;

function mcpNames(server) {
  return [`mcp__plugin_${PLUGIN}_${server}__*`, `mcp__${server}__*`];
}

// Every capability a stage can grant (base + all label-routed additions) and
// every agent that stage can dispatch (base + routed providers), per map.
function stageGrantsByAgent(maps) {
  const byAgent = new Map();
  for (const map of maps) {
    for (const st of Object.values((map.spec && map.spec.stages) || {})) {
      const caps = [st.capabilities || {}, ...(st.routing || []).map((r) => r.addCapabilities || {})];
      const tools = new Set();
      for (const c of caps) {
        for (const server of c.mcp || []) mcpNames(server).forEach((t) => tools.add(t));
        for (const w of c.web || []) tools.add(w);
        if ((c.skills || []).length) tools.add('Skill');
      }
      if (!tools.size) continue;
      const agents = [...(st.providers || []), st.provider, ...(st.routing || []).flatMap((r) => [r.addProvider, r.provider])]
        .filter((p) => p && p.type === 'agent' && p.name).map((p) => p.name);
      for (const a of agents) {
        if (!byAgent.has(a)) byAgent.set(a, new Set());
        tools.forEach((t) => byAgent.get(a).add(t));
      }
    }
  }
  return byAgent;
}

// The plugin's own capability maps: the repo default and the init stub.
function pluginCapabilityMaps(root = ROOT) {
  const yaml = require('js-yaml');
  const maps = [];
  const repoMap = join(root, '.ai-sdlc', 'capabilities.yaml');
  if (existsSync(repoMap)) maps.push(yaml.load(readFileSync(repoMap, 'utf8')));
  maps.push(yaml.load(require(join(root, 'init', 'config-stubs.js')).capabilities()));
  return maps;
}

function block() {
  return `${BEGIN}\n${readFileSync(SOURCE, 'utf8').trim()}\n${END}\n\n`;
}

// Insert or replace the protocol block right after the frontmatter.
function withProtocol(markdown, blockText) {
  const stripped = markdown.replace(BLOCK_RE, '');
  const fm = stripped.match(FRONTMATTER_RE);
  if (!fm) return `${blockText}${stripped}`;
  const rest = stripped.slice(fm[0].length).replace(/^\n+/, '');
  return `${fm[0]}\n${blockText}${rest}`;
}

// Append the context tools (+ any extra stage grants) to a list-form `tools:`
// allowlist (no-op without one).
function withContextTools(markdown, extra = []) {
  const fm = markdown.match(FRONTMATTER_RE);
  if (!fm) return markdown;
  const lines = fm[0].split('\n');
  const start = lines.findIndex((l) => /^tools:\s*$/.test(l));
  if (start === -1) return markdown;
  let end = start + 1;
  while (end < lines.length && /^\s+-\s+/.test(lines[end])) end += 1;
  const present = new Set(lines.slice(start + 1, end).map((l) => l.replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, '')));
  const missing = [...new Set([...CONTEXT_TOOLS, ...extra])].filter((t) => !present.has(t));
  if (!missing.length) return markdown;
  const indent = (lines[start + 1] || '  - ').match(/^(\s+)-/) ? lines[start + 1].match(/^(\s+)-/)[1] : '  ';
  lines.splice(end, 0, ...missing.map((t) => `${indent}- "${t}"`));
  return markdown.replace(fm[0], lines.join('\n'));
}

function isAgent(markdown) {
  const fm = markdown.match(FRONTMATTER_RE);
  return !!fm && /^name:\s*\S/m.test(fm[0]);
}

function targets(root = ROOT) {
  const out = [];
  const agentsDir = join(root, 'agents');
  for (const f of readdirSync(agentsDir).filter((x) => x.endsWith('.md')).sort()) {
    const path = join(agentsDir, f);
    if (isAgent(readFileSync(path, 'utf8'))) out.push({ path, kind: 'agent' });
  }
  const skillsDir = join(root, 'skills');
  for (const d of readdirSync(skillsDir).filter((x) => SKILL_RE.test(x)).sort()) {
    const path = join(skillsDir, d, 'SKILL.md');
    if (existsSync(path)) out.push({ path, kind: 'skill' });
  }
  return out;
}

function agentName(markdown) {
  const fm = markdown.match(FRONTMATTER_RE);
  const m = fm && fm[0].match(/^name:\s*["']?([^"'\n]+?)["']?\s*$/m);
  return m ? m[1] : null;
}

function expected(markdown, kind, blockText, grants) {
  const withBlock = withProtocol(markdown, blockText);
  if (kind !== 'agent') return withBlock;
  return withContextTools(withBlock, [...(grants.get(agentName(markdown)) || [])].sort());
}

// Returns the targets whose file differs from the synced form; writes them unless check.
function sync({ root = ROOT, check = false } = {}) {
  const blockText = block();
  const grants = stageGrantsByAgent(pluginCapabilityMaps(root));
  const drift = [];
  for (const t of targets(root)) {
    const current = readFileSync(t.path, 'utf8');
    const next = expected(current, t.kind, blockText, grants);
    if (next !== current) {
      drift.push(t.path);
      if (!check) writeFileSync(t.path, next);
    }
  }
  return drift;
}

module.exports = { sync, targets, withProtocol, withContextTools, stageGrantsByAgent, pluginCapabilityMaps, block, CONTEXT_TOOLS, BEGIN, END };

if (require.main === module) {
  const check = process.argv.includes('--check');
  try {
    const drift = sync({ check });
    if (check && drift.length) {
      console.error(`context protocol out of sync in ${drift.length} file(s):\n${drift.map((p) => `  ${p}`).join('\n')}\nrun: node scripts/sync-context-protocol.js`);
      process.exit(1);
    }
    console.log(check ? 'context protocol in sync' : `synced ${drift.length} file(s)`);
  } catch (err) {
    console.error(`sync-context-protocol failed: ${err.message}`);
    process.exit(1);
  }
}
