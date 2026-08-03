const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function loadScenario(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return yaml.load(content);
}

function validateScenario(scenario) {
  if (!scenario.name) {
    throw new Error('Scenario missing required field: name');
  }
  if (!scenario.workspace_setup) {
    throw new Error('Scenario missing required field: workspace_setup');
  }
  if (!Array.isArray(scenario.turns) || scenario.turns.length === 0) {
    throw new Error('Scenario missing required field: turns (must be non-empty array)');
  }
  for (let i = 0; i < scenario.turns.length; i++) {
    const turn = scenario.turns[i];
    if (!turn.message || typeof turn.message !== 'string' || turn.message.trim() === '') {
      throw new Error(`Turn ${i} missing required field: message`);
    }
    if (!Array.isArray(turn.checkpoint)) {
      turn.checkpoint = [];
    }
  }
}

function loadAllScenarios(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  if (files.length === 0) {
    throw new Error(`No scenario files found in ${dir}`);
  }
  return files.map(f => {
    const scenario = loadScenario(path.join(dir, f));
    validateScenario(scenario);
    return scenario;
  });
}

module.exports = { loadScenario, validateScenario, loadAllScenarios };
