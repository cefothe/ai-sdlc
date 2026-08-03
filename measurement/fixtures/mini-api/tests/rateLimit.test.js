const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { RateLimiter } = require('../src/middleware/rateLimit');

describe('RateLimiter', () => {
  it('allows requests under the limit', () => {
    const limiter = new RateLimiter(5);
    const result = limiter.check('client-1');
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.remaining, 4);
  });

  it('tracks remaining count correctly', () => {
    const limiter = new RateLimiter(3);
    limiter.check('client-1');
    limiter.check('client-1');
    const result = limiter.check('client-1');
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.remaining, 0);
  });

  it('blocks requests over the limit', () => {
    const limiter = new RateLimiter(2);
    limiter.check('client-1');
    limiter.check('client-1');
    const result = limiter.check('client-1');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.remaining, 0);
  });

  it('tracks clients independently', () => {
    const limiter = new RateLimiter(1);
    limiter.check('client-1');
    const result = limiter.check('client-2');
    assert.strictEqual(result.allowed, true);
  });

  it('resets a specific client', () => {
    const limiter = new RateLimiter(1);
    limiter.check('client-1');
    limiter.reset('client-1');
    const result = limiter.check('client-1');
    assert.strictEqual(result.allowed, true);
  });

  it('returns not allowed for missing clientId', () => {
    const limiter = new RateLimiter(5);
    const result = limiter.check(null);
    assert.strictEqual(result.allowed, false);
  });

  it('uses config default when no limit provided', () => {
    const limiter = new RateLimiter();
    const result = limiter.check('client-1');
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.remaining, 99);
  });
});
