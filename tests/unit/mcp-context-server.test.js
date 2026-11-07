const path = require('path');
const { PassThrough } = require('stream');

const ROOT = path.join(__dirname, '..', '..');
const srv = require(path.join(ROOT, 'mcp', 'context-server.js'));

describe('ai-sdlc context MCP server', () => {
  test('initialize, tools/list and notifications', () => {
    expect(srv.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, ROOT).result)
      .toEqual({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'ai-sdlc-context', version: '1.0.0' } });
    expect(srv.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, ROOT)).toBeNull();
    const names = srv.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ROOT).result.tools.map((t) => t.name);
    expect(names).toEqual(['architecture_lookup', 'architecture_contracts', 'product_lookup', 'spec_lookup', 'decision_lookup']);
  });

  test('tools/call returns text content; unknown tools and methods are errors', () => {
    const r = srv.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'decision_lookup', arguments: { id: 'DEC-0001' } } }, ROOT);
    expect(r.result.content[0].text).toMatch(/^DEC-0001 \[answered\/project\]: Sign attestation envelopes/);
    expect(srv.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope' } }, ROOT).error.code).toBe(-32602);
    expect(srv.handle({ jsonrpc: '2.0', id: 5, method: 'resources/list' }, ROOT).error.code).toBe(-32601);
  });

  test('serve speaks newline-delimited JSON-RPC over streams', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const rl = srv.serve(ROOT, { input, output });
    const lines = [];
    output.on('data', (d) => lines.push(...String(d).split('\n').filter(Boolean)));
    input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\nnot json\n');
    await new Promise((r) => setTimeout(r, 50));
    rl.close();
    expect(JSON.parse(lines[0])).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
    expect(JSON.parse(lines[1]).error.code).toBe(-32700);
  });
});
