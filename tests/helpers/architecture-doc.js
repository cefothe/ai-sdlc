// A complete architecture overview (the architecture gate's happy path) for tests.
function architectureDoc() {
  return [
    '---', 'owner: platform', 'updated: 2026-11-07', '---', '', '# Architecture overview: Shop', '',
    '## System overview', 'An online shop: web storefront, order processing and payments, integrating Stripe and a warehouse API.', '',
    '## Components',
    '- **Storefront** (`web/`): renders the catalog and cart. Exposes: HTTP pages.',
    '- **Orders** (`services/orders/`): order lifecycle — place, cancel, refund. Exposes: REST /orders.',
    '- **Payments** (`services/payments/`): charges and refunds through Stripe. Exposes: PaymentsClient.', '',
    '## Integration contracts',
    '- Storefront → Orders: REST over HTTPS, contract `api/orders.openapi.yaml`',
    '- Orders → Payments: library call, contract `services/payments/client.ts`', '',
    '## Data ownership', '- Orders owns the orders and order_items tables', '- Payments owns the payments table', '',
    '## Cross-cutting concerns', 'JWT auth at the edge, OpenTelemetry tracing, config from environment, retries with backoff on every external call.', '',
    '## Deployment', 'Two containers (web, api) on Kubernetes; Postgres managed; deployed by GitHub Actions on merge to main.', '',
    '## Invariants', '- No component reads another component\'s tables', '- Every external call goes through a client with a timeout', '',
    '## Key decisions', 'Postgres as the single datastore — DEC-0001.', '',
  ].join('\n');
}

module.exports = { architectureDoc };
