const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseChunks, mergeChunks } = require('../src/utils/parser');

describe('parseChunks', () => {
  it('splits comma-separated string', () => {
    const result = parseChunks('a, b, c');
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].value, 'a');
  });

  it('throws on null input', () => {
    assert.throws(() => parseChunks(null), /non-empty string/);
  });

  it('handles empty values between commas', () => {
    const result = parseChunks('a,,b');
    assert.strictEqual(result.length, 2);
  });
});

describe('mergeChunks', () => {
  it('merges multiple arrays', () => {
    const a = [{ index: 0, value: 'x', length: 1 }];
    const b = [{ index: 0, value: 'y', length: 1 }];
    const merged = mergeChunks([a, b]);
    assert.strictEqual(merged.length, 2);
  });
});
