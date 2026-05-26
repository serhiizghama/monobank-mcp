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
│   │   ├── signing.ts            # ECDSA request signing logic
│   │   └── base.ts               # Shared HTTP logic, error handling
│   ├── tools/
│   │   ├── account.ts            # get_client_info
│   │   ├── statement.ts          # get_statement, get_recent_transactions
│   │   ├── currency.ts           # get_exchange_rates
│   │   ├── webhook.ts            # set_webhook, delete_webhook, get_webhook_status
│   │   ├── corporate-auth.ts     # initiate_authorization, check_authorization
│   │   └── corporate-settings.ts # get_corp_settings, set_corp_webhook
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
| `/personal/statement/{account}/{from}/{to}` | 1 req / 60s | unlimited |
| `/bank/currency` | no limit | no limit |
| `/personal/webhook` | no documented limit | N/A (use `/personal/corp/webhook`) |
| `/personal/auth/request` | N/A | no documented limit |
| `/personal/corp/settings` | N/A | no documented limit |
| `/personal/corp/webhook` | N/A | no documented limit |

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
  type: 'black' | 'white' | 'platinum' | 'iron' | 'fop' | 'yellow' | 'eAid' | string;
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
  options: {
    headers?: Record<string, string>;
    method?: string;
    body?: Record<string, unknown>;
  } = {}
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.ok) {
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : (undefined as T);
  }

  // Translate HTTP errors to domain errors
  if (response.status === 401) throw new AuthError();
  if (response.status === 403) throw new AuthError('Access denied. Token may lack required permissions.');

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60', 10);
    throw new RateLimitError(retryAfter);
  }

  const errorBody = await response.text().catch(() => '');
  const message = errorBody || `HTTP ${response.status}`;
  throw new MonobankError('server', message, undefined, response.status);
}
```

> **Note:** Monobank returns empty body on some successful POST requests (e.g., webhook). Using `response.text()` + conditional parse avoids `JSON.parse("")` errors. Also handle 403 — Monobank returns it for permission issues distinct from 401 auth errors.

---

### Step 1.5 — Personal API Client (`src/client/personal.ts`)

```typescript
export class PersonalClient {
  constructor(private readonly token: string) {}

  private headers(): Record<string, string> {
    return { 'X-Token': this.token };
  }

  async getClientInfo(): Promise<ClientInfo> {
    return apiFetch<ClientInfo>('/personal/client-info', {
      headers: this.headers(),
    });
  }

  async getStatement(
    accountId: string,
    from: number,
    to?: number
  ): Promise<StatementItem[]> {
    // `to` is optional — Monobank defaults to current time if omitted
    const path = to
      ? `/personal/statement/${accountId}/${from}/${to}`
      : `/personal/statement/${accountId}/${from}`;
    return apiFetch<StatementItem[]>(path, { headers: this.headers() });
  }

  async setWebhook(url: string): Promise<void> {
    await apiFetch<void>('/personal/webhook', {
      method: 'POST',
      headers: this.headers(),
      body: { webHookUrl: url },
    });
  }

  async getExchangeRates(): Promise<ExchangeRate[]> {
    return apiFetch<ExchangeRate[]>('/bank/currency');
  }
}
```

> **Note:** The `to` parameter in `getStatement` is optional per Monobank docs — if omitted, the API defaults to the current timestamp. The `setWebhook` body must be `{ "webHookUrl": "<url>" }`. Passing an empty string (`""`) unregisters the webhook.

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

> **Tool registration:** Use `server.registerTool()` (the config-object API), not the legacy `server.tool()` which is frozen as of protocol version 2025-03-26. `registerTool` supports `title`, `outputSchema`, `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), and `structuredContent` in responses.
>
> **`inputSchema` format:** Pass a **raw Zod shape** (plain object of Zod types), NOT wrapped in `z.object()`. The SDK wraps it internally. Example: `inputSchema: { name: z.string() }` — NOT `inputSchema: z.object({ name: z.string() })`.
>
> **Logging:** NEVER use `console.log()` in an MCP stdio server — it writes to stdout and corrupts the JSON-RPC stream. Use `server.sendLoggingMessage({ level: 'info', logger: 'monobank', data: '...' })` for structured logging, or `console.error()` for debug output.

