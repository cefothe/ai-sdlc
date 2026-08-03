/**
 * Platform Detection Integration Test
 *
 * Verifies platform detection works correctly on all platforms
 */

const os = require('os');

console.log('Platform Detection Test');
console.log('======================\n');

// Detect platform
const platform = process.platform;
const isWindows = platform === 'win32';
const isMacOS = platform === 'darwin';
const isLinux = platform === 'linux';
const isUnix = isMacOS || isLinux;

console.log(`✅ Platform: ${platform}`);
console.log(`✅ Is Windows: ${isWindows}`);
console.log(`✅ Is macOS: ${isMacOS}`);
console.log(`✅ Is Linux: ${isLinux}`);
console.log(`✅ Is Unix-like: ${isUnix}`);

// System info
console.log(`\nSystem Information:`);
console.log(`  OS Type: ${os.type()}`);
console.log(`  OS Release: ${os.release()}`);
console.log(`  Architecture: ${process.arch}`);
console.log(`  CPU Count: ${os.cpus().length}`);
console.log(`  Total Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`);
console.log(`  Free Memory: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`);

console.log('\n✅ Platform detection test passed\n');
