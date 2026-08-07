const { CxpakVerifier } = require('../../../promise/cxpak-verifier');

describe('CxpakVerifier', () => {
  describe('constructor', () => {
    test('creates instance with default timeout', () => {
      const verifier = new CxpakVerifier();
      expect(verifier.timeout).toBe(10000);
    });

    test('accepts custom timeout', () => {
      const verifier = new CxpakVerifier({ timeout: 5000 });
      expect(verifier.timeout).toBe(5000);
    });

    test('defaults workDir to process.cwd()', () => {
      const verifier = new CxpakVerifier();
      expect(verifier.workDir).toBe(process.cwd());
    });

    test('accepts custom workDir', () => {
      const verifier = new CxpakVerifier({ workDir: '/tmp/test-worktree' });
      expect(verifier.workDir).toBe('/tmp/test-worktree');
    });
  });

  describe('checkAvailability', () => {
    test('returns false when cxpak is not installed', async () => {
      const verifier = new CxpakVerifier({ cxpakCommand: 'nonexistent-command-12345' });
      const available = await verifier.checkAvailability();
      expect(available).toBe(false);
    });
  });

  describe('connection pooling', () => {
    const { EventEmitter } = require('events');

    function makeFakeChild() {
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      const stdinWrites = [];
      const stdin = { write: jest.fn((chunk) => { stdinWrites.push(chunk.toString('utf8')); return true; }) };
      const listeners = {};
      const child = {
        stdout, stderr, stdin,
        on: jest.fn((event, cb) => { listeners[event] = cb; return child; }),
        kill: jest.fn(),
      };
      child._emit = (event, ...args) => listeners[event] && listeners[event](...args);
      child._writes = stdinWrites;
      return child;
    }

    // Allow synchronously-scheduled microtasks (checkAvailability's await) to drain.
    const drainMicrotasks = () => new Promise(r => setImmediate(r));

    test('reuses one spawned cxpak server across multiple callTool invocations', async () => {
      const cp = require('child_process');
      const child = makeFakeChild();
      const spawnSpy = jest.spyOn(cp, 'spawn').mockImplementation(() => child);

      const verifier = new CxpakVerifier({ workDir: '/tmp/x' });
      verifier._available = true; // skip checkAvailability so we don't hit execFileSync

      // Fire 3 calls in parallel; respond to each via stdout
      const p1 = verifier.callTool('cxpak_call_graph', {});
      const p2 = verifier.callTool('cxpak_health', {});
      const p3 = verifier.callTool('cxpak_verify', {});

      // Allow the writes to flush, then respond by id (out of order to verify routing)
      await drainMicrotasks();
      const emit = (id, payload) => child.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ text: JSON.stringify(payload) }] } }) + '\n'));
      emit(2, { kind: 'health' });
      emit(1, { kind: 'call_graph' });
      emit(3, { kind: 'verify' });

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      expect(r1).toEqual({ kind: 'call_graph' });
      expect(r2).toEqual({ kind: 'health' });
      expect(r3).toEqual({ kind: 'verify' });
      expect(spawnSpy).toHaveBeenCalledTimes(1);
      expect(child._writes).toHaveLength(3);

      verifier.close();
      expect(child.kill).toHaveBeenCalledTimes(1);
      spawnSpy.mockRestore();
    });

    test('close() before any callTool is a no-op', () => {
      const verifier = new CxpakVerifier();
      expect(() => verifier.close()).not.toThrow();
    });

    test('close() after callTool kills child and rejects pending', async () => {
      const cp = require('child_process');
      const child = makeFakeChild();
      const spawnSpy = jest.spyOn(cp, 'spawn').mockImplementation(() => child);

      const verifier = new CxpakVerifier({ workDir: '/tmp/x' });
      verifier._available = true;

      const pending = verifier.callTool('cxpak_health', {});
      await drainMicrotasks();
      verifier.close();
      const result = await pending;
      expect(result).toBeNull();
      expect(child.kill).toHaveBeenCalled();
      spawnSpy.mockRestore();
    });

    test('child close event resolves pending calls to null', async () => {
      const cp = require('child_process');
      const child = makeFakeChild();
      const spawnSpy = jest.spyOn(cp, 'spawn').mockImplementation(() => child);

      const verifier = new CxpakVerifier({ workDir: '/tmp/x' });
      verifier._available = true;

      const pending = verifier.callTool('cxpak_health', {});
      await drainMicrotasks();
      child._emit('close', 0);
      const result = await pending;
      expect(result).toBeNull();
      spawnSpy.mockRestore();
    });

    describe('spawn-failure backoff (ryordanov audit)', () => {
      // Pre-fix: cxpak serve that crashes on startup would respawn every
      // verifyAll, with no failure counter or backoff. Post-fix: refuse to
      // respawn after 3 consecutive crashes-before-serving; downstream maps
      // null to 'skipped' which trust-manager already excludes from EMA.

      test('returns null without respawning after MAX_CONSECUTIVE_SPAWN_FAILURES', async () => {
        const cp = require('child_process');
        let spawnCount = 0;
        const children = [];
        const spawnSpy = jest.spyOn(cp, 'spawn').mockImplementation(() => {
          spawnCount++;
          const child = makeFakeChild();
          children.push(child);
          return child;
        });

        const verifier = new CxpakVerifier({ workDir: '/tmp/x' });
        verifier._available = true;

        // Force 3 consecutive spawn-crash cycles. Each callTool triggers a
        // spawn, the child crashes before serving, failAllPending bumps the
        // counter. The 4th call should refuse to spawn and return null.
        for (let i = 0; i < 3; i++) {
          const pending = verifier.callTool('cxpak_health', {});
          await drainMicrotasks();
          // Crash without serving any response
          children[i]._emit('close', 1);
          const result = await pending;
          expect(result).toBeNull();
        }

        expect(spawnCount).toBe(3);

        // 4th call must short-circuit — no new spawn, just null.
        const result4 = await verifier.callTool('cxpak_health', {});
        expect(result4).toBeNull();
        expect(spawnCount).toBe(3);

        spawnSpy.mockRestore();
      });

      test('successful response resets the spawn-failure counter', async () => {
        const cp = require('child_process');
        let spawnCount = 0;
        const children = [];
        const spawnSpy = jest.spyOn(cp, 'spawn').mockImplementation(() => {
          spawnCount++;
          const child = makeFakeChild();
          children.push(child);
          return child;
        });

        const verifier = new CxpakVerifier({ workDir: '/tmp/x' });
        verifier._available = true;

        // Two crashes
        for (let i = 0; i < 2; i++) {
          const pending = verifier.callTool('cxpak_health', {});
          await drainMicrotasks();
          children[i]._emit('close', 1);
          await pending;
        }

        // One success — should reset counter
        const goodPending = verifier.callTool('cxpak_health', {});
        await drainMicrotasks();
        const goodChild = children[2];
        goodChild.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 3, result: { content: [{ text: '{"ok":true}' }] } }) + '\n'));
        const goodResult = await goodPending;
        expect(goodResult).toEqual({ ok: true });

        // Counter reset; now we should be able to crash 3 more times before the latch trips
        goodChild._emit('close', 1);
        for (let i = 0; i < 3; i++) {
          const pending = verifier.callTool('cxpak_health', {});
          await drainMicrotasks();
          children[3 + i]._emit('close', 1);
          await pending;
        }
        expect(spawnCount).toBe(6); // 2 initial crashes + 1 success + 3 more crashes

        // 4th post-reset call should refuse to respawn
        const result = await verifier.callTool('cxpak_health', {});
        expect(result).toBeNull();
        expect(spawnCount).toBe(6);

        spawnSpy.mockRestore();
      });

      test('counter increments by 1 per failure even when both error and close events fire (ryordanov NEW-1)', async () => {
        // Node emits BOTH 'error' AND 'close' on a spawn failure (ENOENT,
        // EACCES, etc. — error first, then close shortly after). Pre-fix,
        // failAllPending ran twice per failure, double-incrementing the
        // counter and tripping the MAX_CONSECUTIVE_SPAWN_FAILURES=3 latch
        // at 2 actual failures instead of 3. Post-fix, the idempotency
        // guard at the top of failAllPending makes the second event a
        // no-op. This test fires both events for each of two failures,
        // then verifies the 3rd callTool DOES spawn (counter at 2, below
        // the latch). Pre-fix the 3rd call would short-circuit without
        // spawning (counter would be at 4, above the latch).
        const cp = require('child_process');
        let spawnCount = 0;
        const children = [];
        const spawnSpy = jest.spyOn(cp, 'spawn').mockImplementation(() => {
          spawnCount++;
          const child = makeFakeChild();
          children.push(child);
          return child;
        });

        const verifier = new CxpakVerifier({ workDir: '/tmp/x' });
        verifier._available = true;

        // Two failure cycles, each firing BOTH error and close.
        for (let i = 0; i < 2; i++) {
          const pending = verifier.callTool('cxpak_health', {});
          await drainMicrotasks();
          // Mimic real Node ordering: error fires first, then close.
          children[i]._emit('error', new Error('ENOENT'));
          children[i]._emit('close', null);
          const result = await pending;
          expect(result).toBeNull();
        }

        expect(spawnCount).toBe(2);

        // 3rd callTool: post-fix counter is 2 (< MAX=3), so this MUST spawn
        // a fresh server. Pre-fix counter would be 4, so this would refuse
        // to respawn and the assertion below would fail. callTool is async
        // (awaits checkAvailability inside), so we must drain microtasks
        // before asserting on spawnCount.
        const pending3 = verifier.callTool('cxpak_health', {});
        await drainMicrotasks();
        expect(spawnCount).toBe(3);
        // Resolve the third call cleanly to avoid hanging the test.
        children[2].stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 3, result: { content: [{ text: '{"ok":true}' }] } }) + '\n'));
        const result3 = await pending3;
        expect(result3).toEqual({ ok: true });

        spawnSpy.mockRestore();
      });

      test('manual close() followed by a stray child event does not bump the failure counter', async () => {
        // Bonus coverage: the idempotency guard also handles the case where
        // close() has been called manually (e.g., end-of-verifier cleanup)
        // and an event subsequently fires on the old child. close() already
        // set server.closed = true, so the event is a no-op. Without this
        // guard, the user's explicit shutdown would be counted as a spawn
        // failure and pollute the latch state for the next callTool.
        const cp = require('child_process');
        const children = [];
        const spawnSpy = jest.spyOn(cp, 'spawn').mockImplementation(() => {
          const child = makeFakeChild();
          children.push(child);
          return child;
        });

        const verifier = new CxpakVerifier({ workDir: '/tmp/x' });
        verifier._available = true;

        // Spawn and serve one response — counter at 0 (servedOne reset path).
        const pending = verifier.callTool('cxpak_health', {});
        await drainMicrotasks();
        children[0].stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ text: '{"ok":true}' }] } }) + '\n'));
        await pending;

        // Manual close.
        verifier.close();
        expect(verifier._consecutiveSpawnFailures).toBe(0);

        // Stray child events fire after manual close — must NOT change counter.
        children[0]._emit('close', 0);
        children[0]._emit('error', new Error('post-close stray'));
        expect(verifier._consecutiveSpawnFailures).toBe(0);

        spawnSpy.mockRestore();
      });
    });
  });

  describe('verifyImportValidity', () => {
    test('returns kept when no files to check', async () => {
      const verifier = new CxpakVerifier();
      const result = await verifier.verifyImportValidity([]);
      expect(result.result).toBe('kept');
      expect(result.promise_id).toBe('import-validity');
    });

    test('returns high confidence', async () => {
      const verifier = new CxpakVerifier();
      const result = await verifier.verifyImportValidity([]);
      expect(result.confidence).toBe('high');
    });

    test('returns kept when call_graph has no unresolved imports', async () => {
      const verifier = new CxpakVerifier();
      const fakeResponse = { edges: [
        { caller_file: 'a.js', callee_name: 'b.js', confidence: 'Exact' },
        { caller_file: 'b.js', callee_name: 'c.js', confidence: 'Exact' },
      ], unresolved: [] };
      const result = await verifier.verifyImportValidity(['a.js'], 0, fakeResponse);
      expect(result.result).toBe('kept');
      expect(result.evidence).toContain('0 unresolved imports');
      expect(result.evidence).toContain('2 edges');
    });

    test('returns broken when call_graph has unresolved file imports', async () => {
      const verifier = new CxpakVerifier();
      const fakeResponse = { edges: [
        { caller_file: 'a.js', callee_name: 'b.js', confidence: 'Exact' },
      ], unresolved: [
        { caller_file: 'a.js', callee_name: './missing.js', caller_symbol: 'doStuff' },
      ] };
      const result = await verifier.verifyImportValidity(['a.js'], 0, fakeResponse);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('1 unresolved import');
      expect(result.evidence).toContain('a.js→./missing.js');
    });

    test('filters builtin function names from unresolved', async () => {
      const verifier = new CxpakVerifier();
      const fakeResponse = { edges: [
        { caller_file: 'a.js', callee_name: 'b.js', confidence: 'Exact' },
      ], unresolved: [
        { caller_file: 'hooks/post-edit-lint.js', callee_name: 'execFileSync' },
        { caller_file: 'hooks/post-edit-lint.js', callee_name: 'existsSync' },
        { caller_file: 'hooks/post-edit-lint.js', callee_name: 'stringify' },
        { caller_file: 'hooks/post-edit-lint.js', callee_name: 'parse' },
        { caller_file: 'hooks/post-edit-lint.js', callee_name: 'slice' },
      ] };
      const result = await verifier.verifyImportValidity(['a.js'], 0, fakeResponse);
      expect(result.result).toBe('kept');
      expect(result.evidence).toContain('0 unresolved imports');
      expect(result.evidence).toContain('5 builtin refs filtered');
    });

    test('counts only file imports as broken, filters builtins', async () => {
      const verifier = new CxpakVerifier();
      const fakeResponse = { edges: [], unresolved: [
        { caller_file: 'a.js', callee_name: './missing-module.js' },
        { caller_file: 'a.js', callee_name: 'execFileSync' },
        { caller_file: 'b.js', callee_name: '../lib/helper.ts' },
        { caller_file: 'b.js', callee_name: 'stringify' },
      ] };
      const result = await verifier.verifyImportValidity(['a.js'], 0, fakeResponse);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('2 unresolved import');
      expect(result.evidence).toContain('a.js→./missing-module.js');
      expect(result.evidence).toContain('b.js→../lib/helper.ts');
      expect(result.evidence).toContain('2 builtin refs filtered');
    });

    test('recognizes scoped packages and paths as file imports', async () => {
      const verifier = new CxpakVerifier();
      expect(verifier._isFileImport('./relative')).toBe(true);
      expect(verifier._isFileImport('../parent')).toBe(true);
      expect(verifier._isFileImport('/absolute')).toBe(true);
      expect(verifier._isFileImport('@scope/package')).toBe(true);
      expect(verifier._isFileImport('lib/utils')).toBe(true);
      expect(verifier._isFileImport('missing.js')).toBe(true);
      expect(verifier._isFileImport('missing.ts')).toBe(true);
      expect(verifier._isFileImport('missing.mjs')).toBe(true);
    });

    test('rejects bare identifiers as not file imports', async () => {
      const verifier = new CxpakVerifier();
      expect(verifier._isFileImport('execFileSync')).toBe(false);
      expect(verifier._isFileImport('stringify')).toBe(false);
      expect(verifier._isFileImport('parse')).toBe(false);
      expect(verifier._isFileImport('slice')).toBe(false);
      expect(verifier._isFileImport('forEach')).toBe(false);
      expect(verifier._isFileImport(null)).toBe(false);
      expect(verifier._isFileImport('')).toBe(false);
    });

    test('truncates evidence when many unresolved file imports', async () => {
      const verifier = new CxpakVerifier();
      const unresolved = Array.from({ length: 8 }, (_, i) => ({
        caller_file: `file${i}.js`, callee_name: `./missing${i}.js`,
      }));
      const fakeResponse = { edges: [], unresolved };
      const result = await verifier.verifyImportValidity(['a.js'], 0, fakeResponse);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('8 unresolved import');
      expect(result.evidence).toContain('+3 more');
    });
  });

  describe('verifyFunctionLength', () => {
    test('returns kept when no files to check', async () => {
      const verifier = new CxpakVerifier();
      const result = await verifier.verifyFunctionLength([]);
      expect(result.result).toBe('kept');
      expect(result.promise_id).toBe('function-length');
    });

    test('returns medium confidence', async () => {
      const verifier = new CxpakVerifier();
      const result = await verifier.verifyFunctionLength([]);
      expect(result.confidence).toBe('medium');
    });

    test('returns kept when health conventions >= 7', async () => {
      const verifier = new CxpakVerifier();
      const fakeHealth = { conventions: 8.5, composite: 8.0 };
      const result = await verifier.verifyFunctionLength(['a.js'], 0, fakeHealth);
      expect(result.result).toBe('kept');
      expect(result.evidence).toContain('conventions: 8.5');
    });

    test('returns broken when health conventions < 7', async () => {
      const verifier = new CxpakVerifier();
      const fakeHealth = { conventions: 5.2, composite: 6.0 };
      const result = await verifier.verifyFunctionLength(['a.js'], 0, fakeHealth);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('below 7.0');
    });
  });

  describe('verifyDuplication', () => {
    test('returns kept when no files to check', async () => {
      const verifier = new CxpakVerifier();
      const result = await verifier.verifyDuplication([]);
      expect(result.result).toBe('kept');
      expect(result.promise_id).toBe('duplication');
    });

    test('returns kept when health dead_code >= 7', async () => {
      const verifier = new CxpakVerifier();
      const fakeHealth = { dead_code: 9.0, composite: 8.0 };
      const result = await verifier.verifyDuplication(['a.js'], 0, fakeHealth);
      expect(result.result).toBe('kept');
      expect(result.evidence).toContain('dead_code: 9.0');
    });

    test('returns broken when health dead_code < 7', async () => {
      const verifier = new CxpakVerifier();
      const fakeHealth = { dead_code: 4.5, composite: 6.0 };
      const result = await verifier.verifyDuplication(['a.js'], 0, fakeHealth);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('below 7.0');
    });

    test('falls back to composite when dead_code is null', async () => {
      const verifier = new CxpakVerifier();
      const fakeHealth = { dead_code: null, composite: 8.0 };
      const result = await verifier.verifyDuplication(['a.js'], 0, fakeHealth);
      expect(result.result).toBe('kept');
      expect(result.evidence).toContain('composite');
      expect(result.evidence).toContain('dead_code unavailable');
    });
  });

  describe('verifyDuplication — direct dead_code', () => {
    test('returns kept when no files', async () => {
      const verifier = new CxpakVerifier();
      const result = await verifier.verifyDuplication([], 0, null, null);
      expect(result.result).toBe('kept');
      expect(result.promise_id).toBe('duplication');
    });

    test('returns kept when no dead symbols', async () => {
      const verifier = new CxpakVerifier();
      const deadCodeResponse = { dead_symbols: [], total_scanned: 150 };
      const result = await verifier.verifyDuplication(['src/a.js'], 0, null, deadCodeResponse);
      expect(result.result).toBe('kept');
      expect(result.confidence).toBe('high');
      expect(result.evidence).toContain('0 dead symbols');
    });

    test('returns broken when dead symbols in modified files', async () => {
      const verifier = new CxpakVerifier();
      const deadCodeResponse = {
        dead_symbols: [
          { file: 'src/a.js', name: 'unusedFn' },
          { file: 'src/a.js', name: 'oldHelper' },
        ],
        total_scanned: 150,
      };
      const result = await verifier.verifyDuplication(['src/a.js'], 0, null, deadCodeResponse);
      expect(result.result).toBe('broken');
      expect(result.confidence).toBe('high');
      expect(result.evidence).toContain('src/a.js:unusedFn');
      expect(result.evidence).toContain('src/a.js:oldHelper');
    });

    test('filters to modified files only', async () => {
      const verifier = new CxpakVerifier();
      const deadCodeResponse = {
        dead_symbols: [
          { file: 'src/unrelated.js', name: 'unusedFn' },
          { file: 'lib/other.js', name: 'deadHelper' },
        ],
        total_scanned: 150,
      };
      const result = await verifier.verifyDuplication(['src/a.js'], 0, null, deadCodeResponse);
      expect(result.result).toBe('kept');
      expect(result.confidence).toBe('high');
      expect(result.evidence).toContain('0 dead symbols in modified files');
    });

    test('falls back to health proxy when dead_code response is null', async () => {
      const verifier = new CxpakVerifier();
      const fakeHealth = { dead_code: 9.0, composite: 8.0 };
      const result = await verifier.verifyDuplication(['a.js'], 0, fakeHealth, null);
      expect(result.result).toBe('kept');
      expect(result.confidence).toBe('medium');
      expect(result.evidence).toContain('dead_code: 9.0');
    });
  });

  describe('verifyConventionCompliance', () => {
    test('returns kept when no files to check', async () => {
      const verifier = new CxpakVerifier();
      const result = await verifier.verifyConventionCompliance([]);
      expect(result.result).toBe('kept');
      expect(result.promise_id).toBe('convention-compliance');
      expect(result.confidence).toBe('medium');
    });

    test('returns kept when no violations', async () => {
      const verifier = new CxpakVerifier();
      const fakeResponse = { files_checked: 5, violations: [] };
      const result = await verifier.verifyConventionCompliance(['a.js'], 0, fakeResponse);
      expect(result.result).toBe('kept');
      expect(result.evidence).toContain('5 files');
      expect(result.evidence).toContain('0 convention violations');
    });

    test('returns broken when violations present', async () => {
      const verifier = new CxpakVerifier();
      const fakeResponse = {
        files_checked: 3,
        violations: [
          { file: 'src/foo.js', line: 42, rule: 'naming', message: 'bad name' },
          { file: 'src/bar.js', line: 10, rule: 'import-order' },
        ],
      };
      const result = await verifier.verifyConventionCompliance(['a.js'], 0, fakeResponse);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('2 convention violation');
      expect(result.evidence).toContain('src/foo.js:42');
      expect(result.evidence).toContain('naming');
    });

    test('truncates violations at 5', async () => {
      const verifier = new CxpakVerifier();
      const violations = Array.from({ length: 8 }, (_, i) => ({
        file: `file${i}.js`, line: i, rule: 'rule',
      }));
      const result = await verifier.verifyConventionCompliance(['a.js'], 0, { violations });
      expect(result.evidence).toContain('8 convention violation');
      expect(result.evidence).toContain('+3 more');
    });
  });

  describe('_extractChangedFiles', () => {
    test('returns empty for null response', () => {
      const verifier = new CxpakVerifier();
      expect(verifier._extractChangedFiles(null)).toEqual([]);
    });

    test('extracts from files array of strings', () => {
      const verifier = new CxpakVerifier();
      const resp = { files: ['a.js', 'b.js'] };
      expect(verifier._extractChangedFiles(resp)).toEqual(['a.js', 'b.js']);
    });

    test('extracts from files array of objects with path', () => {
      const verifier = new CxpakVerifier();
      const resp = { files: [{ path: 'a.js' }, { file: 'b.js' }, { name: 'c.js' }] };
      expect(verifier._extractChangedFiles(resp)).toEqual(['a.js', 'b.js', 'c.js']);
    });

    test('extracts from changed_files array', () => {
      const verifier = new CxpakVerifier();
      const resp = { changed_files: ['x.js', { path: 'y.js' }] };
      expect(verifier._extractChangedFiles(resp)).toEqual(['x.js', 'y.js']);
    });
  });

  describe('_extractDiffContent', () => {
    test('returns null for null response', () => {
      const verifier = new CxpakVerifier();
      expect(verifier._extractDiffContent(null)).toBeNull();
    });

    test('returns string response directly', () => {
      const verifier = new CxpakVerifier();
      expect(verifier._extractDiffContent('raw diff')).toBe('raw diff');
    });

    test('extracts content field', () => {
      const verifier = new CxpakVerifier();
      expect(verifier._extractDiffContent({ content: 'diff text' })).toBe('diff text');
    });

    test('extracts diff field', () => {
      const verifier = new CxpakVerifier();
      expect(verifier._extractDiffContent({ diff: '+added line' })).toBe('+added line');
    });

    test('concatenates file diffs', () => {
      const verifier = new CxpakVerifier();
      const resp = { files: [{ diff: '+a' }, { diff: '+b' }] };
      expect(verifier._extractDiffContent(resp)).toBe('+a\n+b');
    });

    test('falls back to JSON.stringify', () => {
      const verifier = new CxpakVerifier();
      const resp = { something_else: 42 };
      expect(verifier._extractDiffContent(resp)).toBe(JSON.stringify(resp));
    });
  });

  describe('verifyChangeImpact', () => {
    test('returns kept when no files', async () => {
      const verifier = new CxpakVerifier();
      const result = await verifier.verifyChangeImpact([], 0, null);
      expect(result.result).toBe('kept');
      expect(result.promise_id).toBe('change-impact');
    });

    test('returns kept when low risk', async () => {
      const verifier = new CxpakVerifier();
      const fakePrediction = {
        risk_score: 0.2,
        structural_impact: { affected_files: 2 },
        test_predictions: [{ file: 'a.test.js' }],
      };
      const result = await verifier.verifyChangeImpact(['a.js'], 0, fakePrediction);
      expect(result.result).toBe('kept');
      expect(result.confidence).toBe('medium');
    });

    test('returns broken when high unmitigated impact', async () => {
      const verifier = new CxpakVerifier();
      const fakePrediction = {
        risk_score: 0.8,
        structural_impact: { affected_files: 15 },
        test_predictions: [],
      };
      const result = await verifier.verifyChangeImpact(['a.js'], 0, fakePrediction);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('risk_score');
    });

    test('returns kept when high impact but good test coverage', async () => {
      const verifier = new CxpakVerifier();
      const fakePrediction = {
        risk_score: 0.8,
        structural_impact: { affected_files: 15 },
        test_predictions: [{ file: 'a.test.js' }, { file: 'b.test.js' }, { file: 'c.test.js' }],
      };
      const result = await verifier.verifyChangeImpact(['a.js'], 0, fakePrediction);
      expect(result.result).toBe('kept');
      expect(result.evidence).toContain('test_predictions');
    });

    test('returns kept when predict response is null', async () => {
      const verifier = new CxpakVerifier();
      const result = await verifier.verifyChangeImpact(['a.js'], 0, null);
      expect(result.result).toBe('skipped');
      expect(result.evidence).toContain('unavailable');
    });
  });

  describe('verifySecuritySurface', () => {
    test('returns kept when no files', async () => {
      const verifier = new CxpakVerifier();
      const result = await verifier.verifySecuritySurface([], 0, null);
      expect(result.result).toBe('kept');
      expect(result.promise_id).toBe('security-surface');
    });

    test('returns kept when no security issues', async () => {
      const verifier = new CxpakVerifier();
      const fakeResponse = { secrets: [], sql_injection: [], unprotected_endpoints: [], exposure_score: 0 };
      const result = await verifier.verifySecuritySurface(['a.js'], 0, fakeResponse);
      expect(result.result).toBe('kept');
      expect(result.confidence).toBe('high');
    });

    test('returns broken when secrets detected', async () => {
      const verifier = new CxpakVerifier();
      const fakeResponse = {
        secrets: [{ file: 'src/a.js', line: 10, type: 'api_key' }],
        sql_injection: [],
        unprotected_endpoints: [],
        exposure_score: 0.8,
      };
      const result = await verifier.verifySecuritySurface(['src/a.js'], 0, fakeResponse);
      expect(result.result).toBe('broken');
      expect(result.confidence).toBe('high');
      expect(result.evidence).toContain('secret');
    });

    test('returns broken when SQL injection risks', async () => {
      const verifier = new CxpakVerifier();
      const fakeResponse = {
        secrets: [],
        sql_injection: [{ file: 'src/db.js', line: 55 }],
        unprotected_endpoints: [],
        exposure_score: 0.6,
      };
      const result = await verifier.verifySecuritySurface(['src/db.js'], 0, fakeResponse);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('sql_injection');
    });

    test('returns kept when response is null', async () => {
      const verifier = new CxpakVerifier();
      const result = await verifier.verifySecuritySurface(['a.js'], 0, null);
      expect(result.result).toBe('skipped');
      expect(result.evidence).toContain('unavailable');
    });

    test('filters issues to modified files only', async () => {
      const verifier = new CxpakVerifier();
      const fakeResponse = {
        secrets: [{ file: 'src/unrelated.js', line: 10, type: 'api_key' }],
        sql_injection: [],
        unprotected_endpoints: [],
        exposure_score: 0.3,
      };
      const result = await verifier.verifySecuritySurface(['src/a.js'], 0, fakeResponse);
      expect(result.result).toBe('kept');
    });
  });

  describe('verifyAll', () => {
    test('returns object with results array and cxpak responses for empty files', async () => {
      const verifier = new CxpakVerifier();
      const result = await verifier.verifyAll([]);
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('diffResponse');
      expect(result).toHaveProperty('blastRadiusResponse');
      expect(result).toHaveProperty('diffContent');
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.results.length).toBe(7);

      const ids = result.results.map(r => r.promise_id);
      expect(ids).toContain('import-validity');
      expect(ids).toContain('function-length');
      expect(ids).toContain('duplication');
      expect(ids).toContain('architectural-boundary');
      expect(ids).toContain('convention-compliance');
      expect(ids).toContain('change-impact');
      expect(ids).toContain('security-surface');
    });

    test('empty files returns null for diff and blast radius', async () => {
      const verifier = new CxpakVerifier();
      const result = await verifier.verifyAll([]);
      expect(result.diffResponse).toBeNull();
      expect(result.blastRadiusResponse).toBeNull();
      expect(result.diffContent).toBeNull();
    });

    test('all results have standard verification shape', async () => {
      const verifier = new CxpakVerifier();
      const { results } = await verifier.verifyAll([]);
      for (const r of results) {
        expect(r).toHaveProperty('result');
        expect(r).toHaveProperty('promise_id');
        expect(r).toHaveProperty('confidence');
        expect(r).toHaveProperty('evidence');
        expect(['kept', 'broken', 'partial', 'skipped']).toContain(r.result);
      }
    });
  });

  describe('graceful degradation (cxpak unavailable)', () => {
    // Regression test for kgenov #7 / nmilenkov #2: cxpak verifiers used to
    // fail-open as 'kept' when cxpak was unavailable, silently inflating
    // trust because OBSERVATION_VALUES.kept = 1.0. Now they return 'skipped'
    // which is excluded from the trust EMA.
    test('regression — every cxpak-dependent verifier returns skipped, never kept', async () => {
      const verifier = new CxpakVerifier({ cxpakCommand: 'nonexistent-command-12345' });
      const { results } = await verifier.verifyAll(['src/test.js']);
      for (const r of results) {
        expect(r.result).not.toBe('kept');
      }
    });

    test('all results are skipped when cxpak is unreachable', async () => {
      const verifier = new CxpakVerifier({ cxpakCommand: 'nonexistent-command-12345' });
      const { results } = await verifier.verifyAll(['src/test.js']);
      const skipped = results.filter(r => r.result === 'skipped');
      expect(skipped.length).toBe(results.length);
    });

    test('skipped results carry evidence describing the unavailability', async () => {
      const verifier = new CxpakVerifier({ cxpakCommand: 'nonexistent-command-12345' });
      const { results } = await verifier.verifyAll(['src/test.js']);
      for (const r of results.filter(r => r.result === 'skipped')) {
        expect(r.evidence).toMatch(/unavailable|no data/i);
      }
    });

    test('returns null diff and blast radius when cxpak unavailable', async () => {
      const verifier = new CxpakVerifier({ cxpakCommand: 'nonexistent-command-12345' });
      const result = await verifier.verifyAll(['src/test.js']);
      expect(result.diffResponse).toBeNull();
      expect(result.blastRadiusResponse).toBeNull();
      expect(result.diffContent).toBeNull();
    });

    // End-to-end wire check: cxpak unavailable → skipped → trust unchanged.
    test('end-to-end: trust does not change when entire run is cxpak-skipped', async () => {
      const { TrustManager } = require('../../../promise/trust-manager');
      const verifier = new CxpakVerifier({ cxpakCommand: 'nonexistent-command-12345' });
      const { results } = await verifier.verifyAll(['src/test.js']);
      const tm = new TrustManager({ decayFactor: 0.7 });
      const startingTrust = 0.5;
      expect(tm.updateTrust(startingTrust, results)).toBe(startingTrust);
    });
  });

  describe('cxpak 3.x op response shapes', () => {
    // The pre-3.0 standalone tools were replaced by op-based intent-tools with
    // reshaped responses. The verifiers accept both legacy and 3.x shapes; these
    // cover the 3.x fields specifically.
    describe('verifyChangeImpact — 3.x predict', () => {
      test('kept when no structural blast (arrays, no risk_score)', async () => {
        const verifier = new CxpakVerifier();
        const pred = {
          changed_files: ['a.js'], structural_impact: [], historical_impact: [{ path: 'x' }],
          call_impact: [], test_impact: [], confidence_summary: '1 files predicted affected',
        };
        const result = await verifier.verifyChangeImpact(['a.js'], 0, pred);
        expect(result.result).toBe('kept');
      });

      test('broken when structural blast with no predicted tests', async () => {
        const verifier = new CxpakVerifier();
        const pred = {
          structural_impact: [{ path: 'a' }, { path: 'b' }, { path: 'c' }],
          historical_impact: [], call_impact: [], test_impact: [], confidence_summary: 's',
        };
        const result = await verifier.verifyChangeImpact(['a.js'], 0, pred);
        expect(result.result).toBe('broken');
        expect(result.evidence).toContain('high impact, low test coverage');
      });

      test('kept when structural blast but test_impact covers it', async () => {
        const verifier = new CxpakVerifier();
        const pred = {
          structural_impact: [{ path: 'a' }], historical_impact: [], call_impact: [],
          test_impact: [{ name: 't1' }, { name: 't2' }], confidence_summary: 's',
        };
        const result = await verifier.verifyChangeImpact(['a.js'], 0, pred);
        expect(result.result).toBe('kept');
        expect(result.evidence).toContain('test_impact');
      });
    });

    describe('verifySecuritySurface — 3.x fields', () => {
      test('kept when secret_patterns / sql_injection_surface empty', async () => {
        const verifier = new CxpakVerifier();
        const resp = { secret_patterns: [], sql_injection_surface: [], unprotected_endpoints: [] };
        const result = await verifier.verifySecuritySurface(['a.js'], 0, resp);
        expect(result.result).toBe('kept');
      });

      test('broken on secret_patterns in modified files', async () => {
        const verifier = new CxpakVerifier();
        const resp = {
          secret_patterns: [{ file: 'src/a.js', line: 10, type: 'api_key' }],
          sql_injection_surface: [], unprotected_endpoints: [],
        };
        const result = await verifier.verifySecuritySurface(['src/a.js'], 0, resp);
        expect(result.result).toBe('broken');
        expect(result.evidence).toContain('secret');
      });

      test('broken on sql_injection_surface in modified files', async () => {
        const verifier = new CxpakVerifier();
        const resp = {
          secret_patterns: [], sql_injection_surface: [{ file: 'src/db.js', line: 5 }],
          unprotected_endpoints: [],
        };
        const result = await verifier.verifySecuritySurface(['src/db.js'], 0, resp);
        expect(result.result).toBe('broken');
        expect(result.evidence).toContain('sql_injection');
      });
    });

    describe('verifyDuplication — 3.x dead_code total', () => {
      test('reads `total` (not total_scanned) for scanned count', async () => {
        const verifier = new CxpakVerifier();
        const deadCodeResponse = { dead_symbols: [], showing: 0, total: 150 };
        const result = await verifier.verifyDuplication(['src/a.js'], 0, null, deadCodeResponse);
        expect(result.result).toBe('kept');
        expect(result.evidence).toContain('150 scanned');
      });

      test('reads `symbol` (3.x) for the dead-symbol name', async () => {
        const verifier = new CxpakVerifier();
        const deadCodeResponse = {
          dead_symbols: [{ file: 'src/a.js', symbol: 'deadTwo', kind: 'Function', liveness_score: 0 }],
          showing: 1, total: 3,
        };
        const result = await verifier.verifyDuplication(['src/a.js'], 0, null, deadCodeResponse);
        expect(result.result).toBe('broken');
        expect(result.evidence).toContain('src/a.js:deadTwo');
      });
    });
  });
});
