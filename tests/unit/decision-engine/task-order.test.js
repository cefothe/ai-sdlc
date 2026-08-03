const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { computeOrder, nextTask } = require(path.join(ROOT, 'decision-engine', 'task-order.js'));

function t(id, deps = [], priority = 'medium', status = 'To Do') {
  return { id, title: id, priority, status, deps, done: status.toLowerCase() === 'done' };
}

describe('computeOrder', () => {
  test('orders dependents after their dependencies', () => {
    const tasks = [t('AISDLC-0009', ['AISDLC-0006', 'AISDLC-0007']), t('AISDLC-0006', ['AISDLC-0005']), t('AISDLC-0007', ['AISDLC-0005']), t('AISDLC-0005')];
    const ids = computeOrder(tasks).order.map((x) => x.id);
    expect(ids.indexOf('AISDLC-0005')).toBeLessThan(ids.indexOf('AISDLC-0006'));
    expect(ids.indexOf('AISDLC-0006')).toBeLessThan(ids.indexOf('AISDLC-0009'));
    expect(ids.indexOf('AISDLC-0007')).toBeLessThan(ids.indexOf('AISDLC-0009'));
  });

  test('ready tasks are tie-broken by priority then id (stable)', () => {
    const tasks = [t('AISDLC-0002', [], 'high'), t('AISDLC-0004', [], 'high'), t('AISDLC-0003', [], 'low')];
    const ids = computeOrder(tasks).order.map((x) => x.id);
    expect(ids).toEqual(['AISDLC-0002', 'AISDLC-0004', 'AISDLC-0003']); // high (id asc) then low
  });

  test('reports a missing dependency without crashing', () => {
    const { missing, order } = computeOrder([t('AISDLC-0002', ['AISDLC-9999'])]);
    expect(missing).toEqual([{ task: 'AISDLC-0002', dependsOn: 'AISDLC-9999' }]);
    expect(order.map((x) => x.id)).toEqual(['AISDLC-0002']); // still ordered (missing dep ignored as an edge)
  });

  test('detects a cycle', () => {
    const { cycle } = computeOrder([t('A', ['B']), t('B', ['A'])]);
    expect(cycle.sort()).toEqual(['A', 'B']);
  });
});

describe('nextTask', () => {
  test('is the first not-Done task whose deps are all Done', () => {
    const tasks = [t('AISDLC-0005', [], 'high', 'Done'), t('AISDLC-0006', ['AISDLC-0005'], 'medium'), t('AISDLC-0008', ['AISDLC-0004', 'AISDLC-0005']), t('AISDLC-0004', [], 'high')];
    // 0004 (high, no deps, not done) comes before 0006; 0008 blocked (0004 not done)
    expect(nextTask(tasks).id).toBe('AISDLC-0004');
  });

  test('returns null when everything is Done', () => {
    expect(nextTask([t('A', [], 'high', 'Done')])).toBeNull();
  });
});