#### `src/tools/account.ts`

```typescript
server.registerTool(
  'get_client_info',
  {
    title: 'Get Client Info',
    description: 'Get client profile, all bank accounts and savings jars. Includes balances, IBANs, and account types. Results are cached for 59 seconds.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const cacheKey = 'client-info';
    const cached = cache.get<ClientInfo>(cacheKey);
    if (cached) return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };

    const info = await client.getClientInfo();
    cache.set(cacheKey, info, 59);

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
server.registerTool(
  'get_statement',
  {
    title: 'Get Statement',
    description: 'Get transaction history for a date range (max 31 days). Cached for 59 seconds.',
    inputSchema: {
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
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ account_id, from_date, to_date, limit }) => {
    // ... handler
  }
);
```

#### `src/tools/currency.ts`

```typescript
server.registerTool(
  'get_exchange_rates',
  {
    title: 'Get Exchange Rates',
    description: 'Get current Monobank exchange rates (UAH/USD/EUR and 100+ other pairs). Public endpoint, no auth required. Cached for 5 minutes.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async () => {
    // ... handler
  }
);
```

---

### Step 1.8 — Server Entry (`src/index.ts` and `src/server.ts`)

> **CRITICAL (stdio transport):** NEVER use `console.log()` — it writes to stdout and corrupts the JSON-RPC stream. Use `console.error()` for debug output, or `server.sendLoggingMessage()` for structured logging to the client.

```typescript
// src/index.ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main() {
  const transport = new StdioServerTransport();
  const server = await createServer();
  await server.connect(transport);
  console.error('Monobank MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

// src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export async function createServer(): Promise<McpServer> {
  const token = process.env.MONOBANK_TOKEN;
  if (!token) throw new Error('MONOBANK_TOKEN environment variable is required');

  const server = new McpServer(
    { name: 'monobank-mcp', version: '0.1.0' },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        'Monobank personal banking MCP server. Provides access to Ukrainian bank account balances, ' +
        'transaction history (statements), currency exchange rates, savings jars, and webhook management. ' +
        'Rate limit: 1 request per 60 seconds for personal API endpoints (client-info, statement). ' +
        'Results are cached automatically. Use get_client_info first to discover available accounts.',
    }
  );

  // Register all tools (imported from tools/)
  // ...

  return server;
}
```

