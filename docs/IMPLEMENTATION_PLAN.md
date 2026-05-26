# Monobank MCP Server — Implementation Plan

## Overview

A production-grade TypeScript MCP (Model Context Protocol) server for the Monobank Open API.
Monobank is Ukraine's largest digital bank with 10M+ clients and a public REST API.

**Repository:** `serhiizghama/monobank-mcp`  
**Language:** TypeScript (Node.js)  
**MCP SDK:** `@modelcontextprotocol/sdk`  
**Target registries:** Glama, mcp.so, smithery.ai, npm

### Why this MCP stands out
- Only MCP with proper **rate-limit caching** (existing ones ignore the 1 req/60s limit)
- Only MCP with **Corporate API support** (ECDSA signing — no one else has built this)
- Full **webhook management** tools
- **English-first** documentation (existing servers are Ukrainian-only)
- Strict TypeScript, Zod validation, production-ready error handling

### API reference
- Personal API: https://api.monobank.ua/docs/index.html
- Corporate API: https://api.monobank.ua/docs/corporate.html

---

## Project Structure (final state)

```
monobank-mcp/
├── src/
│   ├── index.ts                  # MCP server entry point
│   ├── server.ts                 # McpServer setup, tool registration
│   ├── client/
│   │   ├── personal.ts           # PersonalClient (X-Token auth)
│   │   ├── corporate.ts          # CorporateClient (ECDSA auth)
│   │   └── base.ts               # Shared HTTP logic, error handling
│   ├── tools/
│   │   ├── account.ts            # get_client_info, get_account_list
│   │   ├── statement.ts          # get_statement, get_recent_transactions
│   │   ├── currency.ts           # get_exchange_rates
│   │   ├── webhook.ts            # set_webhook, delete_webhook, get_webhook_status
│   │   └── corporate-auth.ts     # initiate_authorization, check_authorization
│   ├── cache/
│   │   └── ttl-cache.ts          # In-memory TTL cache
│   ├── types/
│   │   └── monobank.ts           # Full TypeScript types for all API responses
│   └── errors/
│       └── index.ts              # MonobankError hierarchy
├── tests/
│   ├── client/
│   ├── tools/
│   └── cache/
├── docs/
│   └── IMPLEMENTATION_PLAN.md    # This file
├── .env.example
├── Dockerfile
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

---

## Environment Variables

```env
# Personal API (required for Personal auth mode)
MONOBANK_TOKEN=your_personal_token_here

# Corporate API (required for Corporate auth mode)
MONOBANK_KEY_ID=sha1_of_your_public_key
MONOBANK_PRIVATE_KEY_PATH=/path/to/priv.key
# OR inline (for Docker/cloud):
MONOBANK_PRIVATE_KEY_PEM=-----BEGIN EC PRIVATE KEY-----\n...

