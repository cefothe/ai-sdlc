const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { handleRequest, handleHealthCheck } = require('../src/api/handler');

describe('handleRequest', () => {
  it('returns parsed chunks for valid input', () => {
    const result = handleRequest({ body: { data: 'a, b, c' } });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.count, 3);
  });

  it('returns error for missing body', () => {
    const result = handleRequest({ body: null });
    assert.ok(result.body.error);
  });

  it('returns error for invalid data type', () => {
    const result = handleRequest({ body: { data: 123 } });
    assert.ok(result.body.error);
  });
});

describe('handleHealthCheck', () => {
  it('returns ok', () => {
    const result = handleHealthCheck();
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.ok, true);
  });
});
