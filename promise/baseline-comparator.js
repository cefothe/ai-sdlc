const fs = require('fs').promises;
const path = require('path');

const HEALTH_KEYS = ['composite', 'dead_code', 'conventions', 'modularity', 'complexity'];
const ARCHITECTURE_KEYS = ['boundary_violations', 'circular_deps', 'modules'];
const RISKS_KEYS = ['high_risk_count'];

function computeSectionDeltas(beforeSection, afterSection, keys, formatter) {
  const deltas = {};
  for (const key of keys) {
    if (key in afterSection) {
      if (key in beforeSection) {
        deltas[key] = formatter(afterSection[key] - beforeSection[key]);
      } else {
        deltas[key] = null;
      }
    }
  }
  return deltas;
}

function computeDeltas(before, after) {
  if (before === null || before === undefined || after === null || after === undefined) {
    return null;
  }

  const toFixed2 = (v) => v.toFixed(2);
  const toInt = (v) => Math.round(v);

  return {
    health: computeSectionDeltas(
      before.health || {}, after.health || {}, HEALTH_KEYS, toFixed2
    ),
    architecture: computeSectionDeltas(
      before.architecture || {}, after.architecture || {}, ARCHITECTURE_KEYS, toInt
    ),
    risks: computeSectionDeltas(
      before.risks || {}, after.risks || {}, RISKS_KEYS, toInt
    ),
  };
}

function isZero(value) {
  if (value === null) return false;
  if (typeof value === 'string') return parseFloat(value) === 0;
  return value === 0;
}

function formatDeltaReport(deltas) {
  if (deltas === null || deltas === undefined) {
    return '';
  }

  const parts = [];
  for (const section of Object.keys(deltas)) {
    for (const key of Object.keys(deltas[section])) {
      const value = deltas[section][key];
      if (value === null) continue;
      if (isZero(value)) continue;

      const numValue = typeof value === 'string' ? parseFloat(value) : value;
      const sign = numValue > 0 ? '+' : '';
      parts.push(`${section}.${key}: ${sign}${value}`);
    }
  }
  return parts.join('; ');
}

async function loadBaseline(logDir, sessionId) {
  const filePath = path.join(logDir, 'baselines', `${sessionId}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function saveBaseline(logDir, sessionId, baseline) {
  const baselinesDir = path.join(logDir, 'baselines');
  await fs.mkdir(baselinesDir, { recursive: true });
  const filePath = path.join(baselinesDir, `${sessionId}.json`);
  await fs.writeFile(filePath, JSON.stringify(baseline, null, 2), 'utf8');
}

module.exports = { computeDeltas, formatDeltaReport, loadBaseline, saveBaseline };
