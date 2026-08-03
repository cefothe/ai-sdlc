---
name: qa-owasp-zap
description: Run OWASP ZAP security scanning against a Spring Boot CQRS API with automatic endpoint discovery and gateway-specific scanning.
---

# /qa:omnius-owasp-zap - OWASP ZAP API Security Scanning (CQRS)

Run OWASP ZAP security scanning against a Spring Boot CQRS API. Automatically discovers REST endpoints from source code annotations, reconciles with OpenAPI specs, splits scanning across query-gateway (GET) and command-gateway (non-GET), and runs passive or active security scans via Docker. Covers OWASP Top 10 categories including injection, broken access control, SSRF, and cryptographic failures.

## CQRS Gateway Routing

Given a base URL, the command derives two gateway URLs:
- **Query Gateway** (`query-gateway.<domain>`) — GET endpoints (reads/queries)
- **Command Gateway** (`command-gateway.<domain>`) — non-GET endpoints (POST, PUT, PATCH, DELETE)

Example: `https://tradu.fun` produces:
- `https://query-gateway.tradu.fun` (GET requests)
- `https://command-gateway.tradu.fun` (POST, PUT, PATCH, DELETE requests)

Gateway URLs can be overridden via `--query-url` / `--command-url` flags or config file.

## Output Directory

All QA artifacts are stored in the **project directory** (not `~/.claude/`):
```
owasp-zap-security-testing-results/<YYYYMMDD>-<HHMMSS>/
```

## Usage

```bash
/qa:omnius-owasp-zap <base_url> <scan_type> [options]
```

**Arguments**:
- `<base_url>` (required) — Base domain URL (e.g., `https://tradu.fun`)
- `<scan_type>` (required) — `passive` (passive-only) or `full` (passive + active)

**Options**:
- `--debug` — Log all HTTP requests ZAP makes to `zap-requests.log`
- `--query-url <url>` — Override derived query gateway URL
- `--command-url <url>` — Override derived command gateway URL
- `--dry-run` — Generate all configs without running Docker

**Examples**:
```bash
/qa:omnius-owasp-zap https://tradu.fun passive
/qa:omnius-owasp-zap https://staging.tradu.fun full
/qa:omnius-owasp-zap https://tradu.fun full --debug
/qa:omnius-owasp-zap https://tradu.fun passive --query-url https://api.tradu.fun --command-url https://api.tradu.fun
/qa:omnius-owasp-zap https://tradu.fun passive --dry-run
```

**IMPORTANT**: Run active scans (`full`) against test/staging environments only. Active scans send malicious payloads that can damage data.

## Prerequisites & Limitations

- **Spring Boot only**: Endpoint discovery scans for `@RestController`, `@GetMapping`, `@PostMapping`, `@PutMapping`, `@PatchMapping`, `@DeleteMapping`, and `@RequestMapping` annotations. Other frameworks will yield zero endpoints — provide an OpenAPI spec file manually instead.
- **springdoc-openapi**: Runtime spec fetching assumes `/v3/api-docs` is available.
- **CQRS gateway pattern**: Auto-derives `query-gateway.<domain>` and `command-gateway.<domain>`. For non-CQRS setups, use `--query-url` / `--command-url` overrides.
- **Docker required**: OWASP ZAP runs inside a Docker container (`--network=host`).
- **python3 required**: Used for config merging, ZAP plan generation, and YAML validation.
- **No ports in base URL**: URLs like `https://localhost:8080` cannot have gateway subdomains prepended. Use `--query-url` / `--command-url` overrides instead.

## Configuration

Loaded from `.claude/.config/omnius-owasp-zap.json` (project-level) or `~/.claude/.config/omnius-owasp-zap.json` (global). Project-level overrides global. All fields optional.

```json
{
  "queryGatewayUrl": "https://custom-query.example.com",
  "commandGatewayUrl": "https://custom-command.example.com",
  "auth": {
    "type": "bearer",
    "token": "eyJhbG...",
    "headerName": "Authorization"
  },
  "excludePaths": ["/health", "/metrics", "/readiness"],
  "technology": ["Java", "PostgreSQL"],
  "rateLimit": { "delayInMs": 100 },
  "threadPerHost": 10,
  "docker": {
    "image": "ghcr.io/zaproxy/zaproxy:stable",
    "network": "host"
  }
}
```

**Defaults** (when config missing): `auth: null`, `excludePaths: ["/health", "/metrics", "/readiness", "/liveness", "/actuator"]`, `technology: ["Java"]`, `rateLimit: { delayInMs: 100 }`, `threadPerHost: 10`, `docker: { image: "ghcr.io/zaproxy/zaproxy:stable", network: "host" }`.

