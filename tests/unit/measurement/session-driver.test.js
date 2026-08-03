const { SessionDriver } = require('../../../measurement/session-driver');

describe('SessionDriver', () => {
  describe('constructor', () => {
    test('requires workDir', () => {
      expect(() => new SessionDriver({})).toThrow(/workDir/i);
    });

    test('sets default timeout values', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      expect(driver.turnTimeout).toBe(300000);
      expect(driver.sessionTimeout).toBe(1800000);
    });

    test('accepts custom timeouts', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test', turnTimeout: 60000, sessionTimeout: 600000 });
      expect(driver.turnTimeout).toBe(60000);
      expect(driver.sessionTimeout).toBe(600000);
    });

    test('accepts model parameter', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test', model: 'opus' });
      expect(driver.model).toBe('opus');
    });

    test('defaults model to sonnet', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      expect(driver.model).toBe('sonnet');
    });

    test('generates a unique sessionId', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      expect(driver.sessionId).toMatch(/^[0-9a-f]{16}$/);
    });

    test('initializes conversationId as null', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      expect(driver.conversationId).toBeNull();
    });

    test('initializes totalUsage with zeros', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      expect(driver.totalUsage).toEqual({ input_tokens: 0, output_tokens: 0 });
    });
  });

  describe('buildClaudeArgs', () => {
    test('includes model and dangerously-skip-permissions', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test', model: 'sonnet' });
      const args = driver.buildClaudeArgs();
      expect(args).toContain('--model');
      expect(args).toContain('sonnet');
      expect(args).toContain('--dangerously-skip-permissions');
    });

    test('does not include -p flag (that is added in injectTurn)', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      const args = driver.buildClaudeArgs();
      expect(args).not.toContain('-p');
    });
  });

  describe('start', () => {
    test('resets conversationId and totalUsage', async () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      driver.conversationId = 'previous-session';
      driver.totalUsage = { input_tokens: 500, output_tokens: 200 };
      await driver.start();
      expect(driver.conversationId).toBeNull();
      expect(driver.totalUsage).toEqual({ input_tokens: 0, output_tokens: 0 });
    });
  });

  describe('stop', () => {
    test('clears conversationId', async () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      driver.conversationId = 'some-session';
      await driver.stop();
      expect(driver.conversationId).toBeNull();
    });
  });

  describe('getTotalTokens', () => {
    test('returns sum of input and output tokens', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      driver.totalUsage = { input_tokens: 1000, output_tokens: 500 };
      expect(driver.getTotalTokens()).toBe(1500);
    });

    test('returns 0 when no tokens used', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      expect(driver.getTotalTokens()).toBe(0);
    });
  });

  describe('parseTranscriptTokens', () => {
    test('sums tokens from conversation entries', () => {
      const entries = [
        { type: 'assistant', usage: { input_tokens: 100, output_tokens: 50 } },
        { type: 'assistant', usage: { input_tokens: 200, output_tokens: 80 } },
        { type: 'user' },
      ];
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      const tokens = driver.parseTranscriptTokens(entries);
      expect(tokens.input_tokens).toBe(300);
      expect(tokens.output_tokens).toBe(130);
      expect(tokens.total_tokens).toBe(430);
    });

    test('returns zeros for empty entries', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      const tokens = driver.parseTranscriptTokens([]);
      expect(tokens.total_tokens).toBe(0);
    });
  });

  describe('_resolveClaudePath', () => {
    test('returns a non-empty string', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      const resolved = driver._resolveClaudePath();
      expect(typeof resolved).toBe('string');
      expect(resolved.length).toBeGreaterThan(0);
    });
  });

  describe('_parseStreamJson', () => {
    test('extracts result text from stream-json result event', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      const stdout = [
        JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] } }),
        JSON.stringify({ type: 'result', subtype: 'success', result: 'final output', session_id: 'sess-123', usage: { input_tokens: 100, output_tokens: 50 } }),
      ].join('\n');
      const { text, sessionId, usage, toolCalls } = driver._parseStreamJson(stdout);
      expect(text).toBe('final output');
      expect(sessionId).toBe('sess-123');
      expect(usage.input_tokens).toBe(100);
      expect(usage.output_tokens).toBe(50);
      expect(toolCalls).toEqual([]);
    });

    test('extracts tool_use names from assistant events', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      const stdout = [
        JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'cxpak_auto_context', input: {} }] } }),
        JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/foo' } }, { type: 'text', text: 'done' }] } }),
        JSON.stringify({ type: 'result', subtype: 'success', result: 'implemented', session_id: 'sess-456', usage: { input_tokens: 200, output_tokens: 100 } }),
      ].join('\n');
      const { text, toolCalls } = driver._parseStreamJson(stdout);
      expect(text).toBe('implemented');
      expect(toolCalls).toEqual(['cxpak_auto_context', 'Read']);
    });

    test('matches tool_result content to tool_use by id and records result_chars', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      const stdout = [
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/a' } }] } }),
        JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'A'.repeat(2000) }] } }),
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'cxpak_auto_context', input: {} }] } }),
        JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't2', content: [{ type: 'text', text: 'B'.repeat(5000) }] }] } }),
        JSON.stringify({ type: 'result', subtype: 'success', result: 'done', session_id: 's1', usage: { input_tokens: 100, output_tokens: 50 } }),
      ].join('\n');
      const { toolUses } = driver._parseStreamJson(stdout);
      expect(toolUses).toHaveLength(2);
      expect(toolUses[0]).toEqual({ name: 'Read', input: { file_path: '/a' }, result_chars: 2000 });
      expect(toolUses[1]).toEqual({ name: 'cxpak_auto_context', input: {}, result_chars: 5000 });
    });

    test('_toolResultChars handles strings, arrays, and missing content', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      expect(driver._toolResultChars('hello')).toBe(5);
      expect(driver._toolResultChars([{ type: 'text', text: 'foo' }, 'bar'])).toBe(6);
      expect(driver._toolResultChars({ text: 'baz' })).toBe(3);
      expect(driver._toolResultChars(null)).toBe(0);
      expect(driver._toolResultChars(undefined)).toBe(0);
    });

    test('falls back to single JSON parse when no stream events found', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      const stdout = JSON.stringify({ result: 'legacy output', session_id: 'old-123', usage: { input_tokens: 50, output_tokens: 25 } });
      const { text, sessionId, usage } = driver._parseStreamJson(stdout);
      expect(text).toBe('legacy output');
      expect(sessionId).toBe('old-123');
      expect(usage.input_tokens).toBe(50);
    });

    test('returns raw stdout and empty toolCalls for unparseable input', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      const { text, toolCalls } = driver._parseStreamJson('not json at all\ngarbage');
      expect(text).toBe('not json at all\ngarbage');
      expect(toolCalls).toEqual([]);
    });
  });

  describe('getLastTurnToolCalls', () => {
    test('returns empty array initially', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      expect(driver.getLastTurnToolCalls()).toEqual([]);
    });
  });

  describe('mcpConfig', () => {
    test('stores mcpConfig parameter', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test', mcpConfig: '/path/to/.mcp.json' });
      expect(driver.mcpConfig).toBe('/path/to/.mcp.json');
    });

    test('defaults mcpConfig to null', () => {
      const driver = new SessionDriver({ workDir: '/tmp/test' });
      expect(driver.mcpConfig).toBeNull();
    });
  });
});
