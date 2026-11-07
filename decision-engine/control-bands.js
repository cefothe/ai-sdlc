// Control bands — deterministic anomaly detection for the maintain loop. No
// model decides whether something is wrong: a rolling baseline (mean, standard
// deviation over a window) and the Western Electric rules classify the latest
// observations into a level, and only the level decides what an agent may do.
//
//   level 3  rule 1: one point beyond 3σ
//   level 2  rule 2: 2 of 3 consecutive points beyond 2σ on the same side
//   level 1  rule 3: 4 of 5 beyond 1σ on the same side, or
//            rule 4: 8 consecutive points on the same side of the mean
//   level 0  in control
//
// `direction` restricts which side counts: 'up' (higher is worse, e.g. failure
// rate), 'down' (lower is worse, e.g. success rate) or 'both'.

function stats(values) {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
  return { mean, sd: Math.sqrt(variance) };
}

// z-scores of the evaluated points, signed so that "worse" is positive.
function signedZ(points, mean, sd, direction) {
  return points.map((v) => {
    const z = sd > 0 ? (v - mean) / sd : 0;
    return direction === 'down' ? -z : z;
  });
}

// series: numbers, oldest first. The baseline is the `window` points before the
// last `recent` points that are evaluated.
function evaluateBand(series, { window = 30, recent = 8, direction = 'up', minBaseline = 10 } = {}) {
  const values = series.map(Number).filter(Number.isFinite);
  const evaluated = values.slice(-recent);
  const baseline = values.slice(-(recent + window), -recent);
  if (baseline.length < minBaseline) {
    return { level: 0, rules: [], reason: `insufficient baseline (${baseline.length} < ${minBaseline} points)`, mean: null, sd: null, latest: values[values.length - 1] ?? null };
  }
  const { mean, sd } = stats(baseline);
  const z = signedZ(evaluated, mean, sd, direction);
  const raw = direction === 'both' ? evaluated.map((v) => (sd > 0 ? (v - mean) / sd : 0)) : z;
  const rules = [];
  const last = raw.length - 1;
  const beyond = (val, k) => (direction === 'both' ? Math.abs(val) > k : val > k);
  const sameSide = (vals) => vals.every((v) => v > 0) || (direction === 'both' && vals.every((v) => v < 0));

  if (beyond(raw[last], 3)) rules.push('rule1: latest point beyond 3σ');
  const last3 = raw.slice(-3);
  if (last3.length === 3 && last3.filter((v) => beyond(v, 2)).length >= 2 && sameSide(last3.filter((v) => beyond(v, 2)))) rules.push('rule2: 2 of 3 beyond 2σ');
  const last5 = raw.slice(-5);
  if (last5.length === 5 && last5.filter((v) => beyond(v, 1)).length >= 4 && sameSide(last5.filter((v) => beyond(v, 1)))) rules.push('rule3: 4 of 5 beyond 1σ');
  const last8 = raw.slice(-8);
  if (last8.length === 8 && sameSide(last8)) rules.push('rule4: 8 in a row on one side');

  const level = rules.some((r) => r.startsWith('rule1')) ? 3 : rules.some((r) => r.startsWith('rule2')) ? 2 : rules.length ? 1 : 0;
  return { level, rules, mean: Number(mean.toFixed(4)), sd: Number(sd.toFixed(4)), latest: evaluated[last], z: Number((raw[last] || 0).toFixed(2)) };
}

module.exports = { evaluateBand, stats };