# Optional
MONOBANK_AUTH_MODE=personal  # "personal" | "corporate" (default: personal)
MONOBANK_CACHE_TTL=59        # seconds (default: 59)
MONOBANK_LOG_LEVEL=info      # "debug" | "info" | "warn" | "error"
```

---

## Rate Limits Reference

| Endpoint | Personal API | Corporate API |
|----------|-------------|---------------|
| `/personal/client-info` | 1 req / 60s | unlimited |
| `/personal/statement` | 1 req / 60s | unlimited |
| `/bank/currency` | no limit | no limit |
| `/personal/webhook` | no documented limit | no documented limit |

**Caching strategy:** TTL cache keyed by `endpoint + args`. Default TTL = 59s (just under the 60s limit). Cache is per-process (in-memory Map).

---

## Phase 1 — Foundation & Personal API Core

**Goal:** Working MCP server with all Personal API tools, proper TypeScript types, Zod validation, and basic error handling.

**Estimated time:** 2–3 days

**Deliverables:**
- `npm run build` produces working JS
- `npx monobank-mcp` launches MCP server on stdio
- Tools: `get_client_info`, `get_statement`, `get_exchange_rates`
- All Personal API types fully typed
- README with quick-start

---

### Step 1.1 — Project Scaffold

```bash
cd monobank-mcp
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node tsx vitest
```

**`package.json`** — key fields:
```json
{
  "name": "monobank-mcp",
  "version": "0.1.0",
  "description": "MCP server for Monobank Open API — accounts, statements, exchange rates",
  "type": "module",
  "bin": {
    "monobank-mcp": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "keywords": ["mcp", "monobank", "banking", "ukraine", "llm", "ai-agent"],
  "license": "MIT"
}
```

**`tsconfig.json`**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

> **Important:** `moduleResolution: NodeNext` is required by `@modelcontextprotocol/sdk` which uses ESM with `.js` extensions. Using plain `"Node"` will cause import resolution failures.

---

### Step 1.2 — TypeScript Types (`src/types/monobank.ts`)

Define all API response types. These are used throughout the codebase for type safety.

```typescript
export interface ClientInfo {
  clientId: string;
  name: string;
  webHookUrl: string;
  permissions: string;
  accounts: Account[];
  jars: Jar[];
}

export interface Account {
  id: string;
  sendId: string;
  balance: number;          // in kopiykas (1 UAH = 100 kopiykas)
  creditLimit: number;
  type: 'black' | 'white' | 'platinum' | 'iron' | 'fop' | 'yellow' | 'eAid';
  currencyCode: number;     // ISO 4217 numeric
  cashbackType: 'None' | 'UAH' | 'Miles';
  maskedPan: string[];
  iban: string;
}

export interface Jar {
  id: string;
  sendId: string;
  title: string;
  description: string;
  currencyCode: number;
  balance: number;
  goal: number;
}

export interface StatementItem {
  id: string;
  time: number;             // Unix timestamp
  description: string;
  mcc: number;              // Merchant Category Code
  originalMcc: number;
  amount: number;           // in kopiykas, negative = expense
  operationAmount: number;
  currencyCode: number;
  commissionRate: number;
  cashbackAmount: number;
  balance: number;
  hold: boolean;
  invoiceId?: string;
  receiptId?: string;
  counterEdrpou?: string;
  counterIban?: string;
  counterName?: string;
  comment?: string;
}

export interface ExchangeRate {
  currencyCodeA: number;
  currencyCodeB: number;
  date: number;
  rateSell?: number;
  rateBuy?: number;
  rateCross?: number;
}

// Helper: convert kopiykas to UAH string
export function formatAmount(kopiykas: number): string {
  return (kopiykas / 100).toFixed(2);
}

// Helper: ISO 4217 numeric → symbol
export const CURRENCY_SYMBOLS: Record<number, string> = {
  980: 'UAH',
  840: 'USD',
  978: 'EUR',
  826: 'GBP',
  756: 'CHF',
  985: 'PLN',
  203: 'CZK',
};
```

---

### Step 1.3 — Error Hierarchy (`src/errors/index.ts`)

```typescript
export class MonobankError extends Error {
  constructor(
    public readonly category: 'auth' | 'rate_limit' | 'validation' | 'not_found' | 'server',
    message: string,
    public readonly retryAfterSeconds?: number,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'MonobankError';
  }
}

export class RateLimitError extends MonobankError {
  constructor(retryAfterSeconds: number) {
    super(
      'rate_limit',
      `Rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`,
      retryAfterSeconds
    );
    this.name = 'RateLimitError';
  }
}

export class AuthError extends MonobankError {
  constructor(message = 'Invalid or missing token. Get your token at https://api.monobank.ua/') {
    super('auth', message, undefined, 401);
    this.name = 'AuthError';
  }
}
```

---

### Step 1.4 — HTTP Base Client (`src/client/base.ts`)

Handles raw HTTP communication with error translation.

```typescript
const BASE_URL = 'https://api.monobank.ua';

export async function apiFetch<T>(
  path: string,
  options: { headers?: Record<string, string>; method?: string } = {}
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  if (response.ok) {
    return response.json() as Promise<T>;
  }

  // Translate HTTP errors to domain errors
  if (response.status === 401) throw new AuthError();

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60', 10);
    throw new RateLimitError(retryAfter);
  }

  const body = await response.text().catch(() => '');
  const message = body || `HTTP ${response.status}`;
  throw new MonobankError('server', message, undefined, response.status);
}
```

---

### Step 1.5 — Personal API Client (`src/client/personal.ts`)

```typescript
export class PersonalClient {
  constructor(private readonly token: string) {}

  async getClientInfo(): Promise<ClientInfo> {
    return apiFetch<ClientInfo>('/personal/client-info', {
      headers: { 'X-Token': this.token },
    });
  }

