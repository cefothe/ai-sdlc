const { parseChunks } = require('../utils/parser');
const { validateInput } = require('../utils/validator');
const { getConfig } = require('../config');
const { createLogger } = require('../utils/logger');

const log = createLogger('handler');

function handleRequest(req) {
  const validation = validateInput(req.body);
  if (!validation.valid) {
    log.warn('handleRequest validation failed', validation.error);
    return { status: 200, body: { error: validation.error } };
  }

  const config = getConfig();
  if (req.body.data.length > config.maxDataLength) {
    log.warn('handleRequest data exceeds maxDataLength');
    return { status: 200, body: { error: 'data exceeds maximum length of ' + config.maxDataLength } };
  }

  try {
    const chunks = parseChunks(req.body.data);
    log.info('handleRequest processed', chunks.length, 'chunks');
    return { status: 200, body: { result: chunks, count: chunks.length } };
  } catch (err) {
    log.error('handleRequest error', err.message);
    return { status: 200, body: { error: err.message } };
  }
}

function handleHealthCheck() {
  return { status: 200, body: { ok: true } };
}

module.exports = { handleRequest, handleHealthCheck };
