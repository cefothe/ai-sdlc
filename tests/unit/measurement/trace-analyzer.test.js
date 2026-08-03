const { loadTrace, tokenAttribution, filesAccessed, explorationRatio, timeToFirstWrite, toolSequence } = require('../../../measurement/trace-analyzer');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('trace-analyzer', () => {
  const sampleEvents = [
    { ts: '2026-04-15T10:00:00.000Z', ev: 'start' },
    { ts: '2026-04-15T10:00:01.000Z', ev: 'tool', name: 'Read', args_summary: 'src/index.js', tokens: { in: 200, out: 0 } },
    { ts: '2026-04-15T10:00:02.000Z', ev: 'tool', name: 'Grep', args_summary: 'handleOrder src/', tokens: { in: 100, out: 300 } },
    { ts: '2026-04-15T10:00:03.000Z', ev: 'tool', name: 'Read', args_summary: 'src/order.js', tokens: { in: 150, out: 0 } },
    { ts: '2026-04-15T10:00:05.000Z', ev: 'tool', name: 'Write', args_summary: 'src/new-file.js', tokens: { in: 500, out: 800 } },
    { ts: '2026-04-15T10:00:06.000Z', ev: 'tool', name: 'Edit', args_summary: 'src/index.js', tokens: { in: 200, out: 400 } },
    { ts: '2026-04-15T10:00:08.000Z', ev: 'end', total_tokens: { in: 1150, out: 1500 }, duration_ms: 8000 },
  ];

  describe('loadTrace', () => {
    test('reads JSONL file and returns events array', () => {
      const tmpFile = path.join(os.tmpdir(), `test-trace-${Date.now()}.jsonl`);
      const content = sampleEvents.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(tmpFile, content);
      try {
        const events = loadTrace(tmpFile);
        expect(events).toHaveLength(7);
        expect(events[0].ev).toBe('start');
        expect(events[6].ev).toBe('end');
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    test('throws on missing file', () => {
      expect(() => loadTrace('/nonexistent/file.jsonl')).toThrow();
    });

    test('skips empty lines', () => {
      const tmpFile = path.join(os.tmpdir(), `test-trace-empty-${Date.now()}.jsonl`);
      const content = JSON.stringify(sampleEvents[0]) + '\n\n' + JSON.stringify(sampleEvents[6]) + '\n';
      fs.writeFileSync(tmpFile, content);
      try {
        const events = loadTrace(tmpFile);
        expect(events).toHaveLength(2);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });
  });

  describe('tokenAttribution', () => {
    test('groups tokens by tool name with percentages', () => {
      const attr = tokenAttribution(sampleEvents);
      expect(attr.get('Read').in).toBe(350);
      expect(attr.get('Write').out).toBe(800);
      expect(attr.get('Grep').in).toBe(100);
    });

    test('percentages sum to ~100', () => {
      const attr = tokenAttribution(sampleEvents);
      let totalPct = 0;
      for (const [, val] of attr) {
        totalPct += val.pct;
      }
      expect(totalPct).toBeCloseTo(100, 0);
    });

    test('returns empty map for events with no tool calls', () => {
      const events = [
        { ts: '2026-04-15T10:00:00.000Z', ev: 'start' },
        { ts: '2026-04-15T10:00:01.000Z', ev: 'end', total_tokens: { in: 0, out: 0 } },
      ];
      const attr = tokenAttribution(events);
      expect(attr.size).toBe(0);
    });
  });

  describe('filesAccessed', () => {
    test('separates read and written files', () => {
      const result = filesAccessed(sampleEvents);
      expect(result.read).toContain('src/index.js');
      expect(result.read).toContain('src/order.js');
      expect(result.written).toContain('src/new-file.js');
      expect(result.written).toContain('src/index.js');
    });

    test('deduplicates file paths', () => {
      const result = filesAccessed(sampleEvents);
      const readCount = result.read.filter(f => f === 'src/index.js').length;
      expect(readCount).toBe(1);
    });
  });

  describe('explorationRatio', () => {
    test('returns ratio of read events to total tool events', () => {
      const ratio = explorationRatio(sampleEvents);
      expect(ratio).toBeCloseTo(3 / 5, 2);
    });

    test('returns 0 for events with no tool calls', () => {
      const events = [{ ev: 'start' }, { ev: 'end' }];
      expect(explorationRatio(events)).toBe(0);
    });
  });

  describe('timeToFirstWrite', () => {
    test('returns milliseconds from start to first Write or Edit', () => {
      const ms = timeToFirstWrite(sampleEvents);
      expect(ms).toBe(5000);
    });

    test('returns null if no write events', () => {
      const events = [
        { ts: '2026-04-15T10:00:00.000Z', ev: 'start' },
        { ts: '2026-04-15T10:00:01.000Z', ev: 'tool', name: 'Read', args_summary: 'a.js' },
        { ts: '2026-04-15T10:00:02.000Z', ev: 'end' },
      ];
      expect(timeToFirstWrite(events)).toBeNull();
    });
  });

  describe('toolSequence', () => {
    test('returns ordered array of tool names', () => {
      const seq = toolSequence(sampleEvents);
      expect(seq).toEqual(['Read', 'Grep', 'Read', 'Write', 'Edit']);
    });

    test('returns empty array for no tool events', () => {
      const events = [{ ev: 'start' }, { ev: 'end' }];
      expect(toolSequence(events)).toEqual([]);
    });
  });
});
