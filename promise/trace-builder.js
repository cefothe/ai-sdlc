const MAX_ARGS_LENGTH = 80;

function buildFingerprint({ model, claudeMdHash, rulesLoaded, promisesActive, registryVersion, cxpakAvailable, cxpakVersion = null }) {
  return {
    ts: new Date().toISOString(),
    ev: 'fingerprint',
    model,
    claude_md_hash: claudeMdHash,
    rules_loaded: rulesLoaded,
    promises_active: promisesActive,
    registry_version: registryVersion,
    cxpak_available: cxpakAvailable,
    cxpak_version: cxpakAvailable ? cxpakVersion : null,
  };
}

function summarizeArgs(name, input) {
  if (!input) return '';

  if (input.file_path) return truncate(input.file_path);
  if (input.pattern) {
    const p = input.path ? `${input.pattern} ${input.path}` : input.pattern;
    return truncate(p);
  }
  if (input.command) return truncate(input.command);
  if (input.query) return truncate(input.query);
  if (input.url) return truncate(input.url);

  const keys = Object.keys(input);
  if (keys.length === 0) return '';
  return truncate(`${keys[0]}:${JSON.stringify(input[keys[0]])}`);
}

function truncate(str) {
  if (!str) return '';
  const s = String(str);
  return s.length <= MAX_ARGS_LENGTH ? s : s.slice(0, MAX_ARGS_LENGTH - 3) + '...';
}

function buildTrace(messages) {
  const now = new Date();
  const events = [];
  let totalIn = 0;
  let totalOut = 0;

  events.push({ ts: now.toISOString(), ev: 'start' });

  for (const msg of messages) {
    if (!msg.message || msg.message.role !== 'assistant') continue;

    const usage = msg.usage || {};
    if (usage.input_tokens) totalIn += usage.input_tokens;
    if (usage.output_tokens) totalOut += usage.output_tokens;

    const content = msg.message.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block.type !== 'tool_use') continue;

      events.push({
        ts: new Date().toISOString(),
        ev: 'tool',
        name: block.name,
        args_summary: summarizeArgs(block.name, block.input),
        file_path: block.input?.file_path || null,
        tokens: {
          in: usage.input_tokens || 0,
          out: usage.output_tokens || 0,
        },
      });
    }
  }

  events.push({
    ts: new Date().toISOString(),
    ev: 'end',
    total_tokens: { in: totalIn, out: totalOut },
  });

  return events;
}

module.exports = { buildTrace, buildFingerprint, summarizeArgs };
