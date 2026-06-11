# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 2.x     | ✅        |
| < 2.0   | ❌        |

## Reporting a Vulnerability

Please **do not** report security issues through public GitHub issues.

Instead, use one of the following channels:

- **GitHub private vulnerability reporting** (preferred): [Report a vulnerability](https://github.com/serhiizghama/monobank-mcp/security/advisories/new)
- **Email**: zmrser@gmail.com with the subject line `[SECURITY] monobank-mcp`

Please include a description of the issue, steps to reproduce, and the affected version. You can expect an initial response within 72 hours.

## Credential Handling

This MCP server is designed to keep your Monobank credentials safe:

- **Personal mode**: the API token is read from the `MONOBANK_TOKEN` environment variable at startup.
- **Corporate mode**: the request-signing key is read from `MONOBANK_PRIVATE_KEY_PEM` or a local file referenced by `MONOBANK_PRIVATE_KEY_PATH`, together with `MONOBANK_KEY_ID`.
- Credentials are never written to disk by the server.
- Requests are sent exclusively to `https://api.monobank.ua` over HTTPS — there are no third-party endpoints.
- Credentials are not logged and are never included in MCP tool responses.

If you find any behavior that contradicts the above, please report it as a vulnerability.

## Out of Scope

- Vulnerabilities in the Monobank Open API itself — report those to [Monobank](https://api.monobank.ua/).
- Issues that require a compromised local environment (e.g. an attacker who can already read your process environment or key files).
