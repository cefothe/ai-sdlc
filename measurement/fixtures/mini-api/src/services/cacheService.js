const { getConfig } = require('../config');
const { createLogger } = require('../utils/logger');

const log = createLogger('cacheService');

class CacheService {
  constructor() {
    this._cache = new Map();
    this._hits = 0;
    this._misses = 0;
  }

  get(key) {
    if (!key) {
      log.warn('get called with empty key');
      return undefined;
    }

    const entry = this._cache.get(key);
    if (!entry) {
      this._misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this._cache.delete(key);
      this._misses++;
      log.debug('cache entry expired for key', key);
      return undefined;
    }

    this._hits++;
    return entry.value;
  }

  set(key, value, ttlMs) {
    if (!key) {
      log.warn('set called with empty key');
      return;
    }

    const config = getConfig();
    const ttl = (ttlMs !== undefined && ttlMs !== null) ? ttlMs : config.cacheTtlMs;
    const expiresAt = Date.now() + ttl;

    this._cache.set(key, { value, expiresAt });
    log.debug('cache set for key', key, 'ttl', ttl);
  }

  invalidate(key) {
    if (!key) {
      log.warn('invalidate called with empty key');
      return false;
    }

    const existed = this._cache.delete(key);
    if (existed) {
      log.info('cache invalidated for key', key);
    }
    return existed;
  }

  stats() {
    const total = this._hits + this._misses;
    return {
      size: this._cache.size,
      hits: this._hits,
      misses: this._misses,
      hitRate: total > 0 ? this._hits / total : 0,
    };
  }
}

module.exports = { CacheService };
