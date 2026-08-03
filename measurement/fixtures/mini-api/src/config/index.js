const CONFIG = {
  maxBatchSize: 50,
  maxDataLength: 10000,
  cacheTtlMs: 30000,
  authTokenHeader: 'x-api-token',
  rateLimitPerMinute: 100,
  logLevel: 'info',
};

function getConfig() {
  return Object.assign({}, CONFIG);
}

module.exports = { getConfig };
