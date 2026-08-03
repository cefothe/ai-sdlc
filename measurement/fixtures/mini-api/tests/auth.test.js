const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { authenticate } = require('../src/middleware/auth');

describe('authenticate', () => {
  it('returns authenticated true for valid token', () => {
    const req = { headers: { 'x-api-token': 'valid-token-123' } };
    const result = authenticate(req);
    assert.strictEqual(result.authenticated, true);
    assert.strictEqual(result.error, undefined);
  });

  it('returns authenticated false for missing headers', () => {
    const result = authenticate({});
    assert.strictEqual(result.authenticated, false);
    assert.ok(result.error.includes('AUTH_ERROR'));
  });

  it('returns authenticated false for null request', () => {
    const result = authenticate(null);
    assert.strictEqual(result.authenticated, false);
    assert.ok(result.error.includes('AUTH_ERROR'));
  });

  it('returns authenticated false for missing token header', () => {
    const req = { headers: { 'x-other-header': 'value' } };
    const result = authenticate(req);
    assert.strictEqual(result.authenticated, false);
    assert.ok(result.error.includes('Missing authentication token'));
  });

  it('returns authenticated false for empty string token', () => {
    const req = { headers: { 'x-api-token': '' } };
    const result = authenticate(req);
    assert.strictEqual(result.authenticated, false);
    assert.ok(result.error.includes('non-empty string'));
  });

  it('returns authenticated false for whitespace-only token', () => {
    const req = { headers: { 'x-api-token': '   ' } };
    const result = authenticate(req);
    assert.strictEqual(result.authenticated, false);
    assert.ok(result.error.includes('non-empty string'));
  });

  it('uses x-api-token header name from config', () => {
    const req = { headers: { 'x-api-token': 'token' } };
    const result = authenticate(req);
    assert.strictEqual(result.authenticated, true);
  });
});
