# Corporate API Setup

The Corporate API provides **zero rate limits** and multi-user access via ECDSA key-pair authentication.

## 1. Generate Key Pair

```bash
openssl ecparam -genkey -name secp256k1 -out priv.key
openssl ec -in priv.key -pubout -out pub.key
```

## 2. Apply for Access

Email **api@monobank.ua** with:
- **Subject:** Corporate API Access — monobank-mcp MCP server
- **Attachment:** `pub.key` (NEVER send `priv.key`)
- **Body:** Brief description of your app

Response time: 2 days to 4 weeks. You will receive a `KEY_ID` (SHA1 hash of your public key).

## 3. Configure

```env
MONOBANK_AUTH_MODE=corporate
MONOBANK_KEY_ID=<KEY_ID from Monobank email>
MONOBANK_PRIVATE_KEY_PATH=/path/to/priv.key
```

For Docker / cloud deployments, use the PEM content directly:

```env
MONOBANK_PRIVATE_KEY_PEM=-----BEGIN EC PRIVATE KEY-----\nMHQC...
```

### Claude Desktop Config

```json
{
  "mcpServers": {
    "monobank": {
      "command": "npx",
      "args": ["-y", "monobank-mcp"],
      "env": {
        "MONOBANK_AUTH_MODE": "corporate",
        "MONOBANK_KEY_ID": "your_key_id",
        "MONOBANK_PRIVATE_KEY_PATH": "/path/to/priv.key"
      }
    }
  }
}
```

## 4. Corporate-Only Tools

| Tool | Description |
|------|-------------|
| `initiate_authorization` | Start user auth flow, returns Monobank app URL |
| `check_authorization` | Check if user approved the auth request |
| `get_corp_settings` | Get corporate app settings (key, name, webhook) |
| `set_corp_webhook` | Set webhook URL for the corporate application |

## 5. Authorization Flow

1. Call `initiate_authorization` with a callback URL
2. User opens the returned `acceptUrl` in their Monobank app
3. User approves access
4. Monobank POSTs the auth token to your callback URL
5. Use the token as `requestId` in subsequent API calls

## 6. Security

- **NEVER** commit `priv.key` to git (`*.key` is in `.gitignore`)
- For cloud deployments, use `MONOBANK_PRIVATE_KEY_PEM` env var
- `X-Time` header must be within ±5 seconds of server time — keep system clock synced (NTP)
- Rotate keys annually
