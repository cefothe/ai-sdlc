const { validateInput } = require('../utils/validator');
const { createLogger } = require('../utils/logger');

const log = createLogger('dataService');

class DataService {
  constructor() {
    this._store = new Map();
    this._nextId = 1;
  }

  create(item) {
    if (!item) {
      log.error('create called with null item');
      return { success: false, error: 'VALIDATION_ERROR: Item is required' };
    }

    const validation = validateInput(item);
    if (!validation.valid) {
      log.warn('create validation failed', validation.error);
      return { success: false, error: 'VALIDATION_ERROR: ' + validation.error };
    }

    const id = this._nextId++;
    const record = { id, data: item.data, createdAt: new Date().toISOString() };
    this._store.set(id, record);
    log.info('created record', id);
    return { success: true, data: record };
  }

  getById(id) {
    if (id === null || id === undefined) {
      log.warn('getById called with null id');
      return { success: false, error: 'VALIDATION_ERROR: id is required' };
    }

    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    if (typeof numId !== 'number' || isNaN(numId) || numId < 1) {
      log.warn('getById called with invalid id', id);
      return { success: false, error: 'VALIDATION_ERROR: id must be a positive number' };
    }

    const record = this._store.get(numId);
    if (!record) {
      log.warn('getById record not found', numId);
      return { success: false, error: 'NOT_FOUND: Record not found' };
    }

    return { success: true, data: record };
  }

  list() {
    const records = Array.from(this._store.values());
    return { success: true, data: records };
  }

  deleteById(id) {
    if (id === null || id === undefined) {
      log.warn('deleteById called with null id');
      return { success: false, error: 'VALIDATION_ERROR: id is required' };
    }

    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    if (typeof numId !== 'number' || isNaN(numId) || numId < 1) {
      log.warn('deleteById called with invalid id', id);
      return { success: false, error: 'VALIDATION_ERROR: id must be a positive number' };
    }

    if (!this._store.has(numId)) {
      log.warn('deleteById record not found', numId);
      return { success: false, error: 'NOT_FOUND: Record not found' };
    }

    this._store.delete(numId);
    log.info('deleted record', numId);
    return { success: true, data: { id: numId, deleted: true } };
  }
}

module.exports = { DataService };
