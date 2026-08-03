const fs = require('fs').promises;
const path = require('path');
const yaml = require('./yaml');

/**
 * Load promises_offered from an agent's frontmatter.
 * Returns [] if file missing, no frontmatter, or no promises_offered.
 *
 * @param {string} agentType - agent name (filename without .md)
 * @param {string} agentsDir - directory containing agent .md files (default: 'agents')
 * @returns {Promise<Array>} array of promise objects
 */
async function loadAgentPromises(agentType, agentsDir = 'agents') {
  if (!agentType) return [];

  const agentFile = path.join(agentsDir, `${agentType}.md`);

  let content;
  try {
    content = await fs.readFile(agentFile, 'utf8');
  } catch (_) {
    return [];
  }

  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return [];

  let parsed;
  try {
    parsed = yaml.load(match[1]);
  } catch (_) {
    return [];
  }

  if (!parsed || !Array.isArray(parsed.promises_offered)) return [];

  return parsed.promises_offered;
}

module.exports = { loadAgentPromises };
