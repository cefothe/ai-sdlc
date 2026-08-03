const { buildTrace, buildFingerprint } = require('../../../promise/trace-builder');

describe('trace-builder', () => {
  describe('buildFingerprint', () => {
    test('returns fingerprint event with required fields', () => {
      const fp = buildFingerprint({
        model: 'sonnet',
        claudeMdHash: 'abc123',
        rulesLoaded: ['security.md'],
        promisesActive: 14,
        registryVersion: '2.0',
        cxpakAvailable: true,
        cxpakVersion: '0.9.3',
      });
      expect(fp.ev).toBe('fingerprint');
      expect(fp.ts).toBeDefined();
      expect(fp.model).toBe('sonnet');
      expect(fp.claude_md_hash).toBe('abc123');
      expect(fp.rules_loaded).toEqual(['security.md']);
      expect(fp.promises_active).toBe(14);
      expect(fp.registry_version).toBe('2.0');
      expect(fp.cxpak_available).toBe(true);
    });

    test('sets cxpak_version to null when unavailable', () => {
      const fp = buildFingerprint({
        model: 'sonnet',
        claudeMdHash: 'abc123',
        rulesLoaded: [],
        promisesActive: 8,
        registryVersion: '2.0',
        cxpakAvailable: false,
      });
      expect(fp.cxpak_available).toBe(false);
      expect(fp.cxpak_version).toBeNull();
    });
  });

  describe('buildTrace', () => {
    test('extracts tool_use events from assistant messages', () => {
      const messages = [
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', name: 'Read', input: { file_path: '/src/index.js' } },
              { type: 'text', text: 'Reading the file...' },
              { type: 'tool_use', name: 'Write', input: { file_path: '/src/out.js', content: 'code' } },
            ],
          },
          usage: { input_tokens: 500, output_tokens: 200 },
        },
      ];

      const events = buildTrace(messages);
      const toolEvents = events.filter(e => e.ev === 'tool');
      expect(toolEvents).toHaveLength(2);
      expect(toolEvents[0].name).toBe('Read');
      expect(toolEvents[0].args_summary).toBe('/src/index.js');
      expect(toolEvents[0].file_path).toBe('/src/index.js');
      expect(toolEvents[1].name).toBe('Write');
      expect(toolEvents[1].args_summary).toBe('/src/out.js');
      expect(toolEvents[1].file_path).toBe('/src/out.js');
    });

    test('truncates args_summary to 80 chars', () => {
      const longPath = '/very/long/path/' + 'a'.repeat(100) + '.js';
      const messages = [
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', name: 'Read', input: { file_path: longPath } },
            ],
          },
        },
      ];

      const events = buildTrace(messages);
      const toolEvents = events.filter(e => e.ev === 'tool');
      expect(toolEvents[0].args_summary.length).toBeLessThanOrEqual(80);
    });

    test('adds start and end events', () => {
      const messages = [
        {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      ];

      const events = buildTrace(messages);
      expect(events[0].ev).toBe('start');
      expect(events[events.length - 1].ev).toBe('end');
    });

    test('end event contains total token counts', () => {
      const messages = [
        {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
          usage: { input_tokens: 100, output_tokens: 50 },
        },
        {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'world' }] },
          usage: { input_tokens: 200, output_tokens: 100 },
        },
      ];

      const events = buildTrace(messages);
      const endEvent = events.find(e => e.ev === 'end');
      expect(endEvent.total_tokens.in).toBe(300);
      expect(endEvent.total_tokens.out).toBe(150);
    });

    test('returns only start+end for messages with no tool calls', () => {
      const messages = [
        {
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'just text' }] },
        },
      ];

      const events = buildTrace(messages);
      expect(events).toHaveLength(2);
      expect(events[0].ev).toBe('start');
      expect(events[1].ev).toBe('end');
    });

    test('handles empty messages array', () => {
      const events = buildTrace([]);
      expect(events).toHaveLength(2);
      expect(events[0].ev).toBe('start');
      expect(events[1].ev).toBe('end');
    });

    test('extracts Grep args_summary from pattern field', () => {
      const messages = [
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', name: 'Grep', input: { pattern: 'handleOrder', path: 'src/' } },
            ],
          },
        },
      ];

      const events = buildTrace(messages);
      const toolEvents = events.filter(e => e.ev === 'tool');
      expect(toolEvents[0].args_summary).toContain('handleOrder');
      expect(toolEvents[0].file_path).toBeNull();
    });

    test('captures file_path for file operations, null for non-file tools', () => {
      const messages = [
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', name: 'Read', input: { file_path: '/src/foo.js' } },
              { type: 'tool_use', name: 'Edit', input: { file_path: '/src/bar.js', old_string: 'a', new_string: 'b' } },
              { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
              { type: 'tool_use', name: 'Write', input: { file_path: '/src/new.js', content: 'code' } },
            ],
          },
        },
      ];

      const events = buildTrace(messages);
      const toolEvents = events.filter(e => e.ev === 'tool');
      expect(toolEvents[0].file_path).toBe('/src/foo.js');
      expect(toolEvents[1].file_path).toBe('/src/bar.js');
      expect(toolEvents[2].file_path).toBeNull();
      expect(toolEvents[3].file_path).toBe('/src/new.js');
    });

    test('each event has ISO timestamp', () => {
      const messages = [
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/a.js' } }],
          },
        },
      ];

      const events = buildTrace(messages);
      events.forEach(e => {
        expect(e.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });
    });
  });
});
