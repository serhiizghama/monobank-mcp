# monobank-mcp

MCP server for [Monobank Open API](https://api.monobank.ua/) — access bank accounts, transaction history, and exchange rates from Claude and other LLM clients.

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
| `get_exchange_rates` | Current UAH/USD/EUR and 100+ other exchange rate pairs |

## Rate Limits

Monobank personal API allows **1 request per 60 seconds** for `client-info` and `statement` endpoints. This server automatically caches responses for 59 seconds to stay within limits. Exchange rates are cached for 5 minutes (Monobank updates them every ~5 min).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONOBANK_TOKEN` | Yes | Personal API token from https://api.monobank.ua/ |

## Development

```bash
git clone https://github.com/serhiizghama/monobank-mcp.git
cd monobank-mcp
npm install
npm run build
MONOBANK_TOKEN=your_token node dist/index.js
```

## License

MIT
