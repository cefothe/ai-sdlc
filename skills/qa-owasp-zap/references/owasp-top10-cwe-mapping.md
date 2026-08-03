# OWASP Top 10 2021 CWE Mapping

Use this table to map ZAP findings (by CWE ID) to OWASP Top 10 categories.

| OWASP Category | Common CWE IDs |
|---|---|
| A01 Broken Access Control | 200, 284, 285, 639, 352 |
| A02 Cryptographic Failures | 310, 311, 312, 326, 327 |
| A03 Injection | 20, 74, 79, 89, 90, 943, 78 |
| A04 Insecure Design | 209, 256, 501, 522 |
| A05 Security Misconfiguration | 2, 11, 13, 15, 16, 388, 756 |
| A06 Vulnerable Components | 1035, 1104 |
| A07 Authentication Failures | 255, 259, 287, 384, 613 |
| A08 Software & Data Integrity | 345, 353, 426, 494, 502, 565 |
| A09 Logging Failures | 117, 223, 532, 778 |
| A10 SSRF | 918 |

## Severity Mapping

ZAP `riskcode` values:
- `riskcode=3` — High (Critical if `confidence >= 3`)
- `riskcode=2` — Medium
- `riskcode=1` — Low
- `riskcode=0` — Informational
