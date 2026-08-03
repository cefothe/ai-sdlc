// Env allowlist for child Claude processes spawned by the measurement
// framework. Closes ryordanov-tradu's H2: passing the full process.env into
// `claude -p --dangerously-skip-permissions` lets a scenario YAML direct the
// child to exfil any environment value (ANTHROPIC_API_KEY, AWS creds, GH
// tokens, etc.) to a worktree file. Allowlisting limits the blast radius to
// only what the child actually needs.
//
// What stays in:
//   - Process basics:        PATH, HOME, USER, LANG, LC_ALL, TMPDIR, TERM, SHLVL
//   - Node/npm:              NODE_PATH, NPM_CONFIG_*
//   - Anthropic direct API:  ANTHROPIC_* (API_KEY, BASE_URL, MODEL, etc.)
//   - AWS Bedrock backend:   AWS_* (REGION, ACCESS_KEY_ID, SESSION_TOKEN,
//                            PROFILE, ROLE_ARN, WEB_IDENTITY_TOKEN_FILE, etc.)
//                            CLAUDE_CODE_USE_BEDROCK
//
// Everything else (GH_TOKEN, GITHUB_TOKEN, OPENAI_*, custom user env, etc.)
// is dropped. The allowlist is prefix-aware for the families where Anthropic
// and AWS may add new variable names without us needing to update the list.

const ENV_ALLOWLIST_EXACT = new Set([
  'PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR',
  'TERM', 'SHLVL', 'PWD',
  'NODE_PATH',
  'CLAUDE_CODE_USE_BEDROCK',
]);

const ENV_ALLOWLIST_PREFIX = ['AWS_', 'ANTHROPIC_', 'NPM_CONFIG_'];

function filterChildEnv(parentEnv = process.env) {
  const out = {};
  for (const key of Object.keys(parentEnv)) {
    if (ENV_ALLOWLIST_EXACT.has(key)) {
      out[key] = parentEnv[key];
      continue;
    }
    for (const prefix of ENV_ALLOWLIST_PREFIX) {
      if (key.startsWith(prefix)) {
        out[key] = parentEnv[key];
        break;
      }
    }
  }
  return out;
}

module.exports = { filterChildEnv, ENV_ALLOWLIST_EXACT, ENV_ALLOWLIST_PREFIX };
