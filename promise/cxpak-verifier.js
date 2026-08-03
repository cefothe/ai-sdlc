const child_process = require('child_process');

// Permanently-broken cxpak (bad workdir, missing binary, license issue, etc.)
// previously caused one spawn-crash cycle per Stop hook with no backoff.
// Now: track consecutive spawn failures and refuse to respawn after a small
// budget — the verifier falls back to 'skipped' results, which the trust EMA
// already excludes (R5 invariant). A successful spawn resets the counter.
const MAX_CONSECUTIVE_SPAWN_FAILURES = 3;

class CxpakVerifier {
  constructor({ timeout = 10000, cxpakCommand = 'cxpak', workDir } = {}) {
    this.timeout = timeout;
    this.cxpakCommand = cxpakCommand;
    this.workDir = workDir || process.cwd();
    this._available = null;
    // Shared cxpak `serve --mcp` server across the verifier's lifetime.
    // Before this pool, each callTool spawned a fresh server and tore it down,
    // costing ~9 spawns per Stop hook invocation (one per structural promise).
    // Now: one spawn per verifier instance, JSON-RPC multiplexed by `id`.
    // Callers should invoke close() when done to terminate the child.
    this._server = null;
    this._nextId = 1;
    // Consecutive spawn-crash count. Resets to 0 when a spawned server
    // produces at least one successful response.
    this._consecutiveSpawnFailures = 0;
  }

  async checkAvailability() {
    if (this._available !== null) return this._available;
    try {
      child_process.execFileSync(this.cxpakCommand, ['--version'], { timeout: 5000, stdio: 'pipe' });
      this._available = true;
    } catch (_) {
      this._available = false;
    }
    return this._available;
  }

  _startServer() {
    const child = child_process.spawn(this.cxpakCommand, ['serve', '--mcp', this.workDir], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: this.workDir,
    });

    // pending: id -> { resolve, timer }. Each pending entry resolves when a
    // matching response arrives or its individual timer fires; resolve(null)
    // on failure so callers always get a deterministic outcome.
    // servedOne flips true on the first successful response; used by
    // failAllPending to decide whether to bump the spawn-failure counter.
    const server = { child, stdoutBuf: '', pending: new Map(), closed: false, servedOne: false };

    const failAllPending = () => {
      // Idempotency guard. Node emits both 'error' and 'close' on a spawn
      // failure (ENOENT, EACCES, etc. — error first, then close); without
      // this guard, _consecutiveSpawnFailures would increment twice per
      // failure and the backoff latch (MAX_CONSECUTIVE_SPAWN_FAILURES) would
      // trip at 2 failures instead of 3. Also covers the case where close()
      // has been called manually and an event subsequently fires on the old
      // child — close() already set server.closed = true, and we don't want
      // a manual shutdown counted as a spawn failure. Found by
      // ryordanov-tradu re-verification of HEAD `2905120` (NEW-1).
      if (server.closed) return;
      // If the server died before producing any successful response, count
      // it as a spawn failure. A server that handled at least one response
      // resets the counter (transient blip, not a permanent break).
      if (!server.servedOne) {
        this._consecutiveSpawnFailures++;
      } else {
        this._consecutiveSpawnFailures = 0;
      }
      for (const entry of server.pending.values()) {
        clearTimeout(entry.timer);
        entry.resolve(null);
      }
      server.pending.clear();
      server.closed = true;
      if (this._server === server) this._server = null;
    };

    child.stdout.on('data', (data) => {
      server.stdoutBuf += data.toString('utf8');
      let nl;
      while ((nl = server.stdoutBuf.indexOf('\n')) !== -1) {
        const line = server.stdoutBuf.slice(0, nl).trim();
        server.stdoutBuf = server.stdoutBuf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch (_) {
          continue;
        }
        if (msg.id == null) continue;
        const entry = server.pending.get(msg.id);
        if (!entry) continue;
        server.pending.delete(msg.id);
        clearTimeout(entry.timer);
        // Mark this server as having served at least one response; failure
        // counter only bumps for servers that died before producing anything.
        server.servedOne = true;
        // Use ?? not || so a legitimately falsy result (0, false, '') from
        // cxpak doesn't get coerced to null. Today's protocol only returns
        // objects, but this is defensive against future changes.
        entry.resolve(msg.result ?? null);
      }
    });

