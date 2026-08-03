const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createLogger, shouldLog, formatMessage } = require('../src/utils/logger');

describe('shouldLog', () => {
  it('error level logs only errors', () => {
    assert.strictEqual(shouldLog('error', 'error'), true);
    assert.strictEqual(shouldLog('error', 'warn'), false);
    assert.strictEqual(shouldLog('error', 'info'), false);
    assert.strictEqual(shouldLog('error', 'debug'), false);
  });

  it('warn level logs errors and warnings', () => {
    assert.strictEqual(shouldLog('warn', 'error'), true);
    assert.strictEqual(shouldLog('warn', 'warn'), true);
    assert.strictEqual(shouldLog('warn', 'info'), false);
  });

  it('info level logs errors, warnings, and info', () => {
    assert.strictEqual(shouldLog('info', 'error'), true);
    assert.strictEqual(shouldLog('info', 'warn'), true);
    assert.strictEqual(shouldLog('info', 'info'), true);
    assert.strictEqual(shouldLog('info', 'debug'), false);
  });

  it('debug level logs everything', () => {
    assert.strictEqual(shouldLog('debug', 'error'), true);
    assert.strictEqual(shouldLog('debug', 'warn'), true);
    assert.strictEqual(shouldLog('debug', 'info'), true);
    assert.strictEqual(shouldLog('debug', 'debug'), true);
  });

  it('defaults to info for unknown config level', () => {
    assert.strictEqual(shouldLog('unknown', 'info'), true);
    assert.strictEqual(shouldLog('unknown', 'debug'), false);
  });
});

describe('formatMessage', () => {
  it('formats string arguments', () => {
    const msg = formatMessage('testModule', 'info', ['hello', 'world']);
    assert.ok(msg.includes('[testModule]'));
    assert.ok(msg.includes('INFO:'));
    assert.ok(msg.includes('hello world'));
  });

  it('JSON-stringifies non-string arguments', () => {
    const msg = formatMessage('mod', 'error', [{ key: 'val' }]);
    assert.ok(msg.includes('{"key":"val"}'));
  });

  it('includes ISO timestamp', () => {
    const msg = formatMessage('mod', 'info', ['test']);
    const timestampPart = msg.split(' ')[0];
    assert.ok(!isNaN(Date.parse(timestampPart)));
  });
});

describe('createLogger', () => {
  it('returns object with info, warn, error, debug methods', () => {
    const logger = createLogger('test');
    assert.strictEqual(typeof logger.info, 'function');
    assert.strictEqual(typeof logger.warn, 'function');
    assert.strictEqual(typeof logger.error, 'function');
    assert.strictEqual(typeof logger.debug, 'function');
  });

  it('info returns formatted message at info level', () => {
    const logger = createLogger('test');
    const msg = logger.info('test message');
    assert.ok(msg.includes('[test]'));
    assert.ok(msg.includes('INFO:'));
    assert.ok(msg.includes('test message'));
  });

  it('debug returns null at default info level', () => {
    const logger = createLogger('test');
    const msg = logger.debug('hidden');
    assert.strictEqual(msg, null);
  });

  it('error returns formatted message', () => {
    const logger = createLogger('test');
    const msg = logger.error('something broke');
    assert.ok(msg.includes('ERROR:'));
    assert.ok(msg.includes('something broke'));
  });
});