  async getStatement(
    accountId: string,
    from: number,
    to: number
  ): Promise<StatementItem[]> {
    return apiFetch<StatementItem[]>(
      `/personal/statement/${accountId}/${from}/${to}`,
      { headers: { 'X-Token': this.token } }
    );
  }

  async setWebhook(url: string): Promise<void> {
    await apiFetch<void>('/personal/webhook', {
      method: 'POST',
      headers: { 'X-Token': this.token },
      // body handled in base client — extend apiFetch to accept body
    });
  }

  async getExchangeRates(): Promise<ExchangeRate[]> {
    return apiFetch<ExchangeRate[]>('/bank/currency');
  }
}
```

---

### Step 1.6 — TTL Cache (`src/cache/ttl-cache.ts`)

```typescript
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class TtlCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlSeconds: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }
}
```

---

### Step 1.7 — MCP Tools

#### `src/tools/account.ts`

```typescript
// Tool: get_client_info
// Returns client profile with all accounts and jars.
// Cached for 59 seconds to respect the 60s rate limit.

server.tool(
  'get_client_info',
  'Get client profile, all bank accounts and savings jars. Includes balances, IBANs, and account types. Results are cached for 59 seconds.',
  {},
  async () => {
    const cacheKey = 'client-info';
    const cached = cache.get<ClientInfo>(cacheKey);
    if (cached) return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };

    const info = await client.getClientInfo();
    cache.set(cacheKey, info, 59);

    // Format output for readability
    const formatted = {
      name: info.name,
      accounts: info.accounts.map(a => ({
        id: a.id,
        iban: a.iban,
        type: a.type,
        currency: CURRENCY_SYMBOLS[a.currencyCode] ?? a.currencyCode,
        balance: formatAmount(a.balance),
        creditLimit: a.creditLimit > 0 ? formatAmount(a.creditLimit) : undefined,
        cashback: a.cashbackType,
      })),
      jars: info.jars.map(j => ({
        id: j.id,
        title: j.title,
        balance: formatAmount(j.balance),
        goal: j.goal > 0 ? formatAmount(j.goal) : undefined,
        currency: CURRENCY_SYMBOLS[j.currencyCode] ?? j.currencyCode,
      })),
    };

    return { content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }] };
  }
);
```

#### `src/tools/statement.ts`

```typescript
// Tool: get_statement
// Input schema with Zod — validates date range, enforces 31-day limit

