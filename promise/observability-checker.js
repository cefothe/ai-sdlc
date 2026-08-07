const { CxpakVerifier } = require('./cxpak-verifier');
const { BehavioralVerifier } = require('./behavioral-verifier');

// Promises whose patterns target code structure (not prose). When a diff is
// available, verify against the diff content rather than the assistant's text
// output — most code reaches the workspace via Edit/Write tool calls and
// would not appear in the assistant text channel. R14 logs showed
// error-handling, resource-cleanup, and implementation-depth firing broken
// on 51-60 of 60 turns because of this mismatch.
const DIFF_ELIGIBLE = new Set([
  'complete-output',
  'no-placeholders',
  'no-dead-code',
  'tests-with-code',
  'error-handling',
  'resource-cleanup',
  'implementation-depth',
  // PR #32 integration — test_assertion_patterns scans diff hunks for
  // newly-added (+) lines in Java test files. Diff is the only meaningful
  // input; running against assistant text would never find the patterns.
  'test-assertion-deserialize',
]);

class ObservabilityChecker {
  verify(method, params, output, context = {}) {
    switch (method) {
      case 'grep': return this._grep(params, output);
      case 'grep_absent': return this._grepAbsent(params, output);
      case 'consecutive_comments': return this._consecutiveComments(params, output);
      case 'output_length': return this._outputLength(params, output);
      case 'file_check': return this._fileCheck(params, output);
      case 'output_contains': return this._outputContains(params, output);
      case 'output_structure': return this._outputStructure(params, output);
      case 'token_metric': return this._tokenMetric(params, context);
      case 'timing': return this._timing(params, context);
      case 'test_assertion_patterns': return this._testAssertionPatterns(params, output, context);
      default:
        return { result: 'partial', method, evidence: `Unknown verification method: ${method}` };
    }
  }

