const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { dispatch, matchRoute, extractPathParam } = require('../src/api/routes');

function makeReq(method, path, body, headers) {
  return {
    method,
    path,
    body: body || null,
    headers: Object.assign({ 'x-api-token': 'test-token', 'x-client-id': 'test-client' }, headers || {}),
  };
}

describe('extractPathParam', () => {
  it('extracts param from matching pattern', () => {
    const result = extractPathParam('/data/42', '/data/:id');
    assert.strictEqual(result, '42');
  });

  it('returns null for non-matching pattern', () => {
    const result = extractPathParam('/other/42', '/data/:id');
    assert.strictEqual(result, null);
  });

  it('returns null for different segment count', () => {
    const result = extractPathParam('/data/42/extra', '/data/:id');
    assert.strictEqual(result, null);
  });
});

describe('matchRoute', () => {
  it('matches GET /health', () => {
    const route = matchRoute('GET', '/health');
    assert.strictEqual(route.handler, 'healthCheck');
  });

  it('matches POST /data', () => {
    const route = matchRoute('POST', '/data');
    assert.strictEqual(route.handler, 'createData');
  });

  it('matches POST /batch', () => {
    const route = matchRoute('POST', '/batch');
    assert.strictEqual(route.handler, 'batch');
  });

  it('matches GET /data/:id', () => {
    const route = matchRoute('GET', '/data/5');
    assert.strictEqual(route.handler, 'getData');
    assert.strictEqual(route.params.id, '5');
  });

  it('matches DELETE /data/:id', () => {
    const route = matchRoute('DELETE', '/data/3');
    assert.strictEqual(route.handler, 'deleteData');
    assert.strictEqual(route.params.id, '3');
  });

  it('returns null for unknown route', () => {
    const route = matchRoute('PUT', '/data');
    assert.strictEqual(route, null);
  });
});

describe('dispatch', () => {
  it('returns health check without auth', () => {
    const req = { method: 'GET', path: '/health', headers: {} };
    const result = dispatch(req);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.ok, true);
  });

  it('returns 404 for unknown route', () => {
    const req = makeReq('PUT', '/unknown');
    const result = dispatch(req);
    assert.strictEqual(result.status, 404);
    assert.ok(result.body.error.includes('NOT_FOUND'));
  });

  it('returns 401 for missing auth on protected route', () => {
    const req = { method: 'POST', path: '/data', body: { data: 'test' }, headers: {} };
    const result = dispatch(req);
    assert.strictEqual(result.status, 401);
    assert.ok(result.body.error.includes('AUTH_ERROR'));
  });

  it('handles POST /data with auth', () => {
    const req = makeReq('POST', '/data', { data: 'a, b, c' });
    const result = dispatch(req);
    assert.strictEqual(result.status, 200);
    assert.ok(result.body.count || result.body.error !== undefined);
  });

  it('returns 400 for invalid request', () => {
    const result = dispatch(null);
    assert.strictEqual(result.status, 400);
  });

  it('returns 400 for request missing method', () => {
    const result = dispatch({ path: '/health', headers: {} });
    assert.strictEqual(result.status, 400);
  });

  it('handles batch route with auth', () => {
    const req = makeReq('POST', '/batch', { items: [{ data: 'item1' }] });
    const result = dispatch(req);
    assert.strictEqual(result.status, 200);
    assert.ok(result.body.processed !== undefined);
  });
});