const StatementSchema = z.object({
  account_id: z
    .string()
    .optional()
    .default('0')
    .describe("Account ID from get_client_info. Use '0' for the default (black) card"),
  from_date: z
    .string()
    .describe("Start date in ISO 8601 format (e.g. '2024-01-01') or Unix timestamp"),
  to_date: z
    .string()
    .optional()
    .describe("End date in ISO 8601 format. Defaults to now. Max range: 31 days"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .default(50)
    .describe('Maximum number of transactions to return (default: 50, max: 500)'),
});
```

#### `src/tools/currency.ts`

```typescript
// Tool: get_exchange_rates
// Public endpoint, no auth required, cached for 5 minutes (Monobank updates every 5 min)
```

---

### Step 1.8 — Server Entry (`src/index.ts` and `src/server.ts`)

```typescript
// src/index.ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const transport = new StdioServerTransport();
const server = await createServer();
await server.connect(transport);

// src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export async function createServer(): Promise<McpServer> {
  const token = process.env.MONOBANK_TOKEN;
  if (!token) throw new Error('MONOBANK_TOKEN environment variable is required');

  const server = new McpServer({
    name: 'monobank-mcp',
    version: '0.1.0',
  });

  // Register all tools (imported from tools/)
  // ...

  return server;
}
```

---

### Step 1.9 — README.md (Phase 1 version)

README must include:
1. One-liner: what it does
2. Quick install (2 lines)
3. Authentication: where to get token (link to api.monobank.ua)
4. Claude Desktop config block (copy-paste ready)
5. Tool listing with descriptions
6. Rate limits note

**Claude Desktop config block:**
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

---

### Phase 1 Checklist

- [ ] `npm init`, `tsconfig.json`, dependencies installed
- [ ] `src/types/monobank.ts` — all Personal API types
- [ ] `src/errors/index.ts` — MonobankError, RateLimitError, AuthError
- [ ] `src/client/base.ts` — apiFetch with error translation
- [ ] `src/client/personal.ts` — PersonalClient class
- [ ] `src/cache/ttl-cache.ts` — TtlCache class
- [ ] `src/tools/account.ts` — get_client_info tool (with cache)
- [ ] `src/tools/statement.ts` — get_statement tool (Zod schema, 31-day validation)
- [ ] `src/tools/currency.ts` — get_exchange_rates tool (5-min cache)
- [ ] `src/index.ts` + `src/server.ts` — entry point
- [ ] `npm run build` succeeds
- [ ] Manual test: launch with `MONOBANK_TOKEN=xxx npx tsx src/index.ts`
- [ ] `README.md` with quick-start and Claude Desktop config
- [ ] `.env.example`
- [ ] `.gitignore` (node_modules, dist, .env, *.key)
- [ ] git commit: `feat: initial MCP server with Personal API tools`

---

## Phase 2 — Robustness, Testing & npm Publish

**Goal:** Production-ready error handling, exponential backoff, full test coverage, published to npm, listed on Glama.

**Estimated time:** 2 days

---

### Step 2.1 — Retry with Exponential Backoff

Add retry wrapper around `apiFetch`. Wrap in `src/client/retry.ts`:

```typescript
const BACKOFF_DELAYS_MS = [2000, 4000, 8000, 16000, 32000];

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err instanceof RateLimitError) {
        const delay = err.retryAfterSeconds
          ? err.retryAfterSeconds * 1000
          : (BACKOFF_DELAYS_MS[attempt] ?? 32000);
        await sleep(delay);
        continue;
      }
      // Don't retry auth errors or validation errors
      if (err instanceof AuthError) throw err;
      if (err instanceof MonobankError && err.category === 'validation') throw err;
      // Retry server errors
      await sleep(BACKOFF_DELAYS_MS[attempt] ?? 32000);
    }
  }

  throw lastError;
}
```

---

### Step 2.2 — Request Deduplication

If two identical requests arrive within the cache window, merge them into one HTTP call:

```typescript
// src/cache/dedup.ts
// Map of in-flight requests: cacheKey → Promise
const inflight = new Map<string, Promise<unknown>>();

export async function dedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}
```

---

### Step 2.3 — Enhanced Tool Error Messages

All tool handlers must catch MonobankError and return user-friendly text, not raw stack traces:

```typescript
try {
  const result = await client.getClientInfo();
  // ...
} catch (err) {
  if (err instanceof AuthError) {
    return {
      content: [{
        type: 'text',
        text: 'Authentication failed. Your MONOBANK_TOKEN is invalid or expired. Get a new token at https://api.monobank.ua/',
      }],
      isError: true,
    };
  }
  if (err instanceof RateLimitError) {
    return {
      content: [{
        type: 'text',
        text: `Rate limit hit. Monobank allows 1 request per 60 seconds for this endpoint. Retry in ${err.retryAfterSeconds ?? 60} seconds.`,
      }],
      isError: true,
    };
  }
  // ...
}
```

---

### Step 2.4 — Tests (`tests/`)

Use **vitest**. Mock `fetch` with `vi.stubGlobal`.

**`tests/cache/ttl-cache.test.ts`**
- get returns undefined for missing key
- get returns data within TTL
- get returns undefined after TTL expires
- set overwrites existing key
- invalidate removes key

**`tests/client/personal.test.ts`**
- getClientInfo: happy path returns typed ClientInfo
- getClientInfo: 401 throws AuthError
- getClientInfo: 429 throws RateLimitError with correct retryAfter
- getStatement: validates date range (rejects > 31 days)
- getExchangeRates: returns ExchangeRate array

**`tests/tools/account.test.ts`**
- get_client_info: uses cache on second call
- get_client_info: cache miss triggers HTTP request
- get_client_info: expired cache triggers fresh HTTP request

Run all: `npm test`

---

### Step 2.5 — Dockerfile

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
ENV MONOBANK_TOKEN=""
CMD ["node", "dist/index.js"]
```

Build: `docker build -t monobank-mcp .`
Run: `docker run -e MONOBANK_TOKEN=xxx monobank-mcp`

---

### Step 2.6 — npm Publish

```bash
# Ensure dist/ is built
npm run build

# Dry run to verify package contents
npm pack --dry-run

# Publish
npm publish --access public
```

