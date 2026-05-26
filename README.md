# monobank-mcp

MCP server for [Monobank Open API](https://api.monobank.ua/) — access bank accounts, transaction history, exchange rates, savings jars, and webhook management from Claude and other LLM clients.

Supports both **Personal API** (token-based) and **Corporate API** (ECDSA signing, zero rate limits).

## Quick Start

```bash
npm install -g monobank-mcp
```

Get your personal API token at **https://api.monobank.ua/** (scan QR with Monobank app).

## Claude Desktop Configuration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

For Corporate API setup, see [docs/CORPORATE_API.md](docs/CORPORATE_API.md).

## Tools

### Personal API (8 tools)

| Tool | Description |
|------|-------------|
| `get_client_info` | Client profile, all accounts and jars with balances, IBANs |
| `get_statement` | Transaction history for any date range (max 31 days) |
| `get_recent_transactions` | Latest N transactions from the last X minutes |
| `get_exchange_rates` | Current UAH/USD/EUR and 100+ other exchange rate pairs |
| `get_jars` | Savings jars with balances, goals, and progress |
| `set_webhook` | Register a URL to receive real-time transaction events |
| `delete_webhook` | Stop receiving webhook notifications |
| `get_webhook_status` | Check currently registered webhook URL |

### Corporate API (4 additional tools)

| Tool | Description |
|------|-------------|
| `initiate_authorization` | Start user auth flow, returns Monobank app URL |
| `check_authorization` | Check if user approved the auth request |
| `get_corp_settings` | Get corporate app settings (key, name, webhook) |
| `set_corp_webhook` | Set webhook URL for the corporate application |

## Resources

| Resource | URI | Description |
|----------|-----|-------------|
| Exchange Rates | `monobank://exchange-rates` | Current exchange rates as reference data |

## Prompts

| Prompt | Description |
|--------|-------------|
| `spending-analysis` | Analyze spending patterns for a given period (week/month/quarter) |

## Rate Limits

Monobank **personal API** allows 1 request per 60 seconds for `client-info` and `statement` endpoints. This server automatically caches responses for 59 seconds to stay within limits. Exchange rates are cached for 5 minutes.

**Corporate API** has no rate limits.

Retry with exponential backoff is built in for transient failures.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONOBANK_TOKEN` | Personal mode | Personal API token from https://api.monobank.ua/ |
| `MONOBANK_AUTH_MODE` | No | `personal` (default) or `corporate` |
| `MONOBANK_KEY_ID` | Corporate mode | SHA1 hash of your public key |
| `MONOBANK_PRIVATE_KEY_PATH` | Corporate mode | Path to ECDSA private key file |
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
MONOBANK_TOKEN=your_token node dist/index.js
```

## License

MIT
