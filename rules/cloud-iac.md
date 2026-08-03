---
paths:
  - "**/*.tf"
  - "**/*.tfvars"
  - "**/terraform/**"
  - "**/ansible/**"
  - "**/*.yml"
  - "**/playbooks/**"
  - "**/roles/**"
  - "**/cloudformation/**"
  - "**/*.template"
  - "**/pulumi/**"
  - "**/cdk/**"
---

# Cloud & Infrastructure as Code

## Terraform — State Safety

| Rule | Detail |
|---|---|
| remote-only | S3+DynamoDB or GCS+Cloud Storage with locking (local state drifts and lacks locking) |
| encrypt | State contains secrets in plaintext — encrypt at rest (S3 SSE, GCS CMEK) |
| no-manual-edit | Use terraform state mv/rm/import — manual edits corrupt checksums |

## Terraform — Resource Protection

| Rule | Detail |
|---|---|
| prevent-destroy | lifecycle { prevent_destroy = true } on databases, buckets, keys, DNS zones |
| plan-file | Plan before apply: terraform plan -out=tfplan then terraform apply tfplan |
| import-existing | terraform import before managing — prevents duplicate creation |

## Terraform — Module Design

| Rule | Detail |
|---|---|
| pin-versions | source = "git::...?ref=v1.2.3" or registry version (unpinned pulls latest) |
| no-creds | Use IAM roles/OIDC/data sources — no credentials in tfvars or state |
| outputs | Every value needed elsewhere must be explicit output (not hardcoded IDs) |

## Terraform — Common Pitfalls

| Rule | Detail |
|---|---|
| for_each-not-count | Use for_each with maps/sets (count uses index — removing item 2 of 5 recreates 3-5) |
| sensitive-flag | Mark secrets with sensitive = true (prevents plan output in CI logs) |
| provider-pinning | required_providers with exact constraints (upgrades change behavior) |

## Ansible — Idempotency

| Rule | Detail |
|---|---|
| idempotent-tasks | Use purpose-built modules over command/shell (apt not apt-get) |
| guard-commands | command/shell need creates or when guards (or re-run every time) |
| handlers | Use notify + handlers for restarts (never restart in task — runs every playbook run) |

## Ansible — Security

| Rule | Detail |
|---|---|
| vault | ansible-vault encrypt for sensitive vars — vault password via --vault-password-file |
| no_log | no_log: true on tasks with secrets (Ansible logs full output by default) |
| limit | Use --limit and --check for production (unscoped runs all hosts) |

## Ansible — Best Practices

| Rule | Detail |
|---|---|
| roles | Roles over monolithic playbooks (reusable, testable, self-contained) |
| tags | Tag tasks for partial runs: --tags deploy or --skip-tags database |
| molecule | Test roles with Molecule + Docker before real infrastructure |

## Cloud General

| Rule | Detail |
|---|---|
| tag-everything | environment, team/owner, service, managed-by (untagged = orphans) |
| least-privilege | Zero permissions + add needed — no * actions/resources — use access-analyzer |
| multi-az | Stateful services span 2+ AZs (single-AZ fails on AZ outage) |
| deletion-protection | RDS protection, S3 versioning+MFA delete, GCP deletion_protection |
| cost-alerts | Billing alerts at 50%, 80%, 100% of expected spend |
