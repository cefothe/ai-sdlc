const fs = require('fs');

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'Search', 'LS']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

function loadTrace(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

function tokenAttribution(events) {
  const toolEvents = events.filter(e => e.ev === 'tool');
  const totals = new Map();
  let grandTotal = 0;

  for (const e of toolEvents) {
    const tokens = e.tokens || { in: 0, out: 0 };
    const total = tokens.in + tokens.out;
    grandTotal += total;

    const existing = totals.get(e.name) || { in: 0, out: 0, total: 0 };
    existing.in += tokens.in;
    existing.out += tokens.out;
    existing.total += total;
    totals.set(e.name, existing);
  }

  const result = new Map();
  for (const [name, val] of totals) {
    result.set(name, {
      in: val.in,
      out: val.out,
      pct: grandTotal > 0 ? (val.total / grandTotal) * 100 : 0,
    });
  }

  return result;
}

function filesAccessed(events) {
  const readSet = new Set();
  const writeSet = new Set();

  for (const e of events) {
    if (e.ev !== 'tool' || !e.args_summary) continue;

    if (READ_TOOLS.has(e.name)) {
      readSet.add(e.args_summary);
    }
    if (WRITE_TOOLS.has(e.name)) {
      writeSet.add(e.args_summary);
    }
  }

  return { read: [...readSet], written: [...writeSet] };
}

function explorationRatio(events) {
  const toolEvents = events.filter(e => e.ev === 'tool');
  if (toolEvents.length === 0) return 0;

  const readEvents = toolEvents.filter(e => READ_TOOLS.has(e.name));
  return readEvents.length / toolEvents.length;
}

function timeToFirstWrite(events) {
  const start = events.find(e => e.ev === 'start');
  if (!start || !start.ts) return null;

  const firstWrite = events.find(e => e.ev === 'tool' && WRITE_TOOLS.has(e.name));
  if (!firstWrite || !firstWrite.ts) return null;

  return new Date(firstWrite.ts).getTime() - new Date(start.ts).getTime();
}

function toolSequence(events) {
  return events
    .filter(e => e.ev === 'tool')
    .map(e => e.name);
}

module.exports = { loadTrace, tokenAttribution, filesAccessed, explorationRatio, timeToFirstWrite, toolSequence };
