// A complete, confirmed bug report (the bug-gate's happy path) for tests.
function bugReport({ status = 'confirmed', severity = 'major', relatedPrd = '', repro = 'Add a test asserting a second cancel is rejected; run `npx jest tests/orders/cancel.test.js -t "double cancel"`.' } = {}) {
  return [
    '---', `status: ${status}`, 'bugId: order-double-cancel', `severity: ${severity}`, 'source: https://github.com/o/r/issues/7',
    ...(relatedPrd ? [`relatedPrd: ${relatedPrd}`] : []), '---', '', '# Bug: cancelling twice refunds twice', '',
    '## Summary', 'Cancelling an already-cancelled order issues a second refund since v2.3.', '',
    '## Environment', 'Production, v2.3.1, Postgres 16, orders service.', '',
    '## Steps to reproduce', '1. Place an order and pay', '2. Cancel the order', '3. Cancel it again via the API', '',
    '## Expected behavior', 'The second cancel is rejected with 409 and no refund is issued (PRD AC3).', '',
    '## Actual behavior', 'The second cancel returns 200 and a second refund is created.', '',
    '## Impact', 'Every double-submitted cancel loses the order value; ~40 cases per week.', '',
    '## Reproduction', repro, '',
    '## Suspected cause', 'OrderService.cancel does not check the current status before refunding.', '',
  ].join('\n');
}

module.exports = { bugReport };
