#!/usr/bin/env node
// Schema-lint + $ref-integrity + instance-envelope validation for ai-sdlc
// declarative resources. Dependency-light on purpose: uses only js-yaml (an
// existing dependency) and Node core, so it runs without an npm install of a
// full JSON Schema engine. It is NOT a complete draft-2020-12 validator; it
// enforces the invariants that actually drift in practice:
//   1. every *.schema.json is well-formed and carries $schema/$id/title
//   2. every "$ref" resolves to an existing sibling file and, for
//      "file#/$defs/X" refs, that the $defs anchor exists in the target
//   3. every .ai-sdlc/*.yaml instance with apiVersion+kind matches a known
//      schema kind and carries that schema's required top-level properties
//
// Full JSON Schema validation is available by adding ajv + ajv-formats and
// pointing it at spec/schemas/; this script covers the no-dep baseline.

const { readdirSync, readFileSync, existsSync, statSync } = require('node:fs');
const { join } = require('node:path');
const yaml = require('js-yaml');

const SCHEMA_DIR = join(__dirname, 'schemas');

// Map resource `kind` -> schema filename. Instances are matched by kind.
const KIND_TO_SCHEMA = {
  Pipeline: 'pipeline.schema.json',
  Decision: 'decision.v1.schema.json',
  AgentRole: 'agent-role.schema.json',
  QualityGate: 'quality-gate.schema.json',
  AutonomyPolicy: 'autonomy-policy.schema.json',
  AdapterBinding: 'adapter-binding.schema.json',
  DorConfig: 'dor-config.v1.schema.json',
  DodConfig: 'dod-config.v1.schema.json',
  Workspace: 'workspace.v1.schema.json',
  WorktreePool: 'worktree-pool.schema.json',
  CapabilityMap: 'capability-map.v1.schema.json',
};

function loadJson(path) {
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (err) {
    return { error: `invalid JSON: ${err.message}` };
  }
}

function collectRefs(node, acc) {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, acc);
  } else if (node && typeof node === 'object') {
    for (const [key, val] of Object.entries(node)) {
      if (key === '$ref' && typeof val === 'string') acc.push(val);
      else collectRefs(val, acc);
    }
  }
  return acc;
}

function anchorExists(schema, pointer) {
  // pointer like "/$defs/metadata"
  const parts = pointer.split('/').filter(Boolean);
  let cur = schema;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
    else return false;
  }
  return true;
}

// Validate the schema files themselves. Returns { schemas, errors }.
function lintSchemas(schemaDir = SCHEMA_DIR) {
  const errors = [];
  const schemas = {};
  if (!existsSync(schemaDir)) {
    return { schemas, errors: [`schema dir not found: ${schemaDir}`] };
  }
  const files = readdirSync(schemaDir).filter((f) => f.endsWith('.schema.json'));
  if (files.length === 0) errors.push(`no *.schema.json files in ${schemaDir}`);

  for (const file of files) {
    const { value, error } = loadJson(join(schemaDir, file));
    if (error) {
      errors.push(`${file}: ${error}`);
      continue;
    }
    schemas[file] = value;
    for (const field of ['$schema', '$id', 'title']) {
      if (!value[field]) errors.push(`${file}: missing "${field}"`);
    }
  }

  // $ref integrity across the loaded set.
  for (const [file, schema] of Object.entries(schemas)) {
    for (const ref of collectRefs(schema, [])) {
      if (ref.startsWith('#')) {
        if (!anchorExists(schema, ref.slice(1))) {
          errors.push(`${file}: local $ref "${ref}" does not resolve`);
        }
        continue;
      }
      const [targetFile, fragment] = ref.split('#');
      if (!schemas[targetFile]) {
        errors.push(`${file}: $ref target file "${targetFile}" not found in schema set`);
        continue;
      }
      if (fragment && !anchorExists(schemas[targetFile], fragment)) {
        errors.push(`${file}: $ref "${ref}" -> missing anchor in ${targetFile}`);
      }
    }
  }
  return { schemas, errors };
}

// Validate .ai-sdlc/*.yaml resource instances (envelope-level). Returns errors[].
function validateInstances(configDir, schemas) {
  const errors = [];
  if (!configDir || !existsSync(configDir)) return errors;
  const files = readdirSync(configDir).filter(
    (f) => (f.endsWith('.yaml') || f.endsWith('.yml')) && statSync(join(configDir, f)).isFile(),
  );
  for (const file of files) {
    let doc;
    try {
      doc = yaml.load(readFileSync(join(configDir, file), 'utf8'));
    } catch (err) {
      errors.push(`${file}: invalid YAML: ${err.message}`);
      continue;
    }
    if (!doc || typeof doc !== 'object' || !doc.kind || !doc.apiVersion) continue; // not a resource
    const schemaFile = KIND_TO_SCHEMA[doc.kind];
    if (!schemaFile) {
      errors.push(`${file}: unknown resource kind "${doc.kind}"`);
      continue;
    }
    const schema = schemas[schemaFile];
    if (!schema) {
      errors.push(`${file}: schema ${schemaFile} for kind ${doc.kind} not loaded`);
      continue;
    }
    if (doc.apiVersion !== 'ai-sdlc.io/v1alpha1') {
      errors.push(`${file}: apiVersion "${doc.apiVersion}" != "ai-sdlc.io/v1alpha1"`);
    }
    for (const req of schema.required || []) {
      if (!(req in doc)) errors.push(`${file}: missing required top-level "${req}" for kind ${doc.kind}`);
    }
  }
  return errors;
}

function run({ schemaDir = SCHEMA_DIR, configDir } = {}) {
  const { schemas, errors } = lintSchemas(schemaDir);
  const instanceErrors = validateInstances(configDir, schemas);
  return { ok: errors.length === 0 && instanceErrors.length === 0, schemas, errors, instanceErrors };
}

module.exports = { lintSchemas, validateInstances, run, SCHEMA_DIR, KIND_TO_SCHEMA };

// CLI entry
if (require.main === module) {
  const configDir = process.argv[2] || join(__dirname, '..', '.ai-sdlc');
  const result = run({ configDir });
  const schemaCount = Object.keys(result.schemas).length;
  const all = [...result.errors, ...result.instanceErrors];
  if (result.ok) {
    console.log(`ai-sdlc schema validation PASSED: ${schemaCount} schemas linted, $ref integrity OK, instances in ${configDir} conform.`);
    process.exit(0);
  } else {
    console.error(`ai-sdlc schema validation FAILED (${all.length} problem(s), ${schemaCount} schemas checked):`);
    for (const e of all) console.error(`  - ${e}`);
    process.exit(1);
  }
}
