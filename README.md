<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/d/db/Monobank_logo.svg" alt="Monobank" width="280" />
</p>

<h1 align="center">monobank-mcp</h1>

<p align="center">
  MCP server for Monobank Open API — accounts, transactions, exchange rates, jars & webhooks for Claude and other LLM clients.
</p>

<p align="center">
  <a href="https://github.com/serhiizghama/monobank-mcp/actions/workflows/ci.yml"><img src="https://github.com/serhiizghama/monobank-mcp/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/monobank-mcp"><img src="https://img.shields.io/npm/v/monobank-mcp" alt="npm version" /></a>
  <a href="https://github.com/serhiizghama/monobank-mcp"><img src="https://img.shields.io/github/stars/serhiizghama/monobank-mcp?style=flat" alt="GitHub stars" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?logo=node.js&logoColor=white" alt="Node.js" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://modelcontextprotocol.io"><img src="https://badge.mcpx.dev?type=server&features=tools,resources,prompts" alt="MCP" /></a>
</p>

<p align="center">
  <a href="https://insiders.vscode.dev/redirect/mcp/install?name=monobank&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22monobank-mcp%22%5D%2C%22env%22%3A%7B%22MONOBANK_TOKEN%22%3A%22%24%7Binput%3Amonobank-token%7D%22%7D%7D"><img src="https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white" alt="Install in VS Code" /></a>
</p>

---

## Features

- **8 Personal API tools** — accounts, statements, exchange rates, jars, webhooks
- **4 Corporate API tools** — ECDSA signing, multi-user auth flow, zero rate limits
- **Smart caching** — respects Monobank's 1 req/60s limit automatically
- **Retry with backoff** — exponential retry on transient failures
- **Request deduplication** — concurrent identical calls merged into one HTTP request
- **Resources & Prompts** — exchange rates as context, spending analysis template
- **English-first docs** — full API reference, agent setup guide, corporate guide

## Quick Start

Get your token at **https://api.monobank.ua/** (scan QR with Monobank app), then:

```bash
npx -y monobank-mcp
```

## Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "monobank": {
      "command": "npx",
      "args": ["-y", "monobank-mcp"],
      "env": {
        "MONOBANK_TOKEN": "your_token_here"
      }
    }
  }
}
```

### VS Code / Cursor

Add to `.vscode/mcp.json` or `.cursor/mcp.json`:

```json
{
  "servers": {
    "monobank": {
      "command": "npx",
      "args": ["-y", "monobank-mcp"],
      "env": {
        "MONOBANK_TOKEN": "your_token_here"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add monobank -- npx -y monobank-mcp
```

Then set `MONOBANK_TOKEN` in your environment.

## Tools

### Personal API

| Tool | Description |
|------|-------------|
| `get_client_info` | Client profile, all accounts and jars with balances, IBANs |
| `get_statement` | Transaction history for any date range (max 31 days) |
| `get_recent_transactions` | Latest N transactions from the last X minutes |
| `get_exchange_rates` | Current UAH/USD/EUR and 100+ exchange rate pairs |
| `get_jars` | Savings jars with balances, goals, and progress |
| `set_webhook` | Register a URL for real-time transaction events |
| `delete_webhook` | Stop receiving webhook notifications |
| `get_webhook_status` | Check currently registered webhook URL |

### Corporate API

Available when `MONOBANK_AUTH_MODE=corporate`. See [Corporate API Setup](docs/CORPORATE_API.md).

| Tool | Description |
|------|-------------|
| `initiate_authorization` | Start user auth flow, returns Monobank app URL |
| `check_authorization` | Check if user approved the auth request |
| `get_corp_settings` | Get corporate app settings (key, name, webhook) |
| `set_corp_webhook` | Set webhook URL for the corporate application |

## Resources

| Resource | URI | Description |
|----------|-----|-------------|
| Exchange Rates | `monobank://exchange-rates` | Current exchange rates as background context |

## Prompts

| Prompt | Description |
|--------|-------------|
| `spending-analysis` | Analyze spending patterns for a given period (week / month / quarter) |

## Rate Limits

| Endpoint | Personal API | Corporate API |
|----------|-------------|---------------|
| `client-info` | 1 req / 60s | Unlimited |
| `statement` | 1 req / 60s | Unlimited |
| `currency` | No limit | No limit |
| `webhook` | No limit | No limit |

The server caches responses automatically (59s for rate-limited endpoints, 5 min for exchange rates). Retry with exponential backoff handles transient failures.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONOBANK_TOKEN` | Personal mode | Token from https://api.monobank.ua/ |
| `MONOBANK_AUTH_MODE` | No | `personal` (default) or `corporate` |
| `MONOBANK_KEY_ID` | Corporate mode | SHA1 hash of your public key |
| `MONOBANK_PRIVATE_KEY_PATH` | Corporate mode | Path to ECDSA secp256k1 private key |
| `MONOBANK_PRIVATE_KEY_PEM` | Corporate mode | PEM string (alternative to file path) |

## Docker

```bash
docker build -t monobank-mcp .
docker run -e MONOBANK_TOKEN=your_token monobank-mcp
```

## Development

```bash
git clone https://github.com/serhiizghama/monobank-mcp.git
cd monobank-mcp
npm install
npm run build
npm test
```

## Documentation

- [API Reference](docs/API_REFERENCE.md) — full tool/resource/prompt reference with examples
- [Corporate API Setup](docs/CORPORATE_API.md) — ECDSA key generation, auth flow
- [Agent Setup Guide](docs/AGENT_SETUP.md) — instructions for AI agents to auto-install

## License

MIT
