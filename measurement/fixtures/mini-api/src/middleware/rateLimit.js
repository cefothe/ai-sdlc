const { getConfig } = require('../config');
const { createLogger } = require('../utils/logger');

const log = createLogger('rateLimit');

class RateLimiter {
  constructor(limit) {
    const config = getConfig();
    this._limit = (limit !== undefined && limit !== null) ? limit : config.rateLimitPerMinute;
    this._clients = new Map();
  }

  check(clientId) {
    if (!clientId) {
      log.warn('check called without clientId');
      return { allowed: false, remaining: 0 };
    }

    const now = Date.now();
    const windowMs = 60000;
    const windowStart = now - windowMs;

    if (!this._clients.has(clientId)) {
      this._clients.set(clientId, []);
    }

    const timestamps = this._clients.get(clientId);
    const active = timestamps.filter(ts => ts > windowStart);
    this._clients.set(clientId, active);

    if (active.length >= this._limit) {
      log.warn('rate limit exceeded for client', clientId);
      return { allowed: false, remaining: 0 };
    }

    active.push(now);
    const remaining = this._limit - active.length;
    return { allowed: true, remaining };
  }

  reset(clientId) {
    if (clientId) {
      this._clients.delete(clientId);
      log.info('rate limit reset for client', clientId);
    }
  }
}

module.exports = { RateLimiter };
