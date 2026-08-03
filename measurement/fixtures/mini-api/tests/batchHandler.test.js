const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { handleBatch } = require('../src/api/batchHandler');
const { DataService } = require('../src/services/dataService');
const { CacheService } = require('../src/services/cacheService');

function makeReq(items) {
  return { body: { items } };
}

describe('handleBatch', () => {
  it('processes valid items', () => {
    const ds = new DataService();
    const cs = new CacheService();
    const req = makeReq([{ data: 'one' }, { data: 'two' }]);
    const result = handleBatch(req, ds, cs);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.processed, 2);
    assert.strictEqual(result.body.failed, 0);
    assert.strictEqual(result.body.cached, 2);
  });

  it('handles mix of valid and invalid items', () => {
    const ds = new DataService();
    const cs = new CacheService();
    const req = makeReq([{ data: 'valid' }, { data: 123 }, { data: 'also valid' }]);
    const result = handleBatch(req, ds, cs);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.processed, 2);
    assert.strictEqual(result.body.failed, 1);
    assert.strictEqual(result.body.errors.length, 1);
    assert.strictEqual(result.body.errors[0].index, 1);
  });

  it('caches processed items in cacheService', () => {
    const ds = new DataService();
    const cs = new CacheService();
    const req = makeReq([{ data: 'test' }]);
    handleBatch(req, ds, cs);
    const cached = cs.get('item:1');
    assert.ok(cached);
    assert.strictEqual(cached.id, 1);
  });

  it('returns error for missing request body', () => {
    const ds = new DataService();
    const cs = new CacheService();
    const result = handleBatch(null, ds, cs);
    assert.strictEqual(result.status, 400);
    assert.ok(result.body.error.includes('VALIDATION_ERROR'));
  });

  it('returns error for non-array items', () => {
    const ds = new DataService();
    const cs = new CacheService();
    const result = handleBatch({ body: { items: 'not-array' } }, ds, cs);
    assert.strictEqual(result.status, 400);
    assert.ok(result.body.error.includes('must be an array'));
  });

  it('returns error for empty items array', () => {
    const ds = new DataService();
    const cs = new CacheService();
    const result = handleBatch(makeReq([]), ds, cs);
    assert.strictEqual(result.status, 400);
    assert.ok(result.body.error.includes('must not be empty'));
  });

  it('returns error when batch exceeds maxBatchSize', () => {
    const ds = new DataService();
    const cs = new CacheService();
    const items = Array.from({ length: 51 }, (_, i) => ({ data: 'item' + i }));
    const result = handleBatch(makeReq(items), ds, cs);
    assert.strictEqual(result.status, 400);
    assert.ok(result.body.error.includes('exceeds maximum'));
  });

  it('all failed items reports zero processed', () => {
    const ds = new DataService();
    const cs = new CacheService();
    const req = makeReq([{ data: 123 }, { data: null }]);
    const result = handleBatch(req, ds, cs);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.processed, 0);
    assert.strictEqual(result.body.failed, 2);
  });
});
