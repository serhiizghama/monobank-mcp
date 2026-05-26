# Agent Setup Guide

Instructions for AI agents to automatically install and configure monobank-mcp.

## Prerequisites

- Node.js >= 18
- A Monobank personal API token (user obtains it at https://api.monobank.ua/)

## Installation

```bash
npm install -g monobank-mcp
```

Or run without installing:

```bash
npx -y monobank-mcp
```

## Configuration

### Claude Desktop (macOS)

Config file path: `~/Library/Application Support/Claude/claude_desktop_config.json`

Read the existing config, merge this into the `mcpServers` object, and write it back:

```json
{
  "mcpServers": {
    "monobank": {
      "command": "npx",
      "args": ["-y", "monobank-mcp"],
      "env": {
        "MONOBANK_TOKEN": "<ask user for token>"
      }
    }
  }
}
```

### Claude Desktop (Windows)

Config file path: `%APPDATA%\Claude\claude_desktop_config.json`

Same JSON content as macOS.

### Claude Code (CLI)

Add to the project's `.claude/settings.json` or global `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "monobank": {
      "command": "npx",
      "args": ["-y", "monobank-mcp"],
      "env": {
        "MONOBANK_TOKEN": "<ask user for token>"
      }
    }
  }
}
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json` in the project root:

```json
{
  "servers": {
    "monobank": {
      "command": "npx",
      "args": ["-y", "monobank-mcp"],
      "env": {
        "MONOBANK_TOKEN": "<ask user for token>"
      }
    }
  }
}
```

## Setup Steps for an Agent

1. **Ask the user for their Monobank token.** Tell them: "Go to https://api.monobank.ua/ and scan the QR code with your Monobank app. Paste the token here."

2. **Check if Node.js is available:**
   ```bash
   node --version
   ```
   If not installed, instruct the user to install it from https://nodejs.org/

3. **Verify the package is accessible:**
   ```bash
   npx -y monobank-mcp --help 2>&1 || echo "Package not reachable"
   ```

4. **Detect the MCP client** and locate its config file:
   - Claude Desktop macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Claude Desktop Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Claude Code: `~/.claude/settings.json` (global) or `.claude/settings.json` (project)
   - Cursor: `.cursor/mcp.json`

5. **Read the existing config**, merge the monobank server entry, and write it back. Do not overwrite other MCP servers in the config.

6. **Tell the user to restart** their MCP client (Claude Desktop, Cursor, etc.) for the changes to take effect.

7. **Verify** by asking the user to invoke `get_exchange_rates` — this works without a valid token and confirms the MCP connection is established.

## Token Troubleshooting

| Problem | Solution |
|---------|----------|
| Token expired | Tokens are long-lived but can expire. User should re-scan QR at https://api.monobank.ua/ |
| "Invalid or missing token" error | Token was copy-pasted incorrectly, or contains extra whitespace |
| No accounts returned | Token may belong to a minor (<16 years old) — Monobank API is unavailable for them |

## Verifying the Setup

After installation, run these tools in order to confirm everything works:

1. `get_exchange_rates` — no auth needed, confirms MCP connection
2. `get_client_info` — confirms token is valid, shows all accounts
3. `get_statement` with `account_id: "0"` and `from_date` set to 7 days ago — confirms statement access

If all three succeed, the setup is complete.
