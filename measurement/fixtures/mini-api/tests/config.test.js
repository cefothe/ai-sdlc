const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getConfig } = require('../src/config');

describe('getConfig', () => {
  it('returns an object with all expected keys', () => {
    const config = getConfig();
    assert.strictEqual(typeof config, 'object');
    assert.ok('maxBatchSize' in config);
    assert.ok('maxDataLength' in config);
    assert.ok('cacheTtlMs' in config);
    assert.ok('authTokenHeader' in config);
    assert.ok('rateLimitPerMinute' in config);
    assert.ok('logLevel' in config);
  });

  it('returns expected default values', () => {
    const config = getConfig();
    assert.strictEqual(config.maxBatchSize, 50);
    assert.strictEqual(config.maxDataLength, 10000);
    assert.strictEqual(config.cacheTtlMs, 30000);
    assert.strictEqual(config.authTokenHeader, 'x-api-token');
    assert.strictEqual(config.rateLimitPerMinute, 100);
    assert.strictEqual(config.logLevel, 'info');
  });

  it('returns a copy, not the original object', () => {
    const config1 = getConfig();
    const config2 = getConfig();
    assert.notStrictEqual(config1, config2);
    assert.deepStrictEqual(config1, config2);
  });

  it('mutating returned config does not affect future calls', () => {
    const config1 = getConfig();
    config1.maxBatchSize = 999;
    const config2 = getConfig();
    assert.strictEqual(config2.maxBatchSize, 50);
  });
});
