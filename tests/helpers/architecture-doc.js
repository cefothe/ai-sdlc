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

module.exports = { architectureDoc, componentDoc, writeComponentDocs };