    // Drain stderr so the kernel pipe doesn't fill and stall the child.
    child.stderr.on('data', () => {});

    child.on('close', failAllPending);
    child.on('error', failAllPending);

    return server;
  }

  _getServer() {
    if (this._server && !this._server.closed) return this._server;
    // Refuse to respawn after consecutive failures. The verifier returns null
    // for all calls in this state; verifyAll's downstream maps null to
    // 'skipped' results, which are excluded from EMA. A subsequent reset
    // (via close() + new verifier instance) clears the latch.
    if (this._consecutiveSpawnFailures >= MAX_CONSECUTIVE_SPAWN_FAILURES) {
      return null;
    }
    this._server = this._startServer();
    return this._server;
  }

  close() {
    if (!this._server) return;
    const server = this._server;
    this._server = null;
    try { server.child.kill(); } catch (_) {}
    for (const entry of server.pending.values()) {
      clearTimeout(entry.timer);
      entry.resolve(null);
    }
    server.pending.clear();
    server.closed = true;
  }

  async callTool(toolName, args = {}) {
    const available = await this.checkAvailability();
    if (!available) return null;

    const server = this._getServer();
    if (!server) return null;
    const id = this._nextId++;
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    });

    return new Promise((resolve) => {
      const settle = (rawResult) => {
        if (rawResult && rawResult.content && rawResult.content[0] && rawResult.content[0].text) {
          try {
            resolve(JSON.parse(rawResult.content[0].text));
            return;
          } catch (_) {}
        }
        resolve(null);
      };

      const timer = setTimeout(() => {
        if (server.pending.has(id)) {
          server.pending.delete(id);
          resolve(null);
        }
      }, this.timeout);

      server.pending.set(id, { resolve: settle, timer });

      try {
        server.child.stdin.write(request + '\n');
      } catch (_) {
        if (server.pending.has(id)) {
          clearTimeout(timer);
          server.pending.delete(id);
        }
        resolve(null);
      }
    });
  }

  makeResult(promiseId, confidence, result, evidence) {
    return { promise_id: promiseId, confidence, result, evidence };
  }

  async _getCxpakCallGraph() {
    const available = await this.checkAvailability();
    if (!available) return null;
    return this.callTool('cxpak_call_graph', {});
  }

  async _getCxpakHealth() {
    const available = await this.checkAvailability();
    if (!available) return null;
    return this.callTool('cxpak_health', {});
  }

  async _getCxpakDiff() {
    const available = await this.checkAvailability();
    if (!available) return null;
    return this.callTool('cxpak_diff', {});
  }

  async _getCxpakVerify() {
    const available = await this.checkAvailability();
    if (!available) return null;
    return this.callTool('cxpak_verify', {});
  }

  async _getCxpakBlastRadius() {
    const available = await this.checkAvailability();
    if (!available) return null;
    return this.callTool('cxpak_blast_radius', {});
  }

  async _getCxpakDeadCode() {
    const available = await this.checkAvailability();
    if (!available) return null;
    return this.callTool('cxpak_dead_code', {});
  }

  async _getCxpakPredict(files) {
    const available = await this.checkAvailability();
    if (!available) return null;
    if (!files || files.length === 0) return null;
    return this.callTool('cxpak_predict', { files });
  }

  async _getCxpakSecuritySurface() {
    const available = await this.checkAvailability();
    if (!available) return null;
    return this.callTool('cxpak_security_surface', {});
  }

  _isFileImport(name) {
    if (!name) return false;
    if (name.startsWith('.') || name.startsWith('/') || name.startsWith('@')) return true;
    if (name.includes('/')) return true;
    if (/\.(js|ts|mjs|cjs|json|node|jsx|tsx)$/.test(name)) return true;
    return false;
  }

  async verifyImportValidity(files, _threshold, callGraphResponse) {
    if (files.length === 0) {
      return this.makeResult('import-validity', 'high', 'kept', 'no files to check');
    }

    const response = callGraphResponse || await this._getCxpakCallGraph();
    if (!response) {
      return this.makeResult('import-validity', 'high', 'skipped', 'cxpak unavailable');
    }

    const allUnresolved = response.unresolved || [];
    const fileImports = allUnresolved.filter(u => this._isFileImport(u.callee_name));
    const filteredCount = allUnresolved.length - fileImports.length;

    if (fileImports.length === 0) {
      const edgeCount = (response.edges || []).length;
      const filterNote = filteredCount > 0 ? `, ${filteredCount} builtin refs filtered` : '';
      return this.makeResult('import-validity', 'high', 'kept',
        `cxpak_call_graph: ${edgeCount} edges, 0 unresolved imports${filterNote}`);
    }

    const detail = fileImports.map(u =>
      `${u.caller_file || 'unknown'}→${u.callee_name || 'unknown'}`
    ).slice(0, 5).join('; ');
    const suffix = fileImports.length > 5 ? ` (+${fileImports.length - 5} more)` : '';
    const filterNote = filteredCount > 0 ? ` [${filteredCount} builtin refs filtered]` : '';
    return this.makeResult('import-validity', 'high', 'broken',
      `${fileImports.length} unresolved import(s): ${detail}${suffix}${filterNote}`);
  }

  async verifyFunctionLength(files, _threshold, healthResponse) {
    if (files.length === 0) {
      return this.makeResult('function-length', 'medium', 'kept', 'no files to check');
    }

    const response = healthResponse || await this._getCxpakHealth();
    if (!response) {
      return this.makeResult('function-length', 'medium', 'skipped', 'cxpak unavailable');
    }

    const conventions = response.conventions || 0;
    if (conventions >= 7) {
      return this.makeResult('function-length', 'medium', 'kept',
        `cxpak_health conventions: ${conventions.toFixed(1)}/10`);
    }

    return this.makeResult('function-length', 'medium', 'broken',
      `cxpak_health conventions: ${conventions.toFixed(1)}/10 (below 7.0 threshold)`);
  }

  async verifyDuplication(files, _threshold, healthResponse, deadCodeResponse) {
    if (files.length === 0) {
      return this.makeResult('duplication', 'medium', 'kept', 'no files to check');
    }

    if (deadCodeResponse) {
      const allSymbols = deadCodeResponse.dead_symbols || [];
      const matched = allSymbols.filter(s => {
        const symFile = s.file || '';
        return files.some(f => symFile.endsWith(f) || f.endsWith(symFile));
      });

      if (matched.length === 0) {
        return this.makeResult('duplication', 'high', 'kept',
          `cxpak_dead_code: 0 dead symbols in modified files (${allSymbols.length} total, ${deadCodeResponse.total_scanned || 0} scanned)`);
      }

      const detail = matched.slice(0, 5).map(s => `${s.file}:${s.name}`).join('; ');
      const suffix = matched.length > 5 ? ` (+${matched.length - 5} more)` : '';
      return this.makeResult('duplication', 'high', 'broken',
        `${matched.length} dead symbol(s) in modified files: ${detail}${suffix}`);
    }

    const response = healthResponse || await this._getCxpakHealth();
    if (!response) {
      return this.makeResult('duplication', 'medium', 'skipped', 'cxpak unavailable');
    }

    const deadCode = response.dead_code;
    if (deadCode != null) {
      if (deadCode >= 7) {
        return this.makeResult('duplication', 'medium', 'kept',
          `cxpak_health dead_code: ${deadCode.toFixed(1)}/10`);
      }
      return this.makeResult('duplication', 'medium', 'broken',
        `cxpak_health dead_code: ${deadCode.toFixed(1)}/10 (below 7.0 threshold)`);
    }

    const composite = response.composite || 0;
    if (composite >= 7) {
      return this.makeResult('duplication', 'medium', 'kept',
        `cxpak_health composite: ${composite.toFixed(1)}/10 (dead_code unavailable)`);
    }
    return this.makeResult('duplication', 'medium', 'broken',
      `cxpak_health composite: ${composite.toFixed(1)}/10 (below 7.0, dead_code unavailable)`);
  }

  async verifyChangeImpact(files, _threshold, predictResponse) {
    if (!files || files.length === 0) {
      return this.makeResult('change-impact', 'medium', 'kept', 'no files to check');
    }
    if (!predictResponse) {
      return this.makeResult('change-impact', 'medium', 'skipped', 'cxpak_predict unavailable');
    }

    const riskScore = predictResponse.risk_score || 0;
    const affectedFiles = (predictResponse.structural_impact && predictResponse.structural_impact.affected_files) || 0;
    const testPredictions = predictResponse.test_predictions || [];

    if (riskScore < 0.5) {
      return this.makeResult('change-impact', 'medium', 'kept',
        `cxpak_predict: risk_score=${riskScore.toFixed(2)}, ${affectedFiles} affected files`);
    }

    if (testPredictions.length >= 2) {
      return this.makeResult('change-impact', 'medium', 'kept',
        `cxpak_predict: risk_score=${riskScore.toFixed(2)}, ${affectedFiles} affected, ${testPredictions.length} test_predictions`);
    }

    return this.makeResult('change-impact', 'medium', 'broken',
      `cxpak_predict: risk_score=${riskScore.toFixed(2)}, ${affectedFiles} affected files, ${testPredictions.length} test prediction(s) — high impact, low test coverage`);
  }

  async verifyConventionCompliance(files, _threshold, verifyResponse) {
    if (files.length === 0) {
      return this.makeResult('convention-compliance', 'medium', 'kept', 'no files to check');
    }

    const response = verifyResponse || await this._getCxpakVerify();
    if (!response) {
      return this.makeResult('convention-compliance', 'medium', 'skipped', 'cxpak unavailable');
    }

    const violations = response.violations || [];
    if (violations.length === 0) {
      const checked = response.files_checked || response.checked || files.length;
      return this.makeResult('convention-compliance', 'medium', 'kept',
        `cxpak_verify: ${checked} files, 0 convention violations`);
    }

    const detail = violations.slice(0, 5).map(v => {
      const loc = v.file ? `${v.file}${v.line ? ':' + v.line : ''}` : 'unknown';
      return `${loc} ${v.rule || v.message || 'violation'}`;
    }).join('; ');
    const suffix = violations.length > 5 ? ` (+${violations.length - 5} more)` : '';
    return this.makeResult('convention-compliance', 'medium', 'broken',
      `${violations.length} convention violation(s): ${detail}${suffix}`);
  }

  _extractChangedFiles(diffResponse) {
    if (!diffResponse) return [];
    if (Array.isArray(diffResponse.files)) {
      return diffResponse.files.map(f => {
        if (typeof f === 'string') return f;
        return f.path || f.file || f.name || '';
      }).filter(Boolean);
    }
    if (Array.isArray(diffResponse.changed_files)) {
      return diffResponse.changed_files.map(f => typeof f === 'string' ? f : f.path || '').filter(Boolean);
    }
    return [];
  }

  _extractDiffContent(diffResponse) {
    if (!diffResponse) return null;
    if (typeof diffResponse === 'string') return diffResponse;
    if (diffResponse.content) return diffResponse.content;
    if (diffResponse.diff) return diffResponse.diff;
    if (diffResponse.text) return diffResponse.text;
    if (Array.isArray(diffResponse.files)) {
      const parts = diffResponse.files.map(f => {
        if (typeof f === 'string') return f;
        return f.diff || f.content || f.patch || '';
      }).filter(Boolean);
      if (parts.length > 0) return parts.join('\n');
    }
    return JSON.stringify(diffResponse);
  }

  async verifyArchitecturalBoundary(files) {
    if (files.length === 0) {
      return this.makeResult('architectural-boundary', 'medium', 'kept', 'no files to check');
    }

    const available = await this.checkAvailability();
    if (!available) {
      return this.makeResult('architectural-boundary', 'medium', 'skipped', 'cxpak unavailable');
    }

    const response = await this.callTool('cxpak_architecture', {});
    if (!response) {
      return this.makeResult('architectural-boundary', 'medium', 'skipped', 'cxpak returned no data');
    }

    const modules = response.modules || [];
    const violations = [];
    for (const mod of modules) {
      if (mod.boundary_violations > 0) {
        violations.push(`${mod.name}: ${mod.boundary_violations} boundary violations`);
      }
      if (mod.god_files > 0) {
        violations.push(`${mod.name}: ${mod.god_files} god files`);
      }
    }

    const circularDeps = response.circular_deps || [];
    if (circularDeps.length > 0) {
      violations.push(`${circularDeps.length} circular dependencies`);
    }

    if (violations.length === 0) {
      return this.makeResult('architectural-boundary', 'medium', 'kept',
        `cxpak_architecture: ${modules.length} modules, no boundary violations`);
    }

    return this.makeResult('architectural-boundary', 'medium', 'broken', violations.join('; '));
  }

  _issueInModifiedFiles(issue, files) {
    if (!issue.file) return false;
    return files.some(f => issue.file.endsWith(f) || f.endsWith(issue.file));
  }

  async verifySecuritySurface(files, _threshold, securityResponse) {
    if (files.length === 0) {
      return this.makeResult('security-surface', 'high', 'kept', 'no files to check');
    }

    if (!securityResponse) {
      return this.makeResult('security-surface', 'high', 'skipped', 'cxpak_security_surface unavailable');
    }

    const secrets = (securityResponse.secrets || []).filter(s => this._issueInModifiedFiles(s, files));
    const sqlInjection = (securityResponse.sql_injection || []).filter(s => this._issueInModifiedFiles(s, files));
    const unprotected = (securityResponse.unprotected_endpoints || []).filter(s => this._issueInModifiedFiles(s, files));

    const issues = [];

    if (secrets.length > 0) {
      const detail = secrets.slice(0, 3).map(s => `${s.file}:${s.line} ${s.type || 'secret'}`).join(', ');
      issues.push(`${secrets.length} secret(s): ${detail}`);
    }

    if (sqlInjection.length > 0) {
      const detail = sqlInjection.slice(0, 3).map(s => `${s.file}:${s.line}`).join(', ');
      issues.push(`${sqlInjection.length} sql_injection risk(s): ${detail}`);
    }

    if (unprotected.length > 0) {
      issues.push(`${unprotected.length} unprotected endpoint(s)`);
    }

    if (issues.length === 0) {
      return this.makeResult('security-surface', 'high', 'kept',
        'cxpak_security_surface: 0 issues in modified files');
    }

    return this.makeResult('security-surface', 'high', 'broken', issues.join('; '));
  }

  async verifyAll(files) {
    if (files.length === 0) {
      return {
        results: [
          this.makeResult('import-validity', 'high', 'kept', 'no files to check'),
          this.makeResult('function-length', 'medium', 'kept', 'no files to check'),
          this.makeResult('duplication', 'medium', 'kept', 'no files to check'),
          this.makeResult('architectural-boundary', 'medium', 'kept', 'no files to check'),
          this.makeResult('convention-compliance', 'medium', 'kept', 'no files to check'),
          this.makeResult('change-impact', 'medium', 'kept', 'no files to check'),
          this.makeResult('security-surface', 'high', 'kept', 'no files to check'),
        ],
        diffResponse: null,
        blastRadiusResponse: null,
        diffContent: null,
      };
    }

    const [callGraphResponse, healthResponse, verifyResponse, diffResponse, blastRadiusResponse, deadCodeResponse, predictResponse, securityResponse] = await Promise.all([
      this._getCxpakCallGraph(),
      this._getCxpakHealth(),
      this._getCxpakVerify(),
      this._getCxpakDiff(),
      this._getCxpakBlastRadius(),
      this._getCxpakDeadCode(),
      this._getCxpakPredict(files),
      this._getCxpakSecuritySurface(),
    ]);

    const results = await Promise.all([
      this.verifyImportValidity(files, 0, callGraphResponse),
      this.verifyFunctionLength(files, 0, healthResponse),
      this.verifyDuplication(files, 0, healthResponse, deadCodeResponse),
      this.verifyArchitecturalBoundary(files),
      this.verifyConventionCompliance(files, 0, verifyResponse),
      this.verifyChangeImpact(files, 0, predictResponse),
      this.verifySecuritySurface(files, 0, securityResponse),
    ]);

    const diffContent = this._extractDiffContent(diffResponse);

    return { results, diffResponse, blastRadiusResponse, diffContent };
  }
}

module.exports = { CxpakVerifier };
