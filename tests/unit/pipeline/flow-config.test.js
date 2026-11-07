const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { loadFlowConfig, DEFAULTS } = require(path.join(ROOT, 'pipeline', 'flow-config.js'));
const stubs = require(path.join(ROOT, 'init', 'config-stubs.js'));

function withFlow(text, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-cfg-'));
  try {
    if (text !== null) {
      fs.mkdirSync(path.join(root, '.ai-sdlc'));
      fs.writeFileSync(path.join(root, '.ai-sdlc', 'flow.yaml'), text);
    }
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe('loadFlowConfig', () => {
  test('no file → defaults', () => {
    withFlow(null, (root) => expect(loadFlowConfig(root)).toEqual(DEFAULTS));
  });

  test('a partial file deep-merges over the defaults', () => {
    withFlow('sandbox:\n  mode: cordon\n  cordonRun: /opt/cordon/bin/cordon-run.sh\nmanifest:\n  nodeRetries: 4\n', (root) => {
      const cfg = loadFlowConfig(root);
      expect(cfg.sandbox).toEqual({ mode: 'cordon', cordonRun: '/opt/cordon/bin/cordon-run.sh', image: '' });
      expect(cfg.manifest).toEqual({ enabled: true, nodeRetries: 4, acceptTimeoutSec: 300 });
      expect(cfg.hitl.enabled).toBe(true);
    });
  });

  test('a non-mapping file is an error', () => {
    withFlow('- a\n- b\n', (root) => expect(() => loadFlowConfig(root)).toThrow(/must be a mapping/));
  });

  test('the init stub parses to exactly the defaults', () => {
    withFlow(stubs.flowConfig(), (root) => {
      const { version, ...cfg } = loadFlowConfig(root);
      expect(version).toBe('1');
      expect(cfg).toEqual(DEFAULTS);
    });
  });
});
