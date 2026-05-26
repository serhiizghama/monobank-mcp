# monobank-mcp

MCP server for [Monobank Open API](https://api.monobank.ua/) — access bank accounts, transaction history, exchange rates, savings jars, and webhook management from Claude and other LLM clients.

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

## Tools

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

## Resources

| Resource | URI | Description |
|----------|-----|-------------|
| Exchange Rates | `monobank://exchange-rates` | Current exchange rates as reference data |

## Prompts

| Prompt | Description |
|--------|-------------|
| `spending-analysis` | Analyze spending patterns for a given period (week/month/quarter) |

## Rate Limits

Monobank personal API allows **1 request per 60 seconds** for `client-info` and `statement` endpoints. This server automatically caches responses for 59 seconds to stay within limits. Exchange rates are cached for 5 minutes (Monobank updates them every ~5 min).

Retry with exponential backoff is built in for transient failures.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONOBANK_TOKEN` | Yes | Personal API token from https://api.monobank.ua/ |

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
