const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

describe('transform-protocol.js', () => {
  let tmpDir;
  const scriptPath = path.resolve(__dirname, '../../../scripts/transform-protocol.js');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'protocol-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('extracts MUST patterns as positive promises', () => {
    const input = `name: test-protocol\nrules:\n  - agent MUST write tests\n  - agent MUST handle errors`;
    const inputFile = path.join(tmpDir, 'test.yaml');
    fs.writeFileSync(inputFile, input, 'utf8');
    execSync(`node ${scriptPath} ${inputFile}`);
    const output = fs.readFileSync(inputFile.replace('.yaml', '.promise.yaml'), 'utf8');
    expect(output).toContain('I will write tests');
    expect(output).toContain('I will handle errors');
    expect(output).toContain('direction: +b');
  });

  test('extracts NEVER patterns as negative promises', () => {
    const input = `name: test-protocol\nrules:\n  - agent NEVER use mocks`;
    const inputFile = path.join(tmpDir, 'test.yaml');
    fs.writeFileSync(inputFile, input, 'utf8');
    execSync(`node ${scriptPath} ${inputFile}`);
    const output = fs.readFileSync(inputFile.replace('.yaml', '.promise.yaml'), 'utf8');
    expect(output).toContain('I will not use mocks');
  });

  test('handles protocol with no MUST/NEVER patterns', () => {
    const input = `name: empty-protocol\ndescription: no obligations here`;
    const inputFile = path.join(tmpDir, 'empty.yaml');
    fs.writeFileSync(inputFile, input, 'utf8');
    execSync(`node ${scriptPath} ${inputFile}`);
    const output = fs.readFileSync(inputFile.replace('.yaml', '.promise.yaml'), 'utf8');
    expect(output).toContain('promises:');
    expect(output).toContain('acceptance:');
  });

  test('caps at 5 MUST and 3 NEVER patterns', () => {
    const musts = Array.from({ length: 8 }, (_, i) => `  - agent MUST do thing ${i}`).join('\n');
    const nevers = Array.from({ length: 5 }, (_, i) => `  - agent NEVER do bad ${i}`).join('\n');
    const input = `name: big\nrules:\n${musts}\n${nevers}`;
    const inputFile = path.join(tmpDir, 'big.yaml');
    fs.writeFileSync(inputFile, input, 'utf8');
    execSync(`node ${scriptPath} ${inputFile}`);
    const output = fs.readFileSync(inputFile.replace('.yaml', '.promise.yaml'), 'utf8');
    const idMatches = output.match(/id: big-\d+/g);
    expect(idMatches.length).toBe(8); // 5 MUST + 3 NEVER
  });

  test('escapes double quotes in declarations', () => {
    const input = `name: quote-test\nrules:\n  - agent MUST handle "special" cases`;
    const inputFile = path.join(tmpDir, 'quote.yaml');
    fs.writeFileSync(inputFile, input, 'utf8');
    execSync(`node ${scriptPath} ${inputFile}`);
    const output = fs.readFileSync(inputFile.replace('.yaml', '.promise.yaml'), 'utf8');
    expect(output).not.toContain('"special"'); // should be escaped
  });

  test('is idempotent — skips if .promise.yaml already exists', () => {
    const input = `name: idem\nrules:\n  - agent MUST be stable`;
    const inputFile = path.join(tmpDir, 'idem.yaml');
    const outputFile = inputFile.replace('.yaml', '.promise.yaml');
    fs.writeFileSync(inputFile, input, 'utf8');
    execSync(`node ${scriptPath} ${inputFile}`);
    const firstOutput = fs.readFileSync(outputFile, 'utf8');
    execSync(`node ${scriptPath} ${inputFile}`);
    const secondOutput = fs.readFileSync(outputFile, 'utf8');
    expect(firstOutput).toBe(secondOutput);
  });
});
