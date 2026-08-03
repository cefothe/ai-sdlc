/**
 * File Operations Integration Test
 *
 * Tests basic file operations work correctly on all platforms
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('File Operations Test');
console.log('===================\n');

// Create temp directory for tests
const testDir = path.join(os.tmpdir(), `claude-test-${Date.now()}`);
const testFile = path.join(testDir, 'test.txt');

try {
  // Test 1: Create directory
  console.log('Test 1: Creating directory...');
  fs.mkdirSync(testDir, { recursive: true });
  console.log(`✅ Directory created: ${testDir}`);

  // Test 2: Write file
  console.log('\nTest 2: Writing file...');
  const content = 'Hello from cross-platform Node.js!\n';
  fs.writeFileSync(testFile, content, 'utf8');
  console.log(`✅ File written: ${testFile}`);

  // Test 3: Read file
  console.log('\nTest 3: Reading file...');
  const readContent = fs.readFileSync(testFile, 'utf8');
  if (readContent === content) {
    console.log('✅ File read successfully with correct content');
  } else {
    throw new Error(`Content mismatch: expected "${content}", got "${readContent}"`);
  }

  // Test 4: File exists
  console.log('\nTest 4: Checking file existence...');
  if (fs.existsSync(testFile)) {
    console.log('✅ File exists check passed');
  } else {
    throw new Error('File should exist but does not');
  }

  // Test 5: Get file stats
  console.log('\nTest 5: Getting file stats...');
  const stats = fs.statSync(testFile);
  console.log(`✅ File size: ${stats.size} bytes`);
  console.log(`✅ Is file: ${stats.isFile()}`);
  console.log(`✅ Is directory: ${stats.isDirectory()}`);

  // Test 6: Delete file
  console.log('\nTest 6: Deleting file...');
  fs.unlinkSync(testFile);
  console.log('✅ File deleted');

  // Test 7: Delete directory
  console.log('\nTest 7: Deleting directory...');
  fs.rmdirSync(testDir);
  console.log('✅ Directory deleted');

  console.log('\n✅ All file operations tests passed\n');
} catch (error) {
  console.error(`\n❌ File operations test failed: ${error.message}\n`);

  // Cleanup on error
  try {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
  } catch (cleanupError) {
    console.error(`Cleanup error: ${cleanupError.message}`);
  }

  process.exit(1);
}
