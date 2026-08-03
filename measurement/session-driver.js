const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync, spawn } = require('child_process');
const { filterChildEnv } = require('./spawn-env');

class SessionDriver {
  constructor({ workDir, model = 'sonnet', turnTimeout = 300000, sessionTimeout = 1800000, mcpConfig = null }) {
    if (!workDir) throw new Error('workDir is required');
    this.workDir = workDir;
    this.model = model;
    this.turnTimeout = turnTimeout;
    this.sessionTimeout = sessionTimeout;
    this.mcpConfig = mcpConfig;
    this.sessionId = crypto.randomBytes(8).toString('hex');
    this.conversationId = null;
    this.totalUsage = { input_tokens: 0, output_tokens: 0 };
    this.lastTurnToolCalls = [];
    this.lastTurnToolUses = [];
  }

  buildClaudeArgs() {
    return [
      '--model', this.model,
      '--dangerously-skip-permissions',
    ];
  }

  _resolveClaudePath() {
    try {
      return execFileSync('which', ['claude'], { encoding: 'utf8' }).trim();
    } catch (_) {
      return 'claude';
    }
  }

  async start() {
    this.conversationId = null;
    this.totalUsage = { input_tokens: 0, output_tokens: 0 };
  }

  async injectTurn(message) {
    this.lastTurnToolCalls = [];
    this.lastTurnToolUses = [];
    const claudePath = this._resolveClaudePath();
    const args = [
      '-p',
      '--verbose',
      '--model', this.model,
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions',
    ];
    if (this.mcpConfig) {
      args.push('--mcp-config', this.mcpConfig);
    }
    if (this.conversationId) {
      args.push('--resume', this.conversationId);
    }

    return new Promise((resolve, reject) => {
      // Spawn claude in its own process group (detached + new session).
      // Without this, the claude CLI and its MCP-server grand-children
      // share PGID with mt-executor. CI smoke runs were repeatedly killed
      // with SIGTERM at varying mid-flight points; the post-mortem ps
      // showed claude reparented to init while node had been killed,
      // consistent with a signal sent to the whole PGID by one of the
      // children. Isolating the process group prevents any such signal
      // from reaching mt-executor.
      const child = spawn(claudePath, args, {
        cwd: this.workDir,
        env: filterChildEnv(process.env),
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
      });

      const chunks = [];
      const stderrChunks = [];
      child.stdout.on('data', (d) => chunks.push(d));
      child.stderr.on('data', (d) => stderrChunks.push(d));

      const timeout = setTimeout(() => {
        // Kill the entire child process group (negative pid) so cxpak +
        // any other grandchildren of claude don't linger after a turn
        // timeout.
        try { process.kill(-child.pid, 'SIGTERM'); } catch (_) { child.kill('SIGTERM'); }
        reject(new Error(`Turn timed out after ${this.turnTimeout}ms`));
      }, this.turnTimeout);

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn claude: ${err.message}`));
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        const stdout = Buffer.concat(chunks).toString('utf8');
        const stderr = Buffer.concat(stderrChunks).toString('utf8');

        if (code !== 0 && !stdout) {
          const detail = stderr ? `\nstderr: ${stderr.slice(0, 500)}` : '';
          reject(new Error(`Claude exited with code ${code}${detail}`));
          return;
        }

        const { text, toolCalls, toolUses, sessionId, usage } = this._parseStreamJson(stdout);
        if (sessionId && !this.conversationId) {
          this.conversationId = sessionId;
        }
        this.totalUsage.input_tokens += usage.input_tokens;
        this.totalUsage.output_tokens += usage.output_tokens;
        this.lastTurnToolCalls = toolCalls;
        this.lastTurnToolUses = toolUses;
        resolve(text);
      });

      child.stdin.write(message);
      child.stdin.end();
    });
  }

  _parseStreamJson(stdout) {
    let resultText = '';
    let sessionId = null;
    const usage = { input_tokens: 0, output_tokens: 0 };
    const toolCalls = [];
    const toolUses = [];
    const toolUseById = new Map();

    const lines = stdout.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch (_) {
        continue;
      }

      if (event.type === 'result') {
        resultText = typeof event.result === 'string' ? event.result : resultText;
        if (event.session_id) sessionId = event.session_id;
        if (event.usage) {
          usage.input_tokens += event.usage.input_tokens || 0;
          usage.output_tokens += event.usage.output_tokens || 0;
        }
      }

      if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
        for (const block of event.message.content) {
          if (block.type === 'tool_use' && block.name) {
            toolCalls.push(block.name);
            const entry = { name: block.name, input: block.input || {}, result_chars: 0 };
            toolUses.push(entry);
            if (block.id) toolUseById.set(block.id, entry);
          }
        }
      }

      if (event.type === 'user' && Array.isArray(event.message?.content)) {
        for (const block of event.message.content) {
          if (block.type !== 'tool_result') continue;
          const entry = block.tool_use_id ? toolUseById.get(block.tool_use_id) : null;
          if (!entry) continue;
          entry.result_chars = this._toolResultChars(block.content);
        }
      }
    }

    if (!resultText && stdout.trim()) {
      try {
        const parsed = JSON.parse(stdout);
        resultText = typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed, null, 2);
        if (parsed.session_id) sessionId = parsed.session_id;
        if (parsed.usage) {
          usage.input_tokens = parsed.usage.input_tokens || 0;
          usage.output_tokens = parsed.usage.output_tokens || 0;
        }
      } catch (_) {
        resultText = stdout;
      }
    }

    return { text: resultText, toolCalls, toolUses, sessionId, usage };
  }

  _toolResultChars(content) {
    if (typeof content === 'string') return content.length;
    if (Array.isArray(content)) {
      let total = 0;
      for (const item of content) {
        if (typeof item === 'string') total += item.length;
        else if (item && typeof item.text === 'string') total += item.text.length;
      }
      return total;
    }
    if (content && typeof content.text === 'string') return content.text.length;
    return 0;
  }

  getLastTurnToolCalls() {
    return this.lastTurnToolCalls;
  }

  getLastTurnToolUses() {
    return this.lastTurnToolUses || [];
  }

  async stop() {
    this.conversationId = null;
  }

  getTotalTokens() {
    return this.totalUsage.input_tokens + this.totalUsage.output_tokens;
  }

  parseTranscriptTokens(entries) {
    let input_tokens = 0;
    let output_tokens = 0;
    for (const entry of entries) {
      if (entry.usage) {
        input_tokens += entry.usage.input_tokens || 0;
        output_tokens += entry.usage.output_tokens || 0;
      }
    }
    return { input_tokens, output_tokens, total_tokens: input_tokens + output_tokens };
  }
}

module.exports = { SessionDriver };
