const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { makeComponentInvoker, parseEnvelope, DEFAULT_IMAGES } = require(path.join(ROOT, 'adapters', 'component-invoker.js'));

function recordingRun(result) {
  const calls = [];
  const run = (cmd, args, opts) => { calls.push({ cmd, args, opts }); return typeof result === 'function' ? result() : result; };
  run.calls = calls;
  return run;
}

describe('parseEnvelope', () => {
  test('parses the last JSON line as an envelope', () => {
    expect(parseEnvelope('noise\n{"schema_version":"1","status":"ok","body":{"x":1}}\n')).toEqual({ schema_version: '1', status: 'ok', body: { x: 1 } });
  });

  test('non-envelopes are null', () => {
    expect(parseEnvelope('')).toBeNull();
    expect(parseEnvelope('not json')).toBeNull();
    expect(parseEnvelope('{"no":"status"}')).toBeNull();
  });
});

describe('makeComponentInvoker', () => {
  test('runs the pinned image with --network none and the request on stdin', async () => {
    const run = recordingRun({ status: 0, stdout: '{"schema_version":"1","status":"ok","body":{"fired":[]}}' });
    const r = await makeComponentInvoker({ run, mode: 'docker' })('commitward', { name_status: 'M\tx' });
    expect(r).toEqual({ status: 'ok', body: { fired: [] }, reason: null });
    expect(run.calls[0].cmd).toBe('docker');
    expect(run.calls[0].args).toEqual(['run', '--rm', '-i', '--network', 'none', DEFAULT_IMAGES.commitward, 'gate']);
    expect(JSON.parse(run.calls[0].opts.input)).toEqual({ name_status: 'M\tx' });
  });

  test('rejected is passed through — the caller must fail, not fall open', async () => {
    const run = recordingRun({ status: 0, stdout: '{"schema_version":"1","status":"rejected","body":{"message":"bad_manifest: x"}}' });
    const r = await makeComponentInvoker({ run, mode: 'docker' })('slicr', { plan_text: 'p' });
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('bad_manifest: x');
    expect(run.calls[0].args.slice(-2)).toEqual([DEFAULT_IMAGES.slicr, 'run-json']);
  });

  test('error envelope, missing docker, timeout and no envelope are all unavailable', async () => {
    const cases = [
      [{ status: 1, stdout: '{"schema_version":"1","status":"error","body":{"message":"boom"}}' }, /error — boom/],
      [{ error: Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' }) }, /docker not found/],
      [{ error: Object.assign(new Error('t'), { code: 'ETIMEDOUT' }) }, /timed out/],
      [{ status: 125, stdout: '', stderr: 'Unable to find image' }, /no response envelope \(Unable to find image\)/],
    ];
    for (const [res, re] of cases) {
      const r = await makeComponentInvoker({ run: recordingRun(res), mode: 'docker' })('commitward', {});
      expect(r.status).toBe('unavailable');
      expect(r.reason).toMatch(re);
    }
  });

  test('inprocess mode never calls docker; unknown components are unavailable', async () => {
    const run = recordingRun({ status: 0, stdout: '' });
    expect((await makeComponentInvoker({ run, mode: 'inprocess' })('commitward', {})).status).toBe('unavailable');
    expect((await makeComponentInvoker({ run, mode: 'docker' })('nope', {})).reason).toMatch(/unknown component/);
    expect(run.calls).toHaveLength(0);
  });

  test('image overrides come from config', async () => {
    const run = recordingRun({ status: 0, stdout: '{"status":"ok","body":{}}' });
    await makeComponentInvoker({ run, mode: 'docker', images: { commitward: 'local/cw:dev' } })('commitward', {});
    expect(run.calls[0].args).toContain('local/cw:dev');
  });
});
