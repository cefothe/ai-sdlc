const { getConfig } = require('../config');
const { validateInput } = require('../utils/validator');
const { createLogger } = require('../utils/logger');

const log = createLogger('batchHandler');

function handleBatch(req, dataService, cacheService) {
  const config = getConfig();

  if (!req || !req.body) {
    log.error('handleBatch called with missing request body');
    return { status: 400, body: { error: 'VALIDATION_ERROR: Request body is required' } };
  }

  const items = req.body.items;
  if (!Array.isArray(items)) {
    log.warn('handleBatch called with non-array items');
    return { status: 400, body: { error: 'VALIDATION_ERROR: items must be an array' } };
  }

  if (items.length === 0) {
    log.warn('handleBatch called with empty items array');
    return { status: 400, body: { error: 'VALIDATION_ERROR: items array must not be empty' } };
  }

  if (items.length > config.maxBatchSize) {
    log.warn('handleBatch batch size exceeded', items.length, '>', config.maxBatchSize);
    return {
      status: 400,
      body: { error: 'VALIDATION_ERROR: Batch size exceeds maximum of ' + config.maxBatchSize },
    };
  }

  const processed = [];
  const failed = [];
  const cached = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const validation = validateInput(item);

    if (!validation.valid) {
      failed.push({ index: i, error: 'VALIDATION_ERROR: ' + validation.error });
      continue;
    }

    const result = dataService.create(item);
    if (!result.success) {
      failed.push({ index: i, error: result.error });
      continue;
    }

    processed.push(result.data);

    const cacheKey = 'item:' + result.data.id;
    cacheService.set(cacheKey, result.data);
    cached.push(cacheKey);
  }

  log.info('batch complete:', processed.length, 'processed,', failed.length, 'failed,', cached.length, 'cached');

  return {
    status: 200,
    body: {
      processed: processed.length,
      failed: failed.length,
      cached: cached.length,
      results: processed,
      errors: failed,
    },
  };
}

module.exports = { handleBatch };
