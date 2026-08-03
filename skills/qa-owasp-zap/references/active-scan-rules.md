# Active Scan Policy — API-Specific Rules

When generating the ZAP plan for `full` scan, configure the active scan to focus on API-relevant checks. Browser-specific checks are disabled because this is a REST API scan, not a web application crawl.

## ENABLE (API-relevant)

| Rule IDs | Name | Strength | Rationale |
|----------|------|----------|-----------|
| 40018, 40019, 40020, 40021, 40022 | SQL Injection | INSANE | Most critical API vulnerability |
| 90020 | OS Command Injection | INSANE | Remote code execution risk |
| 40046 | Server Side Request Forgery | INSANE | Internal network access risk |
| 7 | Remote File Inclusion | HIGH | File system access risk |
| 6 | Path Traversal | HIGH | Directory traversal risk |
| 40008, 40009 | Parameter Tampering | HIGH | Input validation bypass |
| 90023 | XML External Entity | HIGH | XXE injection risk |
| 40012, 40014, 40016, 40017 | Cross-Site Scripting - Reflected | HIGH | XSS via API responses |
| 90035 | Server Side Template Injection | HIGH | Template engine exploitation |
| 40043 | Log4Shell | INSANE | Critical Java RCE vulnerability |

## DISABLE (browser-specific, not relevant for API-only)

| Rule ID | Name | Reason |
|---------|------|--------|
| 40026 | DOM XSS | Browser-only, no DOM in API responses |
| (CSRF rules) | CSRF | Not relevant for stateless REST APIs with token auth |
| (Client redirect rules) | Client-side redirects | Browser-only behavior |
| (Cookie rules) | Cookie-related checks | Stateless API does not use cookies for auth |

## Authentication Configuration

If `config.auth` is defined, a `replacer` job is added to the ZAP plan that injects the auth header on every outgoing request. The ZAP Automation Framework does not support `authentication: method: "header"` in the context block — the replacer job is the correct approach.

The token placeholder `{{ZAP_AUTH_TOKEN}}` is written into the plan YAML. At runtime, `run-zap-scan.sh` substitutes the real token via `sed` just before Docker starts, so the token is only on disk while the scan runs.

**For `bearer` type:**
```yaml
- type: replacer
  parameters:
    deleteAllRules: true
  rules:
    - description: "Add Bearer Auth Header"
      matchType: "REQ_HEADER"
      matchRegex: false
      matchString: "Authorization"
      replacementString: "Bearer {{ZAP_AUTH_TOKEN}}"
      initiators: []
```

**For `apikey` type (no Bearer prefix):**
```yaml
- type: replacer
  parameters:
    deleteAllRules: true
  rules:
    - description: "Add Apikey Auth Header"
      matchType: "REQ_HEADER"
      matchRegex: false
      matchString: "Authorization"
      replacementString: "{{ZAP_AUTH_TOKEN}}"
      initiators: []
```
