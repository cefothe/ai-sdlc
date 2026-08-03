/**
 * Process Execution Integration Test
 *
 * Tests process execution and command running
 */

const { execSync, spawn } = require('child_process');
const os = require('os');

console.log('Process Execution Test');
console.log('=====================\n');

// Test 1: Execute simple command
console.log('Test 1: Execute simple command');
try {
  const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
  console.log(`✅ Node version: ${nodeVersion}`);
} catch (error) {
  console.error('❌ Failed to execute node --version');
  console.error(error.message);
  process.exit(1);
}

// Test 2: Execute platform-specific command
console.log('\nTest 2: Execute platform-specific command');
try {
  const command = process.platform === 'win32' ? 'echo %CD%' : 'pwd';
  const output = execSync(command, { encoding: 'utf8' }).trim();
  console.log(`✅ Current directory command executed: ${output.substring(0, 50)}...`);
} catch (error) {
  console.error('❌ Failed to execute directory command');
  console.error(error.message);
  process.exit(1);
}

// Test 3: Process info
console.log('\nTest 3: Process information');
console.log(`✅ Process ID: ${process.pid}`);
console.log(`✅ Parent PID: ${process.ppid}`);
console.log(`✅ Platform: ${process.platform}`);
console.log(`✅ Architecture: ${process.arch}`);
console.log(`✅ Node version: ${process.version}`);

// Test 4: Environment variables
console.log('\nTest 4: Environment variables');
const hasPath = 'PATH' in process.env || 'Path' in process.env;
if (hasPath) {
  console.log('✅ PATH environment variable exists');
} else {
  console.error('❌ PATH environment variable not found');
  process.exit(1);
}

// Test 5: Exit code handling
console.log('\nTest 5: Exit code handling');
try {
  // This should fail
  execSync('node -e "process.exit(1)"', { stdio: 'ignore' });
  console.error('❌ Should have thrown an error for exit code 1');
  process.exit(1);
} catch (error) {
  if (error.status === 1) {
    console.log('✅ Exit code correctly captured');
  } else {
    console.error(`❌ Unexpected exit code: ${error.status}`);
    process.exit(1);
  }
}

// Test 6: Standard output capture
console.log('\nTest 6: Standard output capture');
try {
  const output = execSync('node -e "console.log(\'test output\')"', { encoding: 'utf8' }).trim();
  if (output === 'test output') {
    console.log('✅ Standard output captured correctly');
  } else {
    console.error(`❌ Output mismatch: expected "test output", got "${output}"`);
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Failed to capture standard output');
  console.error(error.message);
  process.exit(1);
}

console.log('\n✅ All process execution tests passed\n');
