const { createLogger } = require('./logger');

const log = createLogger('parser');

function parseChunks(data) {
  if (!data || typeof data !== 'string') {
    log.error('parseChunks: data must be a non-empty string');
    throw new Error('Data must be a non-empty string');
  }

  const chunks = data.split(',').map(c => c.trim()).filter(c => c.length > 0);
  log.info('parseChunks: parsed', chunks.length, 'chunks');

  const results = [];
  for (let i = 0; i < chunks.length; i++) {
    results.push({ index: i, value: chunks[i], length: chunks[i].length });
  }

  return results;
}

function mergeChunks(chunkArrays) {
  const merged = [];
  for (const arr of chunkArrays) {
    for (const item of arr) {
      merged.push(item);
    }
  }
  log.info('mergeChunks: merged', merged.length, 'items from', chunkArrays.length, 'arrays');
  return merged;
}

module.exports = { parseChunks, mergeChunks };
