# API Reference

Complete reference for all tools, resources, and prompts provided by monobank-mcp.

## Tools

### get_client_info

Get client profile with all bank accounts and savings jars.

**Parameters:** none

**Response example:**
```json
{
  "name": "Іван Петренко",
  "accounts": [
    {
      "id": "Koc7_Ss1RxXUQuI29o83VQ",
      "iban": "UA123456789",
      "type": "black",
      "currency": "UAH",
      "balance": "1376.16",
      "creditLimit": "10000.00",
      "cashback": "UAH"
    },
    {
      "id": "EcgzhAPV_S1ToECqiPg-lg",
      "iban": "UA987654321",
      "type": "fop",
      "currency": "UAH",
      "balance": "255.69"
    }
  ],
  "jars": [
    {
      "id": "jar1",
      "title": "Vacation",
      "balance": "500.00",
      "goal": "2000.00",
      "currency": "UAH"
    }
  ]
}
```

**Notes:**
- Cached for 59 seconds (personal API rate limit: 1 req/60s)
- Account types: `black`, `white`, `platinum`, `iron`, `fop`, `yellow`, `eAid`
- Balances are in UAH (or account currency), formatted as strings with 2 decimals
- `jars` may be empty or absent if the user has no savings jars

---

### get_statement

Get transaction history for a specific date range.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `account_id` | string | No | `"0"` | Account ID from get_client_info. `"0"` = default card |
| `from_date` | string | Yes | — | Start date: ISO 8601 (`"2025-05-01"`) or Unix timestamp (`"1746050400"`) |
| `to_date` | string | No | now | End date, same format as from_date |
| `limit` | number | No | 50 | Max transactions to return (1–500) |

**Response example:**
```json
[
  {
    "time": "2025-05-14T10:30:00.000Z",
    "description": "Vodafone +380501234567",
    "amount": "-480.00 UAH",
    "balance": "1376.16",
    "mcc": 4814,
    "hold": false
  }
]
```

**Notes:**
- Max date range: 31 days
- Negative amounts = expenses, positive = income
- `mcc` is the Merchant Category Code (4814 = telecom, 5411 = grocery, 5812 = restaurants, etc.)
- `hold: true` means the transaction is still pending

---

### get_recent_transactions

Shortcut for getting latest transactions without specifying dates.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `account_id` | string | No | `"0"` | Account ID. `"0"` = default card |
| `minutes` | number | No | 60 | How many minutes back to look (1–43200) |
| `limit` | number | No | 20 | Max transactions to return (1–100) |

**Response:** Same format as get_statement.

---

### get_exchange_rates

Get current Monobank exchange rates.

**Parameters:** none

**Response example:**
```json
[
  {
    "pair": "USD/UAH",
    "date": "2025-05-26T07:10:06.000Z",
    "buy": 44.04,
    "sell": 44.4346
  },
  {
    "pair": "EUR/UAH",
    "date": "2025-05-26T07:10:06.000Z",
    "buy": 51.17,
    "sell": 51.8001
  },
  {
    "pair": "BTC/UAH",
    "date": "2025-05-26T06:30:00.000Z",
    "cross": 4500000.0
  }
]
```

**Notes:**
- Public endpoint, no auth required
- ~107 currency pairs
- Major pairs (USD, EUR) have `buy`/`sell` rates; others have `cross` rate
- Cached for 5 minutes (Monobank updates rates every ~5 min)

---

### get_jars

Get all savings jars (копилки) with balances and goal progress.

**Parameters:** none

**Response example:**
```json
[
  {
    "id": "jar1",
    "title": "Vacation",
    "balance": "500.00",
    "goal": "2000.00",
    "progress": "25.0%",
    "currency": "UAH"
  }
]
```

**Notes:**
- Returns `"No savings jars found."` if the user has none
- Uses cached client-info data (no extra API call if get_client_info was called recently)

---

### set_webhook

Register a URL to receive real-time transaction notifications from Monobank.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | Publicly accessible HTTPS URL |

**Monobank will POST this payload to your URL on each transaction:**
```json
{
  "type": "StatementItem",
  "data": {
    "account": "account_id",
    "statementItem": {
      "id": "...",
      "time": 1234567890,
      "description": "Coffee Shop",
      "amount": -4500,
      "balance": 100000,
      "mcc": 5812
    }
  }
}
```

**Notes:**
- URL must respond with HTTP 200 within 5 seconds
- Only one webhook URL can be active at a time
- Setting a new URL replaces the previous one

---

### delete_webhook

Unregister the current webhook.

**Parameters:** none

---

### get_webhook_status

Check the currently registered webhook URL.

**Parameters:** none

**Response:** `"Active: https://example.com/hook"` or `"No webhook registered."`

---

### initiate_authorization (Corporate only)

Start the OAuth-like user authorization flow.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `callback_url` | string | Yes | — | HTTPS URL where Monobank will POST the auth result |
| `permissions` | string | No | `"sp"` | `"s"` = statements, `"p"` = personal info |

**Response:** Returns `acceptUrl` (for the user to open) and `tokenRequestId` (for polling).

---

### check_authorization (Corporate only)

Check if a user has approved the authorization request.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `request_id` | string | Yes | The `tokenRequestId` from initiate_authorization |

**Response:** `"Status: waiting"`, `"Status: approved"`, or `"Status: rejected"`

---

### get_corp_settings (Corporate only)

Get corporate application settings.

**Parameters:** none

**Response example:**
```json
{
  "pubkey": "...",
  "name": "My App",
  "permission": "sp",
  "logo": "...",
  "webhook": "https://example.com/corp-hook"
}
```

---

### set_corp_webhook (Corporate only)

Set webhook URL for the corporate application (separate from personal webhooks).

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | Publicly accessible HTTPS URL |

---

## Resources

### monobank://exchange-rates

Current exchange rates for all currency pairs as raw JSON.

**MIME type:** `application/json`

**Usage:** Loaded automatically by the host application as background context. Contains the same data as the `get_exchange_rates` tool but in raw API format (numeric currency codes instead of symbols).

---

## Prompts

### spending-analysis

Pre-built prompt template for analyzing spending patterns.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `period` | `"week"` \| `"month"` \| `"quarter"` | Yes | Time period to analyze |
| `account_id` | string | No | Specific account ID (defaults to main card) |

**Generated prompt instructs the LLM to:**
1. Fetch transactions for the period using get_statement
2. Categorize by MCC code
3. Calculate totals per category
4. Identify largest expenses
5. Note unusual spending patterns

---

## Error Responses

All tools return errors in this format:

```json
{
  "content": [{ "type": "text", "text": "Error description" }],
  "isError": true
}
```

| Error | Cause |
|-------|-------|
| `Authentication failed` | Invalid or expired MONOBANK_TOKEN |
| `Rate limit hit. Retry in 60s.` | More than 1 request per 60 seconds to the same endpoint |
| `Date range exceeds 31 days` | get_statement from/to range too large |
| `from_date must be before to_date` | Dates are in wrong order |

---

## Currency Codes

Common ISO 4217 numeric codes used in responses:

| Code | Currency |
|------|----------|
| 980 | UAH |
| 840 | USD |
| 978 | EUR |
| 826 | GBP |
| 756 | CHF |
| 985 | PLN |
| 203 | CZK |
