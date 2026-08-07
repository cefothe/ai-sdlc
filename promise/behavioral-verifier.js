// cxpak tools that provide file-level context. When the agent invokes any of
// these, the read-before-write contract is satisfied via structured context
// rather than direct Read tool calls. Without this, the verifier penalizes
// the very behavior the framework directs (use cxpak instead of ad-hoc Read).
const CXPAK_CONTEXT_TOOLS = new Set([
  // cxpak 3.x op-based intent-tools (ops resolve under these five)
  'cxpak_context',
  'cxpak_graph',
  'cxpak_insight',
  'cxpak_review',
  'cxpak_data',
  // pre-3.0 standalone names (retained; also matched via the `cxpak_` prefix guard)
  'cxpak_auto_context',
  'cxpak_overview',
  'cxpak_trace',
  'cxpak_pack_context',
  'cxpak_context_for_task',
  'cxpak_briefing',
  'cxpak_call_graph',
  'cxpak_architecture',
  'cxpak_search',
  'cxpak_data_flow',
  'cxpak_api_surface',
  'cxpak_conventions',
  'cxpak_blast_radius',
  'cxpak_diff',
  'cxpak_context_diff',
]);

function isCxpakContextTool(name) {
  if (!name) return false;
  // Strip MCP namespace prefix. Two forms in the wild:
  //   "mcp__cxpak__cxpak_auto_context"                  (server-direct)
  //   "mcp__plugin_cxpak_cxpak__cxpak_auto_context"     (plugin-namespaced)
  // Non-greedy match between leading "mcp__" and the first "__" handles both.
  const stripped = String(name).replace(/^mcp__.*?__/, '');
  return CXPAK_CONTEXT_TOOLS.has(stripped) || stripped.startsWith('cxpak_');
}

class BehavioralVerifier {
  extractReadsFromTrace(trace) {
    const reads = new Set();
    if (!Array.isArray(trace)) return reads;
    for (const event of trace) {
      if (event.ev !== 'tool') continue;
      if (event.name !== 'Read') continue;
      const fp = event.file_path;
      if (fp) reads.add(fp);
    }
    return reads;
  }

  // Returns true if the trace shows the agent acquired structured context via
  // cxpak before any Edit/Write. This counts as satisfying read-before-write
  // because cxpak returns file content to the agent, just through a different
  // tool surface than the Read built-in.
  traceHasCxpakContextBeforeWrite(trace) {
    if (!Array.isArray(trace)) return false;
    return trace.some(ev => ev && ev.ev === 'tool' && isCxpakContextTool(ev.name));
  }

  // Suffix-aware path match used for both Read coverage and cxpak coverage.
  // Handles the absolute-vs-relative trace variance the verifier sees in
  // practice (Read events sometimes carry workspace-absolute paths while
  // changedFiles come from `git diff --name-only` which is repo-relative).
  _pathCoveredBy(changedFile, coveredSet) {
    for (const cov of coveredSet) {
      if (cov === changedFile) return true;
      if (cov.endsWith('/' + changedFile)) return true;
      if (changedFile.endsWith('/' + cov)) return true;
    }
    return false;
  }

