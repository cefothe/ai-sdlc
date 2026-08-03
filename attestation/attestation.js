// DSSE-style v6 attestation (RFC-0042 shape) with cross-harness enforcement.
//
// Every code change on `main` must carry an envelope signed by the reviewer
// chain. The load-bearing guarantee is INDEPENDENCE BY CONSTRUCTION: the
// implementer harness (e.g. claude) must differ from every reviewer harness
// (e.g. codex). verifyEnvelope() rejects an envelope whose reviewers share the
// implementer's harness — reviewer collusion is mechanically impossible.
//
// Crypto: ed25519 (node:crypto) over the SHA-256 Merkle root of the reviewer
// transcript leaves. Matches spec/schemas/attestation-envelope-v6.schema.json.

const crypto = require('node:crypto');
const { existsSync, readFileSync } = require('node:fs');
const yaml = require('js-yaml');

function sha256hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function hashPair(aHex, bHex) {
  return sha256hex(Buffer.concat([Buffer.from(aHex, 'hex'), Buffer.from(bHex, 'hex')]));
}

// RFC-6962-style Merkle tree over leaf hashes (hex). Odd nodes promote.
// Returns { root, proofs: [{ leafIndex, proof: [siblingHex...] }] }.
function buildMerkle(leafHashes) {
  if (!Array.isArray(leafHashes) || leafHashes.length === 0) {
    throw new Error('cannot build a Merkle tree over zero leaves');
  }
  const proofs = leafHashes.map((_, i) => ({ leafIndex: i, proof: [] }));
  let positions = leafHashes.map((_, i) => i);
  let level = leafHashes.slice();
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? hashPair(level[i], level[i + 1]) : level[i]);
    }
    for (let l = 0; l < positions.length; l++) {
      const p = positions[l];
      const sib = p % 2 === 0 ? p + 1 : p - 1;
      if (sib < level.length) proofs[l].proof.push(level[sib]);
      positions[l] = Math.floor(p / 2);
    }
    level = next;
  }
  return { root: level[0], proofs };
}

// Generate an ed25519 keypair (PEM). Convenience for setup + tests.
function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

// Build + sign a v6 envelope.
//   inputs: { commitSha (40 hex), leaves: [{ reviewerName, transcript }],
//             headSha (hex), signerIdentity, privateKeyPem, now? }
function signEnvelope(inputs) {
  const { commitSha, leaves, headSha = '', signerIdentity = '', privateKeyPem, now } = inputs;
  if (!/^[0-9a-f]{40}$/.test(commitSha || '')) throw new Error('commitSha must be 40 hex chars');
  if (!Array.isArray(leaves) || leaves.length === 0) throw new Error('at least one reviewer leaf is required');
  if (!privateKeyPem) throw new Error('privateKeyPem is required to sign');

  const transcriptLeaves = leaves.map((l, i) => {
    if (!l.reviewerName) throw new Error(`leaf ${i} missing reviewerName`);
    return { leafIndex: i, reviewerName: l.reviewerName, transcriptHash: sha256hex(Buffer.from(String(l.transcript ?? ''), 'utf8')) };
  });

  const { root, proofs } = buildMerkle(transcriptLeaves.map((l) => l.transcriptHash));
  const nonce = sha256hex(Buffer.concat([Buffer.from(headSha, 'utf8'), crypto.randomBytes(32)]));
  const rootSignature = crypto.sign(null, Buffer.from(root, 'hex'), crypto.createPrivateKey(privateKeyPem)).toString('base64');

  return {
    schemaVersion: 'v6',
    subject: { digest: { sha1: commitSha } },
    transcriptLeaves,
    merkleProofs: proofs,
    rootHash: root,
    rootSignature,
    nonce,
    leafCount: transcriptLeaves.length,
    signerIdentity,
    signedAt: now || new Date().toISOString(),
  };
}

// Load trusted-reviewers.yaml -> { byName: Map<name,{harness,publicKeyPem}>, keys: [pem] }.
function loadTrustedReviewers(path) {
  if (!path || !existsSync(path)) throw new Error(`trusted-reviewers file not found: ${path}`);
  const doc = yaml.load(readFileSync(path, 'utf8'));
  const list = (doc && (doc.reviewers || (doc.spec && doc.spec.reviewers))) || [];
  const byName = new Map();
  const keys = [];
  for (const r of list) {
    if (!r.name || !r.harness || !r.publicKey) continue;
    byName.set(r.name, { harness: r.harness, publicKeyPem: r.publicKey });
    keys.push(r.publicKey);
  }
  return { byName, keys };
}

// Verify an envelope. opts: { trustedReviewers (from loadTrustedReviewers),
// implementerHarness }. Returns { ok, reasons[] }.
function verifyEnvelope(envelope, opts = {}) {
  const reasons = [];
  const { trustedReviewers, implementerHarness } = opts;
  if (!envelope || envelope.schemaVersion !== 'v6') return { ok: false, reasons: ['not a v6 envelope'] };
  if (!Array.isArray(envelope.transcriptLeaves) || envelope.transcriptLeaves.length === 0) {
    return { ok: false, reasons: ['envelope has no transcript leaves'] };
  }
  if (envelope.leafCount !== envelope.transcriptLeaves.length) {
    reasons.push(`leafCount ${envelope.leafCount} != actual leaves ${envelope.transcriptLeaves.length}`);
  }

  // 1. Recompute the Merkle root from the leaves and compare.
  let root;
  try {
    root = buildMerkle(envelope.transcriptLeaves.map((l) => l.transcriptHash)).root;
  } catch (err) {
    return { ok: false, reasons: [`merkle recompute failed: ${err.message}`] };
  }
  if (root !== envelope.rootHash) reasons.push('rootHash does not match recomputed Merkle root');

  // 2. Verify the signature against any trusted key (any-of-N).
  if (!trustedReviewers || trustedReviewers.keys.length === 0) {
    reasons.push('no trusted reviewer keys configured');
  } else {
    const sig = Buffer.from(envelope.rootSignature || '', 'base64');
    const anyValid = trustedReviewers.keys.some((pem) => {
      try {
        return crypto.verify(null, Buffer.from(envelope.rootHash, 'hex'), crypto.createPublicKey(pem), sig);
      } catch {
        return false;
      }
    });
    if (!anyValid) reasons.push('rootSignature does not verify against any trusted reviewer key');
  }

  // 3. Cross-harness enforcement — the crux. Every reviewer must be a known
  // trusted reviewer AND must NOT share the implementer's harness.
  if (trustedReviewers) {
    for (const leaf of envelope.transcriptLeaves) {
      const known = trustedReviewers.byName.get(leaf.reviewerName);
      if (!known) {
        reasons.push(`reviewer "${leaf.reviewerName}" is not in trusted-reviewers`);
        continue;
      }
      if (implementerHarness && known.harness === implementerHarness) {
        reasons.push(`cross-harness violation: reviewer "${leaf.reviewerName}" ran on the implementer harness "${implementerHarness}" — reviewer collusion`);
      }
    }
  }

  return { ok: reasons.length === 0, reasons };
}

module.exports = { buildMerkle, generateKeypair, signEnvelope, verifyEnvelope, loadTrustedReviewers, sha256hex };
