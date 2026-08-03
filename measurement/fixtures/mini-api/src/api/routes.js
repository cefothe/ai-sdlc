const { authenticate } = require('../middleware/auth');
const { RateLimiter } = require('../middleware/rateLimit');
const { handleRequest, handleHealthCheck } = require('./handler');
const { handleBatch } = require('./batchHandler');
const { DataService } = require('../services/dataService');
const { CacheService } = require('../services/cacheService');
const { createLogger } = require('../utils/logger');

const log = createLogger('routes');

const rateLimiter = new RateLimiter();
const dataService = new DataService();
const cacheService = new CacheService();

function extractPathParam(path, pattern) {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      return pathParts[i];
    }
    if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return null;
}

function matchRoute(method, path) {
  if (method === 'GET' && path === '/health') {
    return { handler: 'healthCheck' };
  }
  if (method === 'POST' && path === '/data') {
    return { handler: 'createData' };
  }
  if (method === 'POST' && path === '/batch') {
    return { handler: 'batch' };
  }
  if (method === 'GET') {
    const id = extractPathParam(path, '/data/:id');
    if (id !== null) {
      return { handler: 'getData', params: { id } };
    }
  }
  if (method === 'DELETE') {
    const id = extractPathParam(path, '/data/:id');
    if (id !== null) {
      return { handler: 'deleteData', params: { id } };
    }
  }
  return null;
}

function dispatch(req) {
  if (!req || !req.method || !req.path) {
    log.error('dispatch called with invalid request');
    return { status: 400, body: { error: 'VALIDATION_ERROR: Invalid request' } };
  }

  const route = matchRoute(req.method, req.path);
  if (!route) {
    log.warn('no route matched for', req.method, req.path);
    return { status: 404, body: { error: 'NOT_FOUND: Route not found' } };
  }

  if (route.handler !== 'healthCheck') {
    const auth = authenticate(req);
    if (!auth.authenticated) {
      return { status: 401, body: { error: auth.error } };
    }

    const clientId = req.headers && req.headers['x-client-id'] ? req.headers['x-client-id'] : 'anonymous';
    const rateCheck = rateLimiter.check(clientId);
    if (!rateCheck.allowed) {
      return { status: 429, body: { error: 'RATE_LIMIT: Too many requests' } };
    }
  }

  switch (route.handler) {
    case 'healthCheck':
      return handleHealthCheck();

    case 'createData':
      return handleRequest(req);

    case 'batch':
      return handleBatch(req, dataService, cacheService);

    case 'getData': {
      const result = dataService.getById(route.params.id);
      if (!result.success) {
        const status = result.error.startsWith('NOT_FOUND') ? 404 : 400;
        return { status, body: { error: result.error } };
      }
      return { status: 200, body: result.data };
    }

    case 'deleteData': {
      const result = dataService.deleteById(route.params.id);
      if (!result.success) {
        const status = result.error.startsWith('NOT_FOUND') ? 404 : 400;
        return { status, body: { error: result.error } };
      }
      return { status: 200, body: result.data };
    }

    default:
      log.error('unhandled route handler', route.handler);
      return { status: 500, body: { error: 'INTERNAL: Unhandled route' } };
  }
}

module.exports = { dispatch, matchRoute, extractPathParam };
