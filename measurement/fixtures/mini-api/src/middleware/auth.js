const { getConfig } = require('../config');
const { createLogger } = require('../utils/logger');

const log = createLogger('auth');

function authenticate(req) {
  const config = getConfig();
  const headerName = config.authTokenHeader;

  if (!req || !req.headers) {
    log.warn('authenticate called with missing request or headers');
    return { authenticated: false, error: 'AUTH_ERROR: Missing request headers' };
  }

  const token = req.headers[headerName];

  if (token === undefined || token === null) {
    log.warn('authenticate failed: missing token header', headerName);
    return { authenticated: false, error: 'AUTH_ERROR: Missing authentication token' };
  }

  if (typeof token !== 'string' || token.trim().length === 0) {
    log.warn('authenticate failed: empty or invalid token');
    return { authenticated: false, error: 'AUTH_ERROR: Token must be a non-empty string' };
  }

  return { authenticated: true };
}

module.exports = { authenticate };
