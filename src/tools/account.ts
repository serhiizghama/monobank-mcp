import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TtlCache } from '../cache/ttl-cache.js';
import type { PersonalClient } from '../client/personal.js';
import { AuthError, RateLimitError } from '../errors/index.js';
import { type ClientInfo, CURRENCY_SYMBOLS, formatAmount } from '../types/monobank.js';

export function registerAccountTools(
  server: McpServer,
  client: PersonalClient,
  cache: TtlCache,
): void {
  server.registerTool(
    'get_client_info',
    {
      title: 'Get Client Info',
      description:
        'Get client profile with all bank accounts and savings jars. Call this first to discover available account IDs for use with other tools. Rate-limited: 1 request per 60 seconds in Personal mode, cached automatically. Returns client name, list of accounts (id, IBAN, type, currency, balance, credit limit, cashback type) and savings jars (id, title, balance, goal, progress).',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const cacheKey = 'client-info';
        const cached = cache.get<ClientInfo>(cacheKey);
        if (cached) {
          return { content: [{ type: 'text' as const, text: formatClientInfo(cached) }] };
        }

        const info = await client.getClientInfo();
        cache.set(cacheKey, info, 59);

        return { content: [{ type: 'text' as const, text: formatClientInfo(info) }] };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}

function formatClientInfo(info: ClientInfo): string {
  const formatted = {
    name: info.name,
    accounts: (info.accounts ?? []).map((a) => ({
      id: a.id,
      iban: a.iban,
      type: a.type,
      currency: CURRENCY_SYMBOLS[a.currencyCode] ?? a.currencyCode,
      balance: formatAmount(a.balance),
      creditLimit: a.creditLimit > 0 ? formatAmount(a.creditLimit) : undefined,
      cashback: a.cashbackType,
    })),
    jars: (info.jars ?? []).map((j) => ({
      id: j.id,
      title: j.title,
      balance: formatAmount(j.balance),
      goal: j.goal > 0 ? formatAmount(j.goal) : undefined,
      currency: CURRENCY_SYMBOLS[j.currencyCode] ?? j.currencyCode,
    })),
  };
  return JSON.stringify(formatted, null, 2);
}

function handleToolError(err: unknown) {
  if (err instanceof AuthError) {
    return {
      content: [{ type: 'text' as const, text: `Authentication failed: ${err.message}` }],
      isError: true,
    };
  }
  if (err instanceof RateLimitError) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Rate limit hit. Monobank allows 1 request per 60 seconds. Retry in ${err.retryAfterSeconds ?? 60}s. Cached results are served automatically.`,
        },
      ],
      isError: true,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}