**Gateway URL priority**: CLI flags (`--query-url`) > config file (`queryGatewayUrl`) > auto-derived from base URL.

**Token handling**: Auth supports two modes: (1) `"token": "eyJhbG..."` — direct token in config, or (2) `"tokenEnvVar": "API_TOKEN"` — name of env var holding the token. The generate script writes a `{{ZAP_AUTH_TOKEN}}` placeholder into the ZAP plan; `run-zap-scan.sh` substitutes the real token via `sed` at runtime just before Docker starts. If neither token source is available, auth is skipped with a warning.

**Recommended .gitignore**: `owasp-zap-security-testing-results/`

---

## Workflow

### Phase 0: Validation & Setup

**Parse and validate arguments** using the bundled script:
```bash
SKILL_DIR="skills/qa-owasp-zap"
eval "$(bash ${SKILL_DIR}/scripts/parse-args.sh "$ARGUMENTS")"
```
This sets `BASE_URL`, `SCAN_TYPE`, `DEBUG_MODE`, `DRY_RUN`, `QUERY_URL_OVERRIDE`, and `COMMAND_URL_OVERRIDE`. If validation fails, the script prints usage and exits — STOP.

**Load configuration** using the bundled script:
```bash
CONFIG_JSON=$(bash ${SKILL_DIR}/scripts/load-config.sh "$(pwd)")
```
This merges project-level and global configs, validates the auth token env var, and outputs merged JSON. Warnings go to stderr.

Apply config overrides to gateway URL variables — if `QUERY_URL_OVERRIDE` is empty, check `queryGatewayUrl` from `CONFIG_JSON`; similarly for command URL.

**Derive CQRS gateway URLs** using the bundled script:
```bash
eval "$(bash ${SKILL_DIR}/scripts/derive-gateway-urls.sh "$BASE_URL" "$QUERY_URL_OVERRIDE" "$COMMAND_URL_OVERRIDE")"
```
This sets `QUERY_GATEWAY_URL`, `COMMAND_GATEWAY_URL`, `DOCKER_QUERY_URL`, `DOCKER_COMMAND_URL`.

If the base URL contains a port and no overrides are provided, the script errors out. See `skills/qa-owasp-zap/references/troubleshooting.md` section "Base URL contains a port".

**Check Docker** (skip if `--dry-run`):
```bash
docker info >/dev/null 2>&1 || {
  echo "Docker is not running, not installed, or current user lacks permissions."
  echo "  Start Docker Desktop or install: https://docs.docker.com/get-docker/"
  echo "  Permission denied? See troubleshooting: 'Docker not running'"
}
```
See `skills/qa-owasp-zap/references/troubleshooting.md` section "Docker not running" if this fails.

**Check gateway reachability**:
```bash
HTTP_CODE_QUERY=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$QUERY_GATEWAY_URL" 2>/dev/null)
HTTP_CODE_CMD=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$COMMAND_GATEWAY_URL" 2>/dev/null)
```
If BOTH gateways return `000` (unreachable), warn the user and ask whether to continue. See `skills/qa-owasp-zap/references/troubleshooting.md` section "Cannot reach gateway URL". If user declines, STOP.

**Create output directory**: `owasp-zap-security-testing-results/$(date +%Y%m%d-%H%M%S)/`

---

### Phase 1: Spring Boot Endpoint Discovery & OpenAPI Reconciliation

**Launch 2 agents in PARALLEL (single message, multiple Agent calls).**
Each agent writes to its own output file — Agent 1 writes `endpoint-discovery.md`, Agent 2 writes `openapi-spec-analysis.md`. They do not read or modify each other's files.

**Agent 1: `java-pro`** — Spring Boot Endpoint Discovery

Discover all REST API endpoints by scanning for `@RestController`, `@Controller`, `@GetMapping`, `@PostMapping`, `@PutMapping`, `@PatchMapping`, `@DeleteMapping`, and `@RequestMapping` annotations. For each endpoint, extract: HTTP method, full path (combining class-level and method-level prefixes), controller class, method name, parameters (`@PathVariable`, `@RequestParam`, `@RequestBody`), source file and line number. Also identify the module root path. Write results to `${OUTPUT_DIR}/endpoint-discovery.md` as a table with these columns:

| Method | Path | Controller | Method Name | Parameters | Source |
|--------|------|------------|-------------|------------|--------|
| GET | /api/v1/users | UserController | getUsers | @RequestParam page, size | src/main/.../UserController.java:42 |

**Agent 2: `api-documenter`** — OpenAPI Spec Analysis