> **`instructions` field:** This is a new feature in MCP SDK — free-text instructions surfaced to the LLM. Use it to describe the server, its limitations (rate limits), and recommended tool calling order. This replaces the need for overly verbose tool descriptions.

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
server.registerTool(
  'set_webhook',
  {
    title: 'Set Webhook',
    description: 'Register a webhook URL with Monobank. Monobank will POST real-time transaction events to this URL. The URL must be publicly accessible and respond with HTTP 200 within 5 seconds.',
    inputSchema: {
      url: z
        .string()
        .url()
        .describe('Publicly accessible HTTPS URL to receive transaction events.'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
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
server.registerTool(
  'delete_webhook',
  {
    title: 'Delete Webhook',
    description: 'Unregister the current webhook. Monobank will stop sending transaction notifications.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async () => {
    await client.setWebhook('');
    return { content: [{ type: 'text', text: 'Webhook unregistered.' }] };
  }
);
```

**Tool: `get_webhook_status`**
```typescript
server.registerTool(
  'get_webhook_status',
  {
    title: 'Get Webhook Status',
    description: 'Check the currently registered webhook URL for your account.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
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
server.registerTool(
  'get_recent_transactions',
  {
    title: 'Get Recent Transactions',
    description: 'Get the most recent transactions from an account. Use this to check for new activity, monitor spending, or find a specific payment.',
    inputSchema: {
      account_id: z.string().optional().default('0')
        .describe("Account ID. Use '0' for default card. Get IDs via get_client_info"),
      minutes: z.number().int().min(1).max(43200).optional().default(60)
        .describe('How many minutes back to look (default: 60, max: 43200 = 30 days)'),
      limit: z.number().int().min(1).max(100).optional().default(20)
        .describe('Max transactions to return (default: 20)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
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
server.registerTool(
  'get_jars',
  {
    title: 'Get Jars',
    description: 'Get all savings jars (копилки) with current balances and goals.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const info = await client.getClientInfo();
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

### Step 3.4 — Resource: Exchange Rates (`src/server.ts`)

Resources are ideal for relatively static reference data. Exchange rates update every 5 minutes — a good fit.

```typescript
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

server.registerResource(
  'exchange-rates',
  'monobank://exchange-rates',
  {
    description: 'Current Monobank exchange rates for all currency pairs',
    mimeType: 'application/json',
  },
  async (uri) => {
    const rates = await client.getExchangeRates();
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(rates, null, 2),
      }],
    };
  }
);
```

> **When to use Resources vs Tools:** Resources are "application-driven" — the host app loads them as context. Tools are "model-driven" — the LLM calls them during reasoning. Use resources for reference data the LLM might need as background (currency codes, exchange rates). Use tools for actions and queries with parameters.

---

### Step 3.5 — Prompt: Spending Analysis (`src/server.ts`)

Prompts are user-controlled templates exposed as slash commands in the client.

```typescript
server.registerPrompt(
  'spending-analysis',
  {
    title: 'Analyze Spending',
    description: 'Analyze spending patterns for a given time period',
    argsSchema: {
      period: z.enum(['week', 'month', 'quarter']).describe('Time period to analyze'),
      account_id: z.string().optional().describe('Specific account ID (optional, defaults to main card)'),
    },
  },
  async ({ period, account_id }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Analyze my spending for the last ${period}. ${
          account_id ? `Focus on account ${account_id}.` : 'Use the default card.'
        } Steps:\n1. Use get_statement to fetch transactions for the period\n2. Categorize transactions by MCC code\n3. Calculate totals per category\n4. Identify the largest expenses\n5. Note any unusual spending patterns`,
      },
    }],
  })
);
```

---

### Step 3.6 — Update README for v0.3.0

Full tools table (Personal API):

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

Resources:

| Resource | URI | Description |
|----------|-----|-------------|
| `exchange-rates` | `monobank://exchange-rates` | Current exchange rates (reference data) |

Prompts:

| Prompt | Description |
|--------|-------------|
| `spending-analysis` | Analyze spending patterns for a given period |

Additional tools in Corporate mode (Phase 4):

| Tool | Description |
|------|-------------|
| `initiate_authorization` | Start user auth flow, returns Monobank app URL |
| `check_authorization` | Check if user approved the auth request |
| `get_corp_settings` | Get corporate app settings (key, name, webhook) |
| `set_corp_webhook` | Set webhook URL for the corporate application |

---

### Phase 3 Checklist

- [ ] `src/tools/webhook.ts` — set_webhook, delete_webhook, get_webhook_status
- [ ] `src/tools/jars.ts` — get_jars
- [ ] `src/tools/statement.ts` — add get_recent_transactions
- [ ] Resource: `exchange-rates` (monobank://exchange-rates)
- [ ] Prompt: `spending-analysis`
- [ ] `tests/tools/webhook.test.ts` — 4 tests
- [ ] README tools/resources/prompts tables updated
- [ ] `npm run build` passes
- [ ] `npm publish` — v0.3.0
- [ ] Update Glama listing
- [ ] git commit: `feat: webhook management, get_recent_transactions, jar tools, resources, prompts`
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

> **CRITICAL:** Monobank's corporate signature format is `SHA256(timestamp + secondIngredient + requestPath)`, where `secondIngredient` **varies by endpoint**. This is the most common source of bugs in corporate API integrations.

**Signature formula:** `Sign_ECDSA_SHA256( "{timestamp}{secondIngredient}{requestPath}" )`

| Endpoint | `secondIngredient` |
|----------|-------------------|
| `POST /personal/auth/request` | permissions string (e.g., `"sp"`) |
| `GET /personal/auth/request` (check status) | `requestId` (the `tokenRequestId` from initiation) |
| `GET /personal/client-info` | `requestId` (user's token from auth flow) |
| `GET /personal/statement/...` | `requestId` (user's token from auth flow) |
| `GET /personal/corp/settings` | empty string `""` |
| `POST /personal/corp/webhook` | empty string `""` |

```typescript
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface SigningConfig {
  keyId: string;
  privateKeyPem: string;
}

/**
 * @param secondIngredient — varies by endpoint (see table above):
 *   - For per-user endpoints: the requestId / user token
 *   - For auth initiation: the permissions string (e.g., "sp")
 *   - For corp-level endpoints: empty string ""
 */
export function signRequest(
  config: SigningConfig,
  requestPath: string,
  secondIngredient: string = ''
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);

  const dataToSign = `${timestamp}${secondIngredient}${requestPath}`;

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
2. The `requestPath` in signature is the URL path only — no query parameters, no request body
3. secp256k1 curve — not the common P-256. Node.js `crypto` supports it natively via `createSign('SHA256')` with a secp256k1 key
4. **The `secondIngredient` is NOT the `keyId`** — this is a widespread misconception. It depends on the endpoint (see table above)

---

### Step 4.2 — Corporate Client (`src/client/corporate.ts`)

> **Key insight:** Per-user endpoints (`client-info`, `statement`) require a `requestId` (user token obtained via the auth flow). Corp-level endpoints (`corp/settings`, `corp/webhook`) and the auth initiation endpoint do not.

```typescript
export class CorporateClient {
  private readonly signingConfig: SigningConfig;

  constructor(keyId: string, privateKeyPem: string) {
    this.signingConfig = { keyId, privateKeyPem };
  }

  /**
   * Build headers for per-user endpoints.
   * secondIngredient = requestId (user's token from auth flow)
   */
  private userHeaders(path: string, requestId: string): Record<string, string> {
    return {
      ...signRequest(this.signingConfig, path, requestId),
      'X-Request-Id': requestId,
    };
  }

  /**
   * Build headers for corp-level endpoints (no user context).
   * secondIngredient = "" (empty string)
   */
  private corpHeaders(path: string): Record<string, string> {
    return signRequest(this.signingConfig, path, '');
  }

  // --- Per-user endpoints (require requestId from auth flow) ---

  async getClientInfo(requestId: string): Promise<ClientInfo> {
    const path = '/personal/client-info';
    return apiFetch<ClientInfo>(path, { headers: this.userHeaders(path, requestId) });
  }

  async getStatement(
    requestId: string,
    accountId: string,
    from: number,
    to?: number
  ): Promise<StatementItem[]> {
    const path = to
      ? `/personal/statement/${accountId}/${from}/${to}`
      : `/personal/statement/${accountId}/${from}`;
    return apiFetch<StatementItem[]>(path, { headers: this.userHeaders(path, requestId) });
  }

  // --- Auth flow endpoints ---

  async initiateAuthorization(
    callbackUrl: string,
    permissions: string = 'sp'  // 's' = statements, 'p' = personal info
  ): Promise<{ tokenRequestId: string; acceptUrl: string }> {
    const path = '/personal/auth/request';
    // secondIngredient for auth initiation = permissions string
    const sigHeaders = signRequest(this.signingConfig, path, permissions);
    return apiFetch(path, {
      method: 'POST',
      headers: {
        ...sigHeaders,
        'X-Callback': callbackUrl,       // webhook URL — sent as HEADER, not body
        'X-Permissions': permissions,     // permission flags — sent as HEADER, not body
      },
    });
  }

  async checkAuthorization(
    requestId: string
  ): Promise<{ status: string }> {
    // IMPORTANT: path is /personal/auth/request (NOT /personal/auth/{requestId})
    // The requestId is passed via X-Request-Id header
    const path = '/personal/auth/request';
    // secondIngredient for auth check = requestId
    const sigHeaders = signRequest(this.signingConfig, path, requestId);
    return apiFetch(path, {
      headers: {
        ...sigHeaders,
        'X-Request-Id': requestId,
      },
    });
  }

  // --- Corp-level endpoints (no user context) ---

  async getCorpSettings(): Promise<{
    pubkey: string;
    name: string;
    permission: string;
    logo: string;
    webhook: string | null;
  }> {
    const path = '/personal/corp/settings';
    return apiFetch(path, { headers: this.corpHeaders(path) });
  }

  async setCorpWebhook(url: string): Promise<void> {
    const path = '/personal/corp/webhook';
    await apiFetch<void>(path, {
      method: 'POST',
      headers: this.corpHeaders(path),
      body: { webHookUrl: url },
    });
  }

  async getExchangeRates(): Promise<ExchangeRate[]> {
    return apiFetch<ExchangeRate[]>('/bank/currency');
  }
}
```

> **Important differences from PersonalClient:**
> - `getClientInfo` and `getStatement` require a `requestId` parameter (the user's auth token)
> - Auth initiation sends `X-Callback` and `X-Permissions` as **headers**, not in the body
> - `checkAuthorization` hits `GET /personal/auth/request` with `X-Request-Id` header — **NOT** `/personal/auth/{requestId}` as a path param
> - Corp-level endpoints (`corp/settings`, `corp/webhook`) use empty string as signing ingredient

---

### Step 4.3 — Auth Mode Detection (`src/server.ts` update)

```typescript
type AuthMode = 'personal' | 'corporate';

interface AppContext {
  mode: AuthMode;
  personalClient?: PersonalClient;
  corporateClient?: CorporateClient;
}

function createContext(): AppContext {
  const mode = (process.env.MONOBANK_AUTH_MODE ?? 'personal') as AuthMode;

  if (mode === 'corporate') {
    const keyId = process.env.MONOBANK_KEY_ID;
    if (!keyId) throw new Error('MONOBANK_KEY_ID is required for corporate mode');
    const privateKeyPem = loadPrivateKey();
    return { mode, corporateClient: new CorporateClient(keyId, privateKeyPem) };
  }

  const token = process.env.MONOBANK_TOKEN;
  if (!token) throw new Error('MONOBANK_TOKEN is required for personal mode');
  return { mode, personalClient: new PersonalClient(token) };
}
```

> **Note:** Unlike the PersonalClient which is stateless (token in header), the CorporateClient has **different method signatures** — per-user methods require a `requestId`. These clients do NOT share a common interface. The server registers different tool sets depending on the mode. In personal mode, tools call `personalClient.getClientInfo()`. In corporate mode, tools need a `requestId` parameter and call `corporateClient.getClientInfo(requestId)`.

---

### Step 4.4 — Corporate-Specific MCP Tools (`src/tools/corporate-auth.ts`)

Only registered when `mode === 'corporate'`.

#### Tool: `initiate_authorization`

Starts the OAuth-like flow where an end-user authorizes your corporate app.

```typescript
server.registerTool(
  'initiate_authorization',
  {
    title: 'Initiate Authorization',
    description: '[Corporate API only] Start the user authorization flow. Returns a URL the user must open in their Monobank app to approve access. Poll check_authorization with the returned requestId to confirm approval.',
    inputSchema: {
      callback_url: z.string().url()
        .describe('Publicly accessible HTTPS URL where Monobank will POST the authorization result'),
      permissions: z.string().optional().default('sp')
        .describe("Permission flags: 's' = statements, 'p' = personal info. Default: 'sp' (both)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ callback_url, permissions }) => {
    const result = await corporateClient.initiateAuthorization(callback_url, permissions);
    return {
      content: [{
        type: 'text',
        text: `Authorization initiated.\n\nAsk the user to open this URL in their Monobank app:\n${result.acceptUrl}\n\nRequest ID: ${result.tokenRequestId}\n\nUse check_authorization with this ID to confirm approval.`,
      }],
    };
  }
);
```

> **Note:** `callback_url` and `permissions` are sent as **HTTP headers** (`X-Callback`, `X-Permissions`), not in the request body. The CorporateClient handles this internally.

#### Tool: `check_authorization`

```typescript
server.registerTool(
  'check_authorization',
  {
    title: 'Check Authorization',
    description: '[Corporate API only] Check if a user has approved the authorization request.',
    inputSchema: {
      request_id: z.string()
        .describe('The tokenRequestId returned by initiate_authorization'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ request_id }) => {
    const result = await corporateClient.checkAuthorization(request_id);
    return {
      content: [{
        type: 'text',
        text: `Status: ${result.status}`,
      }],
    };
  }
);
```

> **Note:** This uses `GET /personal/auth/request` with `X-Request-Id: {request_id}` as a header. The path is **always** `/personal/auth/request` — the `requestId` is NOT a path parameter.

#### Tool: `get_corp_settings` (`src/tools/corporate-settings.ts`)

```typescript
server.registerTool(
  'get_corp_settings',
  {
    title: 'Get Corporate Settings',
    description: '[Corporate API only] Get corporate application settings including registered public key, app name, permissions, and webhook URL.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const settings = await corporateClient.getCorpSettings();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(settings, null, 2),
      }],
    };
  }
);
```

#### Tool: `set_corp_webhook`

```typescript
server.registerTool(
  'set_corp_webhook',
  {
    title: 'Set Corporate Webhook',
    description: '[Corporate API only] Set or update the webhook URL for the corporate application.',
    inputSchema: {
      url: z.string().url()
        .describe('Publicly accessible HTTPS URL to receive events'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ url }) => {
    await corporateClient.setCorpWebhook(url);
    return {
      content: [{
        type: 'text',
        text: `Corporate webhook set to: ${url}`,
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
7. Full tools table (8 personal + 4 corporate = 12 tools)
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
- [ ] `src/client/signing.ts` — signRequest() with variable `secondIngredient`, loadPrivateKey()
- [ ] `src/client/corporate.ts` — CorporateClient class (userHeaders vs corpHeaders)
- [ ] `src/server.ts` — auth mode detection with AppContext, conditional tool registration
- [ ] `src/tools/corporate-auth.ts` — initiate_authorization, check_authorization
- [ ] `src/tools/corporate-settings.ts` — get_corp_settings, set_corp_webhook
- [ ] Corporate mode: cache TTL reduced to 5s
- [ ] `tests/client/signing.test.ts` — verify secondIngredient variations, signature format
- [ ] `tests/client/corporate.test.ts` — per-user vs corp-level endpoints, auth flow
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
| **4** | Corporate API | ECDSA auth, multi-user, 12 tools total, v1.0.0 | 3–4 days + approval wait |

**Total active work:** ~10 days  
**Blockers:** Monobank Corporate API approval (Phase 4 only — Phase 1–3 can proceed without it)

---

## Appendix: Verified API Endpoints (as of 2026-05)

### Personal API — All endpoints confirmed via live API and community SDKs

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/bank/currency` | None | Updates every 5 min, ~122 currency pairs |
| GET | `/personal/client-info` | `X-Token` | 1 req/60s rate limit |
| GET | `/personal/statement/{account}/{from}/{to?}` | `X-Token` | `to` optional, max 31 days, 1 req/60s |
| POST | `/personal/webhook` | `X-Token` | Body: `{ "webHookUrl": "..." }`, empty string = delete |

### Corporate API — Verified via community Go/Haskell/PHP SDKs and unofficial docs

| Method | Path | Auth Headers | Signing 2nd Ingredient |
|--------|------|-------------|----------------------|
| POST | `/personal/auth/request` | `X-Key-Id`, `X-Time`, `X-Sign`, `X-Callback`, `X-Permissions` | permissions string |
| GET | `/personal/auth/request` | `X-Key-Id`, `X-Time`, `X-Sign`, `X-Request-Id` | requestId |
| GET | `/personal/client-info` | `X-Key-Id`, `X-Time`, `X-Sign`, `X-Request-Id` | requestId |
| GET | `/personal/statement/{account}/{from}/{to?}` | `X-Key-Id`, `X-Time`, `X-Sign`, `X-Request-Id` | requestId |
| GET | `/personal/corp/settings` | `X-Key-Id`, `X-Time`, `X-Sign` | `""` (empty) |
| POST | `/personal/corp/webhook` | `X-Key-Id`, `X-Time`, `X-Sign` | `""` (empty) |
| GET | `/bank/currency` | None | N/A (public) |