Add to README:
```bash
# Install globally
npm install -g monobank-mcp

# Or run directly
npx monobank-mcp
```

---

### Step 2.7 — Submit to Glama Registry

Go to https://glama.ai/mcp/servers/submit

Required:
- Repository URL
- Working README with Claude Desktop config snippet
- All tools listed with descriptions

---

### Phase 2 Checklist

- [ ] `src/client/retry.ts` — withRetry + exponential backoff
- [ ] `src/cache/dedup.ts` — request deduplication
- [ ] All tool handlers: structured error returns (isError: true)
- [ ] `tests/cache/ttl-cache.test.ts` — 5+ tests
- [ ] `tests/client/personal.test.ts` — 8+ tests
- [ ] `tests/tools/account.test.ts` — 4+ tests
- [ ] `vitest.config.ts` configured
- [ ] `npm test` passes
- [ ] `Dockerfile` builds and runs
- [ ] `npm publish` — package live on npm
- [ ] Glama registry submission
- [ ] git commit: `feat: retry logic, tests, Docker, npm publish`
- [ ] Tag: `git tag v0.2.0`

---

## Phase 3 — Webhook Management & Advanced Tools

**Goal:** Full webhook management tools, `get_recent_transactions` polling tool, jar tools, `v0.3.0` release.

**Estimated time:** 1–2 days

---

### Step 3.1 — Webhook Management Tools

Expose three tools that manage webhook registration at Monobank. These are simple passthrough API calls — no webhook server is needed.

#### `src/tools/webhook.ts`

**Tool: `set_webhook`**
```typescript
server.tool(
  'set_webhook',
  'Register a webhook URL with Monobank. Monobank will POST real-time transaction events to this URL. The URL must be publicly accessible and respond with HTTP 200 within 5 seconds.',
  {
    url: z
      .string()
      .url()
      .describe('Publicly accessible HTTPS URL to receive transaction events. Must return HTTP 200 within 5 seconds.'),
  },
  async ({ url }) => {
    await client.setWebhook(url);
    return {
      content: [{
        type: 'text',
        text: `Webhook registered at ${url}. Monobank will POST StatementItem events to this URL when transactions occur.`,
      }],
    };
  }
);
```

**Tool: `delete_webhook`**
```typescript
server.tool(
  'delete_webhook',
  'Unregister the current webhook. Monobank will stop sending transaction notifications.',
  {},
  async () => {
    // POST /personal/webhook with empty string unregisters
    await client.setWebhook('');
    return { content: [{ type: 'text', text: 'Webhook unregistered.' }] };
  }
);
```

**Tool: `get_webhook_status`**
```typescript
server.tool(
  'get_webhook_status',
  'Check the currently registered webhook URL for your account.',
  {},
  async () => {
    const info = await client.getClientInfo();
    const url = info.webHookUrl;
    const status = url ? `Active: ${url}` : 'No webhook registered.';
    return { content: [{ type: 'text', text: status }] };
  }
);
```

**Webhook payload format** (for documentation — Monobank sends this to the registered URL):
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

---

### Step 3.2 — Polling Tool: `get_recent_transactions`

This is the practical alternative to real-time webhooks for agent use cases.

```typescript
server.tool(
  'get_recent_transactions',
  'Get the most recent transactions from an account. Use this to check for new activity, monitor spending, or find a specific payment. For Corporate API (no rate limits), this can be polled frequently.',
  {
    account_id: z.string().optional().default('0')
      .describe("Account ID. Use '0' for default card. Get IDs via get_client_info"),
    minutes: z.number().int().min(1).max(43200).optional().default(60)
      .describe('How many minutes back to look (default: 60, max: 43200 = 30 days)'),
    limit: z.number().int().min(1).max(100).optional().default(20)
      .describe('Max transactions to return (default: 20)'),
  },
  async ({ account_id, minutes, limit }) => {
    const to = Math.floor(Date.now() / 1000);
    const from = to - minutes * 60;

    const items = await client.getStatement(account_id, from, to);
    const sliced = items.slice(0, limit);

    const formatted = sliced.map(item => ({
      time: new Date(item.time * 1000).toISOString(),
      description: item.description,
      amount: `${formatAmount(item.amount)} ${CURRENCY_SYMBOLS[item.currencyCode] ?? item.currencyCode}`,
      balance: formatAmount(item.balance),
      mcc: item.mcc,
      hold: item.hold,
    }));

    return {
      content: [{
        type: 'text',
        text: formatted.length === 0
          ? 'No transactions in this period.'
          : JSON.stringify(formatted, null, 2),
      }],
    };
  }
);
```