Search for existing OpenAPI/Swagger spec files (`**/openapi.yaml`, `**/swagger.json`, etc., excluding node_modules/vendor/.claude/target/build). Also try fetching runtime specs from `${QUERY_GATEWAY_URL}/v3/api-docs`, `${COMMAND_GATEWAY_URL}/v3/api-docs`, and `${QUERY_GATEWAY_URL}/swagger-resources`. Write analysis to `${OUTPUT_DIR}/openapi-spec-analysis.md`.

**After both agents complete, validate results:**

If Agent 1 found 0 endpoints AND Agent 2 found no OpenAPI spec (neither file nor runtime):
```
No REST endpoints discovered and no OpenAPI spec found.
This skill requires Spring Boot @RestController annotations for endpoint discovery.
If using a different framework, provide an openapi.yaml file in your project root.
```
STOP — do not proceed to Phase 2.

**Then launch Agent 3: `api-documenter`** — OpenAPI Reconciliation, Update & CQRS Split

Compare discovered endpoints against existing spec. Add missing endpoints, flag deprecated ones, update changed paths. If no spec exists, generate a complete OpenAPI 3.0.3 spec. Then split into two CQRS gateway-specific files:
- `${OUTPUT_DIR}/openapi-query.yaml` — GET operations only, `servers[0].url` set to `${QUERY_GATEWAY_URL}`
- `${OUTPUT_DIR}/openapi-command.yaml` — non-GET operations only, `servers[0].url` set to `${COMMAND_GATEWAY_URL}`

Both split specs must include the full `components` section so `$ref` references resolve. Paths with both GET and non-GET methods appear in both files with their respective methods only. Append reconciliation results to `${OUTPUT_DIR}/endpoint-discovery.md`.

**Validate generated specs** after Agent 3 completes (up to 2 retries):
```bash
VALID=true
python3 -c "import yaml, sys; yaml.safe_load(open(sys.argv[1]))" "${OUTPUT_DIR}/openapi-query.yaml" && echo "query spec valid" || VALID=false
python3 -c "import yaml, sys; yaml.safe_load(open(sys.argv[1]))" "${OUTPUT_DIR}/openapi-command.yaml" && echo "command spec valid" || VALID=false
```
If either spec is invalid YAML, have Agent 3 fix it. Allow up to 2 fix attempts. If still invalid after 2 retries, STOP with: "OpenAPI spec generation failed after 2 fix attempts. Check ${OUTPUT_DIR}/openapi-*.yaml for syntax errors."

---

### Phase 2: ZAP Configuration

Generate the ZAP Automation Framework plan using the bundled Python script:

```bash
python3 ${SKILL_DIR}/scripts/generate-zap-plan.py \
  --output-dir "$OUTPUT_DIR" \
  --scan-type "$SCAN_TYPE" \
  --docker-query-url "$DOCKER_QUERY_URL" \
  --docker-command-url "$DOCKER_COMMAND_URL" \
  --query-gateway-url "$QUERY_GATEWAY_URL" \
  --command-gateway-url "$COMMAND_GATEWAY_URL" \
  --config "$CONFIG_JSON" \
  --skill-dir "$SKILL_DIR" \
  $([ "$DEBUG_MODE" = "true" ] && echo "--debug")
```

The script reads the template files from `${SKILL_DIR}/assets/`, substitutes all placeholders (gateway URLs, exclude paths, technology, auth, active scan rules), assembles the plan, and validates the output YAML.

**Exit codes**: `0` = success, `1` = missing template or bad arguments, `2` = YAML validation failed (file written for inspection).

If exit code is `2`, read `${OUTPUT_DIR}/zap-plan.yaml`, identify the YAML syntax error, fix it inline, and re-validate. Allow 1 retry. If still invalid, STOP with the validation error.

---

### Phase 3: Docker Execution

**If `--dry-run`**: Skip Docker execution. Print the `docker run` command that would be executed, list all generated config files in `${OUTPUT_DIR}/`, and display "Dry run complete. Review generated configs in ${OUTPUT_DIR}/". STOP — do not proceed to Phase 4.