  async verifyAll(promises, output, context = {}) {
    const results = [];
    const cxpakVerifier = context.cxpak ? new CxpakVerifier({ workDir: context.workDir }) : null;
    const behavioralVerifier = new BehavioralVerifier();
    const files = context.files || [];

    try {
    for (const p of promises) {
      const isRegistry = p.type !== undefined;

      if (isRegistry && p.type === 'structural' && cxpakVerifier) {
        if (!context._structuralDone) {
          const cxpakResult = await cxpakVerifier.verifyAll(files);
          context._structuralResults = cxpakResult.results;
          context._diffResponse = cxpakResult.diffResponse;
          context._blastRadiusResponse = cxpakResult.blastRadiusResponse;
          context._diffContent = cxpakResult.diffContent;
          context._changedFiles = cxpakVerifier._extractChangedFiles(cxpakResult.diffResponse);
          context._structuralDone = true;
        }
        const result = context._structuralResults.find(r => r.promise_id === p.id);
        if (result) {
          results.push(result);
          continue;
        }
      }

      if (isRegistry && p.type === 'behavioral') {
        const trace = context.trace || [];
        const changedFiles = context._changedFiles || context.files || [];

        if (p.id === 'read-before-write' && trace.length > 0) {
          results.push({
            ...behavioralVerifier.verifyReadBeforeWrite(trace, changedFiles),
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        if (p.id === 'exploration-breadth' && trace.length > 0) {
          const blastRadius = context._blastRadiusResponse || null;
          results.push({
            ...behavioralVerifier.verifyExplorationBreadth(trace, blastRadius),
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        if (p.id === 'context-acquisition') {
          const toolPattern = new RegExp(p.tool_pattern || 'cxpak_context|cxpak_auto_context|cxpak_overview', 'i');
          const outputStr = output || '';
          const traceStr = (context.trace || []).map(t => t.tool || t.name || t.action || '').join(' ');
          const evidence = toolPattern.test(outputStr) || toolPattern.test(traceStr);
          results.push({
            promise_id: p.id,
            method: p.method,
            confidence: p.confidence || 'high',
            result: evidence ? 'kept' : 'broken',
            evidence: evidence ? 'cxpak context tool called' : 'No cxpak_context (or legacy cxpak_auto_context/cxpak_overview) call detected',
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        results.push({
          promise_id: p.id,
          method: p.method,
          confidence: p.confidence || 'low',
          result: 'partial',
          evidence: 'Behavioral promise — trace unavailable',
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      // Standing or legacy promise
      const method = isRegistry ? p.method : p.verification.method;
      const params = isRegistry ? p : p.verification;

      // Diff-based standing: verify against diff content (medium confidence)
      const diffContent = context._diffContent || context.diff || null;
      const useDiff = isRegistry && DIFF_ELIGIBLE.has(p.id) && diffContent;
      const verifyTarget = useDiff ? diffContent : output;
      const confidence = useDiff ? 'medium' : 'low';

      const verification = this.verify(method, params, verifyTarget, context);
      results.push({
        promise_id: p.id,
        method,
        confidence,
        ...verification,
        timestamp: new Date().toISOString(),
      });
    }

    return results;
    } finally {
      if (cxpakVerifier) cxpakVerifier.close();
    }
  }

  _grep(params, output) {
    let pattern;
    try {
      pattern = new RegExp(params.pattern, 'gi');
    } catch (err) {
      return { result: 'partial', evidence: `Invalid regex pattern: ${err.message}` };
    }
    const matches = output.match(pattern);
    if (matches && matches.length > 0) {
      return {
        result: 'broken',
        evidence: `Found ${matches.length} match(es): ${matches.slice(0, 3).join(', ')}`,
      };
    }
    return { result: 'kept', evidence: 'No matches found' };
  }

  _grepAbsent(params, output) {
    let pattern;
    try {
      pattern = new RegExp(params.pattern, 'gi');
    } catch (err) {
      return { result: 'partial', evidence: `Invalid regex pattern: ${err.message}` };
    }
    const matches = output.match(pattern);
    if (matches && matches.length > 0) {
      return {
        result: 'kept',
        evidence: `Required pattern found: ${matches.slice(0, 3).join(', ')}`,
      };
    }
    return { result: 'broken', evidence: 'Required pattern not found in output' };
  }

  _consecutiveComments(params, output) {
    const minLines = params.min_lines || 3;
    const lines = output.split('\n');
    let consecutive = 0;
    let maxConsecutive = 0;

    for (const line of lines) {
      if (/^\s*\/\//.test(line)) {
        consecutive++;
        maxConsecutive = Math.max(maxConsecutive, consecutive);
      } else {
        consecutive = 0;
      }
    }

    if (maxConsecutive >= minLines) {
      return {
        result: 'broken',
        evidence: `Found ${maxConsecutive} consecutive comment lines (threshold: ${minLines})`,
      };
    }
    return { result: 'kept', evidence: `Max consecutive comments: ${maxConsecutive} (threshold: ${minLines})` };
  }

  _outputLength(params, output) {
    const minChars = params.min_chars || 500;
    const length = output.length;
    if (length >= minChars) {
      return { result: 'kept', evidence: `Output length ${length} chars (min: ${minChars})` };
    }
    return { result: 'broken', evidence: `Output length ${length} chars below minimum ${minChars}` };
  }

  _fileCheck(params, output) {
    const check = (params.check || '').toLowerCase();
    if (check.includes('test')) {
      const testPattern = /\.(test|spec)\.(js|ts|jsx|tsx)|tests?\//i;
      if (testPattern.test(output)) {
        return { result: 'kept', evidence: 'Test file reference found in output' };
      }
      return { result: 'broken', evidence: 'No test file reference found in output' };
    }
    return { result: 'partial', evidence: `Unrecognized file_check: ${check}` };
  }

  _outputContains(params, output) {
    const check = params.check || '';
    if (output.includes(check)) {
      return { result: 'kept', evidence: `Found "${check}" in output` };
    }
    return { result: 'broken', evidence: `"${check}" not found in output` };
  }

  _outputStructure(params, output) {
    const check = (params.check || '').toLowerCase();
    if (check.includes('constraint')) {
      if (/constraint|limitation|caveat|note:/i.test(output)) {
        return { result: 'kept', evidence: 'Constraints section detected' };
      }
      return { result: 'broken', evidence: 'No constraints section found' };
    }
    return { result: 'partial', evidence: `Cannot verify structure: ${check}` };
  }

  _tokenMetric(params, context) {
    const tokenCount = context.tokens_used || 0;
    const threshold = params.max_tokens || 50000;
    if (tokenCount <= threshold) {
      return { result: 'kept', evidence: `${tokenCount} tokens (limit: ${threshold})` };
    }
    return { result: 'broken', evidence: `${tokenCount} tokens exceeds limit of ${threshold}` };
  }

  _timing(params, context) {
    const elapsed = context.elapsed_ms || 0;
    const max = params.max_ms || 300000;
    if (elapsed <= max) {
      return { result: 'kept', evidence: `${elapsed}ms (limit: ${max}ms)` };
    }
    return { result: 'broken', evidence: `${elapsed}ms exceeds limit of ${max}ms` };
  }

  // PR #32 integration. Scans diff hunks for Java test files and looks for
  // raw-body / untyped-JSON access patterns in newly-added (+) lines.
  // Scoping by file means production code (which legitimately uses JsonNode
  // for parsing) is not flagged — only test files. The qa-code-reviewer
  // dispatch handles carve-outs (Allure, logger, header checks, 204/304
  // statusCode-only assertions) when this verifier returns broken.
  _testAssertionPatterns(params, output, context = {}) {
    // Require an explicit test_file_pattern. Pre-fix, a missing field fell
    // back to '\\.java$' which matches every Java file including src/main/
    // production code — the verifier would silently flag forbidden patterns
    // in production. Today the registry always supplies the field, but a
    // future caller, trimmed registry entry, or YAML override that drops
    // the field would trip the silent-widening path. Returning partial
    // here makes the configuration error loud rather than silently
    // misclassifying production code as test-rule violations.
    // Caught by ryordanov-tradu re-verification of HEAD `2905120` (NEW-3).
    if (typeof params.test_file_pattern !== 'string' || params.test_file_pattern.length === 0) {
      return { result: 'partial', evidence: 'no test_file_pattern provided — scope is undefined, refusing to fall back to .java$ (would widen to production code)' };
    }
    const fileRegex = (() => {
      try { return new RegExp(params.test_file_pattern); }
      catch (err) { return null; }
    })();
    if (!fileRegex) {
      return { result: 'partial', evidence: `Invalid test_file_pattern: ${params.test_file_pattern}` };
    }
    const forbidden = (params.forbidden_patterns || []).map(p => {
      try { return { source: p, re: new RegExp(p) }; }
      catch (_) { return null; }
    }).filter(Boolean);
    if (forbidden.length === 0) {
      return { result: 'partial', evidence: 'no forbidden_patterns configured' };
    }

    const diff = context._diffContent || context.diff || output || '';
    if (typeof diff !== 'string' || diff.length === 0) {
      return { result: 'kept', evidence: 'no diff content to scan' };
    }

    // Walk the diff line-by-line, tracking the current file from `+++` headers.
    // Only consider lines added in the new revision (leading '+') within hunks
    // for files matching the test-file regex. Skip the file header line itself
    // (which also starts with '+').
    const findings = [];
    let currentFile = null;
    let isTestFile = false;
    const lines = diff.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('+++ ')) {
        const m = line.match(/^\+\+\+\s+b?\/?(.+?)(\s|$)/);
        currentFile = m ? m[1] : null;
        isTestFile = currentFile ? fileRegex.test(currentFile) : false;
        continue;
      }
      if (line.startsWith('--- ') || line.startsWith('diff ') || line.startsWith('@@')) continue;
      if (!isTestFile) continue;
      if (!line.startsWith('+')) continue;
      const content = line.slice(1);
      for (const f of forbidden) {
        if (f.re.test(content)) {
          findings.push({ file: currentFile, pattern: f.source, snippet: content.trim().slice(0, 120) });
          if (findings.length >= 5) break;
        }
      }
      if (findings.length >= 5) break;
    }

    if (findings.length === 0) {
      return { result: 'kept', evidence: 'no forbidden test-assertion patterns in diff' };
    }
    const detail = findings.map(f => `${f.file}: ${f.pattern}`).join('; ');
    return { result: 'broken', evidence: `forbidden in test file(s): ${detail}` };
  }
}

module.exports = { ObservabilityChecker, DIFF_ELIGIBLE };
