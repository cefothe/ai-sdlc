const fs = require('fs');
const os = require('os');
const path = require('path');

const SPEC = path.join(__dirname, '..', '..', '..', 'spec');
const SCHEMA_DIR = path.join(SPEC, 'schemas');

const mod = require(path.join(SPEC, 'validate-schemas.js'));

describe('lintSchemas', () => {
  test('the shipped schema set lints clean with $ref integrity', () => {
    const { schemas, errors } = mod.lintSchemas(SCHEMA_DIR);
    expect(errors).toEqual([]);
    // core resources present
    for (const f of [
      'common.schema.json',
      'workspace.v1.schema.json',
      'backlog-task.v1.schema.json',
      'dor-config.v1.schema.json',
      'quality-gate.schema.json',
    ]) {
      expect(schemas[f]).toBeDefined();
    }
  });

  test('the new Workspace schema declares repos + configScope + crossRepo', () => {
    const { schemas } = mod.lintSchemas(SCHEMA_DIR);
    const ws = schemas['workspace.v1.schema.json'];
    expect(ws.properties.kind.const).toBe('Workspace');
    const spec = ws.properties.spec.properties;
    expect(spec.repos.items.required).toEqual(expect.arrayContaining(['id', 'path']));
    expect(spec.configScope.default).toBe('shared');
    expect(spec.crossRepo.properties.depGraphSpanning).toBeDefined();
  });

  test('backlog-task.v1 carries the targetRepo workspace extension', () => {
    const { schemas } = mod.lintSchemas(SCHEMA_DIR);
    const task = schemas['backlog-task.v1.schema.json'];
    expect(task.properties.targetRepo).toBeDefined();
    expect(task.properties.targetRepo.type).toBe('string');
  });

  test('reports a broken $ref target', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-bad-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'x.schema.json'),
        JSON.stringify({
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: 'urn:x',
          title: 'X',
          properties: { a: { $ref: 'nope.schema.json#/$defs/thing' } },
        }),
      );
      const { errors } = mod.lintSchemas(dir);
      expect(errors.some((e) => e.includes('not found in schema set'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('flags a schema missing $id/title', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-meta-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'y.schema.json'),
        JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema' }),
      );
      const { errors } = mod.lintSchemas(dir);
      expect(errors.some((e) => e.includes('missing "$id"'))).toBe(true);
      expect(errors.some((e) => e.includes('missing "title"'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('validateInstances', () => {
  test('accepts a well-formed Workspace instance', () => {
    const { schemas } = mod.lintSchemas(SCHEMA_DIR);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-ok-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'workspace.yaml'),
        [
          'apiVersion: ai-sdlc.io/v1alpha1',
          'kind: Workspace',
          'metadata:',
          '  name: demo',
          'spec:',
          '  configScope: shared',
          '  repos:',
          '    - id: web',
          '      path: ./web',
        ].join('\n'),
      );
      expect(mod.validateInstances(dir, schemas)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects wrong apiVersion and unknown kind', () => {
    const { schemas } = mod.lintSchemas(SCHEMA_DIR);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-bad-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'bad.yaml'),
        'apiVersion: wrong/v0\nkind: Nonsense\n',
      );
      const errors = mod.validateInstances(dir, schemas);
      expect(errors.some((e) => e.includes('unknown resource kind'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('flags a Workspace instance missing required spec', () => {
    const { schemas } = mod.lintSchemas(SCHEMA_DIR);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-missing-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'ws.yaml'),
        'apiVersion: ai-sdlc.io/v1alpha1\nkind: Workspace\nmetadata:\n  name: demo\n',
      );
      const errors = mod.validateInstances(dir, schemas);
      expect(errors.some((e) => e.includes('missing required top-level "spec"'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
