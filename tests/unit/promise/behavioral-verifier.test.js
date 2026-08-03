const { BehavioralVerifier } = require('../../../promise/behavioral-verifier');

describe('BehavioralVerifier', () => {
  let verifier;

  beforeEach(() => {
    verifier = new BehavioralVerifier();
  });

  describe('extractReadsFromTrace', () => {
    test('extracts Read file paths from trace events', () => {
      const trace = [
        { ev: 'start', ts: '2026-01-01T00:00:00Z' },
        { ev: 'tool', name: 'Read', file_path: '/src/foo.js', ts: '2026-01-01T00:00:01Z' },
        { ev: 'tool', name: 'Read', file_path: '/src/bar.js', ts: '2026-01-01T00:00:02Z' },
        { ev: 'tool', name: 'Write', file_path: '/src/foo.js', ts: '2026-01-01T00:00:03Z' },
        { ev: 'end', ts: '2026-01-01T00:00:04Z' },
      ];
      const reads = verifier.extractReadsFromTrace(trace);
      expect(reads.size).toBe(2);
      expect(reads.has('/src/foo.js')).toBe(true);
      expect(reads.has('/src/bar.js')).toBe(true);
    });

    test('ignores Write, Edit, Bash events', () => {
      const trace = [
        { ev: 'tool', name: 'Write', file_path: '/src/new.js', ts: '2026-01-01T00:00:00Z' },
        { ev: 'tool', name: 'Edit', file_path: '/src/edit.js', ts: '2026-01-01T00:00:01Z' },
        { ev: 'tool', name: 'Bash', file_path: null, ts: '2026-01-01T00:00:02Z' },
      ];
      const reads = verifier.extractReadsFromTrace(trace);
      expect(reads.size).toBe(0);
    });

    test('ignores events without file_path', () => {
      const trace = [
        { ev: 'tool', name: 'Read', file_path: null, ts: '2026-01-01T00:00:00Z' },
        { ev: 'tool', name: 'Read', ts: '2026-01-01T00:00:01Z' },
      ];
      const reads = verifier.extractReadsFromTrace(trace);
      expect(reads.size).toBe(0);
    });

    test('returns empty set for empty or invalid trace', () => {
      expect(verifier.extractReadsFromTrace([]).size).toBe(0);
      expect(verifier.extractReadsFromTrace(null).size).toBe(0);
      expect(verifier.extractReadsFromTrace(undefined).size).toBe(0);
    });

    test('deduplicates repeated reads', () => {
      const trace = [
        { ev: 'tool', name: 'Read', file_path: '/src/foo.js', ts: '2026-01-01T00:00:00Z' },
        { ev: 'tool', name: 'Read', file_path: '/src/foo.js', ts: '2026-01-01T00:00:01Z' },
      ];
      const reads = verifier.extractReadsFromTrace(trace);
      expect(reads.size).toBe(1);
    });
  });

  describe('verifyReadBeforeWrite', () => {
    test('returns kept when no files changed', () => {
      const result = verifier.verifyReadBeforeWrite([], []);
      expect(result.result).toBe('kept');
      expect(result.promise_id).toBe('read-before-write');
      expect(result.confidence).toBe('high');
      expect(result.evidence).toContain('no files changed');
    });

    test('returns kept when null changedFiles', () => {
      const result = verifier.verifyReadBeforeWrite([], null);
      expect(result.result).toBe('kept');
    });

    test('returns kept when all modified files were read first', () => {
      const trace = [
        { ev: 'tool', name: 'Read', file_path: '/repo/src/foo.js', ts: '2026-01-01T00:00:00Z' },
        { ev: 'tool', name: 'Read', file_path: '/repo/src/bar.js', ts: '2026-01-01T00:00:01Z' },
      ];
      const changedFiles = ['src/foo.js', 'src/bar.js'];
      const result = verifier.verifyReadBeforeWrite(trace, changedFiles);
      expect(result.result).toBe('kept');
      expect(result.confidence).toBe('high');
      expect(result.evidence).toContain('2 modified file(s)');
      expect(result.evidence).toContain('2 read(s)');
    });

    test('returns broken when files modified without reading', () => {
      const trace = [
        { ev: 'tool', name: 'Read', file_path: '/repo/src/foo.js', ts: '2026-01-01T00:00:00Z' },
      ];
      const changedFiles = ['src/foo.js', 'src/bar.js'];
      const result = verifier.verifyReadBeforeWrite(trace, changedFiles);
      expect(result.result).toBe('broken');
      expect(result.confidence).toBe('high');
      expect(result.evidence).toContain('1 file(s) modified without reading');
      expect(result.evidence).toContain('src/bar.js');
    });

    test('returns broken when trace has no reads but files changed', () => {
      const trace = [
        { ev: 'tool', name: 'Write', file_path: '/repo/src/out.js', ts: '2026-01-01T00:00:00Z' },
      ];
      const changedFiles = ['src/out.js'];
      const result = verifier.verifyReadBeforeWrite(trace, changedFiles);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('0 reads in trace');
    });

    test('matches absolute trace path against relative changed file (endsWith)', () => {
      const trace = [
        { ev: 'tool', name: 'Read', file_path: '/Users/dev/project/src/utils.js', ts: '2026-01-01T00:00:00Z' },
      ];
      const changedFiles = ['src/utils.js'];
      const result = verifier.verifyReadBeforeWrite(trace, changedFiles);
      expect(result.result).toBe('kept');
    });

    test('truncates evidence at 5 unread files', () => {
      const trace = [];
      const changedFiles = Array.from({ length: 8 }, (_, i) => `src/file${i}.js`);
      const result = verifier.verifyReadBeforeWrite(trace, changedFiles);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('8 file(s)');
      expect(result.evidence).toContain('+3 more');
    });

    test('handles exact path match', () => {
      const trace = [
        { ev: 'tool', name: 'Read', file_path: 'src/foo.js', ts: '2026-01-01T00:00:00Z' },
      ];
      const changedFiles = ['src/foo.js'];
      const result = verifier.verifyReadBeforeWrite(trace, changedFiles);
      expect(result.result).toBe('kept');
    });

    // Regression tests for the R15 finding: read-before-write was firing
    // high-confidence broken on every treatment session that used cxpak,
    // because cxpak isn't a Read tool call. The verifier now recognizes
    // cxpak context tools as satisfying the contract via structured context.
    describe('cxpak context counts as reads (R15 regression)', () => {
      test('cxpak_auto_context + Edit → kept', () => {
        const trace = [
          { ev: 'tool', name: 'cxpak_auto_context' },
          { ev: 'tool', name: 'Edit', file_path: 'src/foo.js' },
        ];
        const result = verifier.verifyReadBeforeWrite(trace, ['src/foo.js']);
        expect(result.result).toBe('kept');
        expect(result.evidence).toContain('cxpak');
      });

      test('cxpak_overview + Write → kept', () => {
        const trace = [
          { ev: 'tool', name: 'cxpak_overview' },
          { ev: 'tool', name: 'Write', file_path: 'src/bar.js' },
        ];
        const result = verifier.verifyReadBeforeWrite(trace, ['src/bar.js', 'src/baz.js']);
        expect(result.result).toBe('kept');
      });

      test('mcp-namespaced cxpak tool name (mcp__cxpak__cxpak_auto_context) → kept', () => {
        const trace = [
          { ev: 'tool', name: 'mcp__cxpak__cxpak_auto_context' },
          { ev: 'tool', name: 'Edit', file_path: 'src/foo.js' },
        ];
        const result = verifier.verifyReadBeforeWrite(trace, ['src/foo.js']);
        expect(result.result).toBe('kept');
        expect(result.evidence).toContain('cxpak');
      });

      // Regression: Claude Code shipped a plugin-style MCP namespace
      // ("mcp__plugin_<plugin>_<server>__<tool>") that the previous
      // strip regex didn't match. Without this, R15 CI runs would
      // re-introduce Bug A (verifier penalising cxpak as absent context).
      test('plugin-namespaced cxpak (mcp__plugin_cxpak_cxpak__cxpak_auto_context) → kept', () => {
        const trace = [
          { ev: 'tool', name: 'mcp__plugin_cxpak_cxpak__cxpak_auto_context' },
          { ev: 'tool', name: 'Edit', file_path: 'src/foo.js' },
        ];
        const result = verifier.verifyReadBeforeWrite(trace, ['src/foo.js']);
        expect(result.result).toBe('kept');
        expect(result.evidence).toContain('cxpak');
      });

      test('plugin-namespaced cxpak with non-whitelisted tool (mcp__plugin_cxpak_cxpak__cxpak_search) → kept via prefix', () => {
        const trace = [
          { ev: 'tool', name: 'mcp__plugin_cxpak_cxpak__cxpak_search' },
          { ev: 'tool', name: 'Edit', file_path: 'src/foo.js' },
        ];
        const result = verifier.verifyReadBeforeWrite(trace, ['src/foo.js']);
        expect(result.result).toBe('kept');
      });

      test('non-cxpak plugin-namespaced tool → does NOT count as context', () => {
        // Important: regex strips correctly so we don't false-positive on
        // unrelated MCP tools that happen to be plugin-namespaced.
        const trace = [
          { ev: 'tool', name: 'mcp__plugin_other_atlassian__authenticate' },
          { ev: 'tool', name: 'Edit', file_path: 'src/foo.js' },
        ];
        // No prior Read of src/foo.js → should be broken
        const result = verifier.verifyReadBeforeWrite(trace, ['src/foo.js']);
        expect(result.result).toBe('broken');
      });

      test('cxpak_trace counts (covers symbol traces)', () => {
        const trace = [
          { ev: 'tool', name: 'cxpak_trace' },
          { ev: 'tool', name: 'Edit', file_path: 'src/foo.js' },
        ];
        const result = verifier.verifyReadBeforeWrite(trace, ['src/foo.js']);
        expect(result.result).toBe('kept');
      });

      test('any cxpak_ prefixed tool counts (forward-compat for new cxpak tools)', () => {
        const trace = [
          { ev: 'tool', name: 'cxpak_some_future_tool' },
          { ev: 'tool', name: 'Edit', file_path: 'src/foo.js' },
        ];
        const result = verifier.verifyReadBeforeWrite(trace, ['src/foo.js']);
        expect(result.result).toBe('kept');
      });

      // The original "broken" path must still fire when there's no context source.
      test('regression — no cxpak AND no Read still produces broken', () => {
        const trace = [
          { ev: 'tool', name: 'Write', file_path: 'src/foo.js' },
        ];
        const result = verifier.verifyReadBeforeWrite(trace, ['src/foo.js']);
        expect(result.result).toBe('broken');
      });

      // Mixed Read + cxpak: cxpak alone is sufficient; Read is bonus.
      test('cxpak + partial Reads still kept (cxpak alone satisfies)', () => {
        const trace = [
          { ev: 'tool', name: 'cxpak_auto_context' },
          { ev: 'tool', name: 'Read', file_path: 'src/foo.js' },
          { ev: 'tool', name: 'Edit', file_path: 'src/bar.js' }, // bar.js never Read
        ];
        const result = verifier.verifyReadBeforeWrite(trace, ['src/bar.js']);
        // Without cxpak this would be broken (bar.js modified, only foo.js read).
        // With cxpak, structured context covers the workspace → kept.
        expect(result.result).toBe('kept');
        expect(result.evidence).toContain('cxpak');
      });

      test('changedFiles empty short-circuits before cxpak check', () => {
        const trace = [{ ev: 'tool', name: 'cxpak_auto_context' }];
        const result = verifier.verifyReadBeforeWrite(trace, []);
        expect(result.result).toBe('kept');
        expect(result.evidence).toBe('no files changed');
      });
    });
  });

  describe('verifyExplorationBreadth', () => {
    test('returns partial when blast radius unavailable', () => {
      const result = verifier.verifyExplorationBreadth([], null);
      expect(result.result).toBe('partial');
      expect(result.promise_id).toBe('exploration-breadth');
      expect(result.confidence).toBe('low');
      expect(result.evidence).toContain('unavailable');
    });

    test('returns kept when no related files identified', () => {
      const blastRadius = { direct_dependents: [], transitive_dependents: [] };
      const result = verifier.verifyExplorationBreadth([], blastRadius);
      expect(result.result).toBe('kept');
    });

    test('returns kept when >= 50% of related files explored', () => {
      const trace = [
        { ev: 'tool', name: 'Read', file_path: '/repo/src/dep1.js', ts: '2026-01-01T00:00:00Z' },
        { ev: 'tool', name: 'Read', file_path: '/repo/src/dep2.js', ts: '2026-01-01T00:00:01Z' },
      ];
      const blastRadius = {
        direct_dependents: ['src/dep1.js', 'src/dep2.js', 'src/dep3.js'],
      };
      const result = verifier.verifyExplorationBreadth(trace, blastRadius);
      expect(result.result).toBe('kept');
      expect(result.evidence).toContain('2/3');
      expect(result.evidence).toContain('67%');
    });

    test('returns broken when < 50% of related files explored', () => {
      const trace = [
        { ev: 'tool', name: 'Read', file_path: '/repo/src/dep1.js', ts: '2026-01-01T00:00:00Z' },
      ];
      const blastRadius = {
        direct_dependents: ['src/dep1.js', 'src/dep2.js', 'src/dep3.js', 'src/dep4.js', 'src/dep5.js'],
      };
      const result = verifier.verifyExplorationBreadth(trace, blastRadius);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('1/5');
      expect(result.evidence).toContain('20%');
    });

    test('handles blast radius with object entries', () => {
      const trace = [
        { ev: 'tool', name: 'Read', file_path: '/repo/src/dep.js', ts: '2026-01-01T00:00:00Z' },
      ];
      const blastRadius = {
        direct_dependents: [{ file: 'src/dep.js', risk: 0.8 }],
        transitive_dependents: [{ path: 'src/trans.js', risk: 0.3 }],
      };
      const result = verifier.verifyExplorationBreadth(trace, blastRadius);
      expect(result.result).toBe('kept');
      expect(result.evidence).toContain('1/2');
    });

    test('deduplicates related files across categories', () => {
      const trace = [
        { ev: 'tool', name: 'Read', file_path: '/repo/src/shared.js', ts: '2026-01-01T00:00:00Z' },
      ];
      const blastRadius = {
        direct_dependents: ['src/shared.js'],
        transitive_dependents: ['src/shared.js'],
        test_files: ['src/shared.js'],
      };
      const result = verifier.verifyExplorationBreadth(trace, blastRadius);
      expect(result.result).toBe('kept');
      expect(result.evidence).toContain('1/1');
    });
  });

  describe('_extractRelatedFiles', () => {
    test('returns empty array for null response', () => {
      expect(verifier._extractRelatedFiles(null)).toEqual([]);
    });

    test('combines direct_dependents and transitive_dependents and test_files', () => {
      const response = {
        direct_dependents: ['a.js', 'b.js'],
        transitive_dependents: ['c.js'],
        test_files: ['a.test.js'],
      };
      const files = verifier._extractRelatedFiles(response);
      expect(files).toEqual(['a.js', 'b.js', 'c.js', 'a.test.js']);
    });

    test('handles mixed string and object entries', () => {
      const response = {
        direct_dependents: ['a.js', { file: 'b.js' }, { path: 'c.js' }],
      };
      const files = verifier._extractRelatedFiles(response);
      expect(files).toEqual(['a.js', 'b.js', 'c.js']);
    });
  });

  // M3 (nmilenkov-tradu): the previous logic short-circuited on any cxpak
  // call regardless of edited files, returning kept at high confidence even
  // when the agent edited 10 unrelated files after a single cxpak_overview.
  // The new resolution combines coverage sources, narrows when an
  // authoritative cxpak file list is provided, and downgrades confidence to
  // medium when only the cxpak call is observed (file coverage unverified).
  describe('M3 — read-before-write cxpak coverage precision', () => {
    test('cxpak called, no Reads, file list NOT provided → kept at MEDIUM (downgrade)', () => {
      // Previously: kept high. Now: kept medium — the cxpak directive was
      // followed but file-level coverage cannot be verified without the
      // cxpak response file list.
      const trace = [
        { ev: 'tool', name: 'cxpak_auto_context' },
        { ev: 'tool', name: 'Edit', file_path: 'src/foo.js' },
      ];
      const result = verifier.verifyReadBeforeWrite(trace, ['src/foo.js', 'src/bar.js']);
      expect(result.result).toBe('kept');
      expect(result.confidence).toBe('medium');
      expect(result.evidence).toContain('cxpak');
      expect(result.evidence).toContain('unverified');
    });

    test('cxpak called AND Reads cover all changedFiles → kept at HIGH (precise)', () => {
      const trace = [
        { ev: 'tool', name: 'cxpak_auto_context' },
        { ev: 'tool', name: 'Read', file_path: '/repo/src/foo.js' },
        { ev: 'tool', name: 'Read', file_path: '/repo/src/bar.js' },
        { ev: 'tool', name: 'Edit', file_path: 'src/foo.js' },
      ];
      const result = verifier.verifyReadBeforeWrite(trace, ['src/foo.js', 'src/bar.js']);
      expect(result.result).toBe('kept');
      expect(result.confidence).toBe('high');
      expect(result.evidence).toContain('2 read(s)');
    });

    test('cxpakReadFiles provided AND covers all changedFiles → kept at HIGH (precise)', () => {
      // When the caller passes an authoritative file list from cxpak's
      // response payload, the verifier can verify coverage at file
      // granularity and return high confidence.
      const trace = [
        { ev: 'tool', name: 'cxpak_auto_context' },
        { ev: 'tool', name: 'Edit', file_path: 'src/foo.js' },
      ];
      const cxpakReadFiles = ['src/foo.js', 'src/bar.js', 'src/baz.js'];
      const result = verifier.verifyReadBeforeWrite(trace, ['src/foo.js', 'src/bar.js'], cxpakReadFiles);
      expect(result.result).toBe('kept');
      expect(result.confidence).toBe('high');
      expect(result.evidence).toContain('cxpak context');
    });

    test('cxpakReadFiles + Reads jointly cover all changedFiles → kept at HIGH (union)', () => {
      // Union of Read coverage and cxpak coverage. Common in practice when
      // cxpak returns a partial file set and the agent fills the rest with
      // direct Reads.
      const trace = [
        { ev: 'tool', name: 'cxpak_auto_context' },
        { ev: 'tool', name: 'Read', file_path: '/repo/src/foo.js' },
        { ev: 'tool', name: 'Edit', file_path: 'src/foo.js' },
      ];
      const cxpakReadFiles = ['src/bar.js']; // cxpak covers bar; reads cover foo
      const result = verifier.verifyReadBeforeWrite(trace, ['src/foo.js', 'src/bar.js'], cxpakReadFiles);
      expect(result.result).toBe('kept');
      expect(result.confidence).toBe('high');
      expect(result.evidence).toContain('1 read(s)');
      expect(result.evidence).toContain('cxpak context');
    });

    test('cxpakReadFiles provided but does NOT cover all changedFiles → broken at HIGH (precise)', () => {
      // The point of M3: when we have authoritative file-level data from
      // cxpak and the agent edited files outside that set, this is broken,
      // not kept. No more "any cxpak call → kept" loophole.
      const trace = [
        { ev: 'tool', name: 'cxpak_auto_context' },
        { ev: 'tool', name: 'Edit', file_path: 'src/unrelated.js' },
      ];
      const cxpakReadFiles = ['src/foo.js']; // cxpak only covered foo
      const result = verifier.verifyReadBeforeWrite(trace, ['src/unrelated.js'], cxpakReadFiles);
      expect(result.result).toBe('broken');
      expect(result.confidence).toBe('high');
      expect(result.evidence).toContain('outside cxpak coverage');
      expect(result.evidence).toContain('src/unrelated.js');
    });

    test('No cxpak, no Reads, file modified → broken at HIGH (unchanged)', () => {
      const trace = [
        { ev: 'tool', name: 'Edit', file_path: 'src/foo.js' },
      ];
      const result = verifier.verifyReadBeforeWrite(trace, ['src/foo.js']);
      expect(result.result).toBe('broken');
      expect(result.confidence).toBe('high');
      expect(result.evidence).toContain('0 reads in trace');
    });

    test('cxpakReadFiles can be a Set (not just an Array)', () => {
      const trace = [
        { ev: 'tool', name: 'cxpak_auto_context' },
        { ev: 'tool', name: 'Edit', file_path: 'src/foo.js' },
      ];
      const cxpakReadFiles = new Set(['src/foo.js']);
      const result = verifier.verifyReadBeforeWrite(trace, ['src/foo.js'], cxpakReadFiles);
      expect(result.result).toBe('kept');
      expect(result.confidence).toBe('high');
    });

    test('empty cxpakReadFiles ([] or empty Set) treated as "no authoritative data" → downgrade', () => {
      // Caller may pass [] when cxpak was called but its response had no
      // identifiable file list (schema mismatch, empty response, etc). The
      // contract: empty == "no authoritative data" — same as null. Avoids
      // making the verifier paradoxically stricter when cxpak provides no
      // information than when no list is passed at all.
      const trace = [
        { ev: 'tool', name: 'cxpak_auto_context' },
        { ev: 'tool', name: 'Edit', file_path: 'src/foo.js' },
      ];
      const result1 = verifier.verifyReadBeforeWrite(trace, ['src/foo.js'], []);
      expect(result1.result).toBe('kept');
      expect(result1.confidence).toBe('medium');

      const result2 = verifier.verifyReadBeforeWrite(trace, ['src/foo.js'], new Set());
      expect(result2.result).toBe('kept');
      expect(result2.confidence).toBe('medium');
    });
  });
});
