import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TtlCache } from '../cache/ttl-cache.js';
import type { PersonalClient } from '../client/personal.js';
import { AuthError, RateLimitError } from '../errors/index.js';
import { type ClientInfo, CURRENCY_SYMBOLS, formatAmount } from '../types/monobank.js';

export function registerJarTools(
  server: McpServer,
  client: PersonalClient,
  cache: TtlCache,
): void {
  server.registerTool(
    'get_jars',
    {
      title: 'Get Jars',
      description:
        'Get all savings jars (копилки) with current balances and goals.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const cacheKey = 'client-info';
        let info = cache.get<ClientInfo>(cacheKey);
        if (!info) {
          info = await client.getClientInfo();
          cache.set(cacheKey, info, 59);
        }

        if (info.jars.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No savings jars found.' }] };
        }

        const jars = info.jars.map((j) => ({
          id: j.id,
          title: j.title,
          description: j.description || undefined,
          balance: formatAmount(j.balance),
          goal: j.goal > 0 ? formatAmount(j.goal) : 'No goal set',
          progress: j.goal > 0 ? `${((j.balance / j.goal) * 100).toFixed(1)}%` : undefined,
          currency: CURRENCY_SYMBOLS[j.currencyCode] ?? j.currencyCode,
        }));
        return { content: [{ type: 'text' as const, text: JSON.stringify(jars, null, 2) }] };
      } catch (err) {
        if (err instanceof AuthError) {
          return {
            content: [{ type: 'text' as const, text: `Authentication failed: ${err.message}` }],
            isError: true,
          };
        }
        if (err instanceof RateLimitError) {
          return {
            content: [{
              type: 'text' as const,
              text: `Rate limit hit. Retry in ${err.retryAfterSeconds ?? 60}s.`,
            }],
            isError: true,
          };
        }
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