---

### Step 3.3 — Jar Tools (`src/tools/jars.ts`)

> Note: Jars are only available in Personal API. Corporate API does not expose jars.

**Tool: `get_jars`**
```typescript
server.tool(
  'get_jars',
  'Get all savings jars (копилки) with current balances and goals.',
  {},
  async () => {
    const info = await client.getClientInfo(); // already cached
    const jars = info.jars.map(j => ({
      id: j.id,
      title: j.title,
      description: j.description || undefined,
      balance: formatAmount(j.balance),
      goal: j.goal > 0 ? formatAmount(j.goal) : 'No goal set',
      progress: j.goal > 0 ? `${((j.balance / j.goal) * 100).toFixed(1)}%` : undefined,
      currency: CURRENCY_SYMBOLS[j.currencyCode] ?? j.currencyCode,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(jars, null, 2) }] };
  }
);
```

---

### Step 3.4 — Update README for v0.3.0

Full tools table:

| Tool | Description |
|------|-------------|
| `get_client_info` | Client profile, all accounts and jars with balances |
| `get_statement` | Transaction history for any date range (max 31 days) |
| `get_recent_transactions` | Latest N transactions from last X minutes |
| `get_exchange_rates` | Current UAH/USD/EUR and other exchange rates |
| `get_jars` | Savings jars with progress toward goals |
| `set_webhook` | Register a URL to receive real-time transaction events |
| `delete_webhook` | Stop receiving webhook notifications |
| `get_webhook_status` | Check currently registered webhook URL |

---

### Phase 3 Checklist

- [ ] `src/tools/webhook.ts` — set_webhook, delete_webhook, get_webhook_status
- [ ] `src/tools/jars.ts` — get_jars
- [ ] `src/tools/statement.ts` — add get_recent_transactions
- [ ] `tests/tools/webhook.test.ts` — 4 tests
- [ ] README tools table updated
- [ ] `npm run build` passes
- [ ] `npm publish` — v0.3.0
- [ ] Update Glama listing
- [ ] git commit: `feat: webhook management, get_recent_transactions, jar tools`
- [ ] Tag: `git tag v0.3.0`

---

## Phase 4 — Corporate API Support

**Goal:** Full Corporate API with ECDSA signing, multi-user authorization flow, zero rate limits.

**Estimated time:** 3–4 days + waiting for Monobank approval

**Pre-requisite:** Apply for Corporate API access BEFORE writing code.

---

### Step 4.0 — Apply for Corporate API Access (Do This First)

```bash
# Generate ECDSA secp256k1 key pair
openssl ecparam -genkey -name secp256k1 -out priv.key
openssl ec -in priv.key -pubout -out pub.key
```

Send email to **api@monobank.ua** with:
- Subject: `Corporate API Access — monobank-mcp MCP server`
- Body: brief description of what the MCP server does
- Attachment: `pub.key` (NOT `priv.key` — never send the private key)
- Store `priv.key` securely, never commit to git

Expected response: 2 days – 4 weeks. You will receive a `KEY_ID` (SHA1 hash of your public key).

---

### Step 4.1 — ECDSA Signing (`src/client/signing.ts`)

```typescript
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface SigningConfig {
  keyId: string;
  privateKeyPem: string;    // PEM string (from file or env var)
}

export function signRequest(
  config: SigningConfig,
  requestPath: string
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);

  // Monobank signature: timestamp + keyId + path (no body, no query params)
  const dataToSign = `${timestamp}${config.keyId}${requestPath}`;

  const signer = createSign('SHA256');
  signer.update(dataToSign);
  const signature = signer.sign(config.privateKeyPem, 'base64');

  return {
    'X-Key-Id': config.keyId,
    'X-Time': timestamp.toString(),
    'X-Sign': signature,
  };
}

export function loadPrivateKey(): string {
  // Priority: env var (for Docker/cloud) > file path
  if (process.env.MONOBANK_PRIVATE_KEY_PEM) {
    return process.env.MONOBANK_PRIVATE_KEY_PEM.replace(/\\n/g, '\n');
  }
  const path = process.env.MONOBANK_PRIVATE_KEY_PATH;
  if (path) return readFileSync(path, 'utf-8');
  throw new Error('Corporate API requires MONOBANK_PRIVATE_KEY_PEM or MONOBANK_PRIVATE_KEY_PATH');
}
```

