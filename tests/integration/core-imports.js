/**
 * Core Module Import Test
 *
 * Verifies all Node.js core modules can be imported
 */

console.log('Core Module Import Test');
console.log('======================\n');

const modules = [
  'fs',
  'path',
  'os',
  'util',
  'crypto',
  'stream',
  'events',
  'child_process',
  'readline',
  'assert'
];

let passed = 0;
let failed = 0;

for (const moduleName of modules) {
  try {
    const mod = require(moduleName);
    if (mod) {
      console.log(`✅ ${moduleName}: imported successfully`);
      passed++;
    } else {
      console.error(`❌ ${moduleName}: imported but returned falsy value`);
      failed++;
    }
  } catch (error) {
    console.error(`❌ ${moduleName}: failed to import - ${error.message}`);
    failed++;
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}

console.log('✅ Core module import test passed\n');
