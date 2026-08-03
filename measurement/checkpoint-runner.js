const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

async function evaluateCheckpoint(checkpoint, workDir) {
  const type = checkpoint.type;
  try {
    switch (type) {
      case 'file_exists': {
        const fullPath = path.join(workDir, checkpoint.path);
        const exists = fs.existsSync(fullPath);
        return { type, passed: exists, details: exists ? 'File found' : `File not found: ${checkpoint.path}` };
      }

      case 'grep_present': {
        const fullPath = path.join(workDir, checkpoint.file);
        if (!fs.existsSync(fullPath)) {
          return { type, passed: false, details: `File not found: ${checkpoint.file}` };
        }
        const content = fs.readFileSync(fullPath, 'utf8');
        const regex = new RegExp(checkpoint.pattern);
        const found = regex.test(content);
        return { type, passed: found, details: found ? `Pattern matched: ${checkpoint.pattern}` : `Pattern not found: ${checkpoint.pattern}` };
      }

      case 'grep_absent': {
        const fullPath = path.join(workDir, checkpoint.file);
        if (!fs.existsSync(fullPath)) {
          return { type, passed: true, details: `File not found (pattern trivially absent): ${checkpoint.file}` };
        }
        const content = fs.readFileSync(fullPath, 'utf8');
        const regex = new RegExp(checkpoint.pattern);
        const found = regex.test(content);
        return { type, passed: !found, details: found ? `Pattern unexpectedly found: ${checkpoint.pattern}` : `Pattern absent as expected` };
      }

      case 'cxpak_function_exists': {
        const fullPath = path.join(workDir, checkpoint.file);
        if (!fs.existsSync(fullPath)) {
          return { type, passed: false, details: `File not found: ${checkpoint.file}` };
        }
        try {
          execFileSync('cxpak', ['trace', '--function', checkpoint.function, fullPath], { encoding: 'utf8', stdio: 'pipe' });
          return { type, passed: true, details: `Function ${checkpoint.function} found via cxpak` };
        } catch (_) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const pattern = new RegExp(`function\\s+${checkpoint.function}\\b|${checkpoint.function}\\s*[=(]`);
          const found = pattern.test(content);
          return { type, passed: found, details: found ? `Function ${checkpoint.function} found via grep fallback` : `Function ${checkpoint.function} not found` };
        }
      }

      case 'defect_check': {
        const fullPath = path.join(workDir, checkpoint.defect_file);
        if (!fs.existsSync(fullPath)) {
          return { type, passed: false, details: `Defect file not found: ${checkpoint.defect_file}` };
        }
        const content = fs.readFileSync(fullPath, 'utf8');
        const hasFixed = content.includes(checkpoint.fixed_line);
        const hasPlanted = content.includes(checkpoint.planted_line);
        if (hasFixed && !hasPlanted) {
          return { type, passed: true, details: 'Defect fixed' };
        }
        if (hasPlanted) {
          return { type, passed: false, details: 'Defect still present' };
        }
        return { type, passed: hasFixed, details: hasFixed ? 'Fixed line present' : 'Neither planted nor fixed line found' };
      }

      case 'test_passes': {
        return { type, passed: false, details: 'test_passes requires transcript parsing (not implemented in checkpoint runner)' };
      }

      default:
        return { type, passed: false, details: `Unknown checkpoint type: ${type}` };
    }
  } catch (err) {
    return { type, passed: false, details: `Error evaluating checkpoint: ${err.message}` };
  }
}

async function evaluateCheckpoints(checkpoints, workDir) {
  const results = [];
  for (const cp of checkpoints) {
    results.push(await evaluateCheckpoint(cp, workDir));
  }
  return results;
}

module.exports = { evaluateCheckpoint, evaluateCheckpoints };