  // Verifies the read-before-write contract.
  //
  // changedFiles:    files modified this turn (from `git diff --name-only`).
  // cxpakReadFiles:  optional iterable of files that cxpak's response payloads
  //                  covered for this turn. Pass null when the cxpak file list
  //                  isn't extractable from the session-driver trace.
  //
  // Resolution order:
  //   1. No files modified → kept (high).
  //   2. Combined coverage (Read events ∪ cxpakReadFiles) covers every
  //      changedFile → kept (high) with explicit evidence of which sources
  //      contributed.
  //   3. cxpak was invoked but no cxpakReadFiles passed AND coverage check
  //      can't complete on Reads alone → kept (medium). The cxpak directive
  //      was followed; file-level coverage is unverified at this confidence
  //      tier. (M3 downgrade — replaces the prior short-circuit that
  //      returned high-confidence kept on any cxpak call regardless of
  //      which files were edited.)
  //   4. Otherwise → broken (high) listing the uncovered files.
  verifyReadBeforeWrite(trace, changedFiles, cxpakReadFiles = null) {
    if (!changedFiles || changedFiles.length === 0) {
      return {
        promise_id: 'read-before-write', confidence: 'high',
        result: 'kept', evidence: 'no files changed',
      };
    }

    const reads = this.extractReadsFromTrace(trace);
    const cxpakCalled = this.traceHasCxpakContextBeforeWrite(trace);

    // Normalise cxpakReadFiles. Empty (null/undefined/[]/Set with size 0) is
    // treated identically as "no authoritative file list" — the caller is
    // saying cxpak's response either wasn't queried for files or had nothing
    // identifiable. The downgrade path applies in that case. Only a non-empty
    // list activates the precise (file-coverage) path.
    const cxpakFileSet = new Set();
    if (cxpakReadFiles) {
      for (const f of cxpakReadFiles) cxpakFileSet.add(f);
    }
    const hasAuthoritativeCxpakList = cxpakFileSet.size > 0;

    // Combined coverage = direct Reads ∪ authoritative cxpak file list.
    const covered = new Set(reads);
    for (const f of cxpakFileSet) covered.add(f);

    const unread = changedFiles.filter(f => !this._pathCoveredBy(f, covered));

    if (unread.length === 0) {
      const sources = [];
      if (reads.size > 0) sources.push(`${reads.size} read(s)`);
      if (hasAuthoritativeCxpakList) sources.push('cxpak context');
      return {
        promise_id: 'read-before-write', confidence: 'high',
        result: 'kept',
        evidence: `${changedFiles.length} modified file(s), all covered by ${sources.join(' + ') || 'context'}`,
      };
    }

    // Coverage gap. If cxpak was invoked but no authoritative file list was
    // passed, accept the satisfaction at medium confidence: the cxpak
    // directive was followed, but the file-level claim is unverified. Wiring
    // cxpakReadFiles from the cxpak response payload tightens this back to
    // high precision.
    if (cxpakCalled && !hasAuthoritativeCxpakList) {
      return {
        promise_id: 'read-before-write', confidence: 'medium',
        result: 'kept',
        evidence: `context acquired via cxpak (structured); file-level coverage of ${changedFiles.length} modified file(s) unverified — pass cxpakReadFiles to tighten`,
      };
    }

    const detail = unread.slice(0, 5).join(', ');
    const suffix = unread.length > 5 ? ` (+${unread.length - 5} more)` : '';
    const evidencePrefix = hasAuthoritativeCxpakList
      ? `${unread.length} file(s) modified outside cxpak coverage`
      : reads.size === 0
        ? `${changedFiles.length} file(s) modified, 0 reads in trace`
        : `${unread.length} file(s) modified without reading`;
    return {
      promise_id: 'read-before-write', confidence: 'high',
      result: 'broken',
      evidence: `${evidencePrefix}: ${detail}${suffix}`,
    };
  }

  verifyExplorationBreadth(trace, blastRadiusResponse) {
    if (!blastRadiusResponse) {
      return {
        promise_id: 'exploration-breadth', confidence: 'low',
        result: 'partial', evidence: 'cxpak_graph(blast_radius) unavailable',
      };
    }

    const reads = this.extractReadsFromTrace(trace);

    const relatedFiles = this._extractRelatedFiles(blastRadiusResponse);
    if (relatedFiles.length === 0) {
      return {
        promise_id: 'exploration-breadth', confidence: 'low',
        result: 'kept', evidence: 'no architecturally-related files identified',
      };
    }

    const explored = relatedFiles.filter(dep => {
      for (const readPath of reads) {
        if (readPath === dep) return true;
        if (readPath.endsWith('/' + dep)) return true;
        if (dep.endsWith('/' + readPath)) return true;
      }
      return false;
    });

    const ratio = relatedFiles.length > 0 ? explored.length / relatedFiles.length : 1;
    const pct = (ratio * 100).toFixed(0);

    if (ratio >= 0.5) {
      return {
        promise_id: 'exploration-breadth', confidence: 'low',
        result: 'kept',
        evidence: `${explored.length}/${relatedFiles.length} related files explored (${pct}%)`,
      };
    }

    return {
      promise_id: 'exploration-breadth', confidence: 'low',
      result: 'broken',
      evidence: `${explored.length}/${relatedFiles.length} related files explored (${pct}%)`,
    };
  }

  _extractRelatedFiles(blastRadiusResponse) {
    if (!blastRadiusResponse) return [];
    const files = [];
    const sources = [
      blastRadiusResponse.direct_dependents,
      blastRadiusResponse.transitive_dependents,
      blastRadiusResponse.test_files,
    ];
    for (const source of sources) {
      if (!Array.isArray(source)) continue;
      for (const item of source) {
        if (typeof item === 'string') {
          files.push(item);
        } else if (item && (item.file || item.path)) {
          files.push(item.file || item.path);
        }
      }
    }
    return [...new Set(files)];
  }
}

module.exports = { BehavioralVerifier };
