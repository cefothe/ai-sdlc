#!/usr/bin/env node
// ai-sdlc context server — a dependency-free MCP server (stdio, newline-
// delimited JSON-RPC 2.0) exposing the context lookups to every agent:
// architecture ownership/contracts, product context, a task's full spec, ADRs.
// Read-only: it opens docs under the repo root and never writes.
//
//   node mcp/context-server.js [repo-root]     (default: the current directory)

const path = require('node:path');
const readline = require('node:readline');
const lookup = require('../decision-engine/context-lookup');
const { detectProjects } = require('../decision-engine/monorepo');
const { loadFlowConfig } = require('../pipeline/flow-config');

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'ai-sdlc-context', version: '1.0.0' };

const TOOLS = [
  {
    name: 'architecture_lookup',
    description: 'Which architecture component owns a file path, or what a named component is: its responsibility, code paths, contracts, data ownership, the invariants that apply, the features whose journey runs through it, and its full component doc (docs/architecture/components/<slug>.md: interfaces, dependencies, internal structure, key flows, failure modes, tests). With `feature`, one feature\'s cross-service architecture (docs/architecture/features/<feature>.md: components, end-to-end interactions, contracts, data ownership, quality attributes). With no arguments, lists every component and feature architecture. Use before changing code outside the components your task was given, or before calling into another component.',
    inputSchema: { type: 'object', properties: { component: { type: 'string', description: 'Component name as in docs/architecture/overview.md' }, path: { type: 'string', description: 'Repo-relative file path' }, feature: { type: 'string', description: 'Feature slug as in docs/prd/<feature>.md' } } },
    run: (root, args, opts) => lookup.architectureLookup(root, args, opts),
  },
  {
    name: 'architecture_contracts',
    description: 'The declared integration contracts (Caller → Callee: mechanism, contract) involving a component, or all of them. A call between components must go through one of these.',
    inputSchema: { type: 'object', properties: { component: { type: 'string' } } },
    run: (root, args, opts) => lookup.architectureContracts(root, args, opts),
  },
  {
    name: 'product_lookup',
    description: 'Search the product context (docs/product/context.md): personas, glossary terms, current capabilities, metric baselines, regulatory constraints, non-goals. With no query, lists its sections.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'A term, persona, capability or metric' } } },
    run: (root, args) => lookup.productLookup(root, args),
  },
  {
    name: 'spec_lookup',
    description: 'The full specification of a backlog task: its PRD and design doc (or bug report) plus the architecture slice it reaches.',
    inputSchema: { type: 'object', properties: { task: { type: 'string', description: 'Task id, e.g. AISDLC-0001' } }, required: ['task'] },
    run: (root, args, opts) => lookup.specLookup(root, args, opts),
  },
  {
    name: 'decision_lookup',
    description: 'One architectural decision (ADR) in full: context, rationale, consequences, options.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'DEC-NNNN' } }, required: ['id'] },
    run: (root, args) => lookup.decisionLookup(root, args),
  },
];

function projectsFor(root) {
  try {
    const flow = loadFlowConfig(root);
    return detectProjects(root, { declared: flow.monorepo.projects, autoDetect: flow.monorepo.autoDetect });
  } catch {
    return [];
  }
}

// Handle one JSON-RPC message; returns the response object, or null for a notification.
function handle(message, root) {
  const { id, method, params = {} } = message || {};
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, msg) => ({ jsonrpc: '2.0', id, error: { code, message: msg } });
  if (id === undefined || id === null) return null; // notifications (e.g. notifications/initialized)
  switch (method) {
    case 'initialize':
      return reply({ protocolVersion: params.protocolVersion || PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS.map(({ run, ...t }) => t) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return fail(-32602, `unknown tool ${params.name}`);
      try {
        const text = tool.run(root, params.arguments || {}, { projects: projectsFor(root) });
        return reply({ content: [{ type: 'text', text }] });
      } catch (err) {
        return reply({ content: [{ type: 'text', text: `lookup failed: ${err.message}` }], isError: true });
      }
    }
    default:
      return fail(-32601, `method not found: ${method}`);
  }
}

function serve(root, { input = process.stdin, output = process.stdout } = {}) {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let response;
    try {
      response = handle(JSON.parse(line), root);
    } catch (err) {
      response = { jsonrpc: '2.0', id: null, error: { code: -32700, message: `parse error: ${err.message}` } };
    }
    if (response) output.write(`${JSON.stringify(response)}\n`);
  });
  return rl;
}

module.exports = { handle, serve, TOOLS };

if (require.main === module) {
  serve(path.resolve(process.argv[2] || process.cwd()));
}
