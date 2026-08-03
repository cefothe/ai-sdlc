# Datetime

## Get current datetime in ISO 8601 UTC

```bash
date -u +"%Y-%m-%dT%H:%M:%SZ"
```

Always use real system time for `created` and `updated` fields. Never use placeholders.
