#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function callCxpakTool(toolName, args, workDir, timeout) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => { if (!settled) { settled = true; resolve(value); } };

    const child = spawn('cxpak', ['serve', '--mcp', workDir], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
      cwd: workDir,
    });

    const request = JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    });

    const chunks = [];
    child.stdout.on('data', d => chunks.push(d));
    child.on('close', () => {
      try {
        const output = Buffer.concat(chunks).toString('utf8');
        const lines = output.split('\n').filter(l => l.trim());
        for (const line of lines) {
          const parsed = JSON.parse(line);
          if (parsed.id === 1 && parsed.result) {
            const res = parsed.result;
            // cxpak 3.x intent-tools return the machine object in
            // `structuredContent`; on a cold repo it is `{status:'indexing'}`
            // (retryable) — treat that as no-data, not a parse target.
            const sc = res.structuredContent;
            if (sc && sc.status === 'indexing') { settle(null); return; }
            if (sc && Object.keys(sc).length) { settle(sc); return; }
            const text = res.content?.[0]?.text;
            if (text) { try { settle(JSON.parse(text)); return; } catch (_) { settle(null); return; } }
          }
        }
        settle(null);
      } catch (_) { settle(null); }
    });
    child.on('error', () => settle(null));

    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      settle(null);
    }, timeout);
    child.on('close', () => clearTimeout(timer));

    child.stdin.write(request + '\n');
    child.stdin.end();
  });
}

async function main() {
  const stdin = readStdin();
  if (!stdin.trim()) process.exit(0);

  let payload;
  try { payload = JSON.parse(stdin); } catch (_) { process.exit(0); }

  const sessionId = payload.session_id || 'unknown';
  const workDir = process.cwd();

  const logDir = process.env.BASELINE_LOG_DIR || path.join(__dirname, '..', 'promise', 'logs');

  // BASELINE_SKIP_CXPAK lets an operator (or a hermetic test) skip the cxpak
  // baseline — the probe + tool calls can otherwise take up to ~10s at session
  // start when cxpak is installed but can't serve the working dir.
  let cxpakAvailable = false;
  if (!process.env.BASELINE_SKIP_CXPAK) {
    try {
      execFileSync('cxpak', ['--version'], { timeout: 5000, stdio: 'pipe' });
      cxpakAvailable = true;
    } catch (_) {}
  }

  const baseline = {
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    cxpak_available: cxpakAvailable,
    health: null,
    architecture: null,
    risks: null,
  };

  if (cxpakAvailable) {
    const timeout = 10000;
    // cxpak 3.x: health/architecture/risks are ops of the `cxpak_insight`
    // intent-tool (the standalone cxpak_health/… tools were removed).
    const [health, architecture, risks] = await Promise.all([
      callCxpakTool('cxpak_insight', { op: 'health' }, workDir, timeout),
      callCxpakTool('cxpak_insight', { op: 'architecture' }, workDir, timeout),
      callCxpakTool('cxpak_insight', { op: 'risks' }, workDir, timeout),
    ]);

    if (health) {
      baseline.health = {
        composite: health.composite || null,
        dead_code: health.dead_code || null,
        conventions: health.conventions || null,
        modularity: health.modularity || null,
        complexity: health.complexity || null,
      };
    }

    if (architecture) {
      const modules = architecture.modules || [];
      baseline.architecture = {
        modules: modules.length,
        boundary_violations: modules.reduce((sum, m) => sum + (m.boundary_violations || 0), 0),
        circular_deps: (architecture.circular_deps || []).length,
      };
    }

    if (risks) {
      const highRisk = (risks.files || risks.risks || []).filter(f => {
        const score = f.composite_risk || f.risk_score || 0;
        return score > 0.7;
      });
      baseline.risks = { high_risk_count: highRisk.length };
    }
  }

  try {
    const dir = path.join(logDir, 'baselines');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${sessionId}.json`),
      JSON.stringify(baseline, null, 2), 'utf8'
    );
  } catch (_) {
    // Best-effort — never block the agent
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
