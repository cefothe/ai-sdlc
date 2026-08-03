const { getConfig } = require('../config');
const { createLogger } = require('./logger');

const log = createLogger('validator');

function validateInput(body) {
  const config = getConfig();

  if (!body) {
    log.warn('validateInput: missing body');
    return { valid: false, error: 'Request body is required' };
  }

  if (typeof body.data !== 'string') {
    log.warn('validateInput: data field is not a string');
    return { valid: false, error: 'data field must be a string' };
  }

  if (body.data.length > config.maxDataLength) {
    log.warn('validateInput: data exceeds max length', body.data.length, '>', config.maxDataLength);
    return { valid: false, error: 'data exceeds maximum length of ' + config.maxDataLength };
  }

  return { valid: true };
}

function validateId(id) {
  if (id === null || id === undefined) {
    log.warn('validateId: id is null or undefined');
    return { valid: false, error: 'id is required' };
  }

  if (typeof id !== 'number' || id < 1) {
    log.warn('validateId: invalid id', id);
    return { valid: false, error: 'id must be a positive number' };
  }

  return { valid: true };
}

module.exports = { validateInput, validateId };
