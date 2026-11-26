## Interfaces

**Order references and tags**

| Purpose | `client_order_ref` |
|---|---|
| create (initial) | `<basket_id>:<market_id>:<attempt>` |
| top-up n | `<basket_id>:t<n>:<market_id>:<attempt>` |
| roll k | `<basket_id>:r<k>:<market_id>:<attempt>` |
| exit | `<basket_id>:x:<market_id>:<attempt>` |

`attempt` starts at 1 and advances only on a terminal rejection, never on an unknown outcome.

## Data flow

The worker sends POST /v1/orders and retries on timeout with the same ref.

## Decisions

- [DEC-0548](../../.ai-sdlc/_decisions/DEC-0548.yaml) — persist-then-send order refs; attempt never advances on an unknown outcome.
