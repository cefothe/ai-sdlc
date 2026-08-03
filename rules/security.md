---
paths:
  - "**/*.java"
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.py"
  - "**/*.go"
  - "**/*.rs"
---

# Security

## Input Validation

| Rule | Detail |
|---|---|
| boundary-only | Validate at system boundaries: user input, API responses, file uploads, URL params |
| allowlist | Validate what IS permitted, not what isn't (denylists always incomplete) |
| parameterized | Never string-interpolate SQL — prepared statements with bind parameters only |

## Secret Handling

| Rule | Detail |
|---|---|
| no-log-secrets | Never log secrets/tokens/PII — log reference IDs only |
| timing-safe | crypto.timingSafeEqual (Node), MessageDigest.isEqual (Java), hmac.compare_digest (Python) |
| secrets-manager | Secrets in Vault/AWS SM, not env vars (.env + .gitignore for local dev only) |

## Network & URL

| Rule | Detail |
|---|---|
| ssrf-prevention | Block user-controlled URLs to private IPs: 127.0.0.0/8, 10.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16 |
| path-traversal | path.resolve() then verify starts with expected base dir |

## Auth & Sessions

| Rule | Detail |
|---|---|
| cookie-flags | httpOnly + Secure + SameSite on auth cookies — all three required |
| token-lifecycle | Short-lived access (minutes), long-lived refresh with rotation |
| rate-limit | Rate limit: login, password reset, 2FA, token refresh |

## Dependencies

| Rule | Detail |
|---|---|
| pin-versions | Lockfiles enforced: npm ci / pip install --require-hashes |
| audit | npm audit / pip-audit in CI before merge |
