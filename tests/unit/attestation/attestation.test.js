const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const att = require(path.join(ROOT, 'attestation', 'attestation.js'));

const SHA = 'a'.repeat(40);

// Build a trusted-reviewers.yaml with three codex-harness reviewers sharing
// one keypair (the operator/reviewer signing key), plus write it to disk.
function makeTrusted(pubPem) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trust-'));
  const body = ['reviewers:',
    ...['code-reviewer', 'test-reviewer', 'security-reviewer'].flatMap((name) => [
      `  - name: ${name}`,
      '    harness: codex',
      '    publicKey: |',
      ...pubPem.trimEnd().split('\n').map((l) => `      ${l}`),
    ]),
  ].join('\n');
  const file = path.join(dir, 'trusted-reviewers.yaml');
  fs.writeFileSync(file, body);
  return { dir, file };
}

describe('buildMerkle', () => {
  test('single leaf: root is the leaf', () => {
    const h = att.sha256hex(Buffer.from('x'));
    expect(att.buildMerkle([h]).root).toBe(h);
  });

  test('deterministic root across calls', () => {
    const leaves = [att.sha256hex(Buffer.from('a')), att.sha256hex(Buffer.from('b')), att.sha256hex(Buffer.from('c'))];
    expect(att.buildMerkle(leaves).root).toBe(att.buildMerkle(leaves).root);
    expect(att.buildMerkle(leaves).proofs).toHaveLength(3);
  });

  test('throws on zero leaves', () => {
    expect(() => att.buildMerkle([])).toThrow(/zero leaves/);
  });
});

describe('sign + verify roundtrip', () => {
  let kp;
  let trusted;
  beforeAll(() => {
    kp = att.generateKeypair();
    trusted = makeTrusted(kp.publicKeyPem);
  });
  afterAll(() => fs.rmSync(trusted.dir, { recursive: true, force: true }));

  function sign(leaves = ['code-reviewer', 'test-reviewer', 'security-reviewer']) {
    return att.signEnvelope({
      commitSha: SHA,
      headSha: 'deadbeef',
      signerIdentity: 'op@host',
      privateKeyPem: kp.privateKeyPem,
      now: '2026-07-17T21:00:00Z',
      leaves: leaves.map((reviewerName, i) => ({ reviewerName, transcript: `transcript-${reviewerName}-${i}` })),
    });
  }

  test('produces a schema-shaped v6 envelope', () => {
    const env = sign();
    expect(env.schemaVersion).toBe('v6');
    expect(env.subject.digest.sha1).toBe(SHA);
    expect(env.leafCount).toBe(3);
    expect(env.rootHash).toMatch(/^[0-9a-f]{64}$/);
    expect(env.nonce).toMatch(/^[0-9a-f]{64}$/);
  });

  test('verifies when implementer harness differs from reviewers (claude vs codex)', () => {
    const reviewers = att.loadTrustedReviewers(trusted.file);
    const r = att.verifyEnvelope(sign(), { trustedReviewers: reviewers, implementerHarness: 'claude' });
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  test('REJECTS when a reviewer shares the implementer harness (collusion)', () => {
    const reviewers = att.loadTrustedReviewers(trusted.file);
    const r = att.verifyEnvelope(sign(), { trustedReviewers: reviewers, implementerHarness: 'codex' });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/cross-harness violation/);
  });

  test('rejects a tampered rootHash', () => {
    const reviewers = att.loadTrustedReviewers(trusted.file);
    const env = sign();
    env.rootHash = 'f'.repeat(64);
    const r = att.verifyEnvelope(env, { trustedReviewers: reviewers, implementerHarness: 'claude' });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/rootHash does not match|does not verify/);
  });

  test('rejects an unknown reviewer', () => {
    const reviewers = att.loadTrustedReviewers(trusted.file);
    const r = att.verifyEnvelope(sign(['code-reviewer', 'rogue-reviewer', 'security-reviewer']), { trustedReviewers: reviewers, implementerHarness: 'claude' });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/not in trusted-reviewers/);
  });

  test('rejects a signature from an untrusted key', () => {
    const other = att.generateKeypair();
    const forged = att.signEnvelope({ commitSha: SHA, headSha: 'x', privateKeyPem: other.privateKeyPem, now: '2026-07-17T21:00:00Z', leaves: [{ reviewerName: 'code-reviewer', transcript: 't' }] });
    const reviewers = att.loadTrustedReviewers(trusted.file);
    const r = att.verifyEnvelope(forged, { trustedReviewers: reviewers, implementerHarness: 'claude' });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/does not verify against any trusted/);
  });

  test('signEnvelope validates inputs', () => {
    expect(() => att.signEnvelope({ commitSha: 'short', leaves: [{ reviewerName: 'x' }], privateKeyPem: kp.privateKeyPem })).toThrow(/40 hex/);
    expect(() => att.signEnvelope({ commitSha: SHA, leaves: [], privateKeyPem: kp.privateKeyPem })).toThrow(/at least one reviewer/);
  });
});
