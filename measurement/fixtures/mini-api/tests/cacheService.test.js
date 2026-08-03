const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { CacheService } = require('../src/services/cacheService');

describe('CacheService', () => {
  describe('get and set', () => {
    it('returns undefined for missing key', () => {
      const cache = new CacheService();
      assert.strictEqual(cache.get('missing'), undefined);
    });

    it('stores and retrieves a value', () => {
      const cache = new CacheService();
      cache.set('key1', { data: 'hello' });
      const result = cache.get('key1');
      assert.deepStrictEqual(result, { data: 'hello' });
    });

    it('returns undefined for empty key on get', () => {
      const cache = new CacheService();
      assert.strictEqual(cache.get(null), undefined);
    });

    it('ignores set with empty key', () => {
      const cache = new CacheService();
      cache.set(null, 'value');
      const stats = cache.stats();
      assert.strictEqual(stats.size, 0);
    });

    it('overwrites existing value', () => {
      const cache = new CacheService();
      cache.set('key1', 'first');
      cache.set('key1', 'second');
      assert.strictEqual(cache.get('key1'), 'second');
    });
  });

  describe('TTL expiry', () => {
    it('returns undefined for expired entry', async () => {
      const cache = new CacheService();
      cache.set('key1', 'value', 1);
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(cache.get('key1'), undefined);
    });

    it('returns value before TTL expires', () => {
      const cache = new CacheService();
      cache.set('key1', 'value', 60000);
      assert.strictEqual(cache.get('key1'), 'value');
    });
  });

  describe('invalidate', () => {
    it('removes existing key', () => {
      const cache = new CacheService();
      cache.set('key1', 'value');
      const existed = cache.invalidate('key1');
      assert.strictEqual(existed, true);
      assert.strictEqual(cache.get('key1'), undefined);
    });

    it('returns false for non-existing key', () => {
      const cache = new CacheService();
      const existed = cache.invalidate('missing');
      assert.strictEqual(existed, false);
    });

    it('returns false for empty key', () => {
      const cache = new CacheService();
      const existed = cache.invalidate(null);
      assert.strictEqual(existed, false);
    });
  });

  describe('stats', () => {
    it('starts with zero stats', () => {
      const cache = new CacheService();
      const stats = cache.stats();
      assert.strictEqual(stats.size, 0);
      assert.strictEqual(stats.hits, 0);
      assert.strictEqual(stats.misses, 0);
      assert.strictEqual(stats.hitRate, 0);
    });

    it('tracks hits correctly', () => {
      const cache = new CacheService();
      cache.set('key1', 'value');
      cache.get('key1');
      cache.get('key1');
      const stats = cache.stats();
      assert.strictEqual(stats.hits, 2);
      assert.strictEqual(stats.misses, 0);
      assert.strictEqual(stats.hitRate, 1);
    });

    it('tracks misses correctly', () => {
      const cache = new CacheService();
      cache.get('missing1');
      cache.get('missing2');
      const stats = cache.stats();
      assert.strictEqual(stats.misses, 2);
      assert.strictEqual(stats.hits, 0);
      assert.strictEqual(stats.hitRate, 0);
    });

    it('calculates hit rate correctly', () => {
      const cache = new CacheService();
      cache.set('key1', 'value');
      cache.get('key1');
      cache.get('missing');
      const stats = cache.stats();
      assert.strictEqual(stats.hits, 1);
      assert.strictEqual(stats.misses, 1);
      assert.strictEqual(stats.hitRate, 0.5);
    });

    it('tracks size correctly', () => {
      const cache = new CacheService();
      cache.set('key1', 'a');
      cache.set('key2', 'b');
      assert.strictEqual(cache.stats().size, 2);
      cache.invalidate('key1');
      assert.strictEqual(cache.stats().size, 1);
    });
  });
});