**Run the ZAP scan** using the bundled script:
```bash
ABS_OUTPUT_DIR=$(cd "$OUTPUT_DIR" && pwd)
DOCKER_IMAGE=$(echo "$CONFIG_JSON" | python3 -c "import json,sys; c=json.load(sys.stdin); print(c.get('docker',{}).get('image','ghcr.io/zaproxy/zaproxy:stable'))")
DOCKER_NETWORK=$(echo "$CONFIG_JSON" | python3 -c "import json,sys; c=json.load(sys.stdin); print(c.get('docker',{}).get('network','host'))")
AUTH_TOKEN_VAR=$(echo "$CONFIG_JSON" | python3 -c "import json,sys; c=json.load(sys.stdin); a=c.get('auth'); print(a.get('tokenEnvVar','') if a else '')")

# Export the auth token so run-zap-scan.sh can substitute it into zap-plan.yaml.
# If config uses direct 'token' field, load-config.sh sets tokenEnvVar=ZAP_AUTH_TOKEN;
# extract the actual token value and export it.
AUTH_TOKEN_VALUE=$(echo "$CONFIG_JSON" | python3 -c "import json,sys; c=json.load(sys.stdin); a=c.get('auth'); print(a.get('token','') if a else '')")
if [ -n "$AUTH_TOKEN_VALUE" ]; then
  export AUTH_TOKEN_VALUE
fi

bash ${SKILL_DIR}/scripts/run-zap-scan.sh \
  "$ABS_OUTPUT_DIR" "$SCAN_TYPE" "$DOCKER_IMAGE" "$DOCKER_NETWORK" "$AUTH_TOKEN_VAR"

ZAP_EXIT_CODE=$?
```

The script handles image pull/verify, OpenAPI spec validation, auth token substitution via `sed` (replacing `{{ZAP_AUTH_TOKEN}}` placeholder), timeout (15m passive / 90m full), and console log capture to `${OUTPUT_DIR}/zap-console.log`.

**Exit codes**: `0` = no alerts, `2` = alerts found (expected), `1` = config error, `3` = missing prerequisites (specs, Docker), `124` = timeout (partial results may exist), other = unexpected failure.

For exit code `1` (config error): read the last 30 lines of `zap-console.log`, identify the issue, and report it. See `skills/qa-owasp-zap/references/troubleshooting.md` section "ZAP config error".

For all other non-zero codes (except `2`): warn the user but continue to Phase 4 — partial results may still exist in the report files.

---

### Phase 4: Report Generation & Analysis

Check for report files. The primary report is `${OUTPUT_DIR}/zap-report.json`. If missing, check whether any partial reports exist (`zap-passive-report.json`, `zap-active-report.json`). If no reports exist at all, display error pointing to `zap-console.log` and STOP. See `skills/qa-owasp-zap/references/troubleshooting.md` section "No report generated".

If partial reports exist (e.g., passive report exists but combined doesn't), use whatever is available and note the gap in the summary.

**Generate scan summary** using the bundled script:
```bash
python3 ${SKILL_DIR}/scripts/generate-scan-summary.py \
  --output-dir "$OUTPUT_DIR" \
  --scan-type "$SCAN_TYPE" \
  --base-url "$BASE_URL" \
  --query-gateway-url "$QUERY_GATEWAY_URL" \
  --command-gateway-url "$COMMAND_GATEWAY_URL" \
  --skill-dir "$SKILL_DIR"
```

The script reads ZAP JSON reports, maps findings to OWASP Top 10 categories using CWE IDs, counts endpoints from the OpenAPI specs, generates detailed findings ordered by severity, and fills in `scan-summary.md.template`. Exit codes: `0` = success, `1` = missing report files or template, `2` = JSON parse error.

**Present final output:**

```
Omnius OWASP ZAP CQRS API Security Scan Complete

Base URL:        ${BASE_URL}
Query Gateway:   ${QUERY_GATEWAY_URL}  (GET requests)
Command Gateway: ${COMMAND_GATEWAY_URL}  (POST/PUT/PATCH/DELETE requests)
Scan Type:       ${SCAN_TYPE}
Framework:       Spring Boot (CQRS)

Findings:
  Critical: <count>
  High:     <count>
  Medium:   <count>
  Low:      <count>
  Info:     <count>

Output: ${OUTPUT_DIR}/

Key Files:
  scan-summary.md            - Findings + remediation
  zap-report.html            - Combined HTML report
  zap-report.json            - Combined machine-readable findings
  zap-passive-report.html    - Passive scan report (full scan only)
  zap-active-report.html     - Active scan report (full scan only)
  zap-requests.log           - HTTP request log (--debug only)
  endpoint-discovery.md      - Endpoint analysis + spec reconciliation

Next Steps:
1. Review scan-summary.md for prioritized findings
2. Open zap-report.html in a browser for the full report
3. Address Critical and High findings before deployment
4. Re-run: /qa:omnius-owasp-zap ${BASE_URL} ${SCAN_TYPE}
```

If Critical or High findings exist, additionally display the top priority items with one-line remediations.

---

## Troubleshooting

For common issues (Docker, networking, rate limiting, debug mode, zero endpoints), read `skills/qa-owasp-zap/references/troubleshooting.md`.
