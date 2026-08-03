const { getConfig } = require('../config');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function shouldLog(configLevel, messageLevel) {
  const threshold = LEVELS[configLevel] !== undefined ? LEVELS[configLevel] : LEVELS.info;
  const msgLevel = LEVELS[messageLevel] !== undefined ? LEVELS[messageLevel] : LEVELS.info;
  return msgLevel <= threshold;
}

function formatMessage(module, level, args) {
  const timestamp = new Date().toISOString();
  const parts = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a)));
  return `${timestamp} [${module}] ${level.toUpperCase()}: ${parts.join(' ')}`;
}

function createLogger(module) {
  const config = getConfig();
  const configLevel = config.logLevel;

  return {
    info(...args) {
      if (shouldLog(configLevel, 'info')) {
        const msg = formatMessage(module, 'info', args);
        process.stdout.write(msg + '\n');
        return msg;
      }
      return null;
    },
    warn(...args) {
      if (shouldLog(configLevel, 'warn')) {
        const msg = formatMessage(module, 'warn', args);
        process.stderr.write(msg + '\n');
        return msg;
      }
      return null;
    },
    error(...args) {
      if (shouldLog(configLevel, 'error')) {
        const msg = formatMessage(module, 'error', args);
        process.stderr.write(msg + '\n');
        return msg;
      }
      return null;
    },
    debug(...args) {
      if (shouldLog(configLevel, 'debug')) {
        const msg = formatMessage(module, 'debug', args);
        process.stdout.write(msg + '\n');
        return msg;
      }
      return null;
    },
  };
}

module.exports = { createLogger, shouldLog, formatMessage };
