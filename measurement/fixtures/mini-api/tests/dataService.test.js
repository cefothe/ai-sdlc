const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DataService } = require('../src/services/dataService');

describe('DataService', () => {
  describe('create', () => {
    it('creates a record with valid input', () => {
      const ds = new DataService();
      const result = ds.create({ data: 'hello world' });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.id, 1);
      assert.strictEqual(result.data.data, 'hello world');
      assert.ok(result.data.createdAt);
    });

    it('auto-increments ids', () => {
      const ds = new DataService();
      ds.create({ data: 'first' });
      const result = ds.create({ data: 'second' });
      assert.strictEqual(result.data.id, 2);
    });

    it('fails for null item', () => {
      const ds = new DataService();
      const result = ds.create(null);
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('VALIDATION_ERROR'));
    });

    it('fails for invalid data type', () => {
      const ds = new DataService();
      const result = ds.create({ data: 123 });
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('VALIDATION_ERROR'));
    });

    it('fails for oversized data', () => {
      const ds = new DataService();
      const result = ds.create({ data: 'x'.repeat(10001) });
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('VALIDATION_ERROR'));
    });
  });

  describe('getById', () => {
    it('retrieves existing record', () => {
      const ds = new DataService();
      ds.create({ data: 'test' });
      const result = ds.getById(1);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.data, 'test');
    });

    it('returns NOT_FOUND for missing record', () => {
      const ds = new DataService();
      const result = ds.getById(999);
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('NOT_FOUND'));
    });

    it('fails for null id', () => {
      const ds = new DataService();
      const result = ds.getById(null);
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('VALIDATION_ERROR'));
    });

    it('handles string id by parsing to number', () => {
      const ds = new DataService();
      ds.create({ data: 'test' });
      const result = ds.getById('1');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.id, 1);
    });

    it('fails for non-numeric string id', () => {
      const ds = new DataService();
      const result = ds.getById('abc');
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('VALIDATION_ERROR'));
    });
  });

  describe('list', () => {
    it('returns empty array for empty store', () => {
      const ds = new DataService();
      const result = ds.list();
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.length, 0);
    });

    it('returns all records', () => {
      const ds = new DataService();
      ds.create({ data: 'one' });
      ds.create({ data: 'two' });
      const result = ds.list();
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.length, 2);
    });
  });

  describe('deleteById', () => {
    it('deletes existing record', () => {
      const ds = new DataService();
      ds.create({ data: 'test' });
      const result = ds.deleteById(1);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.deleted, true);
    });

    it('returns NOT_FOUND for missing record', () => {
      const ds = new DataService();
      const result = ds.deleteById(999);
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('NOT_FOUND'));
    });

    it('record is gone after delete', () => {
      const ds = new DataService();
      ds.create({ data: 'test' });
      ds.deleteById(1);
      const result = ds.getById(1);
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('NOT_FOUND'));
    });

    it('fails for null id', () => {
      const ds = new DataService();
      const result = ds.deleteById(null);
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('VALIDATION_ERROR'));
    });

    it('handles string id', () => {
      const ds = new DataService();
      ds.create({ data: 'test' });
      const result = ds.deleteById('1');
      assert.strictEqual(result.success, true);
    });
  });
});