**Critical gotchas:**
1. `X-Time` must be within ±5 seconds of Monobank server time — ensure system clock is synced (NTP)
2. The path in signature is the URL path only — no query parameters, no request body
3. secp256k1 curve — not the common P-256. Node.js `crypto` supports it natively via `createSign('SHA256')` with a secp256k1 key

---

### Step 4.2 — Corporate Client (`src/client/corporate.ts`)

```typescript
export class CorporateClient {
  private readonly signingConfig: SigningConfig;

  constructor(keyId: string, privateKeyPem: string) {
    this.signingConfig = { keyId, privateKeyPem };
  }

  private headers(path: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...signRequest(this.signingConfig, path),
    };
  }

  // Same interface as PersonalClient — drop-in replacement
  async getClientInfo(): Promise<ClientInfo> {
    const path = '/personal/client-info';
    return apiFetch<ClientInfo>(path, { headers: this.headers(path) });
  }

  async getStatement(accountId: string, from: number, to: number): Promise<StatementItem[]> {
    const path = `/personal/statement/${accountId}/${from}/${to}`;
    return apiFetch<StatementItem[]>(path, { headers: this.headers(path) });
  }

  // Corporate-specific: initiate user authorization
  async initiateAuthorization(
    redirectUrl: string,
    webhookUrl: string,
    permissions: string = 'a'  // 'a' = all
  ): Promise<{ tokenRequestId: string; acceptUrl: string }> {
    const path = '/personal/auth/request';
    return apiFetch(path, {
      method: 'POST',
      headers: this.headers(path),
      // body: { redirectUrl, webhookUrl, permissions }
    });
  }

  async checkAuthorization(requestId: string): Promise<{ status: 'waiting' | 'approved' | 'rejected' }> {
    const path = `/personal/auth/${requestId}`;
    return apiFetch(path, { headers: this.headers(path) });
  }
}
```

---

### Step 4.3 — Auth Mode Detection (`src/server.ts` update)

```typescript
function createClient(): PersonalClient | CorporateClient {
  const mode = process.env.MONOBANK_AUTH_MODE ?? 'personal';

  if (mode === 'corporate') {
    const keyId = process.env.MONOBANK_KEY_ID;
    if (!keyId) throw new Error('MONOBANK_KEY_ID is required for corporate mode');
    const privateKeyPem = loadPrivateKey();
    return new CorporateClient(keyId, privateKeyPem);
  }

  const token = process.env.MONOBANK_TOKEN;
  if (!token) throw new Error('MONOBANK_TOKEN is required for personal mode');
  return new PersonalClient(token);
}
```

Both clients implement the same interface — all tools work identically regardless of auth mode. Corporate mode simply has no rate limits.

---

### Step 4.4 — Corporate-Specific MCP Tools

#### Tool: `initiate_authorization`

Only available in Corporate mode. Starts the OAuth-like flow where an end-user authorizes your app.

```typescript
server.tool(
  'initiate_authorization',
  '[Corporate API only] Start the user authorization flow. Returns a URL the user must open in their Monobank app to approve access. Poll check_authorization with the returned requestId to confirm approval.',
  {
    redirect_url: z.string().url()
      .describe('URL to redirect the user to after approval'),
    webhook_url: z.string().url().optional()
      .describe('URL where Monobank will POST the authorization token after approval'),
  },
  async ({ redirect_url, webhook_url }) => {
    const result = await (client as CorporateClient).initiateAuthorization(
      redirect_url,
      webhook_url ?? redirect_url
    );
    return {
      content: [{
        type: 'text',
        text: `Authorization initiated.\n\nAsk the user to open this URL in their Monobank app:\n${result.acceptUrl}\n\nRequest ID: ${result.tokenRequestId}\n\nUse check_authorization with this ID to confirm approval.`,
      }],
    };
  }
);
```

#### Tool: `check_authorization`

