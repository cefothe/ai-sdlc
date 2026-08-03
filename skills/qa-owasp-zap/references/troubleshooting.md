# Troubleshooting

## Docker not running
```
Docker is not running or not installed
```
Start Docker Desktop or install Docker: https://docs.docker.com/get-docker/

If Docker is installed but `docker info` fails with a permission error, your user may not be in the `docker` group:
```bash
# Check group membership
groups | grep -q docker && echo "OK" || echo "Not in docker group"

# Add yourself to the docker group (requires logout/login to take effect)
sudo usermod -aG docker $USER
newgrp docker
```

## Cannot reach gateway URL
```
WARNING: Cannot reach query-gateway at https://query-gateway.tradu.fun
```
The command derives gateway URLs by prepending `query-gateway.` and `command-gateway.` to the provided domain. Ensure:
- DNS resolves for both `query-gateway.<domain>` and `command-gateway.<domain>`
- Both gateways are running and accepting connections
- For local development, add entries to `/etc/hosts` if needed

If your architecture does not use CQRS gateway subdomains, use explicit gateway URL overrides:
```bash
/qa:omnius-owasp-zap https://tradu.fun passive --query-url https://api.tradu.fun --command-url https://api.tradu.fun
```
Or set them in `.claude/.config/omnius-owasp-zap.json`:
```json
{
  "queryGatewayUrl": "https://api.tradu.fun",
  "commandGatewayUrl": "https://api.tradu.fun"
}
```

## Base URL contains a port
```
ERROR: Base URL contains a port (localhost:8080).
```
Gateway URL derivation (`query-gateway.<host>`) does not work with ports. Use explicit gateway URL overrides via `--query-url` and `--command-url` flags or the config file.

## ZAP config error (exit code 1)
Check `${OUTPUT_DIR}/zap-plan.yaml` for syntax errors. Common causes:
- Invalid YAML syntax
- Missing OpenAPI spec file (openapi-query.yaml or openapi-command.yaml)
- Invalid context configuration

## No report generated
Check `${OUTPUT_DIR}/zap-console.log` for the full ZAP output. Common causes:
- Gateway URLs unreachable from Docker container
- OpenAPI spec import failed (invalid spec format)
- Authentication failure (wrong token or expired)

## Scan takes too long
Active scans are capped at 60 minutes and 5 minutes per rule. Scanning two gateways may take longer than a single-gateway scan. Consider:
- Running `passive` first to get quick results
- Increasing `delayInMs` in config to avoid rate limiting
- Excluding non-critical endpoints via `excludePaths` in config

## Rate limiting blocks ZAP
Add rate limiting to `.claude/.config/omnius-owasp-zap.json`:
```json
{
  "rateLimit": {
    "delayInMs": 200
  }
}
```

## Using --debug to investigate issues
Add `--debug` to log every HTTP request ZAP makes:
```bash
/qa:omnius-owasp-zap https://tradu.fun passive --debug
```
This generates `zap-requests.log` in the output directory. Each entry contains:
```
2026-02-19T14:23:45Z GET https://query-gateway.tradu.fun/api/v1/users?page=1&size=10 -> 200
  Params: page=1&size=10
2026-02-19T14:23:46Z POST https://command-gateway.tradu.fun/api/v1/orders -> 201
  Body: {"symbol":"EURUSD","side":"BUY","quantity":100}
```
Use this to verify which endpoints ZAP is actually hitting, what query parameters and request bodies it sends, and what response codes it receives. The `--debug` flag works with both `passive` and `full` scan types.

## Scan finds zero alerts
If ZAP completes successfully (exit code 0) but finds no alerts at all, common causes:
- **Malformed OpenAPI spec**: ZAP silently skips endpoints it cannot parse. Validate specs with `python3 -c "import yaml; yaml.safe_load(open('openapi-query.yaml'))"` and check for missing `$ref` components.
- **All endpoints excluded**: Check `excludePaths` in config — if too broad (e.g., `/api`), it may exclude everything.
- **Auth required but not provided**: Some endpoints return 401/403 without auth, and ZAP may not flag these as findings. Use `--debug` to inspect HTTP response codes.
- **Passive-only scan on a well-configured API**: Passive scans only analyze responses — a properly configured API may have no passive findings. Run `full` scan for active probing.
- **Wrong gateway URL**: ZAP may be hitting the wrong host. Use `--debug` to verify which URLs are being requested.

## Zero endpoints discovered
If Phase 1 finds no Spring Boot endpoints and no OpenAPI spec exists, the scan cannot proceed. This skill requires Spring Boot `@RestController` annotations for endpoint discovery. If using a different framework:
1. Provide an OpenAPI spec file manually (place `openapi.yaml` in your project)
2. Or use `--query-url` / `--command-url` with a manually created spec
