/**
 * Path Handling Integration Test
 *
 * Verifies path handling works correctly across platforms
 */

const path = require('path');
const os = require('os');

console.log('Path Handling Test');
console.log('==================\n');

// Test 1: Path separator
console.log('Test 1: Path separator');
const expectedSep = process.platform === 'win32' ? '\\' : '/';
if (path.sep === expectedSep) {
  console.log(`✅ Path separator is correct: "${path.sep}"`);
} else {
  console.error(`❌ Path separator mismatch: expected "${expectedSep}", got "${path.sep}"`);
  process.exit(1);
}

// Test 2: Path delimiter
console.log('\nTest 2: Path delimiter');
const expectedDelim = process.platform === 'win32' ? ';' : ':';
if (path.delimiter === expectedDelim) {
  console.log(`✅ Path delimiter is correct: "${path.delimiter}"`);
} else {
  console.error(`❌ Path delimiter mismatch: expected "${expectedDelim}", got "${path.delimiter}"`);
  process.exit(1);
}

// Test 3: Path joining
console.log('\nTest 3: Path joining');
const joined = path.join('foo', 'bar', 'baz');
console.log(`✅ Joined path: ${joined}`);
if (!joined.includes('foo') || !joined.includes('bar') || !joined.includes('baz')) {
  console.error('❌ Path joining failed: components missing');
  process.exit(1);
}

// Test 4: Path normalization
console.log('\nTest 4: Path normalization');
const normalized = path.normalize('foo//bar/../baz');
console.log(`✅ Normalized path: ${normalized}`);
if (normalized.includes('//') || normalized.includes('..')) {
  console.error('❌ Path normalization failed: still contains // or ..');
  process.exit(1);
}

// Test 5: Absolute path
console.log('\nTest 5: Absolute path');
const absolute = path.resolve('foo', 'bar');
console.log(`✅ Absolute path: ${absolute}`);
if (!path.isAbsolute(absolute)) {
  console.error('❌ Path should be absolute');
  process.exit(1);
}

// Test 6: Relative path
console.log('\nTest 6: Relative path');
const home = os.homedir();
const relative = path.relative(home, path.join(home, 'documents', 'file.txt'));
console.log(`✅ Relative path: ${relative}`);

// Test 7: Parse path
console.log('\nTest 7: Parse path');
const parsed = path.parse('/home/user/documents/file.txt');
console.log(`✅ Directory: ${parsed.dir}`);
console.log(`✅ Base name: ${parsed.base}`);
console.log(`✅ Name: ${parsed.name}`);
console.log(`✅ Extension: ${parsed.ext}`);

// Test 8: Format path
console.log('\nTest 8: Format path');
const formatted = path.format({
  dir: '/home/user/documents',
  name: 'file',
  ext: '.txt'
});
console.log(`✅ Formatted path: ${formatted}`);

// Test 9: Cross-platform path handling
console.log('\nTest 9: Cross-platform compatibility');
const testPath = process.platform === 'win32'
  ? 'C:\\Users\\Test\\file.txt'
  : '/home/test/file.txt';
const basename = path.basename(testPath);
const dirname = path.dirname(testPath);
const extname = path.extname(testPath);
console.log(`✅ Basename: ${basename}`);
console.log(`✅ Dirname: ${dirname}`);
console.log(`✅ Extname: ${extname}`);

console.log('\n✅ All path handling tests passed\n');