```typescript
server.tool(
  'check_authorization',
  '[Corporate API only] Check if a user has approved the authorization request.',
  {
    request_id: z.string()
      .describe('The tokenRequestId returned by initiate_authorization'),
  },
  async ({ request_id }) => {
    const result = await (client as CorporateClient).checkAuthorization(request_id);
    return {
      content: [{
        type: 'text',
        text: `Status: ${result.status}`,
      }],
    };
  }
);
```

---

### Step 4.5 — Cache Behavior in Corporate Mode

Corporate API has no rate limits, so caching is optional. Reduce default TTL to 5 seconds for near-real-time data, or make it configurable:

```typescript
const cacheTtl = process.env.MONOBANK_AUTH_MODE === 'corporate'
  ? 5    // 5 seconds — real-time feel
  : 59;  // 59 seconds — stay under 60s rate limit
```

---

### Step 4.6 — Documentation Update

Add `docs/CORPORATE_API.md`:

```markdown
# Corporate API Setup

## 1. Generate key pair
openssl ecparam -genkey -name secp256k1 -out priv.key
openssl ec -in priv.key -pubout -out pub.key

## 2. Apply for access
Email api@monobank.ua with pub.key attached.
Subject: "Corporate API Access — [your app description]"
Response time: 2 days to 4 weeks.

## 3. Configure
MONOBANK_AUTH_MODE=corporate
MONOBANK_KEY_ID=<KEY_ID from Monobank email>
MONOBANK_PRIVATE_KEY_PATH=/path/to/priv.key

## 4. Security
- NEVER commit priv.key to git
- Add *.key to .gitignore
- For cloud deployments, use MONOBANK_PRIVATE_KEY_PEM env var
- Rotate keys annually
```

---

### Step 4.7 — Final README

Full README structure for v1.0.0:

1. Badge row: npm version, license, MCP
2. One-liner description
3. Features list (bullet points, specific)
4. Quick start (2–3 commands)
5. Authentication section: Personal vs Corporate, how to get each
6. Claude Desktop config (copy-paste)
7. Full tools table (8 tools)
8. Corporate API section (link to docs/CORPORATE_API.md)
9. Rate limits note
10. Contributing
11. License

---

### Step 4.8 — Registry Submissions

Submit to all registries after v1.0.0:

| Registry | URL | Notes |
|----------|-----|-------|
| Glama | https://glama.ai/mcp/servers/submit | Main registry, ~24k servers |
| mcp.so | https://mcp.so/submit | Second largest |
| smithery.ai | https://smithery.ai | Enterprise-focused |
| awesome-mcp-servers | GitHub PR | Community list |

---

### Phase 4 Checklist

- [ ] Email sent to api@monobank.ua with pub.key
- [ ] `src/client/signing.ts` — signRequest(), loadPrivateKey()
- [ ] `src/client/corporate.ts` — CorporateClient class
- [ ] `src/server.ts` — auth mode detection, createClient()
- [ ] `src/tools/corporate-auth.ts` — initiate_authorization, check_authorization
- [ ] Corporate mode: cache TTL reduced to 5s
- [ ] `tests/client/signing.test.ts` — verify signature format matches spec
- [ ] `tests/client/corporate.test.ts` — happy path, auth error
- [ ] `docs/CORPORATE_API.md` — setup guide
- [ ] `*.key` in `.gitignore`
- [ ] Full README v1.0.0
- [ ] `npm run build` passes
- [ ] `npm publish` — v1.0.0
- [ ] Glama submission
- [ ] mcp.so submission
- [ ] smithery.ai submission
- [ ] awesome-mcp-servers PR
- [ ] git commit: `feat: Corporate API with ECDSA signing`
- [ ] Tag: `git tag v1.0.0`

---

## Summary

| Phase | Focus | Output | Duration |
|-------|-------|--------|----------|
| **1** | Foundation + Personal API | Working MCP, 3 tools, published to npm | 2–3 days |
| **2** | Robustness + Testing | Retry/backoff, tests, Docker, listed on Glama | 2 days |
| **3** | Webhooks + Advanced tools | 8 tools total, v0.3.0 | 1–2 days |
| **4** | Corporate API | ECDSA auth, multi-user, v1.0.0 | 3–4 days + approval wait |

**Total active work:** ~10 days  
**Blockers:** Monobank Corporate API approval (Phase 4 only — Phase 1–3 can proceed without it)
