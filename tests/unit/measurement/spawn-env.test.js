const {
  filterChildEnv,
  ENV_ALLOWLIST_EXACT,
  ENV_ALLOWLIST_PREFIX,
} = require('../../../measurement/spawn-env');

describe('filterChildEnv (H2: process.env allowlist for child Claude)', () => {
  test('passes through process basics (PATH, HOME, USER, LANG)', () => {
    const parent = { PATH: '/usr/bin:/bin', HOME: '/home/x', USER: 'x', LANG: 'en_US.UTF-8' };
    const out = filterChildEnv(parent);
    expect(out).toEqual(parent);
  });

  test('passes through Anthropic-direct API env (ANTHROPIC_*)', () => {
    const parent = {
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'sk-ant-xxx',
      ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
      ANTHROPIC_MODEL: 'claude-sonnet-4-7',
    };
    const out = filterChildEnv(parent);
    expect(out.ANTHROPIC_API_KEY).toBe('sk-ant-xxx');
    expect(out.ANTHROPIC_BASE_URL).toBe('https://api.anthropic.com');
    expect(out.ANTHROPIC_MODEL).toBe('claude-sonnet-4-7');
  });

  test('passes through AWS Bedrock env (AWS_*, CLAUDE_CODE_USE_BEDROCK)', () => {
    const parent = {
      PATH: '/usr/bin',
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'AKIA...',
      AWS_SECRET_ACCESS_KEY: 'secret',
      AWS_SESSION_TOKEN: 'token',
      AWS_PROFILE: 'r15',
      AWS_ROLE_ARN: 'arn:aws:iam::1234:role/r',
      AWS_WEB_IDENTITY_TOKEN_FILE: '/tmp/oidc',
      CLAUDE_CODE_USE_BEDROCK: '1',
    };
    const out = filterChildEnv(parent);
    expect(out.AWS_REGION).toBe('us-east-1');
    expect(out.AWS_ACCESS_KEY_ID).toBe('AKIA...');
    expect(out.AWS_SESSION_TOKEN).toBe('token');
    expect(out.AWS_WEB_IDENTITY_TOKEN_FILE).toBe('/tmp/oidc');
    expect(out.CLAUDE_CODE_USE_BEDROCK).toBe('1');
  });

  // The point of H2: a malicious scenario YAML can direct child Claude to
  // write env values to a worktree file. Anything not on the allowlist must
  // not propagate. GH/GITHUB tokens, OpenAI keys, custom secrets, etc.
  test('drops tokens for other services (GH, GITHUB, OPENAI, etc.)', () => {
    const parent = {
      PATH: '/usr/bin',
      GH_TOKEN: 'gho_xxx',
      GITHUB_TOKEN: 'ghp_xxx',
      OPENAI_API_KEY: 'sk-xxx',
      GOOGLE_API_KEY: 'AIza...',
      VAULT_TOKEN: 's.xxx',
      DATABASE_URL: 'postgres://...',
      MY_CUSTOM_SECRET: 'sekret',
    };
    const out = filterChildEnv(parent);
    expect(out.GH_TOKEN).toBeUndefined();
    expect(out.GITHUB_TOKEN).toBeUndefined();
    expect(out.OPENAI_API_KEY).toBeUndefined();
    expect(out.GOOGLE_API_KEY).toBeUndefined();
    expect(out.VAULT_TOKEN).toBeUndefined();
    expect(out.DATABASE_URL).toBeUndefined();
    expect(out.MY_CUSTOM_SECRET).toBeUndefined();
    // PATH still passes
    expect(out.PATH).toBe('/usr/bin');
  });

  test('passes through NPM_CONFIG_* (npm registry/auth/proxy)', () => {
    const parent = {
      NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
      NPM_CONFIG_USERCONFIG: '/home/x/.npmrc',
    };
    const out = filterChildEnv(parent);
    expect(out.NPM_CONFIG_REGISTRY).toBe('https://registry.npmjs.org/');
    expect(out.NPM_CONFIG_USERCONFIG).toBe('/home/x/.npmrc');
  });

  test('defaults to process.env when called without argument', () => {
    process.env._H2_TEST_MARKER = 'sentinel';
    process.env.AWS_REGION = 'eu-west-1';
    try {
      const out = filterChildEnv();
      // Custom marker dropped
      expect(out._H2_TEST_MARKER).toBeUndefined();
      // AWS_REGION kept
      expect(out.AWS_REGION).toBe('eu-west-1');
    } finally {
      delete process.env._H2_TEST_MARKER;
    }
  });

  test('handles empty parent env', () => {
    expect(filterChildEnv({})).toEqual({});
  });

  test('exports allowlist constants for inspection', () => {
    expect(ENV_ALLOWLIST_EXACT.has('PATH')).toBe(true);
    expect(ENV_ALLOWLIST_EXACT.has('HOME')).toBe(true);
    expect(ENV_ALLOWLIST_EXACT.has('CLAUDE_CODE_USE_BEDROCK')).toBe(true);
    expect(ENV_ALLOWLIST_PREFIX).toContain('AWS_');
    expect(ENV_ALLOWLIST_PREFIX).toContain('ANTHROPIC_');
  });
});
