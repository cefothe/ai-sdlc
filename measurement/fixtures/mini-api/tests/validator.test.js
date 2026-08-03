const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateInput, validateId } = require('../src/utils/validator');

describe('validateInput', () => {
  it('accepts valid input', () => {
    assert.strictEqual(validateInput({ data: 'hello' }).valid, true);
  });

  it('rejects null body', () => {
    assert.strictEqual(validateInput(null).valid, false);
  });

  it('rejects non-string data', () => {
    assert.strictEqual(validateInput({ data: 42 }).valid, false);
  });

  it('rejects oversized data', () => {
    assert.strictEqual(validateInput({ data: 'x'.repeat(10001) }).valid, false);
  });
});

describe('validateId', () => {
  it('accepts positive number', () => {
    assert.strictEqual(validateId(5).valid, true);
  });

  it('rejects null', () => {
    assert.strictEqual(validateId(null).valid, false);
  });

  it('rejects negative', () => {
    assert.strictEqual(validateId(-1).valid, false);
  });
});
