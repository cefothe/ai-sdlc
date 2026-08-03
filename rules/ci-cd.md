---
paths:
  - "**/.github/**"
  - "**/.gitlab-ci*"
  - "**/Jenkinsfile*"
  - "**/.circleci/**"
  - "**/bitbucket-pipelines*"
---

# CI/CD

## Security

| Rule | Detail |
|---|---|
| pin-sha | uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 not @v4 (tags mutable) |
| permissions | permissions: contents: read at workflow level — override per-job only where needed |
| no-log-secrets | Use ::add-mask::$SECRET for derived values — never echo ${{ secrets.TOKEN }} |
| github-token | Restrict via permissions block — default has write access to repo |
| no-plaintext | Use GitHub Secrets/OIDC/env-level secrets — never hardcode API keys |

## Reliability

| Rule | Detail |
|---|---|
| timeout | timeout-minutes: 15 on every job (default 360 burns 6h on hang) |
| concurrency | concurrency: { group: deploy-${{ github.ref }}, cancel-in-progress: false } for deployments |
| cache-keys | key: deps-${{ hashFiles('**/package-lock.json') }} — include lockfile hash |
| fail-fast | Set fail-fast: false for cross-platform testing (default cancels on first failure) |
| retry | Retry network-dependent steps (npm install, docker pull, API calls) |

## Design

| Rule | Detail |
|---|---|
| build-once | Build artifacts once, promote across environments (no per-env rebuild) |
| env-protection | Production deployments require approval — use GitHub Environments |
| retention | Set explicit retention-days (default 90 burns storage on matrix builds) |
| ci-vs-cd | CI on every push, CD only on specific branches/tags with explicit triggers |
