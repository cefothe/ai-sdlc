// A complete architecture overview (the architecture gate's happy path) for tests.
function architectureDoc() {
  return [
    '---', 'owner: platform', 'updated: 2026-11-07', '---', '', '# Architecture overview: Shop', '',
    '## System overview', 'An online shop: web storefront, order processing and payments, integrating Stripe and a warehouse API.', '',
    '## Components',
    '```mermaid', 'flowchart LR', '  Storefront -->|REST| Orders', '  Orders -->|PaymentsClient| Payments', '```',
    '- **Storefront** (`web/`): renders the catalog and cart. Exposes: HTTP pages.',
    '- **Orders** (`services/orders/`): order lifecycle — place, cancel, refund. Exposes: REST /orders.',
    '- **Payments** (`services/payments/`): charges and refunds through Stripe. Exposes: PaymentsClient.', '',
    '## Integration contracts',
    '```mermaid', 'sequenceDiagram', '  Storefront->>Orders: POST /orders', '  Orders->>Payments: charge()', '  Payments-->>Orders: ok', '```',
    '- Storefront → Orders: REST over HTTPS, contract `api/orders.openapi.yaml`',
    '- Orders → Payments: library call, contract `services/payments/client.ts`', '',
    '## Data ownership', '- Orders owns the orders and order_items tables', '- Payments owns the payments table', '',
    '## Cross-cutting concerns', 'JWT auth at the edge, OpenTelemetry tracing, config from environment, retries with backoff on every external call.', '',
    '## Deployment', 'Two containers (web, api) on Kubernetes; Postgres managed; deployed by GitHub Actions on merge to main.', '',
    '## Invariants', '- No component reads another component\'s tables', '- Every external call goes through a client with a timeout', '',
    '## Key decisions', 'Postgres as the single datastore — DEC-0001.', '',
  ].join('\n');
}

const COMPONENTS = {
  Storefront: { slug: 'storefront', paths: ['web/'] },
  Orders: { slug: 'orders', paths: ['services/orders/'] },
  Payments: { slug: 'payments', paths: ['services/payments/'] },
};

// A complete component doc (the component-doc gate's happy path).
function componentDoc(name, paths = (COMPONENTS[name] || { paths: [] }).paths) {
  return [
    '---', `component: ${name}`, 'owner: platform', 'updated: 2026-11-08', '---', '', `# Component: ${name}`, '',
    '## Responsibility', `${name} owns its slice of the shop end to end and nothing outside it; neighbours are reached only through declared contracts.`, '',
    '## Code', ...paths.map((p) => `- \`${p}\` — the ${name} module: handlers, domain types and the store adapter.`), '',
    '## Interfaces', `- \`POST /${name.toLowerCase()}\` — create; \`GET /${name.toLowerCase()}/:id\` — read. Env: \`${name.toUpperCase()}_DB_URL\`.`, '',
    '## Dependencies', 'Calls the next component only through the contract listed in the overview; Postgres through the shared driver.', '',
    '## Data', `Owns the ${name.toLowerCase()} tables (only writer); reads nothing else directly. Rows are kept for 7 years.`, '',
    '## Internal structure', '```mermaid', 'flowchart LR', '  Handler --> Service --> Repo', '```', '- Handler — HTTP; Service — rules; Repo — SQL.', '',
    '## Key flows', '```mermaid', 'sequenceDiagram', '  Client->>Handler: POST', '  Handler->>Repo: insert', '  alt conflict', '    Repo-->>Handler: 409', '  end', '```', '',
    '## Failure modes', 'DB timeouts retry twice with backoff then return 503; validation errors return 400 and are counted in a metric.', '',
    '## Decisions', '- DEC-0001 — Postgres is the only datastore, so the Repo speaks SQL directly.', '',
    '## Testing', 'Unit tests next to the code; integration tests against a Postgres container via `npm run test:int`.', '',
  ].join('\n');
}

// Writes every component doc of architectureDoc() under <root>/<base>/components/.
function writeComponentDocs(root, base = 'docs/architecture') {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(root, base, 'components');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, c] of Object.entries(COMPONENTS)) fs.writeFileSync(path.join(dir, `${c.slug}.md`), componentDoc(name));
}

// A complete feature architecture (the feature-architecture gate's happy path):
// the checkout journey across every component of architectureDoc().
function featureDoc({ feature = 'checkout', components = ['Storefront', 'Orders', 'Payments'], status = 'approved' } = {}) {
  return [
    '---', `status: ${status}`, `feature: ${feature}`, `relatedPrd: docs/prd/${feature}.md`, 'architecture: docs/architecture/overview.md',
    `components: [${components.join(', ')}]`, '---', '', `# Feature architecture: ${feature}`, '',
    '## Journey', `A shopper checks out a cart and gets a confirmed, paid order (docs/prd/${feature}.md).`, '',
    '## Components',
    '```mermaid', 'flowchart LR', '  Storefront -->|POST /orders| Orders', '  Orders -->|charge| Payments', '```',
    '- **Storefront** — collects the cart and shows the confirmation.',
    '- **Orders** — creates the order and drives the payment.',
    '- **Payments** — charges the card through Stripe.', '',
    '## Interactions',
    '```mermaid', 'sequenceDiagram', '  Storefront->>Orders: POST /orders', '  Orders->>Payments: charge()', '  alt timeout', '    Payments-->>Orders: error', '    Orders-->>Storefront: 503, retry later', '  end', '```',
    'The order is created before the charge; a charge timeout leaves it pending and the retry is idempotent on the order id.', '',
    '## Contracts',
    '- Storefront → Orders: REST over HTTPS, `api/orders.openapi.yaml`',
    '- Orders → Payments: library call, `services/payments/client.ts`', '',
    '## Data ownership', '- Orders owns the order and its status; Payments owns the payment record; Storefront owns nothing durable.', '',
    '## Quality attributes', 'Checkout p95 under 800 ms end to end (Orders 200 ms, Payments 500 ms); Payments down → orders stay pending, never lost.', '',
    '## Decisions', '- DEC-0001 — Postgres is the single datastore.', '',
  ].join('\n');
}

// Writes featureDoc() under <root>/<base>/features/<feature>.md.
function writeFeatureDoc(root, opts = {}, base = 'docs/architecture') {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(root, base, 'features');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${opts.feature || 'checkout'}.md`), featureDoc(opts));
}

module.exports = { architectureDoc, componentDoc, writeComponentDocs, featureDoc, writeFeatureDoc };
